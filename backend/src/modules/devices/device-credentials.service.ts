import crypto from "crypto";
import prisma from "../../config/prisma";
import { logger } from "../../utils/logger";

/**
 * Per-device ingest credentials.
 *
 * Replaces a single fleet-wide `IOT_API_KEY`. That shared secret could not be
 * rotated for one device, could not be revoked when a unit was stolen from a
 * roadside cabinet, and — because ingest is multi-tenant — leaking it exposed
 * every customer's data path at once.
 *
 * Format presented by hardware:  `x-device-key: <keyId>.<secret>`
 *
 * The keyId is a public lookup handle so authentication is one indexed read.
 * Only a SHA-256 hash of the secret is stored, and the secret is returned
 * exactly once, at issue. Comparison is constant-time.
 */

const KEY_ID_BYTES = 12;
const SECRET_BYTES = 32;

export interface IssuedCredential {
  keyId: string;
  /** Full credential to configure on the device. Never retrievable again. */
  deviceKey: string;
  expiresAt: Date | null;
}

export function hashSecret(secret: string): string {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

/** Splits `<keyId>.<secret>`; returns null when the shape is wrong. */
export function parseDeviceKey(
  raw: string | undefined,
): { keyId: string; secret: string } | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const dot = trimmed.indexOf(".");
  if (dot <= 0 || dot === trimmed.length - 1) return null;
  const keyId = trimmed.slice(0, dot);
  const secret = trimmed.slice(dot + 1);
  if (!/^[A-Za-z0-9_-]{8,48}$/.test(keyId)) return null;
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(secret)) return null;
  return { keyId, secret };
}

export async function issueCredential(params: {
  tenantId: number;
  deviceId: number;
  label?: string;
  expiresAt?: Date | null;
  createdBy?: number;
}): Promise<IssuedCredential> {
  const keyId = `dk_${crypto.randomBytes(KEY_ID_BYTES).toString("base64url")}`;
  const secret = crypto.randomBytes(SECRET_BYTES).toString("base64url");

  await prisma.deviceCredential.create({
    data: {
      tenantId: params.tenantId,
      deviceId: params.deviceId,
      keyId,
      secretHash: hashSecret(secret),
      label: params.label ?? null,
      expiresAt: params.expiresAt ?? null,
      createdBy: params.createdBy ?? null,
    },
  });

  return {
    keyId,
    deviceKey: `${keyId}.${secret}`,
    expiresAt: params.expiresAt ?? null,
  };
}

export async function revokeCredential(
  tenantId: number,
  credentialId: number,
): Promise<boolean> {
  const result = await prisma.deviceCredential.updateMany({
    where: { id: credentialId, tenantId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count > 0;
}

export interface AuthenticatedDevice {
  deviceId: number;
  tenantId: number;
  credentialId: number;
}

/**
 * Verifies a presented device key.
 *
 * Returns null for every failure mode — unknown key, wrong secret, revoked,
 * expired — so a probing client cannot distinguish "this key does not exist"
 * from "this key exists but you got the secret wrong".
 */
export async function authenticateDeviceKey(
  raw: string | undefined,
): Promise<AuthenticatedDevice | null> {
  const parsed = parseDeviceKey(raw);
  if (!parsed) return null;

  const credential = await prisma.deviceCredential.findUnique({
    where: { keyId: parsed.keyId },
    select: {
      id: true,
      deviceId: true,
      tenantId: true,
      secretHash: true,
      revokedAt: true,
      expiresAt: true,
    },
  });
  if (!credential) return null;

  const presented = Buffer.from(hashSecret(parsed.secret));
  const stored = Buffer.from(credential.secretHash);
  if (presented.length !== stored.length) return null;
  if (!crypto.timingSafeEqual(presented, stored)) return null;

  if (credential.revokedAt) return null;
  if (credential.expiresAt && credential.expiresAt.getTime() < Date.now()) {
    return null;
  }

  // Best-effort last-used tracking: useful for spotting a device that has gone
  // quiet, but must never fail the request it is recording.
  prisma.deviceCredential
    .update({ where: { id: credential.id }, data: { lastUsedAt: new Date() } })
    .catch((err) => logger.warn(`Could not record credential use: ${String(err)}`));

  return {
    deviceId: credential.deviceId,
    tenantId: credential.tenantId,
    credentialId: credential.id,
  };
}

export async function listCredentials(tenantId: number, deviceId: number) {
  const rows = await prisma.deviceCredential.findMany({
    where: { tenantId, deviceId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      keyId: true,
      label: true,
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true,
      revokedAt: true,
    },
  });
  // Note: no secret field. It is unrecoverable by design — a credential store
  // that can show you the secret again is a credential store that can leak it.
  return rows;
}
