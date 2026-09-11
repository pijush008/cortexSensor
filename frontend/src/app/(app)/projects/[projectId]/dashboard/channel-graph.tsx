"use client";

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

import type { LiveMeasurement } from "@/hooks/use-live-stream";
import { useSensorSeries } from "@/hooks/use-sensor-series";

/**
 * One channel's live trace, ported from the legacy CustomGraph.
 *
 * Carried over from lib/widget/graph.dart: a 2px straight (uncurved) line with
 * 3px dots, a RED threshold rule and a GREEN trigger rule each labelled with
 * their value and unit, #EBECEC gridlines, and axis text at 60% black. The y
 * domain deliberately includes the threshold and trigger, so both rules stay on
 * screen even when readings are nowhere near them — otherwise the lines a user
 * is watching for silently leave the chart.
 *
 * The SERIES colour is NOT the legacy one. lightGraphColors are pastels —
 * #B3E5FC measures 1.32:1 against the card, so a 2px line in it is effectively
 * invisible. These hues keep one colour per channel while clearing 3:1, and
 * avoid red and green, which are spoken for by the two rules.
 */
const SERIES_COLORS = ["#0277BD", "#B45309", "#6A3D9A"];

/** Legacy customLightGreyColor. */
const GRID = "#EBECEC";
const AXIS_INK = "rgba(0,0,0,0.6)";
const THRESHOLD_COLOR = "#D32F2F";
const TRIGGER_COLOR = "#2E7D32";

export interface ChannelGraphProps {
  index: number;
  sensorId: string | null;
  sensorName: string;
  unit: string;
  thresholdValue: number | null;
  triggerValue: number | null;
  events: LiveMeasurement[];
}

interface Point {
  t: number;
  value: number;
  label: string;
}

/**
 * Y bounds that always contain the rules.
 *
 * Mirrors _getMinYValue/_getMaxYValue: fold the threshold and trigger into the
 * extent, floor the top at 5 so a flat zero series is not drawn on a hairline
 * scale, and pad by 10% so the topmost point is not clipped by the frame.
 */
function yDomain(
  points: Point[],
  threshold: number | null,
  trigger: number | null,
): [number, number] {
  const values = points.map((p) => p.value);
  const candidates = [...values, threshold, trigger].filter(
    (v): v is number => v !== null && Number.isFinite(v),
  );
  if (candidates.length === 0) return [0, 5];

  const rawMax = Math.max(...candidates);
  const rawMin = Math.min(...candidates, 0);
  const max = rawMax < 5 ? 5 : roundTo(rawMax * 1.1, 2);
  return [roundTo(rawMin, 2), max];
}

function roundTo(value: number, places: number): number {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

export function ChannelGraph({
  index,
  sensorId,
  sensorName,
  unit,
  thresholdValue,
  triggerValue,
  events,
}: ChannelGraphProps) {
  const color = SERIES_COLORS[index % SERIES_COLORS.length];

  // Stored history, so the chart is populated the moment the page opens rather
  // than waiting for the next reading — and so it works at all for a platform
  // operator, whom the live stream refuses.
  const history = useSensorSeries(sensorId);

  const historyPoints: Point[] = (history.data?.points ?? [])
    // count 0 is a bucket with no readings — a genuine gap. Plotting its null
    // avg as 0 would draw a reading that never happened.
    .filter((p) => p.count > 0 && p.avg !== null)
    .map((p) => ({
      t: new Date(p.bucket).getTime(),
      value: p.avg as number,
      label: new Date(p.bucket).toLocaleTimeString(),
    }));

  // The stream is one feed for the whole tenant and arrives newest-first;
  // this channel wants only its own sensor.
  const livePoints: Point[] = sensorId
    ? events
        .filter(
          (e) => String(e.sensorId) === String(sensorId) && e.value !== null,
        )
        .map((e) => ({
          t: new Date(e.ts).getTime(),
          value: e.value as number,
          label: new Date(e.ts).toLocaleTimeString(),
        }))
    : [];

  // Merged on timestamp: a live event can also be inside the last history
  // bucket, and plotting both would double the tail.
  const byTime = new Map<number, Point>();
  for (const p of [...historyPoints, ...livePoints]) byTime.set(p.t, p);
  const points: Point[] = [...byTime.values()].sort((a, b) => a.t - b.t);

  if (history.isLoading && points.length === 0) {
    return <span>Loading…</span>;
  }

  if (points.length === 0) {
    return <span>No Data Available</span>;
  }

  const [min, max] = yDomain(points, thresholdValue, triggerValue);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={points} margin={{ top: 12, right: 16, bottom: 4, left: 4 }}>
        <CartesianGrid stroke={GRID} strokeWidth={1} />
        <XAxis
          dataKey="label"
          tick={{ fill: AXIS_INK, fontSize: 11 }}
          stroke={GRID}
          minTickGap={28}
        />
        <YAxis
          domain={[min, max]}
          tick={{ fill: AXIS_INK, fontSize: 11 }}
          stroke={GRID}
          width={48}
          label={{
            value: `${sensorName} Data`,
            angle: -90,
            position: "insideLeft",
            style: { fill: AXIS_INK, fontSize: 11 },
          }}
        />
        <Tooltip
          formatter={(v) => [`${v ?? "—"} ${unit}`, sensorName]}
          labelStyle={{ color: "rgba(0,0,0,0.7)", fontSize: 12 }}
          contentStyle={{ fontSize: 12, borderRadius: 4 }}
        />

        {thresholdValue !== null && (
          <ReferenceLine
            y={thresholdValue}
            stroke={THRESHOLD_COLOR}
            strokeWidth={1.5}
            label={{
              value: `Threshold (${thresholdValue} ${unit})`,
              position: "insideTopRight",
              style: { fill: THRESHOLD_COLOR, fontSize: 12 },
            }}
          />
        )}
        {triggerValue !== null && (
          <ReferenceLine
            y={triggerValue}
            stroke={TRIGGER_COLOR}
            strokeWidth={1.5}
            label={{
              value: `Trigger (${triggerValue} ${unit})`,
              position: "insideBottomRight",
              style: { fill: TRIGGER_COLOR, fontSize: 12 },
            }}
          />
        )}

        <Line
          type="linear"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          dot={{ r: 3, fill: color, strokeWidth: 0 }}
          activeDot={{ r: 5 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
