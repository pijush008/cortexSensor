"use client";

import type { ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import { EmptyState } from "./empty-state";
import { ErrorState } from "./error-state";

interface EmptySpec {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

interface QueryStateProps<T> {
  query: UseQueryResult<T>;
  /** Shown while the first fetch is in flight. Should mirror the real layout. */
  skeleton: ReactNode;
  /** Rendered when the fetch succeeded but there is nothing to show. */
  empty?: EmptySpec;
  /**
   * Decides "loaded but nothing here". Defaults to treating an empty array or a
   * null/undefined payload as empty; pass your own for shaped responses.
   */
  isEmpty?: (data: T) => boolean;
  /** Overrides the error headline for this particular surface. */
  errorTitle?: string;
  /** Drops the error panel's own border when it already sits inside a card. */
  bareError?: boolean;
  children: (data: T) => ReactNode;
}

function defaultIsEmpty(data: unknown): boolean {
  if (data == null) return true;
  if (Array.isArray(data)) return data.length === 0;
  return false;
}

/**
 * One place where the four states of an async read are decided:
 * loading → error → empty → content.
 *
 * Before this existed each page branched on `isLoading`/`isError` inline and
 * they drifted apart — some showed a spinner, some showed nothing, and several
 * fell back to hardcoded sample data on failure, which is how a monitoring
 * dashboard ended up able to display numbers that were not measurements.
 * Routing every read through here makes the honest path the default one.
 *
 * Note the order: errors are checked before emptiness, so a failed request can
 * never be mistaken for "no results".
 */
export function QueryState<T>({
  query,
  skeleton,
  empty,
  isEmpty = defaultIsEmpty,
  errorTitle,
  bareError,
  children,
}: QueryStateProps<T>) {
  const { data, isPending, isError, error, refetch, isFetching } = query;

  if (isPending) {
    return (
      <div role="status" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading</span>
        {skeleton}
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorState
        error={error}
        title={errorTitle}
        bare={bareError}
        onRetry={() => void refetch()}
      />
    );
  }

  // `isPending` is false and there is no error, so data is present.
  const value = data as T;

  if (empty && isEmpty(value)) {
    return (
      <EmptyState
        icon={empty.icon}
        title={empty.title}
        description={empty.description}
        action={empty.action}
      />
    );
  }

  return (
    <div
      aria-busy={isFetching || undefined}
      className={isFetching ? "transition-opacity duration-200 opacity-60" : undefined}
    >
      {children(value)}
    </div>
  );
}
