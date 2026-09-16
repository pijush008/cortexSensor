import { afterAll, beforeAll, describe, expect, test } from "vitest";
import request from "supertest";
import { authenticator } from "otplib";
import app from "../src/app";
import prisma from "../src/config/prisma";
import { signPendingMfaToken, signPasswordResetToken } from "../src/utils/jwt";
import { PENDING_MFA_COOKIE } from "../src/modules/auth/google.routes";

/**
 * A platform operator signing in with Google.
 *
 * Google proves control of a mailbox. For an operator that is not enough on its
 * own: the account reaches every tenant on the deployment, so one compromised
 * mailbox would be the entire platform. The authenticator is the factor an
 * attacker holding the mailbox does not also hold.
 *
 * The property under test is therefore narrow and absolute: no session exists
 * until the authenticator code is accepted, and nothing the CLIENT sends may
 * decide whose session it is.
 */

const EMAIL = "google-mfa-operator@example.com";
let userId = 0;
let secret = "";

/**
 * A successful sign-in mints refresh tokens, and refresh_tokens restricts
 * deletion of its user — so the fixture has to be torn down in order rather
 * than deleted outright.
 */
async function removeUser(email: string) {
  const existing = await prisma.user.findUnique({
    where: { emailId: email },
    select: { id: true },
  });
  if (!existing) return;
  await prisma.refreshToken.deleteMany({ where: { userId: existing.id } });
  await prisma.passwordResetToken.deleteMany({ where: { userId: existing.id } });
  await prisma.user.delete({ where: { id: existing.id } });
}

beforeAll(async () => {
  await removeUser(EMAIL);
  secret = authenticator.generateSecret();
  const u = await prisma.user.create({
    data: {
      userType: "superadmin" as never,
      isPlatformAdmin: true,
      firstName: "Op",
      lastName: "Erator",
      emailId: EMAIL,
      phoneNo: "",
      password: "x".repeat(60),
      status: "true_" as never,
      isMailVerified: "true_" as never,
      isUserVerified: "true_" as never,
      isDelete: "false_" as never,
      mfaSecret: secret,
      mfaEnabledAt: new Date(),
    },
    select: { id: true },
  });
  userId = u.id;
});

afterAll(async () => {
  await removeUser(EMAIL);
});

async function pendingCookie(forUserId = userId) {
  return `${PENDING_MFA_COOKIE}=${await signPendingMfaToken(forUserId)}`;
}

describe("finishing a Google sign-in with an authenticator", () => {
  test("a correct code issues the session", async () => {
    const res = await request(app)
      .post("/api/auth/google/mfa")
      .set("Cookie", await pendingCookie())
      .send({ mfaToken: authenticator.generate(secret) });

    expect(res.status).toBe(200);
    expect(res.body.userID).toBe(userId);
    const cookies = String(res.headers["set-cookie"] ?? "");
    expect(cookies).toContain("shm_access");
    expect(cookies).toContain("shm_refresh");
  });

  test("a wrong code issues NO session", async () => {
    const res = await request(app)
      .post("/api/auth/google/mfa")
      .set("Cookie", await pendingCookie())
      .send({ mfaToken: "000000" });

    expect(res.status).toBe(401);
    expect(String(res.headers["set-cookie"] ?? "")).not.toContain("shm_access=ey");
  });

  test("without the pending cookie there is nothing to finish", async () => {
    // The whole point: a correct code alone proves nothing about WHO is signing
    // in, so the account must come from the signed cookie.
    const res = await request(app)
      .post("/api/auth/google/mfa")
      .send({ mfaToken: authenticator.generate(secret) });
    expect(res.status).toBe(401);
  });

  test("a token minted for another purpose cannot finish a sign-in", async () => {
    // A password-reset token also carries a userId and is signed with the same
    // secret. Only the stamped purpose separates them.
    const reset = await signPasswordResetToken(userId);
    const res = await request(app)
      .post("/api/auth/google/mfa")
      .set("Cookie", `${PENDING_MFA_COOKIE}=${reset}`)
      .send({ mfaToken: authenticator.generate(secret) });
    expect(res.status).toBe(401);
    expect(String(res.headers["set-cookie"] ?? "")).not.toContain("shm_access=ey");
  });

  test("a malformed code is rejected before any verification", async () => {
    const res = await request(app)
      .post("/api/auth/google/mfa")
      .set("Cookie", await pendingCookie())
      .send({ mfaToken: "12" });
    expect(res.status).toBe(400);
  });
});

describe("who Google admits", () => {
  test("an operator WITHOUT an authenticator is refused", async () => {
    const email = "google-mfa-unenrolled@example.com";
    await removeUser(email);
    const u = await prisma.user.create({
      data: {
        userType: "superadmin" as never,
        isPlatformAdmin: true,
        firstName: "No",
        lastName: "Totp",
        emailId: email,
        phoneNo: "",
        password: "x".repeat(60),
        status: "true_" as never,
        isMailVerified: "true_" as never,
        isUserVerified: "true_" as never,
        isDelete: "false_" as never,
      },
      select: { id: true },
    });

    const { resolveUser } = await import("../src/modules/auth/google.service");
    await expect(
      resolveUser({ email, emailVerified: true, firstName: "No", lastName: "Totp" } as never),
    ).rejects.toThrow(/authenticator app/i);

    void u;
    await removeUser(email);
  });

  test("an organization admin is still refused outright", async () => {
    const email = "google-mfa-orgadmin@example.com";
    await removeUser(email);
    const u = await prisma.user.create({
      data: {
        userType: "admin" as never,
        isPlatformAdmin: false,
        firstName: "Org",
        lastName: "Admin",
        emailId: email,
        phoneNo: "",
        password: "x".repeat(60),
        status: "true_" as never,
        isMailVerified: "true_" as never,
        isUserVerified: "true_" as never,
        isDelete: "false_" as never,
      },
      select: { id: true },
    });

    const { resolveUser } = await import("../src/modules/auth/google.service");
    await expect(
      resolveUser({ email, emailVerified: true, firstName: "Org", lastName: "Admin" } as never),
    ).rejects.toThrow(/administrator account/i);

    void u;
    await removeUser(email);
  });
});
