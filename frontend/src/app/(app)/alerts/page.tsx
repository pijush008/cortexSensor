"use client";

import { useState } from "react";
import { CheckCircle2, ShieldAlert, Wrench } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { QueryState } from "@/components/ui/query-state";
import { SkeletonCard } from "@/components/ui/skeleton";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import {
  useAcknowledgeAlert,
  useAlert,
  useAlerts,
  useAlertSummary,
  useInvestigateAlert,
  useResolveAlert,
} from "@/hooks/use-alerts";
import type {
  AlertCategory,
  AlertRecord,
  AlertSeverity,
  AlertStatus,
} from "@/types";

/**
 * Alert inbox.
 *
 * This page previously rendered a hardcoded list including "Natural Frequency
 * Decreased 3.8%" with a stated confidence of 0.91 — an engineering claim
 * about a structure, invented wholesale.
 *
 * Everything here is now a stored alert raised by the detection rules, and the
 * evidence behind each one is shown alongside it. Two distinctions the UI keeps
 * visible on purpose:
 *
 *   - CATEGORY vs SEVERITY. A flatlined sensor is urgent maintenance, not a
 *     finding about the bridge (§31), so the category is displayed next to the
 *     severity rather than collapsed into it.
 *   - Confidence is in the DETECTION — that the reading really breached — not
 *     in any conclusion about the structure (§88).
 */

const SEVERITY_TONE: Record<AlertSeverity, StatusTone> = {
  info: "slate",
  low: "blue",
  medium: "yellow",
  high: "yellow",
  critical: "red",
};

const SEVERITY_BAR: Record<AlertSeverity, string> = {
  info: "bg-slate-300",
  low: "bg-shm-navy-500",
  medium: "bg-shm-yellow",
  high: "bg-orange-500",
  critical: "bg-shm-red",
};

const STATUS_TONE: Record<AlertStatus, StatusTone> = {
  open: "red",
  acknowledged: "yellow",
  investigating: "blue",
  resolved: "green",
  closed: "slate",
};

const CATEGORY_LABEL: Record<AlertCategory, string> = {
  structural: "Structural",
  sensor_health: "Sensor fault",
  connectivity: "Connectivity",
  data_quality: "Data quality",
};

