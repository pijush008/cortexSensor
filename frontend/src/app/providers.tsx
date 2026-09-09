"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { useState } from "react";

/**
 * Retry policy: a 4xx is a verdict, not a hiccup. Retrying an expired session
 * (401), a role denial (403) or a missing record (404) can't change the answer,
 * and it delays the error state the user needs to see by several seconds.
 * Transient failures — network drops, 5xx, 429 — are worth two more attempts.
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (error instanceof AxiosError) {
    const status = error.response?.status;
    if (status && status >= 400 && status < 500 && status !== 429) return false;
  }
  return true;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30000,
            retry: shouldRetry,
            // Telemetry moves constantly; re-checking on window focus keeps a
            // dashboard left open on a control-room screen from going stale.
            refetchOnWindowFocus: true,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
