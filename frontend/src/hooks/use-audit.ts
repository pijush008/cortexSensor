"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AuditPage } from "@/types";

/**
 * Audit log.
 *
 * Cursor paginated rather than offset: the log grows while you read it, and an
 * offset page would silently repeat or skip rows as new entries arrive.
 */
export function useAuditLog(filters: { entity?: string; action?: string } = {}) {
  return useInfiniteQuery({
    queryKey: ["audit", filters],
    initialPageParam: undefined as number | undefined,
    queryFn: async ({ pageParam }) => {
      const { data } = await api.get<AuditPage>("/audit", {
        params: {
          entity: filters.entity || undefined,
          action: filters.action || undefined,
          cursor: pageParam,
          limit: 50,
        },
      });
      return data;
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useAuditFacets() {
  return useQuery({
    queryKey: ["audit-facets"],
    queryFn: async () => {
      const { data } = await api.get<{ data: { entities: string[]; actions: string[] } }>(
        "/audit/facets",
      );
      return data.data;
    },
  });
}
