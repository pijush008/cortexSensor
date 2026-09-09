import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { UnauthorizedError } from "../../utils/AppError";
import { auditLogger } from "../../utils/audit";
import * as service from "./structures.service";
import {
  createLocationSchema,
  createStructureSchema,
  listStructuresQuerySchema,
  updateLocationSchema,
  updateStructureSchema,
} from "./structures.types";

function fail(res: Response, error: unknown) {
  const err = error as { statusCode?: number; message: string };
  const statusCode = err.statusCode || 400;
  return res.status(statusCode).json({
    status_code: statusCode,
    message: (err.message || "Something went wrong").replace(/"/g, ""),
  });
}

/** Zod issues are returned per-field so a form can mark the offending input. */
function invalid(res: Response, error: { issues: { path: (string | number)[]; message: string }[] }) {
  return res.status(400).json({
    status_code: 400,
    message: error.issues[0]?.message ?? "Invalid request",
    fields: error.issues.map((i) => ({
      field: i.path.join("."),
      message: i.message,
    })),
  });
}

function ctxOf(req: AuthRequest) {
  if (!req.auth) throw new UnauthorizedError("Unauthorized");
  return req.auth;
}

export async function list(req: AuthRequest, res: Response) {
  try {
    const parsed = listStructuresQuerySchema.safeParse(req.query);
    if (!parsed.success) return invalid(res, parsed.error);
    const data = await service.listStructures(ctxOf(req), parsed.data);
    return res.status(200).json({ status_code: 200, message: null, ...data });
  } catch (error) {
    return fail(res, error);
  }
}

export async function detail(req: AuthRequest, res: Response) {
  try {
    const data = await service.getStructure(ctxOf(req), Number(req.params.id));
    return res.status(200).json({ status_code: 200, message: null, data });
  } catch (error) {
    return fail(res, error);
  }
}

export async function create(req: AuthRequest, res: Response) {
  try {
    const parsed = createStructureSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error);
    const ctx = ctxOf(req);
    const data = await service.createStructure(ctx, parsed.data);
    const { ipAddress, userAgent } = auditLogger.requestContext(req);
    await auditLogger.audit({
      userId: ctx.userId,
      action: "create",
      entity: "structure",
      entityId: data.id,
      newValue: { code: data.code, name: data.name, projectId: data.projectId },
      ipAddress,
      userAgent,
    });
    return res.status(201).json({ status_code: 201, message: null, data });
  } catch (error) {
    return fail(res, error);
  }
}

export async function update(req: AuthRequest, res: Response) {
  try {
    const parsed = updateStructureSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error);
    const ctx = ctxOf(req);
    const id = Number(req.params.id);
    const data = await service.updateStructure(ctx, id, parsed.data);
    const { ipAddress, userAgent } = auditLogger.requestContext(req);
    await auditLogger.audit({
      userId: ctx.userId,
      action: "update",
      entity: "structure",
      entityId: id,
      // Serialized through JSON so the audit payload is a plain JSON value,
      // matching the column type rather than leaking Prisma-specific objects.
      newValue: JSON.parse(JSON.stringify(parsed.data)),
      ipAddress,
      userAgent,
    });
    return res.status(200).json({ status_code: 200, message: null, data });
  } catch (error) {
    return fail(res, error);
  }
}

export async function remove(req: AuthRequest, res: Response) {
  try {
    const ctx = ctxOf(req);
    const id = Number(req.params.id);
    const result = await service.deleteStructure(ctx, id);
    const { ipAddress, userAgent } = auditLogger.requestContext(req);
    await auditLogger.audit({
      userId: ctx.userId,
      action: "delete",
      entity: "structure",
      entityId: id,
      ipAddress,
      userAgent,
    });
    return res.status(200).json(result);
  } catch (error) {
    return fail(res, error);
  }
}

export async function listLocations(req: AuthRequest, res: Response) {
  try {
    const data = await service.listLocations(ctxOf(req), Number(req.params.id));
    return res.status(200).json({ status_code: 200, message: null, data });
  } catch (error) {
    return fail(res, error);
  }
}

export async function createLocation(req: AuthRequest, res: Response) {
  try {
    const parsed = createLocationSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error);
    const ctx = ctxOf(req);
    const data = await service.createLocation(
      ctx,
      Number(req.params.id),
      parsed.data,
    );
    const { ipAddress, userAgent } = auditLogger.requestContext(req);
    await auditLogger.audit({
      userId: ctx.userId,
      action: "create",
      entity: "location",
      entityId: data.id,
      newValue: { code: data.code, structureId: data.structureId },
      ipAddress,
      userAgent,
    });
    return res.status(201).json({ status_code: 201, message: null, data });
  } catch (error) {
    return fail(res, error);
  }
}

export async function updateLocation(req: AuthRequest, res: Response) {
  try {
    const parsed = updateLocationSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error);
    const data = await service.updateLocation(
      ctxOf(req),
      Number(req.params.locationId),
      parsed.data,
    );
    return res.status(200).json({ status_code: 200, message: null, data });
  } catch (error) {
    return fail(res, error);
  }
}

export async function removeLocation(req: AuthRequest, res: Response) {
  try {
    const ctx = ctxOf(req);
    const locationId = Number(req.params.locationId);
    const result = await service.deleteLocation(ctx, locationId);
    const { ipAddress, userAgent } = auditLogger.requestContext(req);
    await auditLogger.audit({
      userId: ctx.userId,
      action: "delete",
      entity: "location",
      entityId: locationId,
      ipAddress,
      userAgent,
    });
    return res.status(200).json(result);
  } catch (error) {
    return fail(res, error);
  }
}
