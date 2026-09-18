"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { GatewayTelemetry, IssuedIngestToken } from "@/types";

/**
 * What one gateway's nodes are reporting.
 *
 * Polled, and ALSO overlaid with the live stream by the page that uses it:
 * the poll is what puts a value on screen for a channel that has not moved
 * since the page opened, and for a platform operator, whom the tenant stream
 * refuses; the stream is what makes a new reading appear the second it lands.
 */
export function useGatewayTelemetry(gatewayId: number | null) {
  return useQuery({
    queryKey: ["gateway-telemetry", gatewayId],
    queryFn: async () => {
      const { data } = await api.get<{ data: GatewayTelemetry }>(
        `/gateways/${gatewayId}/telemetry`,
      );
      return data.data;
    },
    enabled: gatewayId !== null && Number.isFinite(gatewayId),
    refetchInterval: 30_000,
  });
}

/**
 * Issues (or re-issues, which revokes) the URL the gateway is configured to
 * push to. The token comes back once and is never retrievable again, so the
 * page that calls this has to show it immediately.
 */
export function useIssueIngestToken(gatewayId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{ data: IssuedIngestToken }>(
        `/gateways/${gatewayId}/ingest-token`,
      );
      return data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["gateways"] });
      void qc.invalidateQueries({ queryKey: ["gateway-telemetry", gatewayId] });
    },
  });
}
