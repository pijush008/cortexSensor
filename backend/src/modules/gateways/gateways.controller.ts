import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { NotFoundError, UnauthorizedError } from "../../utils/AppError";
import { auditLogger } from "../../utils/audit";
import prisma from "../../config/prisma";
import { tenantScope } from "../rbac/rbac.service";
import * as service from "./gateways.service";
import * as credentials from "../devices/device-credentials.service";
import {
  createGatewaySchema,
  issueCredentialSchema,
  listGatewaysQuerySchema,
  updateGatewaySchema,
} from "./gateways.types";

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

export async function list(req: AuthRequest, res: Response) {
  try {
    const parsed = listGatewaysQuerySchema.safeParse(req.query);
    if (!parsed.success) return invalid(res, parsed.error);
    const data = await service.listGateways(ctxOf(req), parsed.data);
    return res.status(200).json({ status_code: 200, message: null, ...data });
  } catch (error) {
    return fail(res, error);
  }
}

export async function detail(req: AuthRequest, res: Response) {
  try {
    const data = await service.getGateway(ctxOf(req), Number(req.params.id));
    return res.status(200).json({ status_code: 200, message: null, data });
  } catch (error) {
    return fail(res, error);
  }
}

export async function create(req: AuthRequest, res: Response) {
  try {
    const parsed = createGatewaySchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error);
    const ctx = ctxOf(req);
    const data = await service.createGateway(ctx, parsed.data);
    const { ipAddress, userAgent } = auditLogger.requestContext(req);
    await auditLogger.audit({
      userId: ctx.userId,
      action: "create",
      entity: "gateway",
      entityId: data.id,
      newValue: { gatewayKey: data.gatewayKey, name: data.name },
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
    const parsed = updateGatewaySchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error);
    const ctx = ctxOf(req);
    const id = Number(req.params.id);
    const data = await service.updateGateway(ctx, id, parsed.data);
    const { ipAddress, userAgent } = auditLogger.requestContext(req);
    await auditLogger.audit({
      userId: ctx.userId,
      action: "update",
      entity: "gateway",
      entityId: id,
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
    const result = await service.deleteGateway(ctx, id);
    const { ipAddress, userAgent } = auditLogger.requestContext(req);
    await auditLogger.audit({
      userId: ctx.userId,
      action: "delete",
      entity: "gateway",
      entityId: id,
      ipAddress,
      userAgent,
    });
    return res.status(200).json(result);
  } catch (error) {
    return fail(res, error);
  }
}

/** Confirms the device belongs to the caller's tenant before touching its keys. */
async function assertDeviceInScope(req: AuthRequest, deviceId: number) {
  const ctx = ctxOf(req);
  const device = await prisma.device.findFirst({
    where: { id: deviceId, ...tenantScope(ctx) },
    select: { id: true, tenantId: true },
  });
  if (!device || device.tenantId === null) throw new NotFoundError("Device not found");
  return { ctx, device };
}

export async function issueDeviceCredential(req: AuthRequest, res: Response) {
  try {
    const parsed = issueCredentialSchema.safeParse(req.body ?? {});
    if (!parsed.success) return invalid(res, parsed.error);

    const deviceId = Number(req.params.deviceId);
    const { ctx, device } = await assertDeviceInScope(req, deviceId);

    const issued = await credentials.issueCredential({
      tenantId: device.tenantId!,
      deviceId,
      label: parsed.data.label,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
      createdBy: ctx.userId,
    });

    const { ipAddress, userAgent } = auditLogger.requestContext(req);
    await auditLogger.audit({
      userId: ctx.userId,
      action: "assign",
      entity: "device",
      entityId: deviceId,
      // The keyId only. The secret is never written anywhere it could be read
      // back — including the audit trail.
      newValue: { credentialIssued: issued.keyId },
      ipAddress,
      userAgent,
    });

    return res.status(201).json({
      status_code: 201,
      message:
        "Store this device key now. It is shown once and cannot be retrieved again.",
      data: issued,
    });
  } catch (error) {
    return fail(res, error);
  }
}

export async function listDeviceCredentials(req: AuthRequest, res: Response) {
  try {
    const deviceId = Number(req.params.deviceId);
    const { device } = await assertDeviceInScope(req, deviceId);
    const data = await credentials.listCredentials(device.tenantId!, deviceId);
    return res.status(200).json({ status_code: 200, message: null, data });
  } catch (error) {
    return fail(res, error);
  }
}

export async function revokeDeviceCredential(req: AuthRequest, res: Response) {
  try {
    const deviceId = Number(req.params.deviceId);
    const credentialId = Number(req.params.credentialId);
    const { ctx, device } = await assertDeviceInScope(req, deviceId);

    const revoked = await credentials.revokeCredential(device.tenantId!, credentialId);
    if (!revoked) throw new NotFoundError("Credential not found or already revoked");

    const { ipAddress, userAgent } = auditLogger.requestContext(req);
    await auditLogger.audit({
      userId: ctx.userId,
      action: "unassign",
      entity: "device",
      entityId: deviceId,
      newValue: { credentialRevoked: credentialId },
      ipAddress,
      userAgent,
    });

    return res.status(200).json({ status_code: 200, message: "Credential revoked" });
  } catch (error) {
    return fail(res, error);
  }
}
