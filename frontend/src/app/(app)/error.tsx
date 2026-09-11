"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw, LayoutGrid } from "lucide-react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Error boundary for the authenticated app.
 *
 * The root error.tsx replaces the entire document; this one renders inside
 * AppShell, so a failure in one page leaves the sidebar and navigation intact
 * and the operator can move to another screen instead of losing the session's
 * context. Next.js only surfaces `digest` in production — it's shown when
 * present so a user can quote it to support.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] route error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full border border-shm-red/20 bg-shm-red/5 text-shm-red">
        <AlertTriangle className="h-6 w-6" strokeWidth={1.75} />
      </span>

      <h1 className="mt-4 text-lg font-semibold tracking-tight text-slate-900">
        This page couldn&apos;t be displayed
      </h1>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-slate-500">
        An unexpected error occurred while rendering this screen. Your session is
        still active — retrying or moving to another page should work.
      </p>

      {error.digest && (
        <p className="mt-3 font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-slate-400">
          Reference {error.digest}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <Button onClick={reset}>
          <RefreshCw className="h-4 w-4" strokeWidth={2} />
          Try again
        </Button>
        {/* Button has no asChild/Slot support in this codebase, so the link is
            styled with buttonVariants rather than nested inside a <button>. */}
        <Link
          href="/dashboard"
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          <LayoutGrid className="h-4 w-4" strokeWidth={2} />
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
