"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-shm-navy-800 text-lg font-bold text-white">
        SH
      </div>
      <h1 className="text-2xl font-semibold text-foreground">
        Something went wrong
      </h1>
      <p className="max-w-md text-sm text-slate-400">
        An unexpected error occurred while rendering this page. Please try again
        or contact support if the problem persists.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-lg bg-shm-navy-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-shm-navy-600"
      >
        Try again
      </button>
    </div>
  );
}