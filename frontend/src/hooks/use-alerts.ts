"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AlertDetail, AlertRecord, AlertSummary } from "@/types";

export function useAlerts(filters: { activeOnly?: boolean; severity?: string } = {}) {
  return useQuery({
    queryKey: ["alerts", filters],
    queryFn: async () => {
      const { data } = await api.get<{ data: AlertRecord[] }>("/alerts", {
        params: {
          activeOnly: filters.activeOnly ? "true" : undefined,
          severity: filters.severity || undefined,
        },
      });
      return data.data;
    },
    // Alerts are the reason someone leaves this page open.
    refetchInterval: 30_000,
  });
}

export function useAlertSummary() {
  return useQuery({
    queryKey: ["alert-summary"],
    queryFn: async () => {
      const { data } = await api.get<{ data: AlertSummary }>("/alerts/summary");
      return data.data;
    },
    refetchInterval: 30_000,
  });
}

export function useAlert(id: number | null) {
  return useQuery({
    queryKey: ["alert", id],
    queryFn: async () => {
      const { data } = await api.get<{ data: AlertDetail }>(`/alerts/${id}`);
      return data.data;
    },
    enabled: id !== null,
  });
}

function useAlertAction(action: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, note }: { id: number; note?: string }) => {
      const { data } = await api.post(`/alerts/${id}/${action}`, note ? { note } : {});
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["alerts"] });
      void qc.invalidateQueries({ queryKey: ["alert"] });
      void qc.invalidateQueries({ queryKey: ["alert-summary"] });
    },
  });
}

export const useAcknowledgeAlert = () => useAlertAction("acknowledge");
export const useInvestigateAlert = () => useAlertAction("investigate");
export const useResolveAlert = () => useAlertAction("resolve");
