"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { IngestionFileList } from "@/types";

/** The FTP drop's ledger. Refetched on an interval: files arrive on their own. */
export function useIngestionFiles(status: string, page = 1) {
  return useQuery({
    queryKey: ["ingestion-files", status, page],
    queryFn: async () => {
      const { data } = await api.get<IngestionFileList>("/ingestion/files", {
        params: { status: status || undefined, page, limit: 50 },
      });
      return data;
    },
    refetchInterval: 30_000,
  });
}
