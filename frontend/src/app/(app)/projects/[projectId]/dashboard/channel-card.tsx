"use client";

import { ChannelGraph } from "./channel-graph";
import { useSensorSeries } from "@/hooks/use-sensor-series";
import type { LiveMeasurement } from "@/hooks/use-live-stream";
import styles from "./legacy.module.css";

/**
 * One CH card: the channel chip, its trace, and the three value rows.
 *
 * Its own component so it can hold hooks. The cards are rendered from a list,
 * and the reading shown has to come from the same two sources the graph uses —
 * stored history and the live stream — which cannot be looked up inside a map
 * in the parent.
 */
export function ChannelCard({
  index,
  channelNumber,
  sensorId,
  sensorName,
  unit,
  thresholdValue,
  triggerValue,
  events,
}: {
  index: number;
  channelNumber: string;
  sensorId: string | null;
  sensorName: string;
  unit: string;
  thresholdValue: number | null;
  triggerValue: number | null;
  events: LiveMeasurement[];
}) {
  // Shares a query key with the graph, so React Query serves both from one
  // request rather than fetching the same window twice.
  const history = useSensorSeries(sensorId);

  // Newest live reading for this sensor, else the newest stored bucket. A
  // platform operator receives no live events at all, so the fallback is what
  // puts a number on their screen.
  const live = sensorId
    ? events.find(
        (e) => String(e.sensorId) === String(sensorId) && e.value !== null,
      )
    : undefined;

  const lastBucket = [...(history.data?.points ?? [])]
    .filter((p) => p.count > 0 && p.avg !== null)
    .pop();

  const latest = live?.value ?? lastBucket?.avg ?? null;

  return (
    <div className={styles.channelCard}>
      <span className={styles.chChip}>CH {channelNumber}</span>
      <div className={styles.graph}>
        <ChannelGraph
          index={index}
          sensorId={sensorId}
          sensorName={sensorName}
          unit={unit}
          thresholdValue={thresholdValue}
          triggerValue={triggerValue}
          events={events}
        />
      </div>
      <div className={styles.valueRows}>
        <div className={styles.valueRow}>
          <span>Sensor Value</span>
          {/* An em dash, not 0: no reading yet is not a reading of zero. */}
          <span>{latest === null ? `— ${unit}` : `${round2(latest)} ${unit}`}</span>
        </div>
        <div className={styles.valueRow}>
          <span>Threshold Value</span>
          <span>
            {thresholdValue ?? "0"} {unit}
          </span>
        </div>
        <div className={styles.valueRow}>
          <span>Triggered Value</span>
          <span>
            {triggerValue ?? "0"} {unit}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Bucket averages carry long decimal tails; two places is what a gauge reads. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
