"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface SeriesPoint {
  bucket: string;
  avg: number | null;
  min: number | null;
  max: number | null;
  /** Readings behind this bucket. 0 is a real gap, not a zero reading. */
  count: number;
  flagged: number;
}

export interface SeriesResult {
  sensorId: number;
  unit: string | null;
  from: string;
  to: string;
  bucket: string;
  bucketSeconds: number;
  points: SeriesPoint[];
  timescale: boolean;
}

/**
 * Recent readings for one sensor, so a chart is populated on arrival.
 *
 * The live SSE feed only carries what happens WHILE the page is open, which
 * leaves every chart blank on load until the next reading lands — and blank
 * forever for a platform operator, whose account the tenant-scoped stream
 * refuses. This history read is available to both: requireTenant admits a
 * platform admin, and tenantScope() returns an unrestricted filter for them.
 *
 * The graph therefore draws history first and appends live events on top,
 * rather than depending on the stream alone.
 */
export function useSensorSeries(
  sensorId: string | null,
  { hours = 24, enabled = true }: { hours?: number; enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: ["sensor-series", sensorId, hours],
    queryFn: async () => {
      const from = new Date(Date.now() - hours * 3600_000).toISOString();
      const { data } = await api.get<{ data: SeriesResult }>(
        "/measurements/series",
        { params: { sensorId, from } },
      );
      return data.data;
    },
    enabled: Boolean(sensorId) && enabled,
    // Readings arrive continuously; a stale window here would leave the chart
    // showing a frozen history beside a live tail.
    staleTime: 30_000,
  });
}
