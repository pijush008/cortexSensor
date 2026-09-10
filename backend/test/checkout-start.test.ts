import request from "supertest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import app from "../src/app";
import prisma from "../src/config/prisma";
import { signCheckoutToken, signPasswordResetToken } from "../src/utils/jwt";
import { TINY_PNG } from "./fixtures/registration";

/**
 * Starting payment for an account that cannot sign in yet.
 *
 * A new organization admin is inactive until a webhook confirms their charge,
 * so there is no session to authenticate a checkout with. This endpoint is
 * unauthenticated by necessity, which makes the token check the ONLY thing
 * standing between a stranger and someone else's checkout — so most of what is
 * tested here is what the endpoint refuses.
 */

const EMAIL = "checkout-start@example.com";

async function cleanup() {
  const user = await prisma.user.findUnique({ where: { emailId: EMAIL } });
  if (!user) return;
  await prisma.subscription.deleteMany({ where: { adminId: user.id } });
  await prisma.membership.deleteMany({ where: { userId: user.id } });
  await prisma.tenant.deleteMany({ where: { slug: `org-${user.id}` } });
  await prisma.user.delete({ where: { id: user.id } });
}

describe("POST /api/billing/checkout/start", () => {
  let token = "";
  let userId = 0;

  beforeAll(async () => {
    await cleanup();
    await request(app).post("/api/register/admin").send({
      firstName: "Check",
      lastName: "Out",
      emailId: EMAIL,
      phoneNo: "9876543210",
      password: "Password1!",
      companyName: "Checkout Co",
      companyLogo: TINY_PNG,
    });
    const user = await prisma.user.findUniqueOrThrow({
      where: { emailId: EMAIL },
    });
    userId = user.id;
    token = await signCheckoutToken(user.id);
  });

  afterAll(cleanup);

  test("rejects a missing token", async () => {
    const res = await request(app).post("/api/billing/checkout/start").send({});
    expect(res.status).toBe(401);
  });

  test("rejects a malformed token", async () => {
    const res = await request(app)
      .post("/api/billing/checkout/start")
      .send({ checkoutToken: "not-a-jwt" });
    expect(res.status).toBe(401);
  });

  test("rejects a token signed for a different purpose", async () => {
    // Same secret as the checkout token. Without the purpose check, a password
    // reset link would be a licence to start a charge.
    const reset = await signPasswordResetToken(userId);
    const res = await request(app)
      .post("/api/billing/checkout/start")
      .send({ checkoutToken: reset });
    expect(res.status).toBe(401);
  });

  test("refuses rather than pretending when no provider can open an order", async () => {
    // BILLING_PROVIDER is unset in test/setup.ts, so the generic adapter is
    // active. It verifies webhooks but has no API to open an order against,
    // and must say so instead of inventing one.
    const res = await request(app)
      .post("/api/billing/checkout/start")
      .send({ checkoutToken: token });

    expect(res.status).toBe(503);
    expect(String(res.body.message)).toMatch(
      /not configured|cannot start a checkout/i,
    );
    expect(res.body).not.toHaveProperty("orderId");
  });
});
