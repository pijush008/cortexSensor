"use client";

import { Activity, AlertTriangle, Radio, Wifi, WifiOff } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useLiveStream, type ConnectionState } from "@/hooks/use-live-stream";

/**
 * Live measurement feed.
 *
 * Previously this page opened an MQTT connection from the browser using
 * credentials compiled into the client bundle, subscribed to a topic wildcard
 * covering every tenant. It now consumes the API's authenticated,
 * tenant-filtered SSE stream; the browser never contacts the broker and holds
 * no broker credential (audit finding SEC-1).
 *
 * Every value shown is a stored measurement. A reading the device could not
 * express as a number renders as "not a number" rather than as 0, and quality
 * flags are shown next to the value rather than being quietly dropped.
 */

const STATE_LABEL: Record<ConnectionState, string> = {
  idle: "Disconnected",
  connecting: "Connecting",
  open: "Live",
  reconnecting: "Reconnecting",
  error: "Unavailable",
};

const STATE_TONE: Record<ConnectionState, StatusTone> = {
  idle: "slate",
  connecting: "blue",
  open: "green",
  reconnecting: "yellow",
  error: "red",
};

function formatValue(value: number | null): string {
  // A non-finite reading has no numeric value. Rendering 0 would be a lie.
  if (value === null) return "not a number";
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export default function LiveFeedPage() {
  const { events, state, lastEventAt, clear } = useLiveStream({ limit: 200 });

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs items={[{ label: "Monitoring" }, { label: "Live Feed" }]} />
        <PageHeader
          eyebrow="Real-time"
          title="Live Feed"
          subtitle="Measurements arriving from the field, streamed from the platform."
          actions={
            <div className="flex items-center gap-2">
              <StatusBadge label={STATE_LABEL[state]} tone={STATE_TONE[state]} />
              <Button variant="outline" size="sm" onClick={clear}>
                Clear
              </Button>
            </div>
          }
        />
      </div>

      {state === "error" && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-shm-red/25 bg-shm-red/5 px-4 py-3"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-shm-red" />
          <div>
            <p className="text-[0.8125rem] font-medium text-shm-red">
              Live stream unavailable
            </p>
            <p className="mt-0.5 text-[0.78125rem] text-slate-500">
              The connection could not be established. Existing measurements are
              unaffected — this only interrupts real-time updates.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Metric
          icon={Wifi}
          label="Stream"
          value={STATE_LABEL[state]}
          tone={state === "open" ? "text-shm-green-text" : "text-slate-700"}
        />
        <Metric icon={Activity} label="Received this session" value={String(events.length)} />
        <Metric
          icon={Radio}
          label="Last measurement"
          value={lastEventAt ? lastEventAt.toLocaleTimeString() : "—"}
        />
      </div>

      {events.length === 0 ? (
        <EmptyState
          icon={state === "open" ? Radio : WifiOff}
          title={
            state === "open"
              ? "Connected — waiting for measurements"
              : "No live measurements"
          }
          description={
            state === "open"
              ? "The stream is open. Readings appear here as devices report them."
              : "Once the stream connects, readings appear here as they arrive."
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200/90 bg-white">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <caption className="sr-only">Live measurements</caption>
            <thead>
              <tr className="border-b border-slate-200 text-left">
                <Th>Time</Th>
                <Th>Sensor</Th>
                <Th className="text-right">Value</Th>
                <Th className="text-right">Raw</Th>
                <Th>Quality</Th>
              </tr>
            </thead>
            <tbody>
              {events.map((e, i) => (
                <tr
                  key={`${e.sensorId}-${e.ts}-${i}`}
                  className="border-b border-slate-100 last:border-0"
                >
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[0.71875rem] text-slate-500">
                    {new Date(e.ts).toLocaleTimeString()}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[0.75rem] text-slate-700">
                    #{e.sensorId}
                  </td>
                  <td
                    className={`px-4 py-2.5 text-right font-mono text-[0.75rem] tabular-nums ${
                      e.value === null ? "italic text-slate-400" : "text-slate-800"
                    }`}
                  >
                    {formatValue(e.value)}
                    {e.unit && e.value !== null ? ` ${e.unit}` : ""}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-[0.75rem] tabular-nums text-slate-500">
                    {e.rawValue === null ? "—" : e.rawValue}
                  </td>
                  <td className="px-4 py-2.5">
                    {e.qualityFlags.length === 0 ? (
                      <span className="text-[0.75rem] text-slate-400">OK</span>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {e.qualityFlags.map((f) => (
                          <span
                            key={f}
                            className="rounded bg-shm-yellow/15 px-1.5 py-0.5 font-mono text-[0.625rem] font-semibold uppercase tracking-wide text-amber-700"
                          >
                            {f.replace(/_/g, " ")}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`px-4 py-2.5 font-mono text-[0.75rem] font-medium text-slate-500 ${className}`}
    >
      {children}
    </th>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  tone = "text-slate-700",
}: {
  icon: typeof Wifi;
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200/90 bg-white px-4 py-3">
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-slate-400" strokeWidth={1.75} />
        <span className="font-mono text-[0.75rem] font-medium text-slate-500">
          {label}
        </span>
      </div>
      <p className={`mt-1.5 text-[0.9375rem] font-semibold tracking-tight ${tone}`}>
        {value}
      </p>
    </div>
  );
}
