import { authenticator } from "otplib";
import prisma from "../../config/prisma";
import { config } from "../../config";
import { BadRequestError, UnauthorizedError } from "../../utils/AppError";

/**
 * TOTP multi-factor authentication (§24).
 *
 * Enrolment is deliberately two-phase: `beginEnrolment` stores the secret but
 * leaves `mfaEnabledAt` null, and only `confirmEnrolment` — which requires a
 * valid code — turns enforcement on. A single-phase enrolment would lock a user
 * out permanently if they never successfully scanned the QR code.
 *
 * A one-step clock window is allowed either side, which tolerates ordinary
 * device clock drift without meaningfully widening the guess space.
 */

authenticator.options = { window: 1 };

const ISSUER = "SHM Platform";

export interface EnrolmentChallenge {
  secret: string;
  /** otpauth:// URI for QR rendering by the client. */
  otpauthUrl: string;
}

export async function beginEnrolment(userId: number): Promise<EnrolmentChallenge> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { emailId: true, mfaEnabledAt: true },
  });
  if (!user) throw new BadRequestError("User not found");
  if (user.mfaEnabledAt) {
    throw new BadRequestError(
      "Multi-factor authentication is already enabled. Disable it before re-enrolling.",
    );
  }

  const secret = authenticator.generateSecret();
  const otpauthUrl = authenticator.keyuri(user.emailId, ISSUER, secret);

  // Stored before confirmation so the code the user is about to type can be
  // checked against it. Enforcement stays off until confirmEnrolment succeeds.
  await prisma.user.update({
    where: { id: userId },
    data: { mfaSecret: secret },
  });

  return { secret, otpauthUrl };
}

export async function confirmEnrolment(
  userId: number,
  token: string,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { mfaSecret: true, mfaEnabledAt: true },
  });
  if (!user?.mfaSecret) {
    throw new BadRequestError("Start multi-factor enrolment first");
  }
  if (user.mfaEnabledAt) {
    throw new BadRequestError("Multi-factor authentication is already enabled");
  }
  if (!verifyToken(user.mfaSecret, token)) {
    throw new BadRequestError("That code is not valid. Check your authenticator app.");
  }

  await prisma.user.update({
    where: { id: userId },
    data: { mfaEnabledAt: new Date() },
  });
}

export async function disableMfa(userId: number, token: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { mfaSecret: true, mfaEnabledAt: true, isPlatformAdmin: true },
  });
  if (!user?.mfaEnabledAt || !user.mfaSecret) {
    throw new BadRequestError("Multi-factor authentication is not enabled");
  }
  // Turning MFA off is itself a sensitive action, so it requires a current code.
  if (!verifyToken(user.mfaSecret, token)) {
    throw new BadRequestError("That code is not valid");
  }
  if (user.isPlatformAdmin && config.requireMfaForPlatformAdmins) {
    throw new BadRequestError(
      "Multi-factor authentication is mandatory for platform administrators",
    );
  }

  await prisma.user.update({
    where: { id: userId },
    data: { mfaSecret: null, mfaEnabledAt: null },
  });
}

export function verifyToken(secret: string, token: string): boolean {
  if (!token || !/^\d{6}$/.test(token.trim())) return false;
  try {
    return authenticator.verify({ token: token.trim(), secret });
  } catch {
    return false;
  }
}

export interface MfaGate {
  /** True when the user must present a TOTP code to complete login. */
  required: boolean;
  /** True when the user should be told to enrol before proceeding. */
  enrolmentRequired: boolean;
}

/**
 * Whether login must be gated by MFA for this user.
 *
 * Platform operators are required to enrol (§94). Enforcement is configurable
 * so a first-run deployment can create its initial operator before any
 * authenticator app exists.
 */
export function evaluateMfaGate(user: {
  isPlatformAdmin: boolean;
  mfaEnabledAt: Date | null;
}): MfaGate {
  if (user.mfaEnabledAt) return { required: true, enrolmentRequired: false };
  if (user.isPlatformAdmin && config.requireMfaForPlatformAdmins) {
    return { required: false, enrolmentRequired: true };
  }
  return { required: false, enrolmentRequired: false };
}

export async function verifyUserToken(
  userId: number,
  token: string,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { mfaSecret: true, mfaEnabledAt: true },
  });
  if (!user?.mfaSecret || !user.mfaEnabledAt) {
    throw new UnauthorizedError("Multi-factor authentication is not enabled");
  }
  if (!verifyToken(user.mfaSecret, token)) {
    throw new UnauthorizedError("Invalid multi-factor code");
  }
}
