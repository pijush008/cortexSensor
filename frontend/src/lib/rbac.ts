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
  "/analytics": "SHM_VIEW",
  "/alerts": "ALERT_VIEW",
  "/gateways": "GATEWAY_VIEW",
  "/devices": "DEVICE_VIEW",
  "/sensors": "SENSOR_VIEW",
  "/mqtt": "SHM_VIEW",
  "/projects": "PROJECT_VIEW",
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

/** Retained for the sidebar until it is driven by permissions too. */
export type { UserRole };
