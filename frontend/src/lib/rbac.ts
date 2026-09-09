import type { UserRole } from "@/types";

/** Route-level role access map. Mirrors the sidebar menu.
 *  These are UI guards — the backend remains the enforcement point. */
export const ROLE_ROUTE_ACCESS: Record<UserRole, string[]> = {
  superadmin: ["*"],
  admin: [
    "/dashboard",
    "/analytics",
    "/alerts",
    "/gateways",
    "/devices",
    "/sensors",
    "/mqtt",
    "/projects",
    "/structures",
    "/reports",
    "/data-download",
    "/users",
    "/subscription",
    "/profile",
    "/settings",
  ],
  contractor: [
    "/dashboard",
    "/alerts",
    "/gateways",
    "/mqtt",
    "/projects",
    "/structures",
    "/reports",
    "/profile",
    "/settings",
  ],
  authority: [
    "/dashboard",
    "/alerts",
    "/reports",
    "/profile",
    "/settings",
  ],
};

/** Checks whether a protected route is allowed for the given role.
 *  Dynamic segments (e.g. /devices/5/channels) are matched by prefix. */
export function canAccessRoute(
  role: UserRole | null | undefined,
  pathname: string,
): boolean {
  if (!role) return false;
  const allowed = ROLE_ROUTE_ACCESS[role] || [];
  if (!allowed.length) return false;
  if (allowed[0] === "*") return true;

  // normalize: drop trailing slash
  const path = pathname.replace(/\/+$/, "") || "/";

  return allowed.some((route) => {
    if (route === path) return true;
    // allow sub-routes under a listed path (dynamic params)
    if (path.startsWith(route + "/")) return true;
    return false;
  });
}