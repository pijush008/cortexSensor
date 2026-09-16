import type { UserRole } from "@/types";

/**
 * Route access.
 *
 * This used to be a hardcoded role → routes map, which duplicated the server's
 * permission model and drifted from it the moment granular permissions landed:
 * an organization admin who genuinely holds AUDIT_VIEW was still redirected
 * away from /audit by this file.
 *
 * It is now a route → required-permission map, checked against the permission
 * list the SERVER reports for the session (GET /api/v1/me). A route → permission
 * mapping is stable — it changes only when a route changes — whereas a
 * role → routes mapping has to be revisited every time a grant moves.
 *
 * This remains presentation only. Every endpoint enforces its own permission
 * independently; hiding a link the user cannot use is a courtesy, not security.
 */

/** Permission required to see a route. Prefix matched, longest first. */
export const ROUTE_PERMISSION: Record<string, string> = {
  "/dashboard": "PROJECT_VIEW",
  "/alerts": "ALERT_VIEW",
  "/gateways": "GATEWAY_VIEW",
  "/devices": "DEVICE_VIEW",
  "/sensors": "SENSOR_VIEW",
  // The directory only. A viewer holds PROJECT_BROWSE and not PROJECT_VIEW, so
  // this opens for them while /dashboard does not.
  "/projects": "PROJECT_BROWSE",
  "/structures": "STRUCTURE_VIEW",
  "/reports": "REPORT_VIEW",
  "/inspections": "INSPECTION_VIEW",
  "/exports": "REPORT_EXPORT",
  "/data-download": "REPORT_EXPORT",
  "/users": "USER_VIEW",
  "/audit": "AUDIT_VIEW",
  "/subscription": "BILLING_VIEW",
};

/** Always reachable by any authenticated user. */
const ALWAYS_ALLOWED = ["/profile", "/settings"];

export interface SessionEntitlements {
  isPlatformAdmin: boolean;
  permissions: string[];
}

export function canAccessRoute(
  session: SessionEntitlements | null | undefined,
  pathname: string,
): boolean {
  if (!session) return false;

  const path = pathname.replace(/\/+$/, "") || "/";
  if (ALWAYS_ALLOWED.some((p) => path === p || path.startsWith(`${p}/`))) {
    return true;
  }

  // A platform operator administers the SaaS and is not scoped to a tenant's
  // permission set, so the route map does not apply to them.
  if (session.isPlatformAdmin) return true;

  // Longest prefix wins, so /devices/5/channels resolves via /devices.
  const match = Object.keys(ROUTE_PERMISSION)
    .filter((route) => path === route || path.startsWith(`${route}/`))
    .sort((a, b) => b.length - a.length)[0];

  // An unmapped route is allowed: the backend still guards it, and silently
  // hiding a page nobody remembered to map is worse than showing it and
  // letting the API refuse.
  if (!match) return true;

  return session.permissions.includes(ROUTE_PERMISSION[match]);
}

/**
 * Where the guard sends someone who may not see the page they asked for.
 *
 * Ordered by preference, and RESOLVED against the session rather than fixed:
 * different roles have different first reachable pages, and a constant
 * "/dashboard" is wrong for anyone who cannot open it. Ends at /profile, which
 * is always allowed, so the list cannot come up empty for a real session.
 */
const FALLBACK_ORDER = ["/dashboard", "/projects", "/profile"];

export function fallbackRouteFor(
  session: SessionEntitlements | null | undefined,
): string | null {
  return FALLBACK_ORDER.find((r) => canAccessRoute(session, r)) ?? null;
}

/**
 * What the route guard should do about this navigation.
 *
 * Returns a decision rather than performing one so the rule is testable on its
 * own, and so the component cannot re-derive it slightly differently.
 *
 * The "blocked" case is the one that caused a bug worth naming. The guard used
 * to answer every denial by redirecting to GUARD_FALLBACK and rendering null —
 * but the fallback is an ordinary mapped route (/dashboard needs PROJECT_VIEW),
 * so a session holding NO permissions was denied there too. It redirected to
 * the page it had just refused, on every render, and rendered nothing in the
 * meantime: a permanently blank application with no error and no way out.
 *
 * A self-service Google sign-in produces exactly that session — a real user,
 * authenticated, with no organization membership and therefore no permissions.
 * Such a session must be told what is wrong, not bounced in a circle.
 */
export type GuardDecision = "allow" | "redirect" | "blocked";

export function guardDecision(
  session: SessionEntitlements | null | undefined,
  pathname: string,
): GuardDecision {
  if (canAccessRoute(session, pathname)) return "allow";
  // Only redirect somewhere the session can actually land.
  return fallbackRouteFor(session) ? "redirect" : "blocked";
}

/** Retained for the sidebar until it is driven by permissions too. */
export type { UserRole };
