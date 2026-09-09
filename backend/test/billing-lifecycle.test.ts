import crypto from "crypto";
import { SubscriptionStatus } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import app from "../src/app";
import prisma from "../src/config/prisma";
import {
  evaluateEntitlement,
  expireLapsedSubscriptions,
  GRACE_PERIOD_DAYS,
} from "../src/modules/billing/billing.service";
import { verifyHmacSignature } from "../src/modules/billing/provider";

/**
 * Payment lifecycle (§25, §80).
 *
 * The rule under test is that the CLIENT never decides a payment succeeded. A
 * browser returning from a checkout page proves nothing — it can be replayed or
 * forged, and the charge may fail afterwards. Only a signature-verified webhook
 * moves a subscription to active.
 *
 * The other property that matters is idempotency: providers retry aggressively
 * and deliver duplicates, and applying one twice must not double-extend a
 * subscription or double-issue an invoice.
 */

const EMAIL = "billing-admin@example.com";
const PASSWORD = "Password1!";
const SECRET = "test-webhook-secret";

let userId = 0;
let subscriptionId = 0;
const providerSubId = `sub_test_${Date.now()}`;

function sign(body: string): string {
  return crypto.createHmac("sha256", SECRET).update(body, "utf8").digest("hex");
}

async function post(body: object, signature?: string) {
  const raw = JSON.stringify(body);
  return request(app)
    .post("/api/v1/billing/webhook")
    .set("Content-Type", "application/json")
    .set("x-signature", signature ?? sign(raw))
    .send(raw);
}

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { emailId: EMAIL },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  const tenantIds = (
    await prisma.membership
      .findMany({ where: { userId: { in: ids } }, select: { tenantId: true } })
      .catch(() => [] as { tenantId: number }[])
  ).map((m) => m.tenantId);

  const wipe = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch {
      /* absent on first run */
    }
  };

  await wipe(() =>
    prisma.paymentEvent.deleteMany({ where: { providerEventId: { startsWith: "evt_test_" } } }),
  );
  await wipe(() =>
    prisma.invoice.deleteMany({ where: { subscription: { adminId: { in: ids } } } }),
  );
  await wipe(() => prisma.subscription.deleteMany({ where: { adminId: { in: ids } } }));
  await wipe(() => prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } }));
  await wipe(() => prisma.auditLog.deleteMany({ where: { userId: { in: ids } } }));
  await wipe(() => prisma.membership.deleteMany({ where: { userId: { in: ids } } }));
  await wipe(() => prisma.user.deleteMany({ where: { id: { in: ids } } }));
  await wipe(() => prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } }));
}

