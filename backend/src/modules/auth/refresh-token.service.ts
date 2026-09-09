import crypto from "crypto";
import prisma from "../../config/prisma";
import { config } from "../../config";
import {
  signRefreshToken,
  verifyRefreshToken,
} from "../../utils/jwt";
import { v4 as uuidv4 } from "uuid";

export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function issueRefreshToken(userId: number): Promise<string> {
  const token = await signRefreshToken(userId);
  const familyId = uuidv4();

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashRefreshToken(token),
      familyId,
      expiresAt: new Date(Date.now() + config.expiresInMs(config.jwtRefreshExpiry)),
    },
  });

  return token;
}

export async function revokeRefreshToken(token: string): Promise<void> {
  if (!token) return;
  await prisma.refreshToken.updateMany({
    where: {
      tokenHash: hashRefreshToken(token),
      revokedAt: null,
      consumedAt: null,
    },
    data: { revokedAt: new Date(), consumedAt: new Date() },
  });
}

export async function revokeAllUserTokens(userId: number): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null, consumedAt: null },
    data: { revokedAt: new Date(), consumedAt: new Date() },
  });
}

export async function revokeFamily(familyId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date(), consumedAt: new Date() },
  });
}

/**
 * Rotate a refresh token. If a previously-consumed token is presented again
 * (replay), the entire family is revoked (theft detection).
 */
export async function rotateRefreshToken(
  oldToken: string,
): Promise<string | null> {
  if (!oldToken) return null;

  let payload;
  try {
    payload = verifyRefreshToken(oldToken);
  } catch {
    return null;
  }

  const tokenHash = hashRefreshToken(oldToken);
  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash },
  });

  if (!record) return null;
  if (record.revokedAt) return null;

  if (record.expiresAt.getTime() < Date.now()) {
    await revokeFamily(record.familyId);
    return null;
  }

  if (record.consumedAt) {
    await revokeFamily(record.familyId);
    return null;
  }

  const newToken = await signRefreshToken(payload.userId);

  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    }),
    prisma.refreshToken.create({
      data: {
        userId: record.userId,
        tokenHash: hashRefreshToken(newToken),
        familyId: record.familyId,
        expiresAt: new Date(
          Date.now() + config.expiresInMs(config.jwtRefreshExpiry),
        ),
      },
    }),
  ]);

  return newToken;
}