import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import * as usersService from "./users.service";
import {
  userListParamsSchema,
  userListQuerySchema,
  csvAccessParamsSchema,
  assignedSensorQuerySchema,
  assignedDeviceQuerySchema,
} from "./users.types";
import { ForbiddenError } from "../../utils/AppError";

function handleControllerError(res: Response, error: unknown) {
  const err = error as { statusCode?: number; message: string };
  const statusCode = err.statusCode || 400;
  const message = err.message || "Something Went Wrong";
  const errorMessage = message.replace(/"/g, "");
  return res.status(statusCode).json({
    status_code: statusCode,
    message: errorMessage,
    data: statusCode === 500 ? null : undefined,
  });
}

/**
 * Non-superadmin users may only ever scope user lists to their own id.
 * A passed adminId can only be used to browse another tenant's users by superadmin.
 */
function resolveScopedAdminId(req: AuthRequest, requestedAdminId: string): string {
  const user = req.user;
  if (!user) {
    throw new ForbiddenError("You do not have permission to view users");
  }
  if (user.userType !== "superadmin") {
    return String(user.id);
  }
  return requestedAdminId;
}

/**
 * Contractors and authorities have no right to browse any user registry;
 * an admin may only browse their own subtree. Superadmin may browse any.
 */
function assertCanViewUsers(req: AuthRequest): void {
  const user = req.user;
  if (!user) {
    throw new ForbiddenError("You do not have permission to view users");
  }
  if (user.userType !== "superadmin" && user.userType !== "admin") {
    throw new ForbiddenError("You do not have permission to view users");
  }
}

export async function adminList(req: AuthRequest, res: Response) {
  try {
    assertCanViewUsers(req);
    const params = userListParamsSchema.parse(req.params);
    const query = userListQuerySchema.parse(req.query);
    const adminId = resolveScopedAdminId(req, params.adminId);
    const data = await usersService.adminList({ ...params, adminId }, query);
    return res.status(200).json({ status_code: 200, message: null, data });
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function csvAccess(req: AuthRequest, res: Response) {
  try {
    const params = csvAccessParamsSchema.parse(req.params);
    const response = await usersService.csvAccess(params.userId, params.csv);
    return res.status(200).json(response);
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function assignedSensor(req: AuthRequest, res: Response) {
  try {
    const { adminId } = req.params;
    const query = assignedSensorQuerySchema.parse(req.query);
    const scopedAdminId = resolveScopedAdminId(req, adminId);
    const data = await usersService.assignedSensorList(scopedAdminId, query);
    return res.status(200).json({ status_code: 200, message: null, data });
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function assignedDevice(req: AuthRequest, res: Response) {
  try {
    const { adminId } = req.params;
    const query = assignedDeviceQuerySchema.parse(req.query);
    const scopedAdminId = resolveScopedAdminId(req, adminId);
    const data = await usersService.assignedDeviceList(scopedAdminId, query);
    return res.status(200).json({ status_code: 200, message: null, data });
  } catch (error) {
    return handleControllerError(res, error);
  }
}
