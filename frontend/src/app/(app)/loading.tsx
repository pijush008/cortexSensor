import {
  Skeleton,
  SkeletonStatCard,
  SkeletonCard,
} from "@/components/ui/skeleton";

/**
 * Route-level loading UI for the authenticated app.
 *
 * Next.js shows this during navigation while the next page's server work
 * resolves. It mirrors the shared page rhythm — header, stat row, two panels —
 * rather than a centred spinner, so the layout the user is moving to is already
 * roughed in when it appears and doesn't jump when the real content lands.
 */
export default function AppLoading() {
  return (
    <div role="status" aria-busy="true" className="space-y-6">
      <span className="sr-only">Loading page</span>

      {/* PageHeader */}
      <div>
        <Skeleton className="h-2.5 w-36" />
        <Skeleton className="mt-3 h-7 w-72 max-w-full" />
        <Skeleton className="mt-2.5 h-3.5 w-96 max-w-full" />
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>

      {/* Content panels */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SkeletonCard className="lg:col-span-2" bodyHeight="h-56" />
        <SkeletonCard bodyHeight="h-56" />
      </div>
    </div>
  );
}
