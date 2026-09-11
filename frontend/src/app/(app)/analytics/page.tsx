"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Bookmark,
  Info,
  LineChart as LineChartIcon,
  Play,
  Waves,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { QueryState } from "@/components/ui/query-state";
import { SkeletonCard } from "@/components/ui/skeleton";
import { useSensors } from "@/hooks/use-data";
import {
  useAnalysisRun,
  useAnalysisRuns,
  useCaptureBaseline,
  useRequestSpectrum,
} from "@/hooks/use-analysis";
import type { AnalysisStatus, SpectrumResult } from "@/types";

/**
 * Spectral analysis.
 *
 * This page previously rendered a hardcoded modal table — natural frequencies,
 * damping ratios and a "-3.8% change" warning, none of which came from a
 * measurement. Everything here is now computed from stored data by the
 * analysis engine, and every result carries the method, parameters, engine
 * version and resolution that produced it.
 *
 * Note what the page does NOT say. It reports frequencies, shifts and their
 * measurement resolution; it never concludes that a structure is damaged. A
 * frequency shift has many ordinary causes, and the limitations panel is shown
 * with the result rather than buried, because a number without its caveats is
 * how an engineer is misled (§35, §88).
 */

const STATUS_TONE: Record<AnalysisStatus, StatusTone> = {
  queued: "slate",
  running: "blue",
  succeeded: "green",
  failed: "red",
};

function isoLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export default function AnalyticsPage() {
  const sensorsQuery = useSensors();
  const [sensorId, setSensorId] = useState<string>("");
  const [from, setFrom] = useState(() =>
    isoLocal(new Date(Date.now() - 60 * 60 * 1000)),
  );
  const [to, setTo] = useState(() => isoLocal(new Date()));
  const [activeRunId, setActiveRunId] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const runsQuery = useAnalysisRuns(sensorId ? Number(sensorId) : undefined);
  const runQuery = useAnalysisRun(activeRunId);
  const requestSpectrum = useRequestSpectrum();
  const captureBaseline = useCaptureBaseline();

  const sensors = sensorsQuery.data ?? [];

  async function onRun() {
    setFormError(null);
    if (!sensorId) {
      setFormError("Choose a sensor to analyse.");
      return;
    }
    try {
      const response = await requestSpectrum.mutateAsync({
        sensorId: Number(sensorId),
        from: new Date(from).toISOString(),
        to: new Date(to).toISOString(),
      });
      setActiveRunId(response.data.id);
      if (!response.queued) {
        // The API told us the queue is down; say so rather than leaving the
        // run spinning forever with no explanation.
        setFormError(response.message);
      }
    } catch (err) {
      setFormError(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Could not start the analysis.",
      );
    }
  }

  const run = runQuery.data;
  const result = run?.result as SpectrumResult | null | undefined;

  const chartData = useMemo(() => {
    if (!result) return [];
    return result.frequencies_hz.map((f, i) => ({
      frequency: f,
      psd: result.psd[i],
    }));
  }, [result]);

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs items={[{ label: "Monitoring" }, { label: "SHM Analysis" }]} />
        <PageHeader
          eyebrow="Structural Analysis"
          title="SHM Analysis"
          subtitle="Spectral estimation over recorded measurements, with the method and its limits stated alongside every result."
        />
      </div>

      {/* Request panel */}
      <section className="rounded-xl border border-slate-200/90 bg-white p-5">
        <h2 className="font-mono text-[0.625rem] font-semibold uppercase tracking-[0.22em] text-slate-400">
          Run analysis
        </h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <Select
              label="Sensor"
              value={sensorId}
              onChange={(e) => setSensorId(e.target.value)}
              options={[
                { value: "", label: sensors.length ? "Select a sensor…" : "No sensors available" },
                ...sensors.map((s) => ({
                  value: String(s.sensorId),
                  label: `${s.sensorName}${s.sensorType ? ` · ${s.sensorType}` : ""}`,
                })),
              ]}
            />
          </div>
          <Input
            label="From"
            type="datetime-local"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <Input
            label="To"
            type="datetime-local"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={onRun} disabled={requestSpectrum.isPending}>
            <Play className="h-4 w-4" />
            {requestSpectrum.isPending ? "Queueing…" : "Run spectrum"}
          </Button>
          <p className="text-[0.75rem] text-slate-400">
            Welch PSD, Hann window, linear detrend. Analysis runs in the
            background; the result appears below when it completes.
          </p>
        </div>

        {formError && (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-shm-red/25 bg-shm-red/5 px-3 py-2 text-[0.8125rem] text-shm-red"
          >
            {formError}
          </p>
        )}
      </section>

      {/* Result */}
      {activeRunId === null ? (
        <EmptyState
          icon={Waves}
          title="No analysis selected"
          description="Choose a sensor and a time window, then run a spectrum. Previous runs are listed below."
        />
      ) : (
        <QueryState
          query={runQuery}
          errorTitle="Couldn't load the analysis run"
          skeleton={<SkeletonCard bodyHeight="h-72" />}
        >
          {(activeRun) => (
            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <StatusBadge
                    label={activeRun.status}
                    tone={STATUS_TONE[activeRun.status]}
                  />
                  <span className="font-mono text-[0.71875rem] text-slate-400">
                    {activeRun.publicId}
                  </span>
                </div>
                {activeRun.status === "succeeded" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={captureBaseline.isPending}
                    onClick={() =>
                      captureBaseline.mutate({
                        runId: activeRun.id,
                        label: `Reference ${new Date().toLocaleDateString()}`,
                      })
                    }
                  >
                    <Bookmark className="h-4 w-4" />
                    Capture as baseline
                  </Button>
                )}
              </div>

              {activeRun.status === "failed" && (
                <div
                  role="alert"
                  className="flex items-start gap-3 rounded-xl border border-shm-red/25 bg-shm-red/5 px-4 py-3"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-shm-red" />
                  <div>
                    <p className="text-[0.8125rem] font-medium text-shm-red">
                      Analysis could not be completed
                    </p>
                    <p className="mt-0.5 text-[0.78125rem] text-slate-600">
                      {activeRun.error}
                    </p>
                  </div>
                </div>
              )}

              {(activeRun.status === "queued" || activeRun.status === "running") && (
                <div className="rounded-xl border border-slate-200/90 bg-white px-5 py-8 text-center">
                  <p className="text-[0.8125rem] text-slate-500">
                    {activeRun.status === "queued"
                      ? "Queued — waiting for a worker."
                      : "Running…"}
                  </p>
                </div>
              )}

              {activeRun.status === "succeeded" && result && (
                <>
                  {/* Provenance: what produced these numbers */}
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Fact label="Sampling rate" value={`${result.sample_rate_hz.toFixed(2)} Hz`} />
                    <Fact
                      label="Resolution"
                      value={`${result.frequency_resolution_hz.toFixed(4)} Hz`}
                    />
                    <Fact
                      label="Record"
                      value={`${result.sample_count.toLocaleString()} samples · ${result.duration_seconds.toFixed(0)} s`}
                    />
                    <Fact
                      label="Method"
                      value={`${result.window} · ${result.detrend} detrend · v${result.engine_version}`}
                    />
                  </div>

                  {result.warnings.length > 0 && (
                    <div className="rounded-xl border border-shm-yellow/30 bg-shm-yellow/5 px-4 py-3">
                      <p className="font-mono text-[0.625rem] font-semibold uppercase tracking-[0.18em] text-amber-700">
                        Warnings
                      </p>
                      <ul className="mt-2 space-y-1">
                        {result.warnings.map((w) => (
                          <li key={w} className="text-[0.78125rem] text-amber-800">
                            {w}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Spectrum */}
                  <div className="rounded-xl border border-slate-200/90 bg-white p-5">
                    <div className="mb-3 flex items-baseline justify-between">
                      <h3 className="text-[0.9375rem] font-semibold tracking-tight text-slate-900">
                        Power spectral density
                      </h3>
                      <span className="font-mono text-[0.6875rem] text-slate-400">
                        Welch · {result.segment_length}-point segments
                      </span>
                    </div>
                    <div className="h-72 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 28, left: 8 }}>
                          <CartesianGrid stroke="var(--color-shm-chart-grid)" strokeDasharray="3 3" />
                          <XAxis
                            dataKey="frequency"
                            type="number"
                            domain={["dataMin", "dataMax"]}
                            tick={{ fontSize: 11, fill: "var(--color-shm-chart-axis)" }}
                            tickFormatter={(v: number) => v.toFixed(1)}
                            label={{
                              value: "Frequency (Hz)",
                              position: "insideBottom",
                              offset: -14,
                              style: { fontSize: 11, fill: "var(--color-shm-chart-axis)" },
                            }}
                          />
                          <YAxis
                            tick={{ fontSize: 11, fill: "var(--color-shm-chart-axis)" }}
                            tickFormatter={(v: number) => v.toExponential(0)}
                            label={{
                              value: "PSD (unit²/Hz)",
                              angle: -90,
                              position: "insideLeft",
                              style: { fontSize: 11, fill: "var(--color-shm-chart-axis)" },
                            }}
                          />
                          <Tooltip
                            formatter={(v) => [Number(v).toExponential(3), "PSD"]}
                            labelFormatter={(v) => `${Number(v).toFixed(3)} Hz`}
                            contentStyle={{ fontSize: 12 }}
                          />
                          {/* Identified peaks marked on the axis they were found on */}
                          {result.peaks.map((p) => (
                            <ReferenceLine
                              key={p.frequency_hz}
                              x={p.frequency_hz}
                              stroke="var(--color-shm-chart-2)"
                              strokeDasharray="4 3"
                              strokeOpacity={0.6}
                            />
                          ))}
                          <Line
                            type="monotone"
                            dataKey="psd"
                            stroke="var(--color-shm-chart-1)"
                            strokeWidth={1.4}
                            dot={false}
                            isAnimationActive={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Peaks */}
                  <div className="overflow-x-auto rounded-xl border border-slate-200/90 bg-white">
                    <table className="w-full min-w-[640px] border-collapse text-sm">
                      <caption className="sr-only">Identified spectral peaks</caption>
                      <thead>
                        <tr className="border-b border-slate-200 text-left">
                          <Th>Frequency</Th>
                          <Th className="text-right">Resolution</Th>
                          <Th className="text-right">Prominence</Th>
                          <Th className="text-right">Bandwidth</Th>
                          <Th className="text-right">Damping (est.)</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.peaks.map((p) => (
                          <tr
                            key={p.frequency_hz}
                            className="border-b border-slate-100 last:border-0"
                          >
                            <td className="px-4 py-2.5 font-mono text-[0.78125rem] font-semibold text-slate-800">
                              {p.frequency_hz.toFixed(3)} Hz
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-[0.75rem] text-slate-400">
                              ± {p.resolution_hz.toFixed(4)}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-[0.75rem] text-slate-600">
                              {p.prominence.toExponential(2)}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-[0.75rem] text-slate-600">
                              {p.bandwidth_hz === null
                                ? "unresolved"
                                : `${p.bandwidth_hz.toFixed(4)} Hz`}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-[0.75rem] text-slate-600">
                              {/* Null when the peak is narrower than one bin —
                                  stated rather than filled with a fake number. */}
                              {p.damping_ratio === null
                                ? "not estimable"
                                : `${(p.damping_ratio * 100).toFixed(2)} %`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Baseline comparison */}
                  {result.baselineComparison && (
                    <div className="rounded-xl border border-slate-200/90 bg-white p-5">
                      <h3 className="text-[0.9375rem] font-semibold tracking-tight text-slate-900">
                        Comparison against baseline
                      </h3>
                      <ul className="mt-3 space-y-2">
                        {result.baselineComparison.matched.map((m) => (
                          <li
                            key={m.baseline_frequency_hz}
                            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-slate-100 pt-2 text-[0.8125rem] first:border-0 first:pt-0"
                          >
                            <span className="font-mono text-slate-700">
                              {m.baseline_frequency_hz.toFixed(3)} →{" "}
                              {m.current_frequency_hz.toFixed(3)} Hz
                            </span>
                            <span
                              className={
                                m.exceeds_resolution
                                  ? "font-mono text-amber-700"
                                  : "font-mono text-slate-400"
                              }
                            >
                              {m.shift_hz >= 0 ? "+" : ""}
                              {m.shift_hz.toFixed(4)} Hz
                              {m.shift_percent !== null
                                ? ` (${m.shift_percent >= 0 ? "+" : ""}${m.shift_percent.toFixed(2)}%)`
                                : ""}
                            </span>
                            <span className="text-[0.75rem] text-slate-400">
                              {m.exceeds_resolution
                                ? "exceeds measurement resolution"
                                : "within measurement resolution"}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-3 border-t border-slate-100 pt-3 text-[0.78125rem] leading-relaxed text-slate-500">
                        {result.baselineComparison.interpretation}
                      </p>
                    </div>
                  )}

                  {/* Limitations — shown with the result, never buried */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-5">
                    <div className="flex items-center gap-2">
                      <Info className="h-3.5 w-3.5 text-slate-400" />
                      <p className="font-mono text-[0.625rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Method limitations
                      </p>
                    </div>
                    <ul className="mt-3 space-y-1.5">
                      {result.limitations.map((l) => (
                        <li
                          key={l}
                          className="flex items-baseline gap-2.5 text-[0.78125rem] leading-relaxed text-slate-600"
                        >
                          <span
                            aria-hidden
                            className="h-1 w-1 shrink-0 translate-y-[-2px] rounded-full bg-slate-300"
                          />
                          {l}
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </section>
          )}
        </QueryState>
      )}

      {/* History */}
      <section>
        <h2 className="mb-3 text-[0.9375rem] font-semibold tracking-tight text-slate-900">
          Recent runs
        </h2>
        <QueryState
          query={runsQuery}
          errorTitle="Couldn't load previous analyses"
          empty={{
            icon: LineChartIcon,
            title: "No analyses yet",
            description: "Runs you request appear here with their status and result.",
          }}
          skeleton={<SkeletonCard bodyHeight="h-32" />}
        >
          {(runs) => (
            <div className="overflow-x-auto rounded-xl border border-slate-200/90 bg-white">
              <table className="w-full min-w-[620px] border-collapse text-sm">
                <caption className="sr-only">Previous analysis runs</caption>
                <thead>
                  <tr className="border-b border-slate-200 text-left">
                    <Th>Run</Th>
                    <Th>Sensor</Th>
                    <Th>Window</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Peaks</Th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => setActiveRunId(r.id)}
                      className="cursor-pointer border-b border-slate-100 last:border-0 transition-colors hover:bg-slate-50/70"
                    >
                      <td className="px-4 py-2.5 font-mono text-[0.71875rem] text-shm-navy-700">
                        {r.publicId}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[0.75rem] text-slate-600">
                        #{r.sensorId}
                      </td>
                      <td className="px-4 py-2.5 text-[0.78125rem] text-slate-500">
                        {new Date(r.windowFrom).toLocaleString()} →{" "}
                        {new Date(r.windowTo).toLocaleTimeString()}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge label={r.status} tone={STATUS_TONE[r.status]} />
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-[0.75rem] text-slate-600">
                        {r.result?.peaks?.length ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </QueryState>
      </section>
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

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200/90 bg-white px-4 py-3">
      <p className="font-mono text-[0.75rem] font-medium text-slate-500">
        {label}
      </p>
      <p className="mt-1 font-mono text-[0.8125rem] text-slate-800">{value}</p>
    </div>
  );
}
