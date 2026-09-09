import { Response } from "express";
import { z } from "zod";
import { AuthRequest } from "../../middleware/auth";
import { UnauthorizedError } from "../../utils/AppError";
import { auditLogger } from "../../utils/audit";
import * as service from "./sensor-lifecycle.service";

const assignSchema = z.object({
  locationId: z.union([z.number(), z.string()]).optional()
    .transform((v) => (v === undefined || v === "" ? undefined : Number(v))),
  deviceId: z.union([z.number(), z.string()]).optional()
    .transform((v) => (v === undefined || v === "" ? undefined : Number(v))),
  channelNumber: z.string().trim().max(32).optional(),
  orientation: z.string().trim().max(64).optional(),
  validFrom: z.string().optional(),
  notes: z.string().trim().max(4000).optional(),
});

const calibrationSchema = z.object({
  calibrationValue: z.string().trim().min(1, "Calibration value is required").max(64),
  zeroOffset: z.string().trim().max(64).optional(),
  unit: z.string().trim().max(32).optional(),
  manufacturer: z.string().trim().max(120).optional(),
  model: z.string().trim().max(120).optional(),
  serialNumber: z.string().trim().max(120).optional(),
  rangeMin: z.string().trim().max(64).optional(),
  rangeMax: z.string().trim().max(64).optional(),
  accuracy: z.string().trim().max(64).optional(),
  resolution: z.string().trim().max(64).optional(),
  certificateRef: z.string().trim().max(160).optional(),
  performedBy: z.string().trim().max(160).optional(),
  performedAt: z.string().optional(),
  validUntil: z.string().optional(),
  notes: z.string().trim().max(4000).optional(),
});

function fail(res: Response, error: unknown) {
  const err = error as { statusCode?: number; message: string };
  const statusCode = err.statusCode || 400;
  return res.status(statusCode).json({
    status_code: statusCode,
    message: (err.message || "Something went wrong").replace(/"/g, ""),
  });
}

function invalid(
  res: Response,
  error: { issues: { path: (string | number)[]; message: string }[] },
) {
  return res.status(400).json({
    status_code: 400,
    message: error.issues[0]?.message ?? "Invalid request",
    fields: error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
  });
}

function ctxOf(req: AuthRequest) {
  if (!req.auth) throw new UnauthorizedError("Unauthorized");
  return req.auth;
}

export async function assign(req: AuthRequest, res: Response) {
  try {
    const parsed = assignSchema.safeParse(req.body ?? {});
    if (!parsed.success) return invalid(res, parsed.error);
    const ctx = ctxOf(req);
    const sensorId = Number(req.params.sensorId);
    const data = await service.assignSensor(ctx, sensorId, parsed.data);
    const { ipAddress, userAgent } = auditLogger.requestContext(req);
    await auditLogger.audit({
      userId: ctx.userId,
      action: "assign",
      entity: "sensor",
      entityId: sensorId,
      newValue: { locationId: data.locationId, validFrom: data.validFrom.toISOString() },
      ipAddress,
      userAgent,
    });
    return res.status(201).json({ status_code: 201, message: null, data });
  } catch (error) {
    return fail(res, error);
  }
}

export async function assignmentHistory(req: AuthRequest, res: Response) {
  try {
    const data = await service.getAssignmentHistory(
      ctxOf(req),
      Number(req.params.sensorId),
    );
    return res.status(200).json({ status_code: 200, message: null, data });
  } catch (error) {
    return fail(res, error);
  }
}

export async function calibrate(req: AuthRequest, res: Response) {
  try {
    const parsed = calibrationSchema.safeParse(req.body ?? {});
    if (!parsed.success) return invalid(res, parsed.error);
    const ctx = ctxOf(req);
    const sensorId = Number(req.params.sensorId);
    const data = await service.recordCalibration(ctx, sensorId, parsed.data);
    const { ipAddress, userAgent } = auditLogger.requestContext(req);
    await auditLogger.audit({
      userId: ctx.userId,
      action: "update",
      entity: "sensor",
      entityId: sensorId,
      newValue: {
        calibrationValue: data.calibrationValue,
        performedAt: data.performedAt.toISOString(),
        certificateRef: data.certificateRef,
      },
      ipAddress,
      userAgent,
    });
    return res.status(201).json({ status_code: 201, message: null, data });
  } catch (error) {
    return fail(res, error);
  }
}

export async function calibrationHistory(req: AuthRequest, res: Response) {
  try {
    const data = await service.getCalibrationHistory(
      ctxOf(req),
      Number(req.params.sensorId),
    );
    return res.status(200).json({ status_code: 200, message: null, data });
  } catch (error) {
    return fail(res, error);
  }
}
