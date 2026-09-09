"use client";

import { useState } from "react";
import {
  LayoutGrid,
  Boxes,
  Users,
  HardHat,
  Building2,
  Activity,
  PauseCircle,
  Battery,
  Radio,
} from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { GraphCard } from "@/components/ui/graph-card";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { PulseDot } from "@/components/ui/pulse-dot";
import { Reveal } from "@/components/ui/reveal";
import { QueryState } from "@/components/ui/query-state";
import { SkeletonStatCard, SkeletonCard } from "@/components/ui/skeleton";
import { useAuthStore } from "@/stores/auth-store";
import { useDashboardStats, useNodeData } from "@/hooks/use-data";
import { formatDateTime } from "@/lib/utils";
import type { GraphPoint, NodeData } from "@/types";

/**
 * Operations dashboard.
 *
 * Every number on this page comes from the API. There is no sample data and no
 * fallback: this screen previously rendered invented project counts, invented
 * sparklines, an invented event feed and an invented "fleet health" list with
 * fabricated battery percentages — some only on API failure, but the feed, the
 * sparklines and the deltas were shown unconditionally, including when the API
 * was working. For a product that monitors bridges and dams, a plausible-looking
 * number that is not a measurement is the most dangerous thing the UI can draw,
 * so the rule here is: real value, or an explicit "no data" — never a guess.
 */

type Period = "week" | "month" | "year";

const PERIOD_POINTS: Record<Period, number> = { week: 7, month: 6, year: 12 };

/** Trailing window of a series, or [] when the API didn't return that series. */
function windowOf(points: GraphPoint[] | undefined, period: Period): GraphPoint[] {
  if (!points?.length) return [];
  return points.slice(-PERIOD_POINTS[period]);
}

/** Sparkline values from a real series — never synthesised. */
function sparkOf(points: GraphPoint[] | undefined): number[] | undefined {
  if (!points || points.length < 2) return undefined;
  return points.slice(-12).map((p) => p.count);
}

/**
 * Period-over-period change derived from the same series that feeds the chart.
 * Returns undefined when there aren't two points to compare, so the card simply
 * omits the delta rather than showing a made-up one.
 */
function deltaOf(points: GraphPoint[] | undefined): string | undefined {
  if (!points || points.length < 2) return undefined;
  const latest = points[points.length - 1].count;
  const previous = points[points.length - 2].count;
  const diff = latest - previous;
  if (diff === 0) return "No change";
  return `${diff > 0 ? "+" : ""}${diff} vs previous`;
}

/**
 * A count the API omitted is unknown, not zero — zero is a factual claim about
 * the fleet. Render an em dash instead.
 */
function count(value: number | undefined): number | string {
  return typeof value === "number" ? value : "—";
}

