import { UserRole } from "@prisma/client";
import { Request } from "express";
import prisma from "../config/prisma";
import { AuthenticatedRequestUser } from "../types";
import { ForbiddenError, UnauthorizedError } from "../utils/AppError";
import { ACCESS_COOKIE } from "../utils/cookies";
import { verifyAccessToken } from "../utils/jwt";
import {
  IMPERSONATION_COOKIE,
  verifyImpersonationToken,
} from "../modules/platform/impersonation.service";
import { resolveAuthContext, type AuthContext } from "../modules/rbac/rbac.service";

export interface AuthRequest extends Request {
  userId?: number;
  user?: AuthenticatedRequestUser;
  /**
   * Tenant + permission context, derived from the session only (§17).
   * This is the authoritative authorization source for new code; `user` is
   * retained while existing modules are migrated off role-name checks.
   */
  auth?: AuthContext;
  /**
   * Set only while a platform operator is viewing the console as another user.
   * `userId`/`auth` describe the user being VIEWED; this names the operator
   * actually behind the request, which is who any record must be attributed to.
   */
  impersonation?: { operatorId: number; targetUserId: number };
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

    // An impersonation cookie takes precedence over the operator's own access
    // token, and only for the duration of the token's short life. It is checked
    // first so that "view as" needs no cooperation from individual routes; when
    // it is absent or expired, the operator's own session is used unchanged.
    const impersonationToken = (req.cookies as Record<string, string> | undefined)?.[
      IMPERSONATION_COOKIE
    ];
    const impersonation = verifyImpersonationToken(impersonationToken);

    if (impersonation) {
      // NOTE: the read-only rule is NOT enforced here. It lives in
      // `enforceImpersonationReadOnly`, mounted globally in app.ts, because a
      // check in this function is only as good as the routes that remember to
      // use this function — `/logout` uses no auth middleware at all, and
      // `optionalAuth` deliberately swallows whatever this throws. Both slipped
      // through when the rule lived here.

      // The operator's authority is re-checked on EVERY request, not trusted
      // from the token. A token minted while someone was a platform operator
      // must stop working the moment that is revoked, their account is disabled
      // or deleted — otherwise a removed operator keeps a live window into a
      // customer's data for the remainder of the token's life.
      const operator = await prisma.user.findUnique({
        where: { id: impersonation.impersonatorId },
        select: { id: true, isPlatformAdmin: true, status: true, isDelete: true },
      });

      if (
        !operator ||
        !operator.isPlatformAdmin ||
        operator.isDelete === "true_" ||
        operator.status === "false_"
      ) {
        throw new ForbiddenError("This view-as session is no longer valid");
      }

      req.impersonation = {
        operatorId: impersonation.impersonatorId,
        targetUserId: impersonation.userId,
      };
      req.userId = impersonation.userId;
    } else {
      const payload = verifyAccessToken(token);
      req.userId = payload.userId;
    }

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

      // Authoritative tenant + permission context, resolved from membership.
      // Deliberately not taken from anything the client sent.
      req.auth = await resolveAuthContext(user.id);

      req.user = {
        id: user.id,
        userType: user.userType,
        parentId: user.parentId,
        firstName: user.firstName,
        lastName: user.lastName,
        emailId: user.emailId,
        status: user.status === "true_",
        // DEPRECATED: parentId-derived org id. Read req.auth.tenantId instead —
        // this remains only until every module is migrated off it.
        organizationId: user.parentId || 0,
      };
    }

    next();
  } catch (err) {
    /**
     * A bad or expired token is UNAUTHORISED, not a server fault.
     *
     * jsonwebtoken throws TokenExpiredError / JsonWebTokenError, neither of
     * which is an AppError, so they fell through to the generic handler and
     * came back as 500. That is not merely the wrong number: the client
     * refreshes its session on 401 and only on 401, so an access token
     * reaching its expiry — which every session does, on a short timer —
     * produced "Internal Server Error" on every call instead of the silent
     * renewal the refresh token exists to provide.
     */
    const name = (err as Error)?.name;
    if (name === "TokenExpiredError" || name === "JsonWebTokenError" || name === "NotBeforeError") {
      return next(new UnauthorizedError("Session expired"));
    }
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

/**
 * Methods a view-as session may use. Everything else is refused.
 *
 * Stated as METHODS, not routes: the rule then needs no knowledge of individual
 * endpoints, and a new write endpoint is covered the day it is added rather
 * than the day someone remembers to annotate it.
 */
const IMPERSONATION_SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * The one state-changing path a view-as session may still call: ending itself.
 * Without this exemption the read-only rule would trap the operator inside the
 * session until the token expired.
 */
const IMPERSONATION_EXIT_PATH = /\/impersonation\/?$/;

/**
 * Refuses any state-changing request made inside a view-as session.
 *
 * Mounted GLOBALLY, before the routers, and deliberately not inside
 * `authenticate`. Enforcement that lives in an auth middleware only protects
 * the routes that use it, and two did not: `/logout` declares no auth
 * middleware, and `optionalAuth` calls `authenticate` with a callback that
 * discards the error, so a refusal raised there was silently dropped and the
 * handler ran anyway.
 *
 * Placed here it holds for every route, present and future, including any that
 * forgets to authenticate at all.
 */
export const enforceImpersonationReadOnly = (
  req: AuthRequest,
  _res: unknown,
  next: (err?: Error) => void,
): void => {
  const token = (req.cookies as Record<string, string> | undefined)?.[
    IMPERSONATION_COOKIE
  ];
  if (!token) return next();
  if (!verifyImpersonationToken(token)) return next();

  if (IMPERSONATION_SAFE_METHODS.has(req.method)) return next();
  if (req.method === "DELETE" && IMPERSONATION_EXIT_PATH.test(req.path)) {
    return next();
  }

  next(
    new ForbiddenError(
      "This is a read-only view-as session. Exit it to make changes.",
    ),
  );
};
