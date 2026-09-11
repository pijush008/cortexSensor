import { Suspense } from "react";

import { AuthGate } from "@/components/auth/auth-gate";
import { RoleGuard } from "@/components/auth/role-guard";
import { AppShell } from "@/components/layout/app-shell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <RoleGuard>
        {/* One boundary for every page under (app). Stat tiles link to filtered
            lists (/projects?status=start), so the list pages read the query
            string via useSearchParams — which the App Router requires to sit
            under Suspense, as (auth)/reset-password already does locally.
            Putting it here saves repeating the boundary on each page. */}
        <AppShell>
          <Suspense fallback={null}>{children}</Suspense>
        </AppShell>
      </RoleGuard>
    </AuthGate>
  );
}