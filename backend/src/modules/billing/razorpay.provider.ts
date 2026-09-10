import crypto from "crypto";
import { config } from "../../config";
import {
  verifyHmacSignature,
  type BillingEventType,
  type CreateOrderInput,
  type CreatedOrder,
  type NormalizedEvent,
  type PaymentProvider,
} from "./provider";

/**
 * Razorpay adapter.
 *
 * Razorpay signs each webhook with HMAC-SHA256 over the raw request body and
 * sends the hex digest in `X-Razorpay-Signature`, which is exactly the scheme
 * the generic verifier already implements — so the security-critical part is
 * shared code that already has tests, and this class is a mapping layer.
 *
 * Two things about that secret are worth stating plainly, because getting them
 * wrong produces a 401 that looks like a code fault:
 *
 *  - The WEBHOOK secret is not the API key secret. It is set separately in the
 *    Razorpay dashboard when the webhook is created.
 *  - The signature covers the bytes Razorpay sent. The billing route is mounted
 *    ahead of the JSON parser for this reason; verifying a re-serialised body
 *    compares against bytes nobody signed.
 */

/**
 * Razorpay event names mapped onto the platform's vocabulary.
 *
 * `subscription.charged` is the renewal event and the one that keeps a
 * subscription alive; `payment.captured` is a one-off capture. Both mean money
 * actually moved — `payment.authorized` deliberately does not appear here,
 * because an authorised payment has not been captured and treating it as
 * success would activate an account that was never charged.
 */
const RAZORPAY_EVENTS: Record<string, BillingEventType> = {
  "payment.captured": "payment.succeeded",
  "subscription.charged": "payment.succeeded",
  "subscription.activated": "checkout.completed",
  "order.paid": "checkout.completed",
  "payment.failed": "payment.failed",
  "subscription.pending": "payment.failed",
  "subscription.halted": "payment.failed",
  "subscription.updated": "subscription.updated",
  "subscription.cancelled": "subscription.canceled",
  "subscription.completed": "subscription.canceled",
};

interface RazorpayEntity {
  id?: string;
  amount?: number;
  currency?: string;
  status?: string;
  notes?: Record<string, unknown>;
  current_end?: number;
  subscription_id?: string;
  order_id?: string;
  plan_id?: string;
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export class RazorpayProvider implements PaymentProvider {
  readonly name = "razorpay";

  // Injectable so the test can assert what we send without a network call.
  constructor(private readonly fetchImpl: FetchLike = fetch) {}

  isConfigured(): boolean {
    const rp = config.billing.razorpay;
    return Boolean(rp.keyId && rp.keySecret && rp.webhookSecret);
  }

  verifySignature(rawBody: string, signature: string | undefined): boolean {
    return verifyHmacSignature(
      rawBody,
      signature,
      config.billing.razorpay.webhookSecret,
    );
  }

  async createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
    const rp = config.billing.razorpay;
    const auth = Buffer.from(`${rp.keyId}:${rp.keySecret}`).toString("base64");

    const res = await this.fetchImpl("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: input.amountPaise,
        currency: input.currency,
        receipt: input.receipt,
        notes: input.notes,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      throw new Error(
        `Razorpay order creation failed (${res.status}): ${detail.slice(0, 200)}`,
      );
    }

    const order = (await res.json()) as {
      id: string;
      amount: number;
      currency: string;
    };
    return {
      orderId: order.id,
      amountPaise: order.amount,
      currency: order.currency,
    };
  }

  parseEvent(rawBody: string): NormalizedEvent {
    const body = JSON.parse(rawBody) as {
      event?: string;
      payload?: Record<string, { entity?: RazorpayEntity }>;
      created_at?: number;
    };

    const rawType = String(body.event ?? "");
    const payload = body.payload ?? {};
    const subscription = payload.subscription?.entity;
    const payment = payload.payment?.entity;
    const order = payload.order?.entity;
    const entity = subscription ?? payment ?? order ?? {};

    // Razorpay does not send an event id in the body. The signed body is
    // unique per delivery, so its hash is a sound idempotency key — and it is
    // the same fallback the generic adapter uses, so a redelivery of identical
    // bytes is recognised as the duplicate it is.
    const id = crypto.createHash("sha256").update(rawBody).digest("hex");

    // `current_end` is a UNIX timestamp in SECONDS, not milliseconds. Reading it
    // as milliseconds dates the paid period to 1970 and expires the customer
    // immediately.
    const periodEnd =
      typeof subscription?.current_end === "number"
        ? new Date(subscription.current_end * 1000)
        : undefined;

    // Our own subscription id is passed through `notes` at checkout, because a
    // webhook must be attributable to a tenant without trusting anything the
    // browser said.
    const notes = (entity.notes ?? {}) as Record<string, unknown>;

    return {
      id,
      type: RAZORPAY_EVENTS[rawType] ?? "unknown",
      subscriptionId:
        subscription?.id ??
        (payment?.subscription_id ? String(payment.subscription_id) : undefined),
      // The id we put in `notes` at checkout. For a one-time order payment
      // there is no Razorpay subscription entity at all, so this is the only
      // thing tying the settled charge back to an account.
      localSubscriptionId:
        notes.subscriptionId !== undefined
          ? Number(notes.subscriptionId)
          : undefined,
      customerId: notes.tenantPublicId ? String(notes.tenantPublicId) : undefined,
      planCode: notes.planCode ? String(notes.planCode) : undefined,
      // Razorpay amounts are in the minor unit (paise), which is what
      // NormalizedEvent.amountMinor expects — no conversion.
      amountMinor: typeof entity.amount === "number" ? entity.amount : undefined,
      currency: entity.currency ? String(entity.currency) : undefined,
      currentPeriodEnd: periodEnd,
      invoiceId: payment?.id ?? order?.id,
      raw: body,
    };
  }
}
