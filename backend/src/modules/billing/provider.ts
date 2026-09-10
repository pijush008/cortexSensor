import crypto from "crypto";
import { config } from "../../config";

/**
 * Payment provider boundary.
 *
 * Deliberately an interface with one generic implementation rather than a
 * Stripe or Razorpay client. No provider credentials exist in this deployment,
 * and shipping a "Stripe integration" that cannot take a payment would be a
 * fabrication of exactly the kind this platform forbids elsewhere — worse here,
 * because it concerns money.
 *
 * What IS real and testable is the part that decides correctness: signature
 * verification, event parsing, idempotency and the status transitions those
 * events drive. A concrete provider is then a small adapter that maps its event
 * names onto `NormalizedEvent` and its signature scheme onto `verifySignature`.
 */

export type BillingEventType =
  | "checkout.completed"
  | "payment.succeeded"
  | "payment.failed"
  | "subscription.updated"
  | "subscription.canceled"
  | "unknown";

export interface NormalizedEvent {
  /** Provider's own event id — the idempotency key. */
  id: string;
  type: BillingEventType;
  /** Provider's subscription id, when the event concerns one. */
  subscriptionId?: string;
  customerId?: string;
  /** Plan code the customer is moving to, for checkout/update events. */
  planCode?: string;
  amountMinor?: number;
  currency?: string;
  /** End of the paid period this event establishes. */
  currentPeriodEnd?: Date;
  invoiceId?: string;
  raw: unknown;
}

export interface CreateOrderInput {
  /** Integer minor units. Rupees are never floats here. */
  amountPaise: number;
  currency: string;
  /** Our reference, echoed back by the provider for reconciliation. */
  receipt: string;
  /**
   * Carried through to the webhook. Our own subscription id lives here so an
   * incoming event can be attributed to a tenant without trusting the browser.
   */
  notes: Record<string, string>;
}

export interface CreatedOrder {
  orderId: string;
  amountPaise: number;
  currency: string;
}

export interface PaymentProvider {
  readonly name: string;
  /** True when credentials are configured and the provider can be called. */
  isConfigured(): boolean;
  verifySignature(rawBody: string, signature: string | undefined): boolean;
  parseEvent(rawBody: string): NormalizedEvent;
  /**
   * Opens an order with the provider. Throws when the adapter cannot take a
   * payment, so an unconfigured deployment fails loudly instead of handing the
   * browser an order that does not exist.
   */
  createOrder(input: CreateOrderInput): Promise<CreatedOrder>;
}

/**
 * HMAC-SHA256 over the raw request body, compared in constant time.
 *
 * The RAW body matters: verifying a re-serialized object would compare a
 * signature against bytes the provider never signed, and key ordering or
 * whitespace differences would break it non-deterministically. The route
 * therefore captures the body before JSON parsing.
 */
export function verifyHmacSignature(
  rawBody: string,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature || !secret) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");

  const provided = signature.trim().toLowerCase();
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

const TYPE_MAP: Record<string, BillingEventType> = {
  "checkout.completed": "checkout.completed",
  "checkout.session.completed": "checkout.completed",
  "payment.succeeded": "payment.succeeded",
  "invoice.paid": "payment.succeeded",
  "invoice.payment_succeeded": "payment.succeeded",
  "payment.failed": "payment.failed",
  "invoice.payment_failed": "payment.failed",
  "subscription.updated": "subscription.updated",
  "customer.subscription.updated": "subscription.updated",
  "subscription.canceled": "subscription.canceled",
  "customer.subscription.deleted": "subscription.canceled",
};

/**
 * A provider-agnostic adapter over a documented JSON envelope.
 *
 * It also accepts the event names Stripe and Razorpay use, so wiring a real
 * provider is a credentials change rather than a code change.
 */
export class GenericHmacProvider implements PaymentProvider {
  readonly name = "generic";

  isConfigured(): boolean {
    return Boolean(config.billing.webhookSecret);
  }

  verifySignature(rawBody: string, signature: string | undefined): boolean {
    return verifyHmacSignature(rawBody, signature, config.billing.webhookSecret);
  }

  async createOrder(): Promise<CreatedOrder> {
    // The generic adapter verifies and parses webhooks; it has no API to open
    // an order against. Refusing keeps the "never pretend" property.
    throw new Error(
      "The configured payment provider cannot start a checkout. Set BILLING_PROVIDER=razorpay and supply credentials.",
    );
  }

  parseEvent(rawBody: string): NormalizedEvent {
    const body = JSON.parse(rawBody) as Record<string, unknown>;
    const data = (body.data ?? {}) as Record<string, unknown>;

    const rawType = String(body.type ?? body.event ?? "");
    const periodEnd = data.currentPeriodEnd ?? data.current_period_end;

    return {
      // Falling back to a hash of the body rather than a random id: a provider
      // that omits an event id would otherwise defeat deduplication entirely,
      // since every redelivery would look new.
      id: String(
        body.id ??
          body.event_id ??
          crypto.createHash("sha256").update(rawBody).digest("hex"),
      ),
      type: TYPE_MAP[rawType] ?? "unknown",
      subscriptionId: data.subscriptionId
        ? String(data.subscriptionId)
        : data.subscription_id
          ? String(data.subscription_id)
          : undefined,
      customerId: data.customerId ? String(data.customerId) : undefined,
      planCode: data.planCode ? String(data.planCode) : undefined,
      amountMinor:
        typeof data.amountMinor === "number"
          ? data.amountMinor
          : typeof data.amount === "number"
            ? data.amount
            : undefined,
      currency: data.currency ? String(data.currency) : undefined,
      currentPeriodEnd: periodEnd ? new Date(String(periodEnd)) : undefined,
      invoiceId: data.invoiceId ? String(data.invoiceId) : undefined,
      raw: body,
    };
  }
}

/**
 * The active adapter, chosen by configuration.
 *
 * Defaults to the generic HMAC envelope. A deployment that sets
 * BILLING_PROVIDER=razorpay without credentials still gets a provider whose
 * isConfigured() returns false, so checkout refuses with a clear message
 * instead of appearing to work.
 */
function selectProvider(): PaymentProvider {
  if (config.billing.provider === "razorpay") {
    // Imported lazily to keep this module free of a cycle: the Razorpay adapter
    // imports verifyHmacSignature from here.
     
    const { RazorpayProvider } = require("./razorpay.provider") as typeof import("./razorpay.provider");
    return new RazorpayProvider();
  }
  return new GenericHmacProvider();
}

export const paymentProvider: PaymentProvider = selectProvider();