function ago(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export default function AlertsPage() {
  const [activeOnly, setActiveOnly] = useState(true);
  const [severity, setSeverity] = useState("");
  const [selected, setSelected] = useState<number | null>(null);

  const alertsQuery = useAlerts({ activeOnly, severity });
  const summaryQuery = useAlertSummary();

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs items={[{ label: "Operations" }, { label: "Alerts" }]} />
        <PageHeader
          eyebrow="Operations"
          title="Alerts"
          subtitle="Conditions detected by the monitoring rules, awaiting engineering review."
        />
      </div>

      {/* Counts by severity — of ACTIVE alerts only, since resolved ones are
          not workload. */}
      <QueryState
        query={summaryQuery}
        errorTitle="Couldn't load the alert summary"
        bareError
        skeleton={<div className="skel h-20 rounded-xl" />}
      >
        {(summary) => (
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {(["critical", "high", "medium", "low", "info"] as AlertSeverity[]).map(
              (s) => (
                <div
                  key={s}
                  className="rounded-xl border border-slate-200/90 bg-white px-4 py-3"
                >
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${SEVERITY_BAR[s]}`} />
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                      {s}
                    </span>
                  </div>
                  <p className="mt-1.5 font-mono text-[20px] font-semibold tabular-nums text-slate-900">
                    {summary.bySeverity[s] ?? 0}
                  </p>
                </div>
              ),
            )}
          </div>
        )}
      </QueryState>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="w-full sm:w-56">
          <Select
            label="Severity"
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            options={[
              { value: "", label: "All severities" },
              { value: "critical", label: "Critical" },
              { value: "high", label: "High" },
              { value: "medium", label: "Medium" },
              { value: "low", label: "Low" },
              { value: "info", label: "Info" },
            ]}
          />
        </div>
        <label className="flex items-center gap-2 pb-2.5 text-[13px] text-slate-600">
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(e) => setActiveOnly(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Active only
        </label>
      </div>

      <QueryState
        query={alertsQuery}
        errorTitle="Couldn't load alerts"
        empty={{
          icon: CheckCircle2,
          title: activeOnly ? "No active alerts" : "No alerts recorded",
          description: activeOnly
            ? "Nothing currently needs attention. Resolved alerts are still listed with the filter off."
            : "Alerts appear here when a monitoring rule detects a sustained breach.",
        }}
        skeleton={<SkeletonCard bodyHeight="h-48" />}
      >
        {(alerts) => (
          <ul className="space-y-2">
            {alerts.map((alert) => (
              <AlertRow
                key={alert.id}
                alert={alert}
                onOpen={() => setSelected(alert.id)}
              />
            ))}
          </ul>
        )}
      </QueryState>

      <AlertDrawer id={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function AlertRow({
  alert,
  onOpen,
}: {
  alert: AlertRecord;
  onOpen: () => void;
}) {
  return (
    <li>
      <button
        onClick={onOpen}
        className="flex w-full items-stretch gap-0 overflow-hidden rounded-xl border border-slate-200/90 bg-white text-left transition-colors hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-shm-navy-500"
      >
        <span className={`w-1 shrink-0 ${SEVERITY_BAR[alert.severity]}`} aria-hidden />
        <span className="flex-1 px-4 py-3">
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge
              label={alert.severity}
              tone={SEVERITY_TONE[alert.severity]}
            />
            {/* Category sits beside severity, never folded into it. */}
            <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {alert.category === "sensor_health" ? (
                <Wrench className="h-3 w-3" />
              ) : (
                <ShieldAlert className="h-3 w-3" />
              )}
              {CATEGORY_LABEL[alert.category]}
            </span>
            <StatusBadge label={alert.status} tone={STATUS_TONE[alert.status]} />
          </span>

          <span className="mt-1.5 block text-[14px] font-medium text-slate-800">
            {alert.title}
          </span>

          <span className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 font-mono text-[11.5px] text-slate-500">
            {alert.evidence.observedValue !== undefined && (
              <span>
                observed {alert.evidence.observedValue} vs limit{" "}
                {alert.evidence.limit}
                {alert.evidence.exceedancePercent !== undefined
                  ? ` (+${alert.evidence.exceedancePercent}%)`
                  : ""}
              </span>
            )}
            <span>{alert.occurrenceCount} observation(s)</span>
            <span>first {ago(alert.detectedAt)}</span>
            {alert.confidence !== null && (
              <span title="Confidence that the reading really breached — not a conclusion about the structure">
                detection confidence {(alert.confidence * 100).toFixed(0)}%
              </span>
            )}
          </span>
        </span>
      </button>
    </li>
  );
}

function AlertDrawer({ id, onClose }: { id: number | null; onClose: () => void }) {
  const query = useAlert(id);
  const acknowledge = useAcknowledgeAlert();
  const investigate = useInvestigateAlert();
  const resolve = useResolveAlert();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const alert = query.data;

  async function act(
    action: typeof acknowledge,
    requiresNote = false,
  ) {
    if (!alert) return;
    setError(null);
    if (requiresNote && !note.trim()) {
      setError("A resolution note is required — record what was found.");
      return;
    }
    try {
      await action.mutateAsync({ id: alert.id, note: note.trim() || undefined });
      setNote("");
      if (requiresNote) onClose();
    } catch (err) {
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Could not update the alert.",
      );
    }
  }

  return (
    <Modal
      open={id !== null}
      onClose={onClose}
      title={alert?.title ?? "Alert"}
      subtitle={alert ? `${CATEGORY_LABEL[alert.category]} · ${alert.publicId}` : undefined}
    >
      {!alert ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <StatusBadge label={alert.severity} tone={SEVERITY_TONE[alert.severity]} />
            <StatusBadge label={alert.status} tone={STATUS_TONE[alert.status]} />
          </div>

          {/* Evidence: the numbers behind the claim, so an engineer can check
              it rather than take it on trust. */}
          <section>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Evidence
            </p>
            <dl className="mt-2 space-y-1.5 text-[13px]">
              <Row label="Rule" value={alert.evidence.rule} />
              <Row
                label="Limit"
                value={
                  alert.evidence.limit !== undefined
                    ? `${alert.evidence.bound === "min" ? "≥" : "≤"} ${alert.evidence.limit}`
                    : undefined
                }
              />
              <Row label="Observed" value={alert.evidence.observedValue} />
              <Row
                label="Persistence"
                value={
                  alert.evidence.consecutiveSamples !== undefined
                    ? `${alert.evidence.consecutiveSamples} of ${alert.evidence.requiredSamples} required consecutive samples`
                    : undefined
                }
              />
              <Row
                label="Detection confidence"
                value={
                  alert.confidence !== null
                    ? `${(alert.confidence * 100).toFixed(0)}% — that the reading breached, not a structural conclusion`
                    : undefined
                }
              />
            </dl>
            {alert.evidence.severityRationale && (
              <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[12px] leading-relaxed text-slate-600">
                <span className="font-semibold">Severity derivation: </span>
                {alert.evidence.severityRationale}
              </p>
            )}
          </section>

          {/* Timeline: who knew what, when. */}
          <section>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              History
            </p>
            <ol className="mt-2 space-y-2">
              {alert.events.map((e) => (
                <li key={e.id} className="border-l-2 border-slate-200 pl-3">
                  <p className="text-[12.5px] text-slate-700">
                    {e.fromStatus ? `${e.fromStatus} → ` : ""}
                    <span className="font-medium">{e.toStatus}</span>
                    {e.isAutomatic && (
                      <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] uppercase text-slate-500">
                        detector
                      </span>
                    )}
                  </p>
                  {e.note && (
                    <p className="mt-0.5 text-[12px] text-slate-500">{e.note}</p>
                  )}
                  <p className="mt-0.5 font-mono text-[10.5px] text-slate-400">
                    {new Date(e.createdAt).toLocaleString()}
                  </p>
                </li>
              ))}
            </ol>
          </section>

          {alert.status !== "resolved" && alert.status !== "closed" && (
            <section className="space-y-2 border-t border-slate-100 pt-4">
              {error && (
                <p role="alert" className="text-[12.5px] text-shm-red">
                  {error}
                </p>
              )}
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What did you find? (required to resolve)"
                rows={3}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus-visible:border-shm-navy-500 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-shm-navy-500/15"
              />
              <div className="flex flex-wrap gap-2">
                {alert.status === "open" && (
                  <Button size="sm" variant="outline" onClick={() => act(acknowledge)}>
                    Acknowledge
                  </Button>
                )}
                {alert.status !== "investigating" && (
                  <Button size="sm" variant="outline" onClick={() => act(investigate)}>
                    Investigate
                  </Button>
                )}
                <Button size="sm" onClick={() => act(resolve, true)}>
                  Resolve
                </Button>
              </div>
            </section>
          )}

          {alert.resolutionNote && (
            <section className="rounded-lg border border-shm-green/25 bg-shm-green/5 px-3 py-2">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-shm-green-text">
                Resolution
              </p>
              <p className="mt-1 text-[13px] text-slate-700">{alert.resolutionNote}</p>
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: string | number | undefined | null;
}) {
  return (
    <div className="flex gap-3">
      <dt className="w-40 shrink-0 text-slate-400">{label}</dt>
      <dd className="text-slate-700">
        {value === undefined || value === null ? "—" : String(value)}
      </dd>
    </div>
  );
}
