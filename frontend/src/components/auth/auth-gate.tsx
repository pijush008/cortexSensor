"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { BrandLoader } from "@/components/ui/brand-loader";

/**
 * Reachable without a session.
 *
 * /reset-password belongs here for an obvious reason that is easy to miss: the
 * person following an emailed reset link is BY DEFINITION signed out. Left off
 * this list, the gate bounced them to /login and the link could never be used.
 * /register is here for the same reason — nobody signing up has a session yet.
 */
const PUBLIC_PATHS = ["/login", "/reset-password", "/register"];

/**
 * Pages a signed-in user is bounced AWAY from, back into the app.
 *
 * A separate list from PUBLIC_PATHS, because the two answer different
 * questions: one is "may you be here without a session", the other is "is this
 * page pointless once you have one".
 *
 * They used to be the same list, which was fine while it held only /login.
 * Adding /register and /reset-password to make them reachable signed-out
 * silently gave them the redirect too, so a signed-in user could not open the
 * registration page at all and — worse — could never use an emailed password
 * reset link, since anyone still signed in on another tab was thrown to the
 * dashboard before the form rendered.
 *
 * Only /login belongs here. Registering an organization while signed in is
 * legitimate (a platform operator walking a customer through it), and changing
 * your password while signed in is the normal case, not the exception.
 */
const SIGNED_IN_ELSEWHERE = ["/login"];

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading, initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated && !PUBLIC_PATHS.includes(pathname)) {
      router.replace("/login");
    }
    if (isAuthenticated && SIGNED_IN_ELSEWHERE.includes(pathname)) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, isLoading, pathname, router]);

  // The genuine wait on entering the app: the session is being restored and
  // entitlements fetched. Previously a placeholder "SH" tile stood in for the
  // company mark here — the one screen a returning user sees before anything
  // else, showing initials rather than the brand.
  if (isLoading) {
    return <BrandLoader label="Restoring session" />;
  }

  if (!isAuthenticated && !PUBLIC_PATHS.includes(pathname)) {
    return null;
  }

  return <>{children}</>;
}