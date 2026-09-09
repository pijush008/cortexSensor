import request from "supertest";
import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import app from "../src/app";
import prisma from "../src/config/prisma";

/**
 * What a failed sign-in is allowed to disclose.
 *
 * A login endpoint that answers "User not found" for one address and "Invalid
 * password" for another is an account enumeration oracle: anyone can discover
 * which email addresses hold accounts here simply by watching which of the two
 * replies comes back. That list is the starting point for credential stuffing,
 * and on a monitoring platform it also reveals who operates which
 * infrastructure.
 *
 * These tests hold the endpoint to one status and one message regardless of
 * which half of the credential was wrong.
 */

const EMAIL = "login-failure@example.com";
const PASSWORD = "Password1!";
const ABSENT = "no-such-account@example.com";

beforeAll(async () => {
  await prisma.$connect();
  const stale = await prisma.user.findMany({
    where: { emailId: { in: [EMAIL, ABSENT] } },
    select: { id: true },
  });
  if (stale.length > 0) {
    const ids = stale.map((u) => u.id);
    await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.user.create({
    data: {
      emailId: EMAIL,
      firstName: "Login",
      lastName: "Failure",
      phoneNo: "0000000000",
      password: await bcrypt.hash(PASSWORD, 10),
      userType: "admin",
      isMailVerified: "true_" as never,
      isUserVerified: "true_" as never,
      status: "true_" as never,
      isDelete: "false_" as never,
    },
  });
});

afterAll(async () => {
  // The successful sign-in issues a refresh token, which holds a foreign key to
  // the user. Children first, or the delete is rejected.
  const users = await prisma.user.findMany({
    where: { emailId: { in: [EMAIL, ABSENT] } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  if (userIds.length > 0) {
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  await prisma.$disconnect();
});

describe("a failed sign-in", () => {
  test("does not reveal whether the account exists", async () => {
    const wrongPassword = await request(app)
      .post("/api/v1/commonLogin")
      .send({ username: EMAIL, password: "definitely-not-it" });

    const noSuchUser = await request(app)
      .post("/api/v1/commonLogin")
      .send({ username: ABSENT, password: "definitely-not-it" });

    // Identical status AND identical body. Either one differing is enough to
    // tell the two cases apart.
    expect(wrongPassword.status).toBe(noSuchUser.status);
    expect(wrongPassword.body.message).toBe(noSuchUser.body.message);
    expect(wrongPassword.body.message).not.toMatch(/not found|invalid password/i);
  });

  test("is a 401, not a 400", async () => {
    // 400 tells the client its request was malformed, which is untrue and sends
    // the sign-in form down a generic "the request was rejected" path instead of
    // saying the credentials were wrong.
    const res = await request(app)
      .post("/api/v1/commonLogin")
      .send({ username: EMAIL, password: "definitely-not-it" });

    expect(res.status).toBe(401);
  });

  test("still lets the real credentials through", async () => {
    // The guard against a fix that closes the oracle by rejecting everyone.
    const res = await request(app)
      .post("/api/v1/commonLogin")
      .send({ username: EMAIL, password: PASSWORD });

    expect(res.status).toBe(200);
  });
});
