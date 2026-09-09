import prisma from "../../config/prisma";
import { AuthenticatedRequestUser } from "../../types";
import {
  BadRequestError,
  NotFoundError,
  PaymentRequiredError,
} from "../../utils/AppError";
import type { SwitchPlanInput } from "./subscription.types";

const FALLBACK_CODE = "starter";
const TRIAL_DAYS = 14;

export interface UsageCounts {
  structures: number;
  sensors: number;
  users: number;
}

export interface PlanFeatures {
  apiAccess: boolean;
  smsAlerts: boolean;
  aiFeatures: boolean;
  advancedReports: boolean;
  femIntegration: boolean;
  sso: boolean;
}

interface PlanRecord {
  id: number;
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

/** The admin of an organization is the billing entity (one subscription each). */
export async function resolveSubscriptionAdminId(
  user: AuthenticatedRequestUser,
): Promise<number | null> {
  if (user.userType === "superadmin") return null;
  if (user.userType === "admin") return user.id;
  // contractor/authority bill through their parent admin's subscription
  return user.parentId || null;
}

export function formatPrice(plan: PlanRecord): string {
  if (plan.priceMonthly === 0) return plan.code === "complimentary" ? "FREE" : "Custom";
  const value = plan.priceMonthly / 100;
  return `₹${value.toLocaleString("en-IN")}`;
}

export async function countUsage(adminId: number): Promise<UsageCounts> {
  const [structures, sensors, users] = await Promise.all([
    prisma.project.count({
      where: { createdBy: adminId, isDelete: false },
    }),
    prisma.sensor.count({
      where: { assignedAdmin: adminId },
    }),
    prisma.user.count({
      where: { parentId: adminId, isDelete: "false_" as never },
    }),
  ]);
  return { structures, sensors, users };
}

/**
 * Lazily create a trial subscription for an admin that doesn't have one yet
 * (e.g. admins created before billing shipped, or state drift).
 */
export async function ensureSubscriptionForAdmin(adminId: number) {
  const existing = await prisma.subscription.findUnique({
    where: { adminId },
  });
  if (existing) return existing;

  const fallback = await prisma.billingPlan.findFirst({
    where: { code: FALLBACK_CODE, isActive: true },
  });
  if (!fallback) {
    throw new BadRequestError("No default billing plan configured");
  }

  return prisma.subscription.create({
    data: {
      adminId,
      planId: fallback.id,
      status: "trial",
      startsOn: new Date(),
      renewsOn: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
      autoRenew: true,
    },
  });
}

export async function getEffectivePlan(adminId: number) {
  const subscription = await ensureSubscriptionForAdmin(adminId);
  const plan = await prisma.billingPlan.findUnique({
    where: { id: subscription.planId },
  });
  if (!plan) {
    throw new BadRequestError("Billing plan not found");
  }
  return {
    subscription,
    plan: plan as unknown as PlanRecord,
  };
}

function featureList(plan: PlanRecord): PlanFeatures {
  return {
    apiAccess: plan.apiAccess,
    smsAlerts: plan.smsAlerts,
    aiFeatures: plan.aiFeatures,
    advancedReports: plan.advancedReports,
    femIntegration: plan.femIntegration,
    sso: plan.sso,
  };
}

/**
 * Central plan enforcement. Called before creating a billable resource.
 * Superadmins (adminId null) and unlimited limits pass through.
 */
export async function assertWithinLimits(
  adminId: number | null,
  increment: Partial<UsageCounts>,
): Promise<void> {
  if (!adminId) return; // superadmin / complementary org
  const { plan } = await getEffectivePlan(adminId);
  const usage = await countUsage(adminId);

  const checks: { label: string; max: number | null; used: number; delta: number }[] = [
    {
      label: "Structures",
      max: plan.maxStructures,
      used: usage.structures,
      delta: increment.structures ?? 0,
    },
    {
      label: "Sensors",
      max: plan.maxSensors,
      used: usage.sensors,
      delta: increment.sensors ?? 0,
    },
    {
      label: "Users",
      max: plan.maxUsers,
      used: usage.users,
      delta: increment.users ?? 0,
    },
  ];

  for (const check of checks) {
    if (check.max === null) continue;
    if (usageOverLimit(check.used, check.delta, check.max)) {
      throw new PaymentRequiredError(
        `${check.label} limit reached for the ${plan.name} plan (${check.used}/${check.max}). Please upgrade your subscription.`,
      );
    }
  }
}

function usageOverLimit(used: number, delta: number, max: number): boolean {
  return used + delta > max;
}

export async function getPlanView(user: AuthenticatedRequestUser) {
  const adminId = await resolveSubscriptionAdminId(user);

  if (!adminId) {
    const critical = await prisma.billingPlan.findUnique({
      where: { code: "complimentary" },
    });
    if (!critical) {
      throw new BadRequestError("Complimentary plan not configured");
    }
    const plan = critical as unknown as PlanRecord;
    return {
      scheme: "complimentary",
      plan: {
        code: plan.code,
        name: plan.name,
        priceLabel: "FREE",
        periodLabel: "lifetime · no charge",
        currency: plan.currency,
        limits: {
          structures: plan.maxStructures,
          sensors: plan.maxSensors,
          users: plan.maxUsers,
          dataRetentionDays: plan.dataRetentionDays,
        },
        features: featureList(plan),
      },
      status: "active" as const,
      autoRenew: false,
      renewsOn: null,
    };
  }

  const { subscription, plan } = await getEffectivePlan(adminId);
  const usage = await countUsage(adminId);
  const catalog = await listActivePlans();

  return {
    scheme: "subscription" as const,
    plan: {
      code: plan.code,
      name: plan.name,
      priceLabel: formatPrice(plan),
      periodLabel: plan.priceMonthly > 0 ? "per month · billed monthly" : "custom quote",
      currency: plan.currency,
      limits: {
        structures: plan.maxStructures,
        sensors: plan.maxSensors,
        users: plan.maxUsers,
        dataRetentionDays: plan.dataRetentionDays,
      },
      features: featureList(plan),
    },
    status: subscription.status,
    autoRenew: subscription.autoRenew,
    renewsOn: subscription.renewsOn,
    usage,
    plans: catalog,
  };
}

export async function listActivePlans() {
  const rows = await prisma.billingPlan.findMany({
    where: { isActive: true, code: { not: "complimentary" } },
    orderBy: { priceMonthly: "asc" },
  });
  return rows.map((p) => {
    const plan = p as unknown as PlanRecord;
    return {
      code: plan.code,
      name: plan.name,
      priceLabel: formatPrice(plan),
      description:
        plan.code === "enterprise"
          ? "For large-scale infrastructure monitoring."
          : undefined,
      limits: {
        structures: plan.maxStructures,
        sensors: plan.maxSensors,
        users: plan.maxUsers,
        dataRetentionDays: plan.dataRetentionDays,
      },
      features: featureList(plan),
    };
  });
}

export async function switchPlan(adminId: number | null, input: SwitchPlanInput) {
  if (!adminId) {
    throw new BadRequestError("Superadmin has a complimentary plan and cannot switch");
  }
  const subscription = await ensureSubscriptionForAdmin(adminId);
  const plan = await prisma.billingPlan.findFirst({
    where: { code: input.planCode, isActive: true },
  });
  if (!plan || plan.code === "complimentary") {
    throw new BadRequestError("Invalid or inactive plan");
  }

  const renewed = await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      planId: plan.id,
      status: "active",
      updatedAt: new Date(),
      renewsOn: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  if (plan.priceMonthly > 0) {
    await prisma.invoice.create({
      data: {
        subscriptionId: renewed.id,
        invoiceNo: `INV-${adminId}-${Date.now()}`,
        periodStart: new Date(),
        periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        amountPaise: plan.priceMonthly,
        currency: plan.currency,
        status: "OPEN",
      },
    });
  }

  return { status_code: 200, message: `Plan switched to ${plan.name}`, plan: plan.code };
}

export async function listInvoices(adminId: number | null) {
  if (!adminId) return { status_code: 200, data: [] };
  await ensureSubscriptionForAdmin(adminId);
  const invoices = await prisma.invoice.findMany({
    where: { subscription: { adminId } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return {
    status_code: 200,
    data: invoices.map((inv) => ({
      invoiceNo: inv.invoiceNo,
      periodStart: inv.periodStart.toISOString(),
      periodEnd: inv.periodEnd.toISOString(),
      amountLabel:
        inv.status === "OPEN"
          ? `₹${(inv.amountPaise / 100).toLocaleString("en-IN")}`
          : `₹${(inv.amountPaise / 100).toLocaleString("en-IN")}`,
      currency: inv.currency,
      status: inv.status,
      createdAt: inv.createdAt.toISOString(),
    })),
  };
}

export async function getInvoiceForAdmin(adminId: number | null, invoiceNo: string) {
  if (!adminId) throw new NotFoundError("Invoice not found");
  await ensureSubscriptionForAdmin(adminId);
  const invoice = await prisma.invoice.findFirst({
    where: { invoiceNo, subscription: { adminId } },
    include: {
      subscription: { include: { plan: true } },
    },
  });
  return invoice;
}

interface InvoiceCsvSource {
  invoiceNo: string;
  periodStart: Date;
  periodEnd: Date;
  amountPaise: number;
  currency: string;
  status: string;
  createdAt: Date;
  subscription: { plan: { name: string } };
}

export type { InvoiceCsvSource };

export function invoiceToCsv(invoice: InvoiceCsvSource): string {
  const planName = invoice.subscription.plan.name;
  const rows = [
    ["Field", "Value"],
    ["Invoice No", invoice.invoiceNo],
    ["Plan", planName],
    ["Period Start", invoice.periodStart.toISOString()],
    ["Period End", invoice.periodEnd.toISOString()],
    ["Amount", `₹${(invoice.amountPaise / 100).toLocaleString("en-IN")}`],
    ["Currency", invoice.currency],
    ["Status", invoice.status],
    ["Issued", invoice.createdAt.toISOString()],
  ];
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
}