"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { GatewayListResponse } from "@/types";

/**
 * Edge gateway fleet.
 *
 * Refetched on an interval because connectivity is derived from the last
 * heartbeat: without a periodic re-read, a gateway that stopped reporting would
 * keep rendering as "online" for as long as the page stayed open.
 */
export function useGateways() {
  return useQuery({
    queryKey: ["gateways"],
    queryFn: async () => {
      const { data } = await api.get<GatewayListResponse>("/gateways");
      return data;
    },
    refetchInterval: 30_000,
  });
}

export function useCreateGateway() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Record<string, unknown>) => {
      const { data } = await api.post("/gateways", input);
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["gateways"] });
    },
  });
}
