"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { canAccessRoute } from "@/lib/rbac";

/**
 * Route-level authorization guard for the authenticated app shell.
 * Redirects users to /dashboard when they navigate directly to a route
 * that their role isn't allowed to use (e.g. contractor → /users).
 */
export function RoleGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { userType, isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!canAccessRoute(userType, pathname)) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, userType, pathname, router]);

  if (isAuthenticated && !canAccessRoute(userType, pathname)) {
    return null;
  }

  return <>{children}</>;
}