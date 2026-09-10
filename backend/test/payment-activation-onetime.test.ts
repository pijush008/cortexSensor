import crypto from "crypto";
import request from "supertest";
import { afterAll, describe, expect, test } from "vitest";
import app from "../src/app";
import prisma from "../src/config/prisma";
import { TINY_PNG } from "./fixtures/registration";

/**
 * A ONE-TIME payment activates the account it paid for.
 *
 * This is distinct from payment-activation.test.ts, which covers recurring
 * plans: that suite writes `providerSubscriptionId` onto the row itself before
 * sending the webhook, so it proves the matcher works when a provider-side
 * subscription exists.
 *
 * Nothing in the real signup flow ever writes that column. A one-time order
 * payment has no provider subscription at all, so the charge settled, the
 * webhook was accepted with 200, and the account was never activated — the
 * person waited at "confirming your payment" forever. The fix is that checkout
 * sends our own id in the provider's metadata and the matcher falls back to it.
 */

const SECRET = "test-webhook-secret"; // pinned in test/setup.ts
const created: number[] = [];

function signed(body: string) {
  return crypto.createHmac("sha256", SECRET).update(body).digest("hex");
}

afterAll(async () => {
  for (const id of created) {
    await prisma.subscription.deleteMany({ where: { adminId: id } });
    await prisma.membership.deleteMany({ where: { userId: id } });
    await prisma.tenant.deleteMany({ where: { slug: `org-${id}` } });
    await prisma.user.deleteMany({ where: { id } });
  }
});

async function registerAdmin(email: string) {
  await request(app).post("/api/register/admin").send({
    firstName: "One",
    lastName: "Time",
    emailId: email,
    phoneNo: "9876543210",
    password: "Password1!",
    companyName: "One Time Co",
    companyLogo: TINY_PNG,
  });
  const user = await prisma.user.findUniqueOrThrow({
    where: { emailId: email },
  });
  created.push(user.id);
  return prisma.subscription.findUniqueOrThrow({ where: { adminId: user.id } });
}

describe("one-time payment activation", () => {
  test("activates the subscription named in the provider's metadata", async () => {
    const sub = await registerAdmin(`onetime-${Date.now()}@example.com`);
    expect(sub.status).toBe("pending");
    // The column the old matcher relied on is never populated by signup.
    expect(sub.providerSubscriptionId).toBeNull();

    const body = JSON.stringify({
      id: `evt-${Date.now()}`,
      type: "payment.succeeded",
      data: { localSubscriptionId: sub.id, amount: 499900, currency: "INR" },
    });

    const res = await request(app)
      .post("/api/billing/webhook")
      .set("Content-Type", "application/json")
      .set("x-signature", signed(body))
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Subscription activated");

    const after = await prisma.subscription.findUniqueOrThrow({
      where: { id: sub.id },
    });
    expect(after.status).toBe("active");
    expect(after.currentPeriodEnd).not.toBeNull();
  });

  test("an unsigned request activates nothing", async () => {
    const sub = await registerAdmin(`unsigned-${Date.now()}@example.com`);

    const body = JSON.stringify({
      id: `evt-unsigned-${Date.now()}`,
      type: "payment.succeeded",
      data: { localSubscriptionId: sub.id },
    });

    const res = await request(app)
      .post("/api/billing/webhook")
      .set("Content-Type", "application/json")
      .set("x-signature", "0".repeat(64))
      .send(body);

    expect(res.status).toBe(401);
    const after = await prisma.subscription.findUniqueOrThrow({
      where: { id: sub.id },
    });
    expect(after.status).toBe("pending");
  });

  test("an unknown subscription id activates nothing", async () => {
    const body = JSON.stringify({
      id: `evt-missing-${Date.now()}`,
      type: "payment.succeeded",
      data: { localSubscriptionId: 99999999 },
    });

    const res = await request(app)
      .post("/api/billing/webhook")
      .set("Content-Type", "application/json")
      .set("x-signature", signed(body))
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("No matching subscription for this event");
  });
});
