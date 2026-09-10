import { afterAll, beforeAll, describe, expect, test } from "vitest";
import prisma from "../src/config/prisma";
import {
  LOGIN_OTP_PURPOSE,
  consumeLoginOtp,
  loginOtpRequired,
} from "../src/modules/auth/login-otp.service";

/**
 * The emailed second factor for platform operators.
 *
 * The integration suites run with mail deliberately unconfigured (test/setup),
 * so the gate is off there and a platform admin signs in one step. That keeps
 * those suites deterministic but leaves this logic uncovered, which is what
 * this file is for: the decision function and the code-consuming function are
 * exercised directly.
 */

const EMAIL = "otp-unit@example.com";
let userId = 0;

async function makeUser() {
  const u = await prisma.user.create({
    data: {
      userType: "superadmin",
      firstName: "Otp",
      lastName: "Unit",
      emailId: EMAIL,
      phoneNo: "9876543210",
      password: "x",
      status: "true_" as never,
      isMailVerified: "true_" as never,
      isUserVerified: "true_" as never,
      isDelete: "false_" as never,
      isPlatformAdmin: true,
    },
  });
  userId = u.id;
  return u.id;
}

beforeAll(async () => {
  await prisma.tempOtp.deleteMany({
    where: { user: { emailId: EMAIL } },
  });
  await prisma.user.deleteMany({ where: { emailId: EMAIL } });
  await makeUser();
});

afterAll(async () => {
  if (!userId) return;
  await prisma.tempOtp.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
});

describe("loginOtpRequired", () => {
  test("is off for an ordinary user", () => {
    expect(
      loginOtpRequired({ isPlatformAdmin: false, mfaEnabledAt: null }),
    ).toBe(false);
  });

  test("is off for a platform admin who already uses an authenticator", () => {
    // TOTP is the stronger factor; asking for both is friction, not security.
    expect(
      loginOtpRequired({ isPlatformAdmin: true, mfaEnabledAt: new Date() }),
    ).toBe(false);
  });

  test("is off when mail cannot be sent, rather than locking the operator out", () => {
    // test/setup pins mail empty. Demanding a code no one can receive would
    // be worse than the single factor it replaces.
    expect(loginOtpRequired({ isPlatformAdmin: true, mfaEnabledAt: null })).toBe(
      false,
    );
  });
});

describe("consumeLoginOtp", () => {
  test("rejects when no code was ever issued", async () => {
    const id = userId || (await makeUser());
    await expect(consumeLoginOtp(id, "123456")).rejects.toThrow(
      /request a new sign-in code/i,
    );
  });

  test("rejects a wrong code and does NOT consume the real one", async () => {
    await prisma.tempOtp.create({
      data: { userId, otp: "111111", purpose: LOGIN_OTP_PURPOSE },
    });

    await expect(consumeLoginOtp(userId, "999999")).rejects.toThrow(
      /not correct/i,
    );

    // Still usable: deleting on a wrong guess would let anyone who knows the
    // address cancel an operator's code at will.
    await expect(consumeLoginOtp(userId, "111111")).resolves.toBeUndefined();
  });

  test("a correct code works exactly once", async () => {
    await prisma.tempOtp.create({
      data: { userId, otp: "222222", purpose: LOGIN_OTP_PURPOSE },
    });
    await expect(consumeLoginOtp(userId, "222222")).resolves.toBeUndefined();
    await expect(consumeLoginOtp(userId, "222222")).rejects.toThrow();
  });

  test("an expired code is refused", async () => {
    await prisma.tempOtp.create({
      data: {
        userId,
        otp: "333333",
        purpose: LOGIN_OTP_PURPOSE,
        createdAt: new Date(Date.now() - 11 * 60 * 1000),
      },
    });
    await expect(consumeLoginOtp(userId, "333333")).rejects.toThrow(/expired/i);
  });

  test("a PASSWORD RESET code cannot be used to sign in", async () => {
    // The reason temp_otps carries a purpose at all. Without it, the code
    // mailed for a reset would satisfy the second factor, and vice versa.
    await prisma.tempOtp.deleteMany({ where: { userId } });
    await prisma.tempOtp.create({
      data: { userId, otp: "444444", purpose: "password_reset" },
    });

    await expect(consumeLoginOtp(userId, "444444")).rejects.toThrow(
      /request a new sign-in code/i,
    );

    // And it is still there for the reset it was issued for.
    const still = await prisma.tempOtp.findFirst({
      where: { userId, purpose: "password_reset" },
    });
    expect(still?.otp).toBe("444444");
  });
});
