"use client";

import { useState } from "react";
import {
  Check,
  CreditCard,
  Crown,
  Download,
  Gem,
  Receipt,
  Rocket,
  Sparkles,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Reveal } from "@/components/ui/reveal";
import { StatusBadge } from "@/components/ui/status-badge";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { useAuthStore } from "@/stores/auth-store";
import {
  downloadInvoice,
  useSubscriptionInvoices,
  useSubscriptionPlan,
  useSwitchPlan,
} from "@/hooks/use-subscription";
import type { BillingPlanSummary } from "@/types";

const PLAN_ICON: Record<string, { icon: typeof Rocket; className: string }> = {
  starter: { icon: Rocket, className: "text-slate-400" },
  professional: { icon: Zap, className: "text-shm-navy-400" },
  enterprise: { icon: Crown, className: "text-shm-yellow" },
};

function formatUsage(used: number, max: number | null): string {
  return max === null || max === 0 ? `${used} / Unlimited` : `${used} / ${max}`;
}

function featureMap(plan: BillingPlanSummary) {
  return [
    { label: "API Access", value: plan.features.apiAccess },
    { label: "AI Features", value: plan.features.aiFeatures },
    { label: "Advanced Reports", value: plan.features.advancedReports },
    { label: "SMS Alerts", value: plan.features.smsAlerts },
    { label: "FEM Integration", value: plan.features.femIntegration },
    { label: "SSO", value: plan.features.sso },
  ];
}

function SuperAdminFreeView({ priceLabel }: { priceLabel: string }) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Subscription & Billing"
        subtitle="Platform owner — all capabilities are included at no charge."
      />
      <Reveal>
        <Card>
          <CardContent className="p-0">
            <div className="flex flex-col gap-6 rounded-2xl bg-gradient-to-br from-shm-navy-800 to-shm-navy-900 p-6 text-white shadow-lg sm:p-8 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10">
                  <Gem className="h-6 w-6 text-shm-yellow" />
                </div>
                <div>
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-bold">Platform Owner Plan</h2>
                    <StatusBadge
                      label="COMPLIMENTARY"
                      tone="yellow"
                      className="bg-white/10 text-shm-yellow"
                    />
                  </div>
                  <p className="max-w-xl text-sm text-slate-300">
                    As the platform superadmin, your subscription is fully covered
                    by Cloudglance Sensinglab Pvt Ltd. There is nothing to pay —
                    no invoices, no renewal, no card on file.
                  </p>
                </div>
              </div>
              <div className="shrink-0">
                <p className="text-right text-3xl font-bold">{priceLabel}</p>
                <p className="text-right text-xs text-slate-300">lifetime · no charge</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </Reveal>
    </div>
  );
}

