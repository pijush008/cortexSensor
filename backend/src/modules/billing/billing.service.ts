import { Prisma, SubscriptionStatus } from "@prisma/client";
import prisma from "../../config/prisma";
import { config } from "../../config";
import { logger } from "../../utils/logger";
import { paymentProvider, type NormalizedEvent } from "./provider";

/**
 * Subscription state, driven by the payment provider.
 *
 * The governing rule (§25): the client never decides that a payment succeeded.
 * A browser returning from a checkout page can be replayed, spoofed, or simply
 * closed before the charge settles, so the only thing that moves a
 * subscription to `active` is a verified webhook.
 *
 * Entitlement is computed from dates rather than read from the status column.
 * A status can go stale — a missed webhook, a worker outage — and access that
 * depends solely on a stale flag either locks out a paying customer or keeps
 * serving one who stopped paying weeks ago.
 */

/** How long a failed payment is tolerated before access stops. */
export const GRACE_PERIOD_DAYS = 7;

export interface EntitlementState {
  status: SubscriptionStatus;
  /** Whether tenant features should be served right now. */
  active: boolean;
  /** True while a payment has failed but grace has not run out. */
  inGracePeriod: boolean;
  graceEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  reason: string;
}

interface SubscriptionRow {
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  gracePeriodEndsAt: Date | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
}

/**
 * Whether a subscription entitles access, evaluated against the clock.
 *
 * Pure and synchronous so the rules are testable without a database, and so
 * the same function decides both API access and what the billing page shows —
 * two answers that must never disagree.
 */
export function evaluateEntitlement(
  sub: SubscriptionRow,
  now: Date = new Date(),
): EntitlementState {
  const base = {
    status: sub.status,
    graceEndsAt: sub.gracePeriodEndsAt,
    currentPeriodEnd: sub.currentPeriodEnd,
  };

  if (sub.status === SubscriptionStatus.pending) {
    // Registered, not yet paid. Grants nothing — and says why in terms the
    // customer can act on, rather than reporting their new account as expired.
    return {
      ...base,
      active: false,
      inGracePeriod: false,
      reason: "Awaiting payment",
    };
  }

  if (sub.status === SubscriptionStatus.suspended) {
    return {
      ...base,
      active: false,
      inGracePeriod: false,
      reason: "Suspended by the platform operator",
    };
  }

  if (sub.status === SubscriptionStatus.trial) {
    // A trial with no end date is treated as open — better than locking out a
    // customer because a field was never set.
    const ends = sub.currentPeriodEnd;
    const live = !ends || ends.getTime() > now.getTime();
    return {
      ...base,
      active: live,
      inGracePeriod: false,
      reason: live ? "Trial in progress" : "Trial ended",
    };
  }

  if (sub.status === SubscriptionStatus.canceled) {
    // Cancellation runs to the end of the paid period: the customer paid for
    // it, and cutting them off on the cancel click would be taking their money.
    const paidThrough =
      sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() > now.getTime();
    return {
      ...base,
      active: Boolean(paidThrough),
      inGracePeriod: false,
      reason: paidThrough
        ? "Canceled — access continues until the end of the paid period"
        : "Canceled and the paid period has ended",
    };
  }

  if (sub.status === SubscriptionStatus.past_due) {
    const inGrace =
      !!sub.gracePeriodEndsAt && sub.gracePeriodEndsAt.getTime() > now.getTime();
    return {
      ...base,
      active: inGrace,
      inGracePeriod: inGrace,
      reason: inGrace
        ? "Payment failed — access continues during the grace period"
        : "Payment failed and the grace period has ended",
    };
  }

  if (sub.status === SubscriptionStatus.expired) {
    return { ...base, active: false, inGracePeriod: false, reason: "Expired" };
  }

  // Active: entitled while the paid period has not elapsed. Checking the date
  // rather than trusting the flag is what stops a missed renewal webhook from
  // serving a lapsed customer indefinitely.
  const live =
    !sub.currentPeriodEnd || sub.currentPeriodEnd.getTime() > now.getTime();
  return {
    ...base,
    active: live,
    inGracePeriod: false,
    reason: live ? "Active" : "The paid period has elapsed without renewal",
  };
}

export interface WebhookResult {
  handled: boolean;
  duplicate: boolean;
  type: string;
  message: string;
}

/**
 * Records and applies a webhook.
 *
 * The event is persisted BEFORE it is applied. If applying it throws, the
 * event still exists with its error recorded, so it can be retried
 * deliberately rather than lost — and a provider redelivery is recognised as
 * the duplicate it is.
 */
