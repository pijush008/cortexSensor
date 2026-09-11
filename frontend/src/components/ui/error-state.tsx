"use client";

import { useState } from "react";
import { AlertTriangle, RefreshCw, ChevronDown } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/utils";
import { describeError } from "@/lib/errors";

interface ErrorStateProps {
  /** The thrown value. Passed through describeError() for consistent wording. */
  error: unknown;
  /** Wire to React Query's refetch. Omit to hide the retry affordance. */
  onRetry?: () => void;
  /** Overrides the derived headline when a surface needs specific wording. */
  title?: string;
  /** Renders inside a card that already has a border — drops its own chrome. */
  bare?: boolean;
  className?: string;
}

/**
 * The failure counterpart to <EmptyState />, and deliberately its visual twin:
 * same height, same centred column, so a card swapping between the two doesn't
 * jump.
 *
 * This exists because "no data" and "we could not load the data" are different
 * facts and a monitoring product must never conflate them — an operator looking
 * at a structural dashboard has to be able to tell an empty fleet from a broken
 * connection.
 */
export function ErrorState({
  error,
  onRetry,
  title,
  bare,
  className,
}: ErrorStateProps) {
  const [showDetail, setShowDetail] = useState(false);
  const described = describeError(error);

  return (
    <div
      role="alert"
      className={cn(
        "flex min-h-48 flex-col items-center justify-center px-6 py-8 text-center",
        !bare && "rounded-xl border border-slate-200 bg-white",
        className,
      )}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full border border-shm-red/20 bg-shm-red/5 text-shm-red">
        <AlertTriangle className="h-5 w-5" strokeWidth={1.75} />
      </span>

      <p className="mt-3 text-sm font-semibold text-slate-800">
        {title ?? described.title}
      </p>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500">
        {described.description}
      </p>

      {(onRetry && described.retryable) || described.detail ? (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {onRetry && described.retryable && (
            <Button size="sm" variant="outline" onClick={onRetry}>
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
              Try again
            </Button>
          )}
          {described.detail && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowDetail((v) => !v)}
              aria-expanded={showDetail}
            >
              Technical details
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 transition-transform duration-200",
                  showDetail && "rotate-180",
                )}
                strokeWidth={2}
              />
            </Button>
          )}
        </div>
      ) : null}

      {showDetail && described.detail && (
        <pre className="mt-3 max-w-full overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left font-mono text-[0.6875rem] leading-relaxed text-slate-600">
          {described.status ? `${described.status} · ` : ""}
          {described.detail}
        </pre>
      )}
    </div>
  );
}

/**
 * Compact inline variant for headers and toolbars, where a full panel would be
 * disproportionate but silently showing nothing would be dishonest.
 */
export function InlineError({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const described = describeError(error);
  return (
    <div
      role="alert"
      className={cn(
        "flex items-center gap-2 rounded-lg border border-shm-red/20 bg-shm-red/5 px-3 py-2",
        className,
      )}
    >
      <AlertTriangle
        className="h-3.5 w-3.5 shrink-0 text-shm-red"
        strokeWidth={2}
      />
      <span className="min-w-0 flex-1 truncate text-xs text-slate-700">
        {described.title}
      </span>
      {onRetry && described.retryable && (
        <button
          onClick={onRetry}
          className="shrink-0 cursor-pointer text-xs font-medium text-shm-navy-600 underline-offset-2 hover:underline"
        >
          Retry
        </button>
      )}
    </div>
  );
}
