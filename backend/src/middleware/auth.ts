import { UserRole } from "@prisma/client";
import { Request } from "express";
import prisma from "../config/prisma";
import { AuthenticatedRequestUser } from "../types";
import { ForbiddenError, UnauthorizedError } from "../utils/AppError";
import { ACCESS_COOKIE } from "../utils/cookies";
import { verifyAccessToken } from "../utils/jwt";

export interface AuthRequest extends Request {
  userId?: number;
  user?: AuthenticatedRequestUser;
}

export const authenticate = async (
  req: AuthRequest,
  _res: unknown,
  next: (err?: Error) => void,
): Promise<void> => {
  try {
    const authHeader = req.headers["authorization"];
    const cookieToken = (req.cookies as Record<string, string> | undefined)?.[
      ACCESS_COOKIE
    ];

    let token: string | null = null;

    if (authHeader) {
      const parts = authHeader.split(" ");
      if (parts.length === 2 && parts[0] === "Bearer") {
        token = parts[1];
      }
    } else if (cookieToken) {
      token = cookieToken;
    }

    if (!token) {
      throw new UnauthorizedError("Unauthorized Error");
    }

    const payload = verifyAccessToken(token);
    req.userId = payload.userId;

    if (req.userId) {
      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: {
          id: true,
          userType: true,
          parentId: true,
          firstName: true,
          lastName: true,
          emailId: true,
          status: true,
          isDelete: true,
        },
      });

      if (!user) {
        throw new UnauthorizedError("User not found");
      }

      if (user.isDelete === "true_") {
        throw new ForbiddenError("User has been deleted.");
      }

      if (user.status === "false_") {
        throw new ForbiddenError("User is disabled. Please contact admin.");
      }

      req.user = {
        id: user.id,
        userType: user.userType,
        parentId: user.parentId,
        firstName: user.firstName,
        lastName: user.lastName,
        emailId: user.emailId,
        status: user.status === "true_",
        // convenience: organization/tenant id derived from parentId
        organizationId: user.parentId || 0,
      };
    }

    next();
  } catch (err) {
    next(err as Error);
  }
};

export const requireRole = (...roles: UserRole[]) => {
  return (
    req: AuthRequest,
    _res: unknown,
    next: (err?: Error) => void,
  ): void => {
    if (!req.user) {
      return next(new UnauthorizedError("Unauthorized Error"));
    }
    if (!roles.includes(req.user.userType)) {
      return next(
        new ForbiddenError("You do not have permission to perform this action"),
      );
    }
    next();
  };
};

export const superAdminOnly = requireRole(UserRole.superadmin);
export const adminOnly = requireRole(UserRole.superadmin, UserRole.admin);

/**
 * Like authenticate, but never fails the request when no/invalid token is
 * present. Sets req.user/req.userId only when a valid token exists.
 */
export const optionalAuth = (
  req: AuthRequest,
  res: unknown,
  next: (err?: Error) => void,
): void => {
  authenticate(req, res, () => next());
};