export async function handleWebhook(
  event: NormalizedEvent,
): Promise<WebhookResult> {
  let record;
  try {
    record = await prisma.paymentEvent.create({
      data: {
        provider: paymentProvider.name,
        providerEventId: event.id,
        type: event.type,
        payload: event.raw as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      // The provider redelivered. Acknowledging with 200 is important: a 4xx
      // here would make it retry forever.
      logger.info(`Billing webhook ${event.id} already processed; ignoring replay`);
      return {
        handled: false,
        duplicate: true,
        type: event.type,
        message: "Event already processed",
      };
    }
    throw err;
  }

  try {
    const message = await applyEvent(event);
    await prisma.paymentEvent.update({
      where: { id: record.id },
      data: { processedAt: new Date() },
    });
    return { handled: true, duplicate: false, type: event.type, message };
  } catch (err) {
    const message = (err as Error).message ?? "Failed to apply event";
    await prisma.paymentEvent.update({
      where: { id: record.id },
      data: { error: message.slice(0, 2000) },
    });
    throw err;
  }
}

async function applyEvent(event: NormalizedEvent): Promise<string> {
  if (event.type === "unknown") {
    // Recorded but not acted on. Providers add event types over time, and
    // failing on an unrecognised one would make them retry it forever.
    return "Event type not handled";
  }

  // Provider-side subscription id first, for recurring plans that have one.
  // Then our own id, echoed back through the checkout metadata — a one-time
  // payment has no provider subscription, and matching on it alone meant a
  // settled charge activated nothing.
  const subscription =
    (event.subscriptionId
      ? await prisma.subscription.findFirst({
          where: { providerSubscriptionId: event.subscriptionId },
        })
      : null) ??
    (Number.isInteger(event.localSubscriptionId)
      ? await prisma.subscription.findUnique({
          where: { id: event.localSubscriptionId as number },
        })
      : null);

  if (!subscription) {
    return "No matching subscription for this event";
  }

  switch (event.type) {
    case "checkout.completed":
    case "payment.succeeded": {
      const periodEnd =
        event.currentPeriodEnd ??
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: SubscriptionStatus.active,
          currentPeriodEnd: periodEnd,
          // Cleared: a successful payment ends any grace that was running.
          gracePeriodEndsAt: null,
        },
      });

      // The account becomes usable HERE, on a signed webhook, and nowhere else.
      // A browser returning from checkout can be replayed, forged, or simply
      // closed before the charge settles; only the provider's signature is
      // evidence that money moved.
      await activateOwnerAfterPayment(subscription.adminId);

      if (event.invoiceId && event.amountMinor !== undefined) {
        await prisma.invoice
          .create({
            data: {
              subscriptionId: subscription.id,
              providerInvoiceId: event.invoiceId,
              invoiceNo: `INV-${subscription.id}-${event.invoiceId}`,
              periodStart: new Date(),
              periodEnd: periodEnd,
              amountPaise: event.amountMinor,
              currency: event.currency ?? "INR",
              status: "PAID",
              paidAt: new Date(),
            },
          })
          .catch((err) => {
            // A unique violation here means the invoice already exists from an
            // earlier delivery, which is fine — the payment is still recorded.
            if (
              !(
                err instanceof Prisma.PrismaClientKnownRequestError &&
                err.code === "P2002"
              )
            ) {
              throw err;
            }
          });
      }
      return "Subscription activated";
    }

    case "payment.failed": {
      // Grace starts at the FIRST failure and is not extended by subsequent
      // ones; otherwise a card that keeps failing would renew its own grace
      // indefinitely and never expire.
      const graceEndsAt =
        subscription.gracePeriodEndsAt ??
        new Date(Date.now() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: SubscriptionStatus.past_due, gracePeriodEndsAt: graceEndsAt },
      });
      return "Subscription marked past due";
    }

    case "subscription.updated": {
      const data: Prisma.SubscriptionUpdateInput = {};
      if (event.currentPeriodEnd) data.currentPeriodEnd = event.currentPeriodEnd;
      if (event.planCode) {
        const plan = await prisma.billingPlan.findFirst({
          where: { code: event.planCode, isActive: true },
        });
        if (plan) data.plan = { connect: { id: plan.id } };
      }
      await prisma.subscription.update({ where: { id: subscription.id }, data });
      return "Subscription updated";
    }

    case "subscription.canceled": {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: SubscriptionStatus.canceled,
          canceledAt: new Date(),
          cancelAtPeriodEnd: true,
        },
      });
      return "Subscription canceled";
    }

    default:
      return "Event type not handled";
  }
}

/**
 * Moves subscriptions whose grace or paid period has elapsed into `expired`.
 *
 * Run on a schedule. Entitlement is already evaluated against the clock, so
 * this does not gate access — it keeps the stored status honest so the billing
 * screen and any report of who is paying reflect reality.
 */
export async function expireLapsedSubscriptions(now = new Date()): Promise<number> {
  const result = await prisma.subscription.updateMany({
    where: {
      status: SubscriptionStatus.past_due,
      gracePeriodEndsAt: { lt: now },
    },
    data: { status: SubscriptionStatus.expired },
  });
  if (result.count > 0) {
    logger.info(`Billing: ${result.count} subscription(s) moved to expired`);
  }
  return result.count;
}

/**
 * Lets a newly-registered organization admin sign in, once their payment has
 * been confirmed by a verified webhook.
 *
 * Registration leaves an admin with isUserVerified = false, which the sign-in
 * path already refuses. This is the only thing that flips it for a paying
 * customer, so the gate cannot be opened from the browser.
 *
 * Deliberately narrow: it never touches an account that is already active, and
 * it never activates anything but the tenant's own admin.
 */
async function activateOwnerAfterPayment(adminId: number): Promise<void> {
  const owner = await prisma.user.findUnique({
    where: { id: adminId },
    select: { id: true, emailId: true, isUserVerified: true, isDelete: true },
  });

  if (!owner || owner.isDelete === ("true_" as never)) return;
  if (owner.isUserVerified === ("true_" as never)) return;

  await prisma.user.update({
    where: { id: owner.id },
    data: { isUserVerified: "true_" as never },
  });

  await prisma.auditLog.create({
    data: {
      userId: owner.id,
      action: "verify",
      entity: "user",
      entityId: owner.id,
      newValue: { activatedBy: "payment-webhook", provider: paymentProvider.name },
    },
  });

  logger.info(`Account ${owner.id} activated by verified payment webhook`);
}

export function isBillingConfigured(): boolean {
  return paymentProvider.isConfigured() && Boolean(config.billing.enabled);
}
