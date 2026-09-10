import crypto from "crypto";
import prisma from "../../config/prisma";
import { config } from "../../config";
import { BadRequestError, UnauthorizedError } from "../../utils/AppError";
import { isEmailConfigured, sendEmail } from "../../utils/email";
import { logger } from "../../utils/logger";

/**
 * Email one-time codes as a second factor for platform operators.
 *
 * A platform admin can see and act across every tenant on the deployment, so a
 * password alone is a single point of failure for the whole platform. This adds
 * a factor that lives in a different place: a code mailed to the address on the
 * account, which an attacker holding only the password does not receive.
 *
 * Deliberately separate from the TOTP path in mfa.service. TOTP is the stronger
 * factor and remains the goal for operators who enrol; this covers the operator
 * who has not enrolled yet, where the alternative today is a password on its own.
 */

export const LOGIN_OTP_PURPOSE = "login";

/** Long enough that guessing is impractical within the window and the rate limit. */
const OTP_DIGITS = 6;
const OTP_TTL_MS = 10 * 60 * 1000;

function generateOtp(): string {
  // crypto, not Math.random: a predictable second factor is not a second factor.
  const max = 10 ** OTP_DIGITS;
  const n = crypto.randomInt(0, max);
  return String(n).padStart(OTP_DIGITS, "0");
}

/**
 * True when this account must clear an emailed code before a session is issued.
 *
 * Requires mail to be configured. Demanding a code this deployment cannot send
 * would lock every operator out of their own platform, which is a worse outcome
 * than the weaker factor it was meant to replace.
 */
export function loginOtpRequired(user: {
  isPlatformAdmin: boolean;
  mfaEnabledAt: Date | null;
}): boolean {
  if (!config.requireMfaForPlatformAdmins) return false;
  if (!user.isPlatformAdmin) return false;
  // An enrolled authenticator is the stronger factor; do not ask for both.
  if (user.mfaEnabledAt) return false;
  return isEmailConfigured();
}

/** Issues a code and mails it. Any earlier login code for this user is void. */
export async function issueLoginOtp(user: {
  id: number;
  emailId: string;
  firstName: string;
}): Promise<void> {
  const otp = generateOtp();

  // Scoped delete: a pending PASSWORD RESET code for the same person must
  // survive, and a login code must never satisfy a reset.
  await prisma.tempOtp.deleteMany({
    where: { userId: user.id, purpose: LOGIN_OTP_PURPOSE },
  });
  await prisma.tempOtp.create({
    data: { userId: user.id, otp, purpose: LOGIN_OTP_PURPOSE },
  });

  const minutes = OTP_TTL_MS / 60000;
  await sendEmail({
    to: user.emailId,
    subject: `${otp} is your sign-in code`,
    html: `
      <p>Hello ${user.firstName},</p>
      <p>Your sign-in code for the Cloudglance monitoring console is:</p>
      <p style="font-size:24px;font-weight:700;letter-spacing:4px">${otp}</p>
      <p>It expires in ${minutes} minutes and can be used once.</p>
      <p>If you did not try to sign in, your password may be known to someone
         else — change it.</p>
    `.trim(),
    text: `Your sign-in code is ${otp}. It expires in ${minutes} minutes.\n\nIf you did not try to sign in, change your password.`,
  });

  logger.info(`Sign-in code issued for platform admin ${user.id}`);
}

/**
 * Checks a submitted code and consumes it.
 *
 * Consumed on SUCCESS only. Deleting on failure would let anyone who knows the
 * email cancel an operator's code at will; the attempt limit is the rate
 * limiter's job, and the ten-minute window bounds the rest.
 */
export async function consumeLoginOtp(
  userId: number,
  submitted: string,
): Promise<void> {
  const record = await prisma.tempOtp.findFirst({
    where: { userId, purpose: LOGIN_OTP_PURPOSE },
    orderBy: { createdAt: "desc" },
  });

  if (!record) {
    throw new UnauthorizedError("Request a new sign-in code");
  }

  if (Date.now() - record.createdAt.getTime() > OTP_TTL_MS) {
    await prisma.tempOtp.deleteMany({
      where: { userId, purpose: LOGIN_OTP_PURPOSE },
    });
    throw new BadRequestError("That code has expired. Request a new one.");
  }

  if (record.otp !== submitted.trim()) {
    throw new UnauthorizedError("That code is not correct");
  }

  await prisma.tempOtp.deleteMany({
    where: { userId, purpose: LOGIN_OTP_PURPOSE },
  });
}
