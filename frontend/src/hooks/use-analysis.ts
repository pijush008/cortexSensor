"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AnalysisRun, BaselineRecord } from "@/types";

/**
 * Spectral analysis.
 *
 * Analysis is queued, not computed in the request, so the client requests a run
 * and then polls it. Polling stops as soon as the run reaches a terminal state,
 * so an open tab does not keep hitting the API forever.
 */

export function useAnalysisRuns(sensorId?: number) {
  return useQuery({
    queryKey: ["analysis-runs", sensorId ?? null],
    queryFn: async () => {
      const { data } = await api.get<{ data: AnalysisRun[] }>("/analysis/runs", {
        params: sensorId ? { sensorId } : undefined,
      });
      return data.data;
    },
  });
}

export function useAnalysisRun(id: number | null) {
  return useQuery({
    queryKey: ["analysis-run", id],
    queryFn: async () => {
      const { data } = await api.get<{ data: AnalysisRun }>(`/analysis/runs/${id}`);
      return data.data;
    },
    enabled: id !== null,
    refetchInterval: (query) => {
      const run = query.state.data as AnalysisRun | undefined;
      if (!run) return 2000;
      // Terminal states need no further polling.
      return run.status === "succeeded" || run.status === "failed" ? false : 2000;
    },
  });
}

export function useBaselines(sensorId?: number) {
  return useQuery({
    queryKey: ["baselines", sensorId ?? null],
    queryFn: async () => {
      const { data } = await api.get<{ data: BaselineRecord[] }>(
        "/analysis/baselines",
        { params: sensorId ? { sensorId } : undefined },
      );
      return data.data;
    },
  });
}

export function useRequestSpectrum() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Record<string, unknown>) => {
      const { data } = await api.post<{ data: AnalysisRun; queued: boolean; message: string }>(
        "/analysis/spectrum",
        input,
      );
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["analysis-runs"] });
    },
  });
}

export function useCaptureBaseline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ runId, label }: { runId: number; label: string }) => {
      const { data } = await api.post<{ data: BaselineRecord }>(
        `/analysis/runs/${runId}/baseline`,
        { label },
      );
      return data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["baselines"] });
    },
  });
}
