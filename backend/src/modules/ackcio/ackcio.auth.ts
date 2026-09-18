import crypto from "crypto";
import { NextFunction, Request, Response } from "express";
import prisma from "../../config/prisma";
import { UnauthorizedError } from "../../utils/AppError";
import { logger } from "../../utils/logger";
import { authenticateDeviceKey } from "../devices/device-credentials.service";
import type { ResolvedGateway } from "./ackcio.service";

/**
 * Who is pushing.
 *
 * An Ackcio gateway's dashboard takes a URL and nothing else, so the secret
 * has to be part of the address: `POST /api/v1/ingest/ackcio/<token>`. The
 * token is issued per gateway from the console, stored only as a SHA-256
 * hash, and replaced by re-issuing, which is how a URL that has leaked is
 * revoked without touching any other gateway.
 *
 * Two other forms are accepted for hardware that CAN set a header, so the
 * same endpoint serves a proxy or a test rig without a secret in its logs:
 *
 *   x-gateway-token: <token>          the same per-gateway token
 *   x-device-key:    <keyId>.<secret>  an existing per-device credential,
 *                                      resolved to the device's gateway
 */

export interface GatewayPushRequest extends Request {
  gateway?: ResolvedGateway;
}

export function hashIngestToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{32,128}$/;

export async function resolveGatewayByToken(raw: string | undefined): Promise<ResolvedGateway | null> {
  const token = (raw ?? "").trim();
  if (!TOKEN_SHAPE.test(token)) return null;

  const gateway = await prisma.gateway.findUnique({
    where: { ingestTokenHash: hashIngestToken(token) },
    select: { id: true, tenantId: true, gatewayKey: true, status: true },
  });
  if (!gateway) return null;
  if (gateway.status === "decommissioned") return null;

  prisma.gateway
    .update({ where: { id: gateway.id }, data: { ingestTokenLastUsedAt: new Date() } })
    .catch((err) => logger.warn(`Could not record ingest token use: ${String(err)}`));

  return { id: gateway.id, tenantId: gateway.tenantId, gatewayKey: gateway.gatewayKey };
}

export async function resolveGatewayByDeviceKey(raw: string | undefined): Promise<ResolvedGateway | null> {
  const device = await authenticateDeviceKey(raw);
  if (!device) return null;
  const row = await prisma.device.findUnique({
    where: { id: device.deviceId },
    select: { gateway: { select: { id: true, tenantId: true, gatewayKey: true, status: true } } },
  });
  const gateway = row?.gateway;
  if (!gateway || gateway.status === "decommissioned") return null;
  if (gateway.tenantId !== device.tenantId) return null;
  return { id: gateway.id, tenantId: gateway.tenantId, gatewayKey: gateway.gatewayKey };
}

export async function authenticateGatewayPush(
  req: GatewayPushRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const pathToken = typeof req.params.token === "string" ? req.params.token : undefined;
    const headerToken = req.header("x-gateway-token");
    const deviceKey = req.header("x-device-key");

    let gateway: ResolvedGateway | null = null;
    if (pathToken || headerToken) {
      gateway = await resolveGatewayByToken(pathToken ?? headerToken);
    } else if (deviceKey) {
      gateway = await resolveGatewayByDeviceKey(deviceKey);
    }

    if (!gateway) {
      // One message for every failure, so a probing client learns nothing
      // about which tokens exist.
      return next(new UnauthorizedError("Missing or invalid gateway credential"));
    }
    req.gateway = gateway;
    return next();
  } catch (err) {
    return next(err as Error);
  }
}
