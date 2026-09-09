import { MembershipStatus, RoleKey, TenantStatus } from "@prisma/client";
import prisma from "../../config/prisma";
import { ROLE_GRANTS, type PermissionKey } from "./permission.catalog";

/**
 * Resolution of "who is this request acting as", derived entirely from the
 * authenticated session.
 *
 * The tenant is NEVER taken from the request body, a query parameter or a
 * header (§17). It is looked up from the user's membership. A client that sends
 * a tenant id is ignored, which is what makes cross-tenant access structurally
 * impossible rather than merely unlikely.
 */

export interface AuthContext {
  userId: number;
  /** Platform operator. Not scoped to a tenant; see §19. */
  isPlatformAdmin: boolean;
  /** Null for a platform operator, or a user with no active membership. */
  tenantId: number | null;
  role: RoleKey | null;
  permissions: Set<PermissionKey>;
}

/** In-memory grant lookup, avoiding a join on every request. */
function grantsFor(role: RoleKey): Set<PermissionKey> {
  return new Set(ROLE_GRANTS[role] ?? []);
}

/**
 * Builds the authorization context for a user.
 *
 * A suspended or closed tenant yields no tenant context, so a lapsed customer
 * loses access to tenant data without any route needing to check subscription
 * state itself.
 */
export async function resolveAuthContext(userId: number): Promise<AuthContext> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isPlatformAdmin: true },
  });

  if (!user) {
    return {
      userId,
      isPlatformAdmin: false,
      tenantId: null,
      role: null,
      permissions: new Set(),
    };
  }

  if (user.isPlatformAdmin) {
    // A platform operator is intentionally given no tenant and no tenant
    // permissions. Platform authority is expressed by isPlatformAdmin alone,
    // so "runs the platform" never silently becomes "is an admin inside a
    // specific customer's organization".
    return {
      userId,
      isPlatformAdmin: true,
      tenantId: null,
      role: null,
      permissions: new Set(),
    };
  }

  const membership = await prisma.membership.findFirst({
    where: {
      userId,
      status: MembershipStatus.active,
      tenant: { status: TenantStatus.active },
    },
    select: { tenantId: true, role: { select: { key: true } } },
    orderBy: { id: "asc" },
  });

  if (!membership) {
    return {
      userId,
      isPlatformAdmin: false,
      tenantId: null,
      role: null,
      permissions: new Set(),
    };
  }

  return {
    userId,
    isPlatformAdmin: false,
    tenantId: membership.tenantId,
    role: membership.role.key,
    permissions: grantsFor(membership.role.key),
  };
}

/**
 * Whether the context may perform an action.
 *
 * Platform operators are handled by an explicit short-circuit rather than by
 * being granted the whole catalog, so the distinction stays visible in code.
 */
export function can(ctx: AuthContext, permission: PermissionKey): boolean {
  if (ctx.isPlatformAdmin) return true;
  return ctx.permissions.has(permission);
}

/**
 * The Prisma `where` fragment that confines a query to the caller's tenant.
 *
 * Every read or write of a tenant-owned table should spread this. A platform
 * operator gets `{}` (unrestricted). A user with no tenant gets an impossible
 * predicate rather than `{}` — failing closed, so a missing membership can
 * never widen a query to every tenant's rows.
 */
export function tenantScope(ctx: AuthContext): { tenantId?: number | { in: number[] } } {
  if (ctx.isPlatformAdmin) return {};
  if (ctx.tenantId === null) return { tenantId: { in: [] } };
  return { tenantId: ctx.tenantId };
}

/**
 * Assert that a specific row's tenant matches the caller's.
 * Use when a row has already been fetched by id and needs an ownership check.
 */
export function ownsTenantRow(
  ctx: AuthContext,
  row: { tenantId: number | null } | null,
): boolean {
  if (!row) return false;
  if (ctx.isPlatformAdmin) return true;
  if (ctx.tenantId === null) return false;
  return row.tenantId === ctx.tenantId;
}
