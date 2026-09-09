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
  validateOtpSchema,
  changePasswordSchema,
  registerSchema,
  updateUserSchema,
} from "./auth.types";
import { BadRequestError, ForbiddenError } from "../../utils/AppError";
import { auditLogger } from "../../utils/audit";

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
    const { userID, type } = await authService.login(result.data);
    const accessToken = await authService.generateAccessToken(userID);
    const refreshToken = await issueRefreshToken(userID);
    setAuthCookies(res, accessToken, refreshToken);
    return res.status(200).json({
      status_code: 200,
      message: null,
      error: null,
      userID,
      type,
    });
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
    const response = await authService.forgotPassword(result.data.username);
    return res.status(200).json(response);
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

    const result = registerSchema.safeParse(req.body);
    if (!result.success) {
      const errorMessage = result.error.errors[0].message.replace(/"/g, "");
      return res.status(400).json({
        status_code: 400,
        message: errorMessage,
      });
    }

    const response = await authService.register(userType, result.data);
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
