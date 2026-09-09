import { UserRole } from "@prisma/client";
import { AuthRequest } from "./auth";
import { ForbiddenError, UnauthorizedError } from "../utils/AppError";

// RBAC permission matrix
// superadmin: full access
// admin: manage own created projects/devices/sensors
// contractor: view assigned projects + report export
// authority: view assigned project + report export

export const PERMISSIONS = {
  // Users
  VIEW_USERS: [UserRole.superadmin, UserRole.admin],
  CREATE_ADMIN: [UserRole.superadmin],
  MANAGE_USER: [UserRole.superadmin, UserRole.admin],
  DELETE_USER: [UserRole.superadmin],

  // Devices
  MANAGE_DEVICES: [UserRole.superadmin, UserRole.admin],
  VIEW_DEVICES: [UserRole.superadmin, UserRole.admin],

  // Sensors
  MANAGE_SENSORS: [UserRole.superadmin, UserRole.admin],
  VIEW_SENSORS: [UserRole.superadmin, UserRole.admin],

  // Projects
  MANAGE_PROJECTS: [UserRole.superadmin, UserRole.admin],
  VIEW_PROJECTS: [
    UserRole.superadmin,
    UserRole.admin,
    UserRole.contractor,
    UserRole.authority,
  ],
  PROJECT_REPORTS: [
    UserRole.superadmin,
    UserRole.admin,
    UserRole.contractor,
    UserRole.authority,
  ],
} as const;

export type Permission = keyof typeof PERMISSIONS;

export function hasPermission(
  userType: UserRole,
  permission: Permission,
): boolean {
  return (PERMISSIONS[permission] as readonly UserRole[]).includes(userType);
}

// Express middleware factory to require a specific permission
export const requirePermission = (permission: Permission) => {
  return (
    req: AuthRequest,
    _res: unknown,
    next: (err?: Error) => void,
  ) => {
    const userType = req.user?.userType as UserRole | undefined;
    if (!userType) return next(new UnauthorizedError("Unauthorized"));
    if (!hasPermission(userType, permission))
      return next(
        new ForbiddenError("You do not have permission to perform this action"),
      );
    next();
  };
};
