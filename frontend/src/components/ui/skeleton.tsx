import { cn } from "@/lib/utils";

/**
 * Skeleton primitives.
 *
 * Built on the `.skel` shimmer utility already defined in globals.css, so the
 * shimmer timing and the `prefers-reduced-motion` opt-out are shared with the
 * rest of the app rather than redefined here.
 *
 * Skeletons are decorative: they convey "content is coming", which is already
 * announced by the `role="status"` wrapper their container provides. Each shape
 * is therefore `aria-hidden` so screen readers get one announcement instead of
 * a burst of meaningless nodes.
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn("skel rounded-md", className)}
      {...props}
    />
  );
}

/** A block of text lines. The last line is short, the way real text wraps. */
export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn("h-3", i === lines - 1 ? "w-2/5" : "w-full")}
        />
      ))}
    </div>
  );
}

/**
 * Mirrors the real <StatCard /> layout — label, value, footer rule — so the
 * page doesn't visibly reflow when data arrives.
 */
export function SkeletonStatCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200/90 bg-white p-5",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Skeleton className="h-2.5 w-24" />
          <Skeleton className="mt-3 h-7 w-16" />
        </div>
        <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
      </div>
      <div className="mt-3 flex items-end justify-between gap-3 border-t border-slate-100 pt-3">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-6 w-20 shrink-0" />
      </div>
    </div>
  );
}

/** Matches the <Card> + CardHeader + CardContent rhythm. */
export function SkeletonCard({
  className,
  bodyHeight = "h-40",
}: {
  className?: string;
  bodyHeight?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200/90 bg-white",
        className,
      )}
    >
      <div className="px-5 pb-0 pt-5">
        <Skeleton className="h-3.5 w-40" />
        <Skeleton className="mt-2 h-2.5 w-56" />
      </div>
      <div className="px-5 pb-5 pt-4">
        <Skeleton className={cn("w-full", bodyHeight)} />
      </div>
    </div>
  );
}

/**
 * Table placeholder. `columns` drives the cell widths so the skeleton keeps
 * the same column rhythm as the table it stands in for.
 */
export function SkeletonTable({
  rows = 6,
  columns = 5,
  className,
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-slate-200/90 bg-white",
        className,
      )}
    >
      <div className="flex items-center gap-4 border-b border-slate-200 bg-slate-50/60 px-5 py-3">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton
            key={i}
            className={cn("h-2.5", i === 0 ? "w-32" : "flex-1")}
          />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="flex items-center gap-4 border-b border-slate-100 px-5 py-4 last:border-b-0"
        >
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton
              key={c}
              className={cn("h-3", c === 0 ? "w-32" : "flex-1")}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
