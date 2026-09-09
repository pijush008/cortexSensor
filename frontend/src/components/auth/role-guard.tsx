"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { useMe } from "@/hooks/use-me";
import { canAccessRoute } from "@/lib/rbac";

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
 */
export function RoleGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated } = useAuthStore();
  const me = useMe();

  const session = me.data
    ? { isPlatformAdmin: me.data.isPlatformAdmin, permissions: me.data.permissions }
    : null;

  const denied =
    isAuthenticated && me.isSuccess && !canAccessRoute(session, pathname);

  useEffect(() => {
    if (denied) router.replace("/dashboard");
  }, [denied, router]);

  if (denied) return null;

  return <>{children}</>;
}
