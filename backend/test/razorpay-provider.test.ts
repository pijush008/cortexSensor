import crypto from "crypto";
import { describe, expect, test } from "vitest";
import { RazorpayProvider } from "../src/modules/billing/razorpay.provider";
import { config } from "../src/config";

/**
 * The Razorpay adapter.
 *
 * What matters here is not that a happy-path webhook parses, but that the
 * mapping refuses to treat "money might move" as "money moved", and that the
 * fields Razorpay expresses differently from the rest of the platform —
 * timestamps in seconds, amounts in paise — cross the boundary intact.
 */

const SECRET = config.billing.razorpay.webhookSecret || "test-rzp-webhook-secret";

function sign(body: string): string {
  return crypto.createHmac("sha256", SECRET).update(body, "utf8").digest("hex");
}

function subscriptionEvent(event: string, entity: Record<string, unknown> = {}) {
  return JSON.stringify({
    event,
    payload: {
      subscription: {
        entity: {
          id: "sub_RZP123",
          status: "active",
          current_end: 1793577600, // 2026-11-02T00:00:00Z, in SECONDS
          notes: { tenantPublicId: "tn_abc", planCode: "professional" },
          ...entity,
        },
      },
    },
  });
}

describe("Razorpay webhook signatures", () => {
  const provider = new RazorpayProvider();

  test("accepts a body signed with the webhook secret", () => {
    const body = subscriptionEvent("subscription.charged");
    expect(provider.verifySignature(body, sign(body))).toBe(true);
  });

  test("rejects a body that was altered after signing", () => {
    // The exact attack the signature exists to stop: a real event, edited to
    // point at someone else's subscription.
    const body = subscriptionEvent("subscription.charged");
    const signature = sign(body);
    const tampered = body.replace("sub_RZP123", "sub_SOMEONEELSE");

    expect(provider.verifySignature(tampered, signature)).toBe(false);
  });

  test("rejects a missing signature", () => {
    const body = subscriptionEvent("subscription.charged");
    expect(provider.verifySignature(body, undefined)).toBe(false);
  });
});

describe("Razorpay event mapping", () => {
  const provider = new RazorpayProvider();

  test("an authorized-but-not-captured payment is NOT success", () => {
    // Razorpay authorises before it captures. Treating an authorisation as
    // payment would activate an account that was never actually charged, which
    // is the single most expensive mistake this mapping could make.
    const body = JSON.stringify({
      event: "payment.authorized",
      payload: { payment: { entity: { id: "pay_1", amount: 499900 } } },
    });

    expect(provider.parseEvent(body).type).toBe("unknown");
  });

  test("a captured payment and a subscription charge both count as paid", () => {
    const captured = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_2", amount: 499900, currency: "INR" } } },
    });
    expect(provider.parseEvent(captured).type).toBe("payment.succeeded");
    expect(provider.parseEvent(subscriptionEvent("subscription.charged")).type).toBe(
      "payment.succeeded",
    );
  });

  test("a halted subscription is a failure, not a cancellation", () => {
    // Halted means collection kept failing. Mapping it to "canceled" would run
    // the customer to the end of a paid period they never paid for; mapping it
    // to a failure starts the grace period instead.
    expect(provider.parseEvent(subscriptionEvent("subscription.halted")).type).toBe(
      "payment.failed",
    );
  });

  test("current_end is read as seconds, not milliseconds", () => {
    const event = provider.parseEvent(subscriptionEvent("subscription.charged"));

    // Read as milliseconds this lands in January 1970, and entitlement — which
    // is computed from dates — would expire the customer the instant they paid.
    expect(event.currentPeriodEnd?.getUTCFullYear()).toBe(2026);
    expect(event.currentPeriodEnd?.getTime()).toBe(1793577600 * 1000);
  });

  test("amounts stay in the minor unit", () => {
    const body = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_3", amount: 499900, currency: "INR" } } },
    });

    // 499900 paise = ₹4,999. Dividing here would store ₹49.99 against a ₹4,999
    // plan and make every invoice wrong by two orders of magnitude.
    expect(provider.parseEvent(body).amountMinor).toBe(499900);
    expect(provider.parseEvent(body).currency).toBe("INR");
  });

  test("carries the tenant reference passed through notes", () => {
    // The webhook must be attributable to a tenant without trusting anything
    // the browser claimed on its way back from checkout.
    const event = provider.parseEvent(subscriptionEvent("subscription.charged"));
    expect(event.customerId).toBe("tn_abc");
    expect(event.planCode).toBe("professional");
  });

  test("identical redeliveries produce the same event id", () => {
    // Razorpay sends no event id, so the id is derived from the signed bytes.
    // A redelivery must therefore collide with the original and be recognised
    // as a duplicate rather than applied twice.
    const body = subscriptionEvent("subscription.charged");
    expect(provider.parseEvent(body).id).toBe(provider.parseEvent(body).id);

    const other = subscriptionEvent("subscription.charged", { id: "sub_OTHER" });
    expect(provider.parseEvent(body).id).not.toBe(provider.parseEvent(other).id);
  });

  test("an unknown event type is not silently treated as success", () => {
    const body = JSON.stringify({ event: "invoice.partially_paid", payload: {} });
    expect(provider.parseEvent(body).type).toBe("unknown");
  });
});

describe("Razorpay configuration", () => {
  test("reports itself unconfigured until all three secrets are present", () => {
    const provider = new RazorpayProvider();
    const rp = config.billing.razorpay;
    const expected = Boolean(rp.keyId && rp.keySecret && rp.webhookSecret);

    // isConfigured gates checkout. Half-configured must read as NOT configured,
    // so the endpoint refuses instead of failing further in with a provider error.
    expect(provider.isConfigured()).toBe(expected);
  });
});
