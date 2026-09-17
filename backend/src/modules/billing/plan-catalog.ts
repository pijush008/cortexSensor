import prisma from "../../config/prisma";
import { config } from "../../config";

/**
 * The plan catalog, as every screen sees it.
 *
 * Three places show plans — the public pricing section, the sign-up form and
 * the admin's subscription page — and until this existed each described them
 * on its own. The pricing page had a hand-written feature list, the
 * subscription page listed three limits, and the two could not be compared to
 * the row that billing actually charged against. Deriving all three from the
 * billing_plans row keeps them identical by construction: change the row and
 * every screen follows, with nothing to remember.
 */

export interface PlanShape {
  code: string;
  name: string;
  priceMonthly: number;
  currency: string;
  maxStructures: number | null;
  maxSensors: number | null;
  maxUsers: number | null;
  dataRetentionDays: number | null;
  apiAccess: boolean;
  smsAlerts: boolean;
  aiFeatures: boolean;
  advancedReports: boolean;
  femIntegration: boolean;
  sso: boolean;
}

export interface PlanFeatures {
  apiAccess: boolean;
  smsAlerts: boolean;
  aiFeatures: boolean;
  advancedReports: boolean;
  femIntegration: boolean;
  sso: boolean;
}

export interface PlanCard {
  code: string;
  name: string;
  /** "₹4,999", "Custom" for a quoted plan, "FREE" for the operator's own. */
  priceLabel: string;
  amountPaise: number;
  currency: string;
  /** One line under the name: who the plan is for. */
  tagline: string;
  limits: {
    structures: number | null;
    sensors: number | null;
    users: number | null;
    dataRetentionDays: number | null;
  };
  features: PlanFeatures;
  /** The bullet list on a plan card, in display order. */
  highlights: string[];
}

/** The rows carry no copy, so the one line of it per plan lives here. */
const TAGLINES: Record<string, string> = {
  starter: "Small projects and proof of concept",
  professional: "Growing monitoring operations",
  enterprise: "Large-scale infrastructure monitoring",
  complimentary: "The platform operator's own organization",
};

export function formatPrice(plan: Pick<PlanShape, "code" | "priceMonthly">): string {
  if (plan.priceMonthly === 0) return plan.code === "complimentary" ? "FREE" : "Custom";
  const value = plan.priceMonthly / 100;
  return `₹${value.toLocaleString("en-IN")}`;
}

/**
 * The bullets a plan card shows, read off the row.
 *
 * Wording is fixed here rather than stored, so two plans with the same
 * capability say it the same way, and a capability the row does not grant is
 * simply absent — a card never lists what a plan lacks.
 */
export function planHighlights(p: PlanShape): string[] {
  const upTo = (n: number | null, noun: string) =>
    n === null ? `Unlimited ${noun}` : `Up to ${n} ${noun}`;
  const retention =
    p.dataRetentionDays === null
      ? "Unlimited retention"
      : p.dataRetentionDays % 365 === 0
        ? `${p.dataRetentionDays / 365}-year retention`
        : `${p.dataRetentionDays}-day retention`;

  return [
    upTo(p.maxStructures, "structures"),
    upTo(p.maxSensors, "sensors"),
    p.maxUsers === null ? "Unlimited users" : `${p.maxUsers} users`,
    p.advancedReports ? "Advanced analytics + FFT" : "Basic analytics & reports",
    ...(p.aiFeatures ? ["AI anomaly detection"] : []),
    ...(p.apiAccess ? ["API access"] : []),
    p.smsAlerts ? "Email + SMS alerts" : "Email alerts",
    retention,
  ];
}

export function describePlan(p: PlanShape): PlanCard {
  return {
    code: p.code,
    name: p.name,
    priceLabel: formatPrice(p),
    amountPaise: p.priceMonthly,
    currency: p.currency,
    tagline: TAGLINES[p.code] ?? "",
    limits: {
      structures: p.maxStructures,
      sensors: p.maxSensors,
      users: p.maxUsers,
      dataRetentionDays: p.dataRetentionDays,
    },
    features: {
      apiAccess: p.apiAccess,
      smsAlerts: p.smsAlerts,
      aiFeatures: p.aiFeatures,
      advancedReports: p.advancedReports,
      femIntegration: p.femIntegration,
      sso: p.sso,
    },
    highlights: planHighlights(p),
  };
}

/**
 * The plans on offer, in the configured order.
 *
 * Driven by SIGNUP_PLAN_CODES rather than "every active row": billing_plans
 * also holds the operator's unlimited plan and the quoted Enterprise tier,
 * and neither is something a card with a "Switch" button should offer. The
 * same list serves the pricing page, sign-up and the subscription page, so an
 * admin sees exactly the plans the site advertised.
 */
export async function listOfferedPlans(): Promise<PlanCard[]> {
  const codes = config.billing.signupPlanCodes;
  const rows = await prisma.billingPlan.findMany({
    where: { code: { in: codes }, isActive: true },
  });
  return codes
    .map((code) => rows.find((r) => r.code === code))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .map((r) => describePlan(r as unknown as PlanShape));
}
