import { Response } from "express";
import { ForbiddenError, UnauthorizedError } from "../utils/AppError";
import { AuthRequest } from "./auth";
import { can } from "../modules/rbac/rbac.service";
import type { PermissionKey } from "../modules/rbac/permission.catalog";

/**
 * Permission-based route guards.
 *
 * These replace role-name checks. Asking "does this caller hold
 * ALERT_RESOLVE?" instead of "is this caller an admin?" means adding a role
 * does not require revisiting every route, and the answer to "who can do X?"
 * is a query rather than a code search.
 *
 * The legacy `requireRole` / `requirePermission` helpers remain in place while
 * modules are migrated; this is the target for all new code.
 */

export const requirePermission = (...permissions: PermissionKey[]) => {
  return (req: AuthRequest, _res: Response, next: (err?: Error) => void): void => {
    const ctx = req.auth;
    if (!ctx) return next(new UnauthorizedError("Unauthorized"));

    // All listed permissions are required, not any-of. A route that needs
    // either of two permissions should be two routes, or check explicitly —
    // an implicit OR here would be easy to misread as an AND at the call site.
    const missing = permissions.filter((p) => !can(ctx, p));
    if (missing.length > 0) {
      return next(
        new ForbiddenError("You do not have permission to perform this action"),
      );
    }
    next();
  };
};

/** Platform operators only (§19). Tenant members are rejected regardless of role. */
export const requirePlatformAdmin = (
  req: AuthRequest,
  _res: Response,
  next: (err?: Error) => void,
): void => {
  if (!req.auth) return next(new UnauthorizedError("Unauthorized"));
  if (!req.auth.isPlatformAdmin) {
    return next(new ForbiddenError("Platform administrator access required"));
  }
  next();
};

/**
 * Require an active tenant context. Use on routes that operate on tenant data,
 * so a user whose membership or tenant has been disabled gets a clear 403
 * rather than an empty result set that looks like "you have no projects".
 */
export const requireTenant = (
  req: AuthRequest,
  _res: Response,
  next: (err?: Error) => void,
): void => {
  if (!req.auth) return next(new UnauthorizedError("Unauthorized"));
  if (req.auth.isPlatformAdmin) return next();
  if (req.auth.tenantId === null) {
    return next(
      new ForbiddenError("Your account is not an active member of any organization"),
    );
  }
  next();
};
