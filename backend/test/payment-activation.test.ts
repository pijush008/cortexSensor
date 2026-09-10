import crypto from "crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import app from "../src/app";
import prisma from "../src/config/prisma";
import { TINY_PNG } from "./fixtures/registration";

/**
 * Registration is not enough to sign in. Payment is.
 *
 * The rule under test: a new organization admin's account is opened by a
 * SIGNED WEBHOOK from the payment provider and by nothing else. Not by
 * registering, not by verifying their email, and above all not by the browser
 * coming back from a checkout page saying it went well — that return can be
 * replayed, forged, or fired before the charge settles.
 */

const EMAIL = "pay-gate-admin@example.com";
const PASSWORD = "Password1!";
const SECRET = "test-webhook-secret"; // pinned in test/setup.ts

function signedWebhook(body: string) {
  return crypto.createHmac("sha256", SECRET).update(body, "utf8").digest("hex");
}

async function purge() {
  const users = await prisma.user.findMany({
    where: { emailId: EMAIL },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length === 0) return;

  const subs = await prisma.subscription.findMany({
    where: { adminId: { in: ids } },
    select: { id: true, tenantId: true },
  });
  await prisma.invoice.deleteMany({
    where: { subscriptionId: { in: subs.map((s) => s.id) } },
  });
  await prisma.subscription.deleteMany({ where: { adminId: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { userId: { in: ids } } });
  await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
  await prisma.membership.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });

  const tenantIds = subs.map((s) => s.tenantId).filter((t): t is number => t !== null);
  if (tenantIds.length > 0) {
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  }
}

let adminId = 0;
let providerSubscriptionId = "";

beforeAll(async () => {
  await prisma.$connect();
  await purge();

  const res = await request(app).post("/api/v1/register/admin").send({
      companyName: `Test Org ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      companyLogo: TINY_PNG,
    firstName: "Pay",
    lastName: "Gate",
    emailId: EMAIL,
    phoneNo: "9000000000",
    password: PASSWORD,
  });
  expect(res.status).toBe(200);

  const user = await prisma.user.findFirstOrThrow({ where: { emailId: EMAIL } });
  adminId = user.id;

  // Email verification is a separate gate; clear it so the only thing left
  // standing between this account and a session is payment.
  await prisma.user.update({
    where: { id: adminId },
    data: { isMailVerified: "true_" as never },
  });

  // Checkout records the provider's id against the tenant's subscription. That
  // link is what makes a later webhook attributable without trusting the client.
  providerSubscriptionId = `sub_test_${Date.now()}`;
  await prisma.subscription.update({
    where: { adminId },
    data: { providerSubscriptionId },
  });
});

afterAll(async () => {
  await purge();
  await prisma.$disconnect();
});

function login() {
  return request(app)
    .post("/api/v1/commonLogin")
    .send({ username: EMAIL, password: PASSWORD });
}

describe("a registered admin who has not paid", () => {
  test("cannot sign in", async () => {
    const res = await login();
    expect(res.status).toBe(403);
    expect(String(res.body.message)).toMatch(/not active yet|payment/i);
  });

  test("is not activated by an UNSIGNED webhook", async () => {
    // The whole point of the signature. Anyone can POST this shape.
    const body = JSON.stringify({
      id: `evt_forged_${Date.now()}`,
      type: "payment.succeeded",
      data: { subscriptionId: providerSubscriptionId },
    });

    const res = await request(app)
      .post("/api/v1/billing/webhook")
      .set("Content-Type", "application/json")
      .send(body);

    expect(res.status).toBe(401);

    const after = await prisma.user.findFirstOrThrow({ where: { id: adminId } });
    expect(String(after.isUserVerified)).toBe("false_");
    expect((await login()).status).toBe(403);
  });

  test("is not activated by a webhook signed with the wrong key", async () => {
    const body = JSON.stringify({
      id: `evt_wrongkey_${Date.now()}`,
      type: "payment.succeeded",
      data: { subscriptionId: providerSubscriptionId },
    });
    const wrong = crypto
      .createHmac("sha256", "not-the-webhook-secret")
      .update(body, "utf8")
      .digest("hex");

    const res = await request(app)
      .post("/api/v1/billing/webhook")
      .set("Content-Type", "application/json")
      .set("x-webhook-signature", wrong)
      .send(body);

    expect(res.status).toBe(401);
    expect((await login()).status).toBe(403);
  });
});

describe("once a verified payment webhook arrives", () => {
  test("the account is activated and can sign in", async () => {
    const body = JSON.stringify({
      id: `evt_paid_${Date.now()}`,
      type: "payment.succeeded",
      data: {
        subscriptionId: providerSubscriptionId,
        currentPeriodEnd: new Date(Date.now() + 30 * 86400_000).toISOString(),
      },
    });

    const res = await request(app)
      .post("/api/v1/billing/webhook")
      .set("Content-Type", "application/json")
      .set("x-webhook-signature", signedWebhook(body))
      .send(body);

    expect(res.status).toBe(200);

    const after = await prisma.user.findFirstOrThrow({ where: { id: adminId } });
    expect(String(after.isUserVerified)).toBe("true_");

    const session = await login();
    expect(session.status).toBe(200);
  });

  test("the activation is attributed to the webhook in the audit log", async () => {
    // A customer's account being opened is a security event; the record has to
    // say what opened it, not merely that it happened.
    const entry = await prisma.auditLog.findFirst({
      where: { userId: adminId, action: "verify", entity: "user" },
      orderBy: { id: "desc" },
    });

    expect(entry).not.toBeNull();
    expect(JSON.stringify(entry?.newValue)).toContain("payment-webhook");
  });

  test("a redelivery of the same event does not double-apply", async () => {
    // Providers retry. The event id is the idempotency key, enforced by a
    // unique constraint rather than by application logic.
    const id = `evt_replay_${Date.now()}`;
    const body = JSON.stringify({
      id,
      type: "payment.succeeded",
      data: { subscriptionId: providerSubscriptionId },
    });
    const sig = signedWebhook(body);

    const first = await request(app)
      .post("/api/v1/billing/webhook")
      .set("Content-Type", "application/json")
      .set("x-webhook-signature", sig)
      .send(body);
    const second = await request(app)
      .post("/api/v1/billing/webhook")
      .set("Content-Type", "application/json")
      .set("x-webhook-signature", sig)
      .send(body);

    // Both acknowledged — a 4xx would make the provider retry forever — but
    // only one was applied.
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const events = await prisma.paymentEvent.count({
      where: { providerEventId: id },
    });
    expect(events).toBe(1);
  });
});
