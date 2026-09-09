import { Response } from "express";
import prisma from "../config/prisma";
import { ForbiddenError, NotFoundError } from "../utils/AppError";
import { AuthRequest } from "./auth";

/**
 * Ensure the requesting user has access to the device identified by `:deviceId`.
 * - superadmin: allowed
 * - admin: allowed only if `addedBy` === user.id or `assignedAdmin` === user.id
 */
export async function ensureDeviceAccess(
  req: AuthRequest,
  _res: Response,
  next: (err?: Error) => void,
): Promise<void> {
  try {
    const user = req.user;
    if (!user) return next(new ForbiddenError("Unauthorized"));

    if (user.userType === "superadmin") return next();

    const deviceId = req.params.deviceId as string | undefined;
    if (!deviceId) return next(new NotFoundError("deviceId missing"));

    const device = await prisma.device.findUnique({
      where: { id: Number(deviceId) },
      select: { addedBy: true, assignedAdmin: true, isDelete: true },
    });

    if (!device || device.isDelete === "true_") {
      return next(new NotFoundError("Device not found"));
    }

    const allowed =
      device.addedBy === user.id || device.assignedAdmin === user.id;
    if (!allowed)
      return next(new ForbiddenError("You do not have access to this device"));

    next();
  } catch (err) {
    next(err as Error);
  }
}

/**
 * Ensure the requesting user may manage the given sensor `:id` (sensor id param).
 */
export async function ensureSensorAccess(
  req: AuthRequest,
  _res: Response,
  next: (err?: Error) => void,
): Promise<void> {
  try {
    const user = req.user;
    if (!user) return next(new ForbiddenError("Unauthorized"));
    if (user.userType === "superadmin") return next();

    const id =
      req.params.sensorId ?? req.params.id ?? (req.params.sensor_id as string | undefined);
    if (!id) return next(new NotFoundError("sensor id missing"));

    const sensor = await prisma.sensor.findUnique({
      where: { id: Number(id) },
      select: { assignedAdmin: true, status: true },
    });

    if (!sensor) return next(new NotFoundError("Sensor not found"));

    const allowed = sensor.assignedAdmin === user.id;
    if (!allowed)
      return next(new ForbiddenError("You do not have access to this sensor"));

    next();
  } catch (err) {
    next(err as Error);
  }
}

export default {};
