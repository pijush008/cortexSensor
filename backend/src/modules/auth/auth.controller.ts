import { Response, NextFunction } from "express";
import { AuthRequest } from "../../middleware/auth";
import * as authService from "./auth.service";
import {
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
} from "./refresh-token.service";
import { REFRESH_COOKIE, clearAuthCookies, setAuthCookies } from "../../utils/cookies";
import { signAccessToken, verifyRefreshToken } from "../../utils/jwt";
import {
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  validateOtpSchema,
  changePasswordSchema,
  registerSchema,
  registerAdminSchema,
  updateUserSchema,
} from "./auth.types";
import { BadRequestError, ForbiddenError } from "../../utils/AppError";
import { auditLogger } from "../../utils/audit";
import {
  requestPasswordReset,
  resetPasswordWithToken,
} from "./password-reset.service";

function handleControllerError(res: Response, error: unknown) {
  const err = error as { statusCode?: number; message: string };
  const statusCode = err.statusCode || 400;
  const message = err.message || "Something Went Wrong";
  const errorMessage = message.replace(/"/g, "");
  return res.status(statusCode).json({
    status_code: statusCode,
    message: errorMessage,
    error: statusCode === 500 ? null : undefined,
  });
}

export async function authLogin(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const result = loginSchema.safeParse(req.body);
    if (!result.success) {
      const errorMessage = result.error.errors[0].message.replace(/"/g, "");
      return res.status(400).json({
        status_code: 400,
        message: errorMessage,
      });
    }
    const outcome = await authService.login(result.data);

    // A platform operator gets a code by email and no session yet. Cookies are
    // deliberately NOT set here — issuing them now would make the second factor
    // decorative, since the caller could simply ignore the next step.
    if (outcome.otpRequired) {
      return res.status(200).json({
        status_code: 200,
        message: "A sign-in code has been sent to your email address.",
        error: null,
        userID: outcome.userID,
        type: outcome.type,
        otpRequired: true,
      });
    }

    const { userID, type } = outcome;
    const accessToken = await authService.generateAccessToken(userID);
    const refreshToken = await issueRefreshToken(userID);
    setAuthCookies(res, accessToken, refreshToken);
    return res.status(200).json({
      status_code: 200,
      message: null,
      error: null,
      userID,
      type,
      otpRequired: false,
    });
  } catch (error) {
    return handleControllerError(res, error);
  }
}

/**
 * Second step of a platform operator's sign-in: submit the emailed code.
 *
 * This is where the session is finally issued, and the only place it can be
 * for an account that requires a code.
 */
export async function authLoginOtp(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const body = (req.body ?? {}) as { userID?: unknown; otp?: unknown };
    const userID = Number(body.userID);
    const otp = String(body.otp ?? "").trim();

    if (!Number.isInteger(userID) || userID <= 0 || otp.length === 0) {
      return res.status(400).json({
        status_code: 400,
        message: "A user and a sign-in code are both required",
      });
    }

    const { type } = await authService.verifyLoginOtp(userID, otp);
    const accessToken = await authService.generateAccessToken(userID);
    const refreshToken = await issueRefreshToken(userID);
    setAuthCookies(res, accessToken, refreshToken);

    const { ipAddress, userAgent } = auditLogger.requestContext(req);
    await auditLogger.audit({
      userId: userID,
      action: "verify",
      entity: "user",
      // Security-relevant: records that a platform operator cleared the second
      // factor, which is the moment the cross-tenant session begins.
      newValue: { event: "platform_admin_sign_in", secondFactor: "email_otp" },
      ipAddress,
      userAgent,
    });

    return res
      .status(200)
      .json({ status_code: 200, message: null, error: null, userID, type });
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function refresh(req: AuthRequest, res: Response) {
  try {
    const oldToken = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    if (!oldToken) {
      return res.status(401).json({ status_code: 401, message: "Not authenticated" });
    }

    const newRefreshToken = await rotateRefreshToken(oldToken);
    if (!newRefreshToken) {
      clearAuthCookies(res);
      return res.status(401).json({ status_code: 401, message: "Session expired" });
    }

    const payload = verifyRefreshToken(newRefreshToken);
    const accessToken = await signAccessToken(payload.userId);
    setAuthCookies(res, accessToken, newRefreshToken);
    return res.status(200).json({ status_code: 200, message: null });
  } catch {
    clearAuthCookies(res);
    return res.status(401).json({ status_code: 401, message: "Session expired" });
  }
}

export async function logout(req: AuthRequest, res: Response) {
  try {
    const oldToken = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    if (oldToken) {
      await revokeRefreshToken(oldToken);
    }
    clearAuthCookies(res);
    return res.status(200).json({ status_code: 200, message: "Logged out" });
  } catch {
    clearAuthCookies(res);
    return res.status(200).json({ status_code: 200, message: "Logged out" });
  }
}

export async function forgotPassword(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const result = forgotPasswordSchema.safeParse(req.body);
    if (!result.success) {
      const errorMessage = result.error.errors[0].message.replace(/"/g, "");
      return res.status(400).json({
        status_code: 400,
        message: errorMessage,
      });
    }
    // Emails a single-use link. The response is identical whether or not an
    // account exists, so this endpoint cannot be used to discover which
    // addresses are registered.
    const response = await requestPasswordReset(
      result.data.username,
      req.ip ?? undefined,
    );
    return res.status(200).json({ status_code: 200, ...response });
  } catch (error) {
    return handleControllerError(res, error);
  }
}

/** Completes a reset started by the emailed link. */
export async function resetPassword(
  req: AuthRequest,
  res: Response,
  _next: NextFunction,
) {
  try {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        status_code: 400,
        message: parsed.error.errors[0].message.replace(/"/g, ""),
      });
    }

    const result = await resetPasswordWithToken(
      parsed.data.token,
      parsed.data.password,
    );

    await auditLogger.audit({
      // The actor is not authenticated here; the token proves control of the
      // mailbox, which is what the record should reflect.
      action: "update",
      entity: "user",
      newValue: { passwordReset: true },
      ...auditLogger.requestContext(req),
    });

    return res.status(200).json({ status_code: 200, ...result });
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function validateOTP(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const result = validateOtpSchema.safeParse(req.body);
    if (!result.success) {
      const errorMessage = result.error.errors[0].message.replace(/"/g, "");
      return res.status(400).json({
        status_code: 400,
        message: errorMessage,
      });
    }
    const response = await authService.validateOTP(
      result.data.userId,
      result.data.inputOTP,
    );
    return res.status(200).json(response);
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function changeUserPassword(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const result = changePasswordSchema.safeParse(req.body);
    if (!result.success) {
      const errorMessage = result.error.errors[0].message.replace(/"/g, "");
      return res.status(400).json({
        status_code: 400,
        message: errorMessage,
      });
    }

    if (result.data.oldPassword !== null && !req.userId) {
      throw new ForbiddenError("You must be signed in to change your password");
    }

    const response = await authService.changePassword(
      result.data.userId,
      result.data.newPassword,
      result.data.oldPassword ?? null,
      result.data.resetToken,
    );
    return res.status(200).json(response);
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function registerAll(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const userType = req.params.userType;
    if (!["admin", "contractor", "authority"].includes(userType)) {
      throw new BadRequestError("Invalid user type");
    }

    // An admin brings a company with them; a contractor or authority is being
    // added into one that already exists. Picking the schema here rather than
    // making the extra fields optional means a member payload carrying them has
    // them stripped, not quietly honoured.
    const schema = userType === "admin" ? registerAdminSchema : registerSchema;
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errorMessage = result.error.errors[0].message.replace(/"/g, "");
      return res.status(400).json({
        status_code: 400,
        message: errorMessage,
      });
    }

    const payload = { ...result.data };

    if (userType !== "admin") {
      // Adding somebody to an organization requires being in one.
      //
      // The organization comes from the SESSION, never from the body. It used
      // to be `admin_id` as posted, on a route with no authentication at all, so
      // anyone could grant themselves an active VIEWER membership in any tenant
      // by naming its admin's id — the same "never trust a tenant id from the
      // client" rule the rest of the platform follows.
      if (!req.user) {
        throw new ForbiddenError(
          "You must be signed in to add someone to an organization",
        );
      }
      payload.admin_id = String(req.user.id);
    }

    const response = await authService.register(userType, payload);
    const { ipAddress, userAgent } = auditLogger.requestContext(req);
    await auditLogger.audit({
      userId: req.user?.id,
      action: "create",
      entity: "user",
      newValue: { userType, emailId: result.data.emailId },
      ipAddress,
      userAgent,
    });
    return res.status(200).json(response);
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function verifyPrimaryUser(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id: token } = req.params;
    const response = await authService.verifyPrimaryUser(token);

    if (response.status_code === 200) {
      return res
        .status(200)
        .send("<html><body><h1>Account Verified</h1></body></html>");
    }
    return res.status(response.status_code).json(response);
  } catch (error) {
    return res
      .status(500)
      .send("<html><body><h1>Error</h1></body></html>");
  }
}

export async function sendVerificationLink(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const { emailId } = req.params;
    const response = await authService.sendVerificationLink(emailId);
    return res.status(200).json(response);
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function UpdateAllUserType(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const { userId } = req.params;
    const result = updateUserSchema.safeParse(req.body);
    if (!result.success) {
      const errorMessage = result.error.errors[0].message.replace(/"/g, "");
      return res.status(400).json({
        status_code: 400,
        message: errorMessage,
      });
    }

    const response = await authService.updateUser(userId, result.data);
    return res.status(200).json(response);
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function userDelete(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const { userId } = req.params;
    const response = await authService.deleteUser(userId);
    const { ipAddress, userAgent } = auditLogger.requestContext(req);
    await auditLogger.audit({
      userId: req.user?.id,
      action: "delete",
      entity: "user",
      entityId: Number(userId),
      ipAddress,
      userAgent,
    });
    return res.status(200).json(response);
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function getUserDetail(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const { userId } = req.params;
    const response = await authService.getUserDetail(userId);
    return res.status(200).json(response);
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function superAdminVerifyUser(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const { userId, verifyType } = req.params;
    const response = await authService.superAdminVerifyUser(userId, verifyType);
    const { ipAddress, userAgent } = auditLogger.requestContext(req);
    await auditLogger.audit({
      userId: req.user?.id,
      action: "verify",
      entity: "user",
      entityId: Number(userId),
      newValue: { verifyType },
      ipAddress,
      userAgent,
    });
    return res.status(200).json(response);
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function adminDeleteSoft(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const { adminId } = req.params;
    const response = await authService.adminDeleteSoft(adminId);
    const { ipAddress, userAgent } = auditLogger.requestContext(req);
    await auditLogger.audit({
      userId: req.user?.id,
      action: "delete",
      entity: "user",
      entityId: Number(adminId),
      ipAddress,
      userAgent,
    });
    return res.status(200).json(response);
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function adminDeactivate(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const { adminId } = req.params;
    const response = await authService.adminDeactivate(adminId);
    const { ipAddress, userAgent } = auditLogger.requestContext(req);
    await auditLogger.audit({
      userId: req.user?.id,
      action: "deactivate",
      entity: "user",
      entityId: Number(adminId),
      ipAddress,
      userAgent,
    });
    return res.status(200).json(response);
  } catch (error) {
    return handleControllerError(res, error);
  }
}