export default function SubscriptionPage() {
  const { userType } = useAuthStore();
  const query = useSubscriptionPlan();
  const invoicesQuery = useSubscriptionInvoices();
  const switchMutation = useSwitchPlan();
  const [error, setError] = useState<string | null>(null);
  const isSuperAdmin = userType === "superadmin";

  if (isSuperAdmin) {
    return (
      <SuperAdminFreeView priceLabel={query.data?.plan.priceLabel ?? "FREE"} />
    );
  }

  if (query.isLoading) {
    return <LoadingState label="Loading subscription…" />;
  }

  const view = query.data;
  if (!view) {
    return (
      <EmptyState
        icon={CreditCard}
        title="Subscription unavailable"
        description="We couldn't load your billing details. Please try again."
      />
    );
  }

  const plan = view.plan;
  const usage = view.usage ?? { structures: 0, sensors: 0, users: 0 };
  const usageItems = [
    { label: "Structures", used: usage.structures, max: plan.limits.structures, color: "bg-shm-yellow" },
    { label: "Sensors", used: usage.sensors, max: plan.limits.sensors, color: "bg-shm-navy-500" },
    { label: "Users", used: usage.users, max: plan.limits.users, color: "bg-shm-navy-400" },
  ];
  const catalog = view.plans ?? [];
  const invoices = invoicesQuery.data ?? [];

  const handleSwitch = async (code: string) => {
    setError(null);
    try {
      await switchMutation.mutateAsync(code);
    } catch (e) {
      setError((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Could not switch plan");
    }
  };

  const handleDownload = async (invoiceNo: string) => {
    try {
      const res = await downloadInvoice(invoiceNo);
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${invoiceNo}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not download invoice");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subscription & Billing"
        subtitle="Manage your plan, view entitlements, and download invoices."
        actions={
          <Button variant="outline" disabled>
            <CreditCard className="h-4 w-4" /> Payment Method
          </Button>
        }
      />

      {/* Current Subscription */}
      <div className="rounded-2xl bg-gradient-to-r from-shm-navy-800 to-shm-navy-900 p-6 text-white shadow-lg sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Crown className="h-5 w-5 text-shm-yellow" />
              <h2 className="text-xl font-bold">{plan.name} Plan</h2>
              <StatusBadge
                label={view.status.toUpperCase()}
                tone={view.status === "active" ? "green" : "yellow"}
                className="bg-white/10 text-white"
              />
            </div>
            {view.renewsOn && view.status !== "trial" && (
              <p className="mb-3 text-sm text-slate-300">
                Renews on{" "}
                <span className="font-semibold text-white">
                  {new Date(view.renewsOn).toLocaleDateString("en-IN", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </span>
              </p>
            )}
            {view.status === "trial" && (
              <p className="mb-3 text-sm text-slate-300">
                Trial ends on{" "}
                <span className="font-semibold text-white">
                  {view.renewsOn
                    ? new Date(view.renewsOn).toLocaleDateString("en-IN", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })
                    : "soon"}
                </span>
              </p>
            )}
            <div className="flex gap-3 text-sm">
              {usageItems.map((u) => (
                <span key={u.label} className="rounded-lg bg-white/10 px-3 py-1">
                  {formatUsage(u.used, u.max)} {u.label}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="text-right">
              <p className="text-3xl font-bold">
                {plan.priceLabel.startsWith("₹") ? plan.priceLabel : `₹${plan.priceLabel}`}
              </p>
              <p className="text-xs text-slate-300">{plan.periodLabel}</p>
            </div>
          </div>
        </div>

        {/* Usage bars */}
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {usageItems.map((usageItem) => {
            const pct = usageItem.max
              ? Math.min(100, (usageItem.used / usageItem.max) * 100)
              : Math.min(100, usageItem.used * 10);
            return (
              <div key={usageItem.label}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-slate-300">{usageItem.label}</span>
                  <span className="font-medium">{formatUsage(usageItem.used, usageItem.max)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`anim-rise h-full rounded-full ${usageItem.color}`}
                    style={{ width: `${pct}%`, animationDelay: "250ms" }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Plans */}
      <div className="grid gap-4 lg:grid-cols-3">
        {catalog.map((item) => {
          const icon = PLAN_ICON[item.code] ?? { icon: Zap, className: "text-shm-navy-400" };
          const Icon = icon.icon;
          const isCurrent = item.code === plan.code;
          return (
            <Card
              key={item.code}
              className={`relative border-2 ${
                isCurrent ? "border-shm-navy-400 shadow-xl" : "border-slate-200"
              }`}
            >
              {isCurrent && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-shm-navy-500 px-4 py-1 text-xs font-bold text-white">
                  Current Plan
                </div>
              )}
              <CardContent className="p-6">
                <div className="mb-2 flex items-center gap-2">
                  <Icon className={`h-5 w-5 ${icon.className}`} />
                  <h3 className="text-lg font-bold text-shm-navy-900">{item.name}</h3>
                </div>
                <p className="mb-3 text-sm text-slate-500">{item.description}</p>
                <div className="mb-4">
                  <span className="text-3xl font-bold text-shm-navy-900">
                    {item.priceLabel === "Custom" ? "Custom" : `₹${item.priceLabel.replace(/₹/g, "")}`}
                  </span>
                  {item.code === "enterprise" ? (
                    <span className="text-sm text-slate-500"> · quote</span>
                  ) : (
                    <span className="text-sm text-slate-500">/month</span>
                  )}
                </div>
                <ul className="mb-5 space-y-2">
                  {Object.entries(item.limits)
                    .filter(([key]) => ["structures", "sensors", "users"].includes(key))
                    .map(([key, max]) => (
                      <li key={key} className="flex items-start gap-2 text-sm text-slate-600">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-shm-navy-400" />
                        {key.charAt(0).toUpperCase() + key.slice(1)}:{" "}
                        {max === null ? "Unlimited" : max}
                      </li>
                    ))}
                </ul>
                <Button
                  className={`w-full ${
                    isCurrent
                      ? "bg-slate-100 text-slate-500 hover:bg-slate-200 cursor-default"
                      : "bg-shm-navy-800 text-white hover:bg-shm-navy-700"
                  }`}
                  disabled={isCurrent || switchMutation.isPending}
                  onClick={() => handleSwitch(item.code)}
                >
                  {isCurrent ? "Current Plan" : switchMutation.isPending ? "Switching…" : "Switch Plan"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Entitlements */}
      <Reveal>
        <Card>
          <CardHeader>
            <CardTitle>Plan Entitlements</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {featureMap(plan).map((e) => (
                <div
                  key={e.label}
                  className={`flex items-center justify-between rounded-lg border p-3 ${
                    e.value ? "border-green-100 bg-green-50/50" : "border-slate-100 bg-slate-50"
                  }`}
                >
                  <span className="text-sm font-medium text-slate-600">{e.label}</span>
                  <StatusBadge label={e.value ? "Enabled" : "Not included"} tone={e.value ? "green" : "slate"} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </Reveal>

      {/* Invoices */}
      <Reveal>
        <Card>
          <CardHeader>
            <CardTitle>Billing History</CardTitle>
          </CardHeader>
          <CardContent className={invoices.length ? "" : "py-6"}>
            {invoices.length === 0 ? (
              <EmptyState
                icon={Receipt}
                title="No invoices yet"
                description="Your billing history will appear here once you've been billed."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-[0.75rem] font-medium text-slate-500">
                      <th className="pb-3 pr-4 font-medium">Invoice</th>
                      <th className="pb-3 pr-4 font-medium">Period</th>
                      <th className="pb-3 pr-4 font-medium">Amount</th>
                      <th className="pb-3 pr-4 font-medium">Status</th>
                      <th className="pb-3 font-medium"> </th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr key={inv.invoiceNo} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                        <td className="py-3 pr-4 font-mono text-slate-700">{inv.invoiceNo}</td>
                        <td className="py-3 pr-4 text-slate-600">
                          {new Date(inv.periodStart).toLocaleDateString("en-IN", {
                            month: "short",
                            day: "numeric",
                          })}
                          {inv.periodEnd
                            ? ` – ${new Date(inv.periodEnd).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}`
                            : ""}
                        </td>
                        <td className="py-3 pr-4 font-semibold text-slate-800">{inv.amountLabel}</td>
                        <td className="py-3 pr-4">
                          <StatusBadge label={inv.status} tone={inv.status === "PAID" ? "green" : "yellow"} />
                        </td>
                        <td className="py-3">
                          <Button variant="ghost" size="sm" onClick={() => handleDownload(inv.invoiceNo)}>
                            <Download className="h-4 w-4 text-slate-500" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </Reveal>

      {/* Payment Info */}
      <Reveal>
        <Card>
          <CardHeader>
            <CardTitle>Payment Method</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-14 items-center justify-center rounded-lg bg-shm-cyan-soft">
                <Receipt className="h-5 w-5 text-shm-navy-800" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">No card on file</p>
                <p className="text-xs text-slate-500">
                  Invoices are generated on upgrade; secure card processing coming soon.
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" disabled>
              Update
            </Button>
          </CardContent>
        </Card>
      </Reveal>

      <div className="flex items-center gap-2 rounded-lg border border-shm-navy-100 bg-shm-navy-50/40 px-4 py-3 text-xs text-slate-500">
        <Sparkles className="h-4 w-4 text-shm-navy-400" />
        Usage is enforced by the platform. Reaching a plan limit will prompt you to upgrade.
      </div>
    </div>
  );
}