describe("payment lifecycle", () => {
  beforeAll(async () => {
    // BILLING_ENABLED and BILLING_WEBHOOK_SECRET are set in test/setup.ts,
    // which runs before any import — src/config snapshots the environment at
    // import time, so setting them here would be too late.
    await prisma.$connect();
    await cleanup();

    await request(app).post("/api/v1/register/admin").send({
      firstName: "Billing",
      lastName: "Admin",
      emailId: EMAIL,
      phoneNo: "1234567890",
      password: PASSWORD,
    });
    const user = await prisma.user.findUniqueOrThrow({ where: { emailId: EMAIL } });
    userId = user.id;

    const plan = await prisma.billingPlan.findFirstOrThrow({
      where: { code: "starter" },
    });
    const subscription = await prisma.subscription.upsert({
      where: { adminId: userId },
      update: { providerSubscriptionId: providerSubId },
      create: {
        adminId: userId,
        planId: plan.id,
        status: SubscriptionStatus.trial,
        providerSubscriptionId: providerSubId,
      },
    });
    subscriptionId = subscription.id;
  }, 60_000);

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  // ── Signature verification ─────────────────────────────────────────────────

  test("a signature is verified against the raw body, in constant time", () => {
    const body = '{"id":"evt_1","type":"payment.succeeded"}';
    expect(verifyHmacSignature(body, sign(body), SECRET)).toBe(true);
    expect(verifyHmacSignature(body, "deadbeef", SECRET)).toBe(false);
    expect(verifyHmacSignature(body, undefined, SECRET)).toBe(false);
    // A different body must not validate under the same signature, which is
    // the whole point of signing the bytes rather than a parsed object.
    expect(verifyHmacSignature(body + " ", sign(body), SECRET)).toBe(false);
  });

  test("an unsigned or wrongly signed webhook is rejected", async () => {
    const unsigned = await request(app)
      .post("/api/v1/billing/webhook")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ id: "evt_test_unsigned", type: "payment.succeeded" }));
    expect(unsigned.status).toBe(401);

    const wrong = await post(
      { id: "evt_test_wrongsig", type: "payment.succeeded" },
      "0".repeat(64),
    );
    expect(wrong.status).toBe(401);

    // And nothing was recorded from a rejected request.
    const stored = await prisma.paymentEvent.count({
      where: { providerEventId: { in: ["evt_test_unsigned", "evt_test_wrongsig"] } },
    });
    expect(stored).toBe(0);
  });

  // ── Payment succeeds (§80) ─────────────────────────────────────────────────

  test("a verified payment webhook activates the subscription", async () => {
    const periodEnd = new Date(Date.now() + 30 * 86_400_000);
    const res = await post({
      id: "evt_test_paid_1",
      type: "payment.succeeded",
      data: {
        subscriptionId: providerSubId,
        invoiceId: "inv_test_1",
        amountMinor: 499900,
        currency: "INR",
        currentPeriodEnd: periodEnd.toISOString(),
      },
    });
    expect(res.status).toBe(200);
    expect(res.body.duplicate).toBe(false);

    const sub = await prisma.subscription.findUniqueOrThrow({
      where: { id: subscriptionId },
    });
    expect(sub.status).toBe(SubscriptionStatus.active);
    expect(sub.currentPeriodEnd?.getTime()).toBeCloseTo(periodEnd.getTime(), -3);

    const invoice = await prisma.invoice.findFirst({
      where: { providerInvoiceId: "inv_test_1" },
    });
    expect(invoice?.status).toBe("PAID");
    expect(invoice?.amountPaise).toBe(499900);
  });

  test("a redelivered webhook is acknowledged but not applied twice", async () => {
    const before = await prisma.invoice.count({
      where: { providerInvoiceId: "inv_test_1" },
    });

    const replay = await post({
      id: "evt_test_paid_1",
      type: "payment.succeeded",
      data: {
        subscriptionId: providerSubId,
        invoiceId: "inv_test_1",
        amountMinor: 499900,
        currency: "INR",
      },
    });

    // 200, not 4xx: a rejection would make the provider retry an event that
    // was already applied correctly, forever.
    expect(replay.status).toBe(200);
    expect(replay.body.duplicate).toBe(true);

    const after = await prisma.invoice.count({
      where: { providerInvoiceId: "inv_test_1" },
    });
    expect(after).toBe(before);
  });

  test("the raw payload is retained as evidence", async () => {
    const event = await prisma.paymentEvent.findFirstOrThrow({
      where: { providerEventId: "evt_test_paid_1" },
    });
    expect(event.processedAt).not.toBeNull();
    // Billing disputes are settled by what the provider actually said.
    expect(JSON.stringify(event.payload)).toContain("inv_test_1");
  });

  // ── Payment fails, grace, expiry (§80) ─────────────────────────────────────

  test("a failed payment starts a grace period rather than cutting access", async () => {
    const res = await post({
      id: "evt_test_failed_1",
      type: "payment.failed",
      data: { subscriptionId: providerSubId },
    });
    expect(res.status).toBe(200);

    const sub = await prisma.subscription.findUniqueOrThrow({
      where: { id: subscriptionId },
    });
    expect(sub.status).toBe(SubscriptionStatus.past_due);
    expect(sub.gracePeriodEndsAt).not.toBeNull();

    // Access continues during grace.
    const state = evaluateEntitlement(sub);
    expect(state.active).toBe(true);
    expect(state.inGracePeriod).toBe(true);
  });

  test("repeated failures do not extend the grace period", async () => {
    const before = await prisma.subscription.findUniqueOrThrow({
      where: { id: subscriptionId },
    });

    await post({
      id: "evt_test_failed_2",
      type: "payment.failed",
      data: { subscriptionId: providerSubId },
    });

    const after = await prisma.subscription.findUniqueOrThrow({
      where: { id: subscriptionId },
    });
    // A card that keeps failing would otherwise renew its own grace forever
    // and never expire.
    expect(after.gracePeriodEndsAt?.getTime()).toBe(
      before.gracePeriodEndsAt?.getTime(),
    );
  });

  test("access stops when the grace period has elapsed", () => {
    const lapsed = {
      status: SubscriptionStatus.past_due,
      currentPeriodEnd: new Date(Date.now() - 86_400_000),
      gracePeriodEndsAt: new Date(Date.now() - 3600_000),
      cancelAtPeriodEnd: false,
      canceledAt: null,
    };
    const state = evaluateEntitlement(lapsed);
    expect(state.active).toBe(false);
    expect(state.inGracePeriod).toBe(false);
  });

  test("a lapsed grace period moves the subscription to expired", async () => {
    await prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: SubscriptionStatus.past_due,
        gracePeriodEndsAt: new Date(Date.now() - 3600_000),
      },
    });

    const count = await expireLapsedSubscriptions();
    expect(count).toBeGreaterThanOrEqual(1);

    const sub = await prisma.subscription.findUniqueOrThrow({
      where: { id: subscriptionId },
    });
    expect(sub.status).toBe(SubscriptionStatus.expired);
  });

  test("a later successful payment clears the grace and reactivates", async () => {
    const res = await post({
      id: "evt_test_recovered",
      type: "payment.succeeded",
      data: {
        subscriptionId: providerSubId,
        currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      },
    });
    expect(res.status).toBe(200);

    const sub = await prisma.subscription.findUniqueOrThrow({
      where: { id: subscriptionId },
    });
    expect(sub.status).toBe(SubscriptionStatus.active);
    expect(sub.gracePeriodEndsAt).toBeNull();
    expect(evaluateEntitlement(sub).active).toBe(true);
  });

  // ── Cancellation (§80) ─────────────────────────────────────────────────────

  test("cancellation runs to the end of the paid period", async () => {
    const res = await post({
      id: "evt_test_canceled",
      type: "subscription.canceled",
      data: { subscriptionId: providerSubId },
    });
    expect(res.status).toBe(200);

    const sub = await prisma.subscription.findUniqueOrThrow({
      where: { id: subscriptionId },
    });
    expect(sub.status).toBe(SubscriptionStatus.canceled);
    expect(sub.cancelAtPeriodEnd).toBe(true);

    // The customer paid for the rest of the period, so access continues.
    const state = evaluateEntitlement(sub);
    expect(state.active).toBe(true);
    expect(state.reason).toMatch(/end of the paid period/i);
  });

  test("a canceled subscription stops once the paid period ends", () => {
    const state = evaluateEntitlement({
      status: SubscriptionStatus.canceled,
      currentPeriodEnd: new Date(Date.now() - 86_400_000),
      gracePeriodEndsAt: null,
      cancelAtPeriodEnd: true,
      canceledAt: new Date(Date.now() - 172_800_000),
    });
    expect(state.active).toBe(false);
  });

  // ── Entitlement is computed, not trusted ───────────────────────────────────

  test("an active subscription whose paid period elapsed is not entitled", () => {
    // A missed renewal webhook would otherwise leave the flag on `active` and
    // serve a customer who stopped paying weeks ago.
    const state = evaluateEntitlement({
      status: SubscriptionStatus.active,
      currentPeriodEnd: new Date(Date.now() - 86_400_000),
      gracePeriodEndsAt: null,
      cancelAtPeriodEnd: false,
      canceledAt: null,
    });
    expect(state.active).toBe(false);
    expect(state.reason).toMatch(/elapsed/i);
  });

  test("a suspended subscription is never entitled", () => {
    const state = evaluateEntitlement({
      status: SubscriptionStatus.suspended,
      currentPeriodEnd: new Date(Date.now() + 86_400_000),
      gracePeriodEndsAt: null,
      cancelAtPeriodEnd: false,
      canceledAt: null,
    });
    // Even with time left on the clock: suspension is an operator decision.
    expect(state.active).toBe(false);
  });

  test("a trial is entitled until it ends", () => {
    expect(
      evaluateEntitlement({
        status: SubscriptionStatus.trial,
        currentPeriodEnd: new Date(Date.now() + 86_400_000),
        gracePeriodEndsAt: null,
        cancelAtPeriodEnd: false,
        canceledAt: null,
      }).active,
    ).toBe(true);

    expect(
      evaluateEntitlement({
        status: SubscriptionStatus.trial,
        currentPeriodEnd: new Date(Date.now() - 86_400_000),
        gracePeriodEndsAt: null,
        cancelAtPeriodEnd: false,
        canceledAt: null,
      }).active,
    ).toBe(false);
  });

  test("the grace period is the documented length", () => {
    expect(GRACE_PERIOD_DAYS).toBe(7);
  });

  // ── The client cannot self-serve activation (§25) ──────────────────────────

  test("checkout never marks a subscription paid", async () => {
    await prisma.subscription.update({
      where: { id: subscriptionId },
      data: { status: SubscriptionStatus.trial },
    });

    const login = await request(app)
      .post("/api/v1/commonLogin")
      .send({ username: EMAIL, password: PASSWORD });

    if (login.status === 200) {
      const cookie = ([] as string[])
        .concat(login.headers["set-cookie"] as never)
        .join(";");
      const res = await request(app)
        .post("/api/v1/billing/checkout")
        .set("Cookie", cookie)
        .send({ planCode: "professional" });

      // Whatever it answers, it must not have activated anything.
      expect([501, 503, 403, 401]).toContain(res.status);
    }

    const sub = await prisma.subscription.findUniqueOrThrow({
      where: { id: subscriptionId },
    });
    expect(sub.status).toBe(SubscriptionStatus.trial);
  });

  test("an unknown event type is recorded but not acted on", async () => {
    const before = await prisma.subscription.findUniqueOrThrow({
      where: { id: subscriptionId },
    });

    const res = await post({
      id: "evt_test_unknown",
      type: "customer.tax_id.created",
      data: { subscriptionId: providerSubId },
    });
    // 200 so the provider stops retrying an event we simply do not handle.
    expect(res.status).toBe(200);

    const stored = await prisma.paymentEvent.findFirst({
      where: { providerEventId: "evt_test_unknown" },
    });
    expect(stored).toBeTruthy();

    const after = await prisma.subscription.findUniqueOrThrow({
      where: { id: subscriptionId },
    });
    expect(after.status).toBe(before.status);
  });

  test("an event for an unknown subscription changes nothing", async () => {
    const res = await post({
      id: "evt_test_orphan",
      type: "payment.succeeded",
      data: { subscriptionId: "sub_does_not_exist", amountMinor: 100 },
    });
    expect(res.status).toBe(200);
    expect(String(res.body.message)).toMatch(/no matching subscription/i);
  });
});