/** Most recent reading per gateway, newest first. */
function latestPerGateway(readings: NodeData[]): NodeData[] {
  const byGateway = new Map<string, NodeData>();
  for (const r of readings) {
    const key = r.gatewayDeviceId ?? r.deviceId ?? String(r.id);
    const seen = byGateway.get(key);
    if (!seen || new Date(r.createdAt) > new Date(seen.createdAt)) {
      byGateway.set(key, r);
    }
  }
  return [...byGateway.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

function batteryTone(pct: number | null): "green" | "yellow" | "red" | "slate" {
  if (pct == null) return "slate";
  if (pct <= 20) return "red";
  if (pct <= 50) return "yellow";
  return "green";
}

const BATTERY_BAR: Record<string, string> = {
  green: "#379745",
  yellow: "#f7a707",
  red: "#cc1c16",
  slate: "#a3a3a3",
};

export default function DashboardPage() {
  const { userId, userType } = useAuthStore();
  const statsQuery = useDashboardStats(userId, userType);
  const nodesQuery = useNodeData();
  const [period, setPeriod] = useState<Period>("year");

  const showAdmin = userType === "superadmin";
  const isAdmin = userType === "admin";

  return (
    <div className="space-y-6">
      <Reveal>
        <PageHeader
          eyebrow="Operations Board"
          title="Live monitoring overview"
          subtitle="Structures, gateways, and sensors reporting in real time."
          actions={
            <div
              className="flex rounded-lg border border-slate-200 bg-white p-1"
              role="group"
              aria-label="Chart period"
            >
              {(["week", "month", "year"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setPeriod(t)}
                  aria-pressed={period === t}
                  className={`cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-shm-navy-500 ${
                    period === t
                      ? "bg-shm-navy-800 text-white"
                      : "text-slate-500 hover:bg-slate-100"
                  }`}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          }
        />
      </Reveal>

      <QueryState
        query={statsQuery}
        errorTitle="Couldn't load the monitoring overview"
        isEmpty={(d) => d == null}
        empty={{
          icon: LayoutGrid,
          title: "No monitoring data yet",
          description:
            "Once projects and devices are registered, their activity appears here.",
        }}
        skeleton={
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <SkeletonStatCard key={i} />
              ))}
            </div>
            <div className="grid gap-6 lg:grid-cols-3">
              <SkeletonCard className="lg:col-span-2" bodyHeight="h-64" />
              <SkeletonCard bodyHeight="h-64" />
            </div>
          </div>
        }
      >
        {(data) => {
          const projectSeries = data?.projectGraph;
          const deviceSeries = data?.deviceGraph;
          const peopleSeries = isAdmin ? data?.contractorGraph : data?.adminGraph;

          return (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Reveal delay={0}>
                  <StatCard
                    icon={LayoutGrid}
                    title="Upcoming"
                    value={count(data?.upcomingProjects)}
                    accent="blue"
                    hint="Contracts in pipeline"
                  />
                </Reveal>
                <Reveal delay={60}>
                  <StatCard
                    icon={Activity}
                    title="Running"
                    value={count(data?.runningProjects)}
                    accent="green"
                    hint="Active structures"
                    delta={deltaOf(projectSeries)}
                    spark={sparkOf(projectSeries)}
                  />
                </Reveal>
                <Reveal delay={120}>
                  <StatCard
                    icon={PauseCircle}
                    title="Paused"
                    value={count(data?.pausedProjects)}
                    accent="yellow"
                    hint="Awaiting permits"
                  />
                </Reveal>
                <Reveal delay={180}>
                  <StatCard
                    icon={Boxes}
                    title="Devices"
                    value={count(data?.ongoingDevices ?? data?.totalDevices)}
                    accent="navy"
                    hint="Sensors + gateways"
                    delta={deltaOf(deviceSeries)}
                    spark={sparkOf(deviceSeries)}
                  />
                </Reveal>
              </div>

              <div className="grid gap-6 lg:grid-cols-3">
                <div className="space-y-6 lg:col-span-2">
                  <Reveal>
                    <div className="grid gap-6 sm:grid-cols-2">
                      <GraphCard
                        title="Structures"
                        subtitle="Active monitoring load"
                        data={windowOf(projectSeries, period)}
                        type={period}
                        color="#1f1f1f"
                      />
                      <GraphCard
                        title={isAdmin ? "Contractors" : "Administrators"}
                        subtitle="Platform users"
                        data={windowOf(peopleSeries, period)}
                        type={period}
                        color="#737373"
                      />
                    </div>
                  </Reveal>

                  {(showAdmin || isAdmin) && (
                    <Reveal delay={80}>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        {showAdmin && (
                          <StatCard
                            icon={Users}
                            title="Admins"
                            value={count(data?.adminCount)}
                            accent="navy"
                          />
                        )}
                        <StatCard
                          icon={Building2}
                          title="Contractors"
                          value={count(data?.contractorCount)}
                          accent="red"
                        />
                        <StatCard
                          icon={HardHat}
                          title="Authorities"
                          value={count(data?.authorityCount)}
                          accent="purple"
                        />
                      </div>
                    </Reveal>
                  )}
                </div>

                {/* Gateway telemetry — real readings, or an honest empty state.
                    This replaces a hardcoded "fleet health" list that showed
                    invented gateway names and battery levels. */}
                <Reveal delay={60}>
                  <Card>
                    <CardHeader className="flex-row items-center justify-between">
                      <CardTitle>Gateway nodes</CardTitle>
                      {nodesQuery.isSuccess && nodesQuery.data.length > 0 && (
                        <PulseDot tone="green" />
                      )}
                    </CardHeader>
                    <CardContent>
                      <QueryState
                        query={nodesQuery}
                        bareError
                        errorTitle="Couldn't load node telemetry"
                        empty={{
                          icon: Radio,
                          title: "No node readings yet",
                          description:
                            "Gateway nodes appear here once they report battery and environment data.",
                        }}
                        skeleton={
                          <div className="space-y-4">
                            {[0, 1, 2, 3].map((i) => (
                              <div key={i} className="skel h-9 rounded-md" />
                            ))}
                          </div>
                        }
                      >
                        {(readings) => (
                          <ul className="space-y-3.5">
                            {latestPerGateway(readings)
                              .slice(0, 6)
                              .map((n) => {
                                const tone = batteryTone(n.battery);
                                return (
                                  <li
                                    key={n.id}
                                    className="flex items-center gap-3"
                                  >
                                    <PulseDot tone={tone} />
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-baseline justify-between gap-2">
                                        <span className="truncate font-mono text-[11px] font-semibold text-slate-800">
                                          {n.gatewayDeviceId ??
                                            n.deviceName ??
                                            "Unknown node"}
                                        </span>
                                        <span className="shrink-0 text-[10.5px] text-slate-400">
                                          {formatDateTime(n.createdAt)}
                                        </span>
                                      </div>
                                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-100">
                                        <div
                                          className="h-full rounded-full transition-all duration-700"
                                          style={{
                                            width: `${Math.max(0, Math.min(100, n.battery ?? 0))}%`,
                                            background: BATTERY_BAR[tone],
                                          }}
                                        />
                                      </div>
                                    </div>
                                    <span className="flex shrink-0 items-center gap-1 font-mono text-[10px] tabular-nums text-slate-500">
                                      <Battery
                                        className="h-3.5 w-3.5"
                                        strokeWidth={1.75}
                                      />
                                      {n.battery == null ? "—" : `${n.battery}%`}
                                    </span>
                                  </li>
                                );
                              })}
                          </ul>
                        )}
                      </QueryState>
                    </CardContent>
                  </Card>
                </Reveal>
              </div>
            </div>
          );
        }}
      </QueryState>
    </div>
  );
}
