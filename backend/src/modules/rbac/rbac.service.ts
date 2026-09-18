import { MembershipStatus, Prisma, RoleKey, TenantStatus } from "@prisma/client";
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
 * Everything a request needs to know about its caller, in ONE query.
 *
 * The database is remote, so every query is a network round trip and
 * sequential queries add up. Identifying the caller used to take five of
 * them, spread over three middlewares that each looked the user up afresh:
 * from a developer's machine that was several seconds per API call before the
 * route had done anything. The memberships ride along with the user row here,
 * and `authContextFromUser` turns the result into a context without touching
 * the database again.
 */
export const SESSION_USER_SELECT = {
  id: true,
  userType: true,
  parentId: true,
  firstName: true,
  lastName: true,
  emailId: true,
  status: true,
  isDelete: true,
  isPlatformAdmin: true,
  memberships: {
    select: {
      id: true,
      status: true,
      tenantId: true,
      role: { select: { key: true } },
      tenant: { select: { status: true } },
    },
    orderBy: { id: "asc" as const },
  },
} satisfies Prisma.UserSelect;

export type SessionUser = Prisma.UserGetPayload<{ select: typeof SESSION_USER_SELECT }>;

export async function loadSessionUser(userId: number): Promise<SessionUser | null> {
  return prisma.user.findUnique({ where: { id: userId }, select: SESSION_USER_SELECT });
}

/**
 * Builds the authorization context for a user.
 *
 * A suspended or closed tenant yields no tenant context, so a lapsed customer
 * loses access to tenant data without any route needing to check subscription
 * state itself.
 */
export async function resolveAuthContext(userId: number): Promise<AuthContext> {
  return authContextFromUser(await loadSessionUser(userId), userId);
}

/**
 * The context for an already-loaded session row. Pure: the one place the
 * membership rules live, whether the row came from `loadSessionUser` or from
 * the per-request cache the middlewares share.
 */
export function authContextFromUser(user: SessionUser | null, userId: number): AuthContext {
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

  // The first ACTIVE membership in an ACTIVE organization, in id order — the
  // same row the previous query selected.
  const membership = user.memberships.find(
    (m) => m.status === MembershipStatus.active && m.tenant.status === TenantStatus.active,
  );

  if (!membership) {
    // No ACTIVE membership. Two very different situations share this branch and
    // must not share an answer.
    //
    // A lapsed customer — their membership exists but the tenant is suspended
    // or closed — keeps no permissions, exactly as before. Granting them the
    // directory would turn "your subscription ended" into "you may now browse
    // every other customer on the platform", which is the opposite of intended.
    const belongsToSomeOrganization = user.memberships.length > 0;
    if (belongsToSomeOrganization) {
      return {
        userId,
        isPlatformAdmin: false,
        tenantId: null,
        role: null,
        permissions: new Set(),
      };
    }

    // Genuinely in no organization at all — a self-service Google sign-up, or
    // an account whose membership has not been created yet. Such a session gets
    // exactly one thing: the project directory. A deliberate narrow grant
    // rather than an empty set, because an empty set leaves a real
    // authenticated user with no page they may open.
    //
    // PROJECT_BROWSE alone. It does NOT imply PROJECT_VIEW, so the directory
    // opens and a project's measurements do not.
    return {
      userId,
      isPlatformAdmin: false,
      tenantId: null,
      role: null,
      permissions: new Set<PermissionKey>(["PROJECT_BROWSE"]),
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
