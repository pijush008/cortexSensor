"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ShieldOff } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { useMe } from "@/hooks/use-me";
import { BrandLoader } from "@/components/ui/brand-loader";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { fallbackRouteFor, guardDecision } from "@/lib/rbac";

/**
 * Route-level authorization guard for the authenticated app shell.
 *
 * Checks the permissions the SERVER reports for this session rather than
 * inferring them from a role name held in localStorage. The previous version
 * used a hardcoded role → routes map, which drifted from the server's model as
 * soon as granular permissions landed and redirected an organization admin
 * away from a page their permissions allowed.
 *
 * While entitlements are loading the children render. Blanking the page on
 * every navigation would be a worse experience than briefly showing a route
 * the API will refuse anyway — and the API is the actual enforcement point.
 *
 * A session that can reach NOWHERE is shown a message rather than redirected.
 * See guardDecision: sending such a session to the fallback route redirected it
 * to a page it had just been refused, which rendered an empty application for
 * as long as the user cared to look at it.
 */
export function RoleGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, logout } = useAuthStore();
  const me = useMe();

  const session = me.data
    ? { isPlatformAdmin: me.data.isPlatformAdmin, permissions: me.data.permissions }
    : null;

  const decision =
    isAuthenticated && me.isSuccess ? guardDecision(session, pathname) : "allow";

  const fallback = fallbackRouteFor(session);

  useEffect(() => {
    if (decision === "redirect" && fallback) router.replace(fallback);
  }, [decision, fallback, router]);

  // Entitlements still arriving: show the loader rather than the page.
  //
  // This used to render the children instead, on the reasoning that the API is
  // the real enforcement point and blanking the page on every navigation would
  // be worse. But the entitlements are fetched once and then cached, so the
  // wait is paid on first load only — where a loader is already showing — while
  // rendering children meant a session was left sitting on a screen it may not
  // have for as long as /me took. Measured at up to 1.5 seconds on a page a
  // viewer is not allowed to open, which is not a flicker; it is the page.
  if (isAuthenticated && me.isLoading) {
    return <BrandLoader label="Checking access" />;
  }

  if (decision === "redirect") return null;

  if (decision === "blocked") {
    return (
      <EmptyState
        icon={ShieldOff}
        title="Your account doesn't have access to anything yet"
        description="You're signed in, but your account isn't part of an organization, so there's nothing to show. Ask an administrator to add you to one."
        action={
          <Button variant="outline" onClick={() => logout()}>
            Sign out
          </Button>
        }
      />
    );
  }

  return <>{children}</>;
}
