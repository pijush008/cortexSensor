import { BrandLoader } from "@/components/ui/brand-loader";

/**
 * Root-level loading UI.
 *
 * Covers navigation into any route that does not provide its own — the public
 * pages and the sign-in screen. The authenticated app keeps its skeleton
 * loading state in (app)/loading.tsx, which roughs in the layout being
 * navigated to and is a better fit there than a full-screen mark.
 */
export default function RootLoading() {
  return <BrandLoader />;
}
