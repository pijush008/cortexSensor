import prisma from "../../config/prisma";
import { config } from "../../config";
import { BadRequestError } from "../../utils/AppError";
import { paymentProvider } from "./provider";

export interface SignupPlan {
  code: string;
  name: string;
  amountPaise: number;
  currency: string;
  maxStructures: number | null;
  maxSensors: number | null;
  maxUsers: number | null;
}

/**
 * The plans a new organization may choose between.
 *
 * Driven by config rather than "all active plans", because billing_plans also
 * holds the unlimited internal plan — listing everything active would offer it
 * to the public. Order follows the configured order, not the table's.
 */
export async function listSignupPlans(): Promise<SignupPlan[]> {
  const codes = config.billing.signupPlanCodes;
  const rows = await prisma.billingPlan.findMany({
    where: { code: { in: codes }, isActive: true },
  });

  return codes
    .map((code) => rows.find((r) => r.code === code))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .map((r) => ({
      code: r.code,
      name: r.name,
      amountPaise: r.priceMonthly,
      currency: r.currency,
      maxStructures: r.maxStructures,
      maxSensors: r.maxSensors,
      maxUsers: r.maxUsers,
    }));
}

export interface StartedCheckout {
  orderId: string;
  /** Publishable key. The secret never leaves the server. */
  keyId: string;
  amountPaise: number;
  currency: string;
  planName: string;
}

/**
 * Opens a payment order for the subscription belonging to `userId`.
 *
 * The amount comes from the plan row, never from the request. A client able to
 * name its own price could buy a year of monitoring for one paisa, so the only
 * thing the caller gets to influence is WHICH subscription is being paid for —
 * and even that is fixed by the signed token the route verified.
 */
export async function startCheckoutForUser(
  userId: number,
  planCode?: string,
): Promise<StartedCheckout> {
  const subscription = await prisma.subscription.findUnique({
    where: { adminId: userId },
    include: { plan: true },
  });

  if (!subscription) {
    throw new BadRequestError("No subscription exists for this account");
  }

  // Charging an already-paid account is not a no-op, it is a second charge.
  if (subscription.status === "active") {
    throw new BadRequestError("This subscription is already active");
  }

  // A chosen plan must be one we actually offer. Taking the code on trust
  // would let a caller name `complimentary` — the unlimited internal plan,
  // priced at zero — and check out for nothing.
  if (planCode && !config.billing.signupPlanCodes.includes(planCode)) {
    throw new BadRequestError("That plan is not available at sign-up");
  }

  const wantedCode = planCode ?? config.billing.signupPlanCode;
  const plan = await prisma.billingPlan.findFirst({
    where: { code: wantedCode, isActive: true },
  });

  if (!plan) {
    throw new BadRequestError("No billing plan is configured for sign-up");
  }

  // Record the choice now so the webhook activates the plan that was paid for,
  // not whatever the row happened to carry from provisioning.
  if (plan.id !== subscription.planId) {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { planId: plan.id },
    });
  }

  const order = await paymentProvider.createOrder({
    amountPaise: plan.priceMonthly,
    currency: plan.currency,
    receipt: `sub-${subscription.id}`,
    // Read back by the webhook adapter to attribute the payment to a tenant.
    // Without it a settled charge cannot be matched to an account.
    notes: { subscriptionId: String(subscription.id) },
  });

  return {
    orderId: order.orderId,
    keyId: config.billing.razorpay.keyId,
    amountPaise: order.amountPaise,
    currency: order.currency,
    planName: plan.name,
  };
}
