import request from "supertest";
import { afterAll, describe, expect, test } from "vitest";
import app from "../src/app";
import prisma from "../src/config/prisma";
import { verifyCheckoutToken } from "../src/utils/jwt";
import { TINY_PNG } from "./fixtures/registration";

/**
 * Registration hands the new admin the one credential they can use.
 *
 * They cannot sign in — the account is inactive until payment clears — so the
 * checkout token is the only thing standing between registering and being able
 * to pay. If registration does not return it, the flow dead-ends.
 */

const created: number[] = [];

async function drop(userId: number) {
  await prisma.subscription.deleteMany({ where: { adminId: userId } });
  await prisma.membership.deleteMany({ where: { userId } });
  await prisma.tenant.deleteMany({ where: { slug: `org-${userId}` } });
  await prisma.user.deleteMany({ where: { id: userId } });
}

afterAll(async () => {
  for (const id of created) await drop(id);
});

describe("registration returns a checkout token", () => {
  test("an admin registration returns a token that resolves to that admin", async () => {
    const email = `tok-${Date.now()}@example.com`;
    const res = await request(app).post("/api/register/admin").send({
      firstName: "Tok",
      lastName: "En",
      emailId: email,
      phoneNo: "9876543210",
      password: "Password1!",
      companyName: "Token Co",
      companyLogo: TINY_PNG,
    });

    expect(res.status).toBe(200);
    expect(typeof res.body.checkoutToken).toBe("string");

    const user = await prisma.user.findUniqueOrThrow({
      where: { emailId: email },
    });
    created.push(user.id);

    // The token must name THIS admin — a token for the wrong account would let
    // one organization's payment activate another's.
    expect(verifyCheckoutToken(res.body.checkoutToken).userId).toBe(user.id);
  });

  test("the token registration returns actually starts a checkout", async () => {
    const email = `tok2-${Date.now()}@example.com`;
    const reg = await request(app).post("/api/register/admin").send({
      firstName: "Tok",
      lastName: "Two",
      emailId: email,
      phoneNo: "9876543210",
      password: "Password1!",
      companyName: "Token Two Co",
      companyLogo: TINY_PNG,
    });
    const user = await prisma.user.findUniqueOrThrow({
      where: { emailId: email },
    });
    created.push(user.id);

    // End to end through the real route: no provider is configured in tests, so
    // the proof the token was ACCEPTED is that it fails at the provider (503)
    // rather than at the token check (401).
    const start = await request(app)
      .post("/api/billing/checkout/start")
      .send({ checkoutToken: reg.body.checkoutToken });

    expect(start.status).toBe(503);
    expect(start.status).not.toBe(401);
  });
});
