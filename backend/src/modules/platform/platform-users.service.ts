import prisma from "../../config/prisma";
import { NotFoundError } from "../../utils/AppError";
import { ROLE_GRANTS } from "../rbac/permission.catalog";

/**
 * What a platform operator can learn about one user.
 *
 * Everything here is read back from stored rows. The platform records writes
 * (audit_logs) and session issuance (refresh_tokens); it does not record page
 * views, reads, or navigation, so this deliberately reports "what they have
 * done" and never "what they are looking at". Presenting a richer activity
 * picture than the data supports would be inventing operational evidence about
 * a real person.
 */

/** How a session row reads to a human, derived from its timestamps. */
export type SessionState = "active" | "revoked" | "rotated" | "expired";

function sessionState(row: {
  expiresAt: Date;
  revokedAt: Date | null;
  consumedAt: Date | null;
}, now: Date): SessionState {
  // Order matters: a revoked token is revoked even if it also expired, and a
  // consumed one was rotated by the refresh flow rather than ended by anyone.
  if (row.revokedAt) return "revoked";
  if (row.consumedAt) return "rotated";
  if (row.expiresAt.getTime() <= now.getTime()) return "expired";
  return "active";
}

export interface PlatformUserDetail {
  user: {
    id: number;
    firstName: string;
    lastName: string;
    emailId: string;
    phoneNo: string;
    userType: string;
    isPlatformAdmin: boolean;
    isMailVerified: boolean;
    isUserVerified: boolean;
    isActive: boolean;
    mfaEnabled: boolean;
    createdAt: Date | null;
  };
  memberships: {
    tenantId: number;
    tenantName: string;
    tenantSlug: string;
    tenantStatus: string;
    role: string | null;
    membershipStatus: string;
  }[];
  /** Effective permissions, derived the same way the request path derives them. */
  permissions: string[];
  sessions: {
    id: number;
    familyId: string;
    createdAt: Date;
    expiresAt: Date;
    revokedAt: Date | null;
    consumedAt: Date | null;
    state: SessionState;
  }[];
  activity: {
    items: {
      id: number;
      action: string;
      entity: string;
      entityId: number | null;
      ipAddress: string | null;
      createdAt: Date;
    }[];
    total: number;
  };
}

export async function getUserDetail(
  userId: number,
  options: { activityLimit?: number } = {},
): Promise<PlatformUserDetail> {
  const activityLimit = Math.min(Math.max(options.activityLimit ?? 50, 1), 200);

  const user = await prisma.user.findFirst({
    where: { id: userId, isDelete: "false_" as never },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      emailId: true,
      phoneNo: true,
      userType: true,
      isPlatformAdmin: true,
      isMailVerified: true,
      isUserVerified: true,
      status: true,
      mfaEnabledAt: true,
      createdAt: true,
    },
  });

  if (!user) throw new NotFoundError("User not found");

  const memberships = await prisma.membership.findMany({
    where: { userId },
    select: {
      status: true,
      tenant: { select: { id: true, name: true, slug: true, status: true } },
      role: { select: { key: true } },
    },
    orderBy: { tenantId: "asc" },
  });

  const now = new Date();

  const sessionRows = await prisma.refreshToken.findMany({
    where: { userId },
    select: {
      id: true,
      familyId: true,
      createdAt: true,
      expiresAt: true,
      revokedAt: true,
      consumedAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 25,
  });

  const [activityItems, activityTotal] = await Promise.all([
    prisma.auditLog.findMany({
      where: { userId },
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        ipAddress: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: activityLimit,
    }),
    prisma.auditLog.count({ where: { userId } }),
  ]);

  // A platform operator holds no membership and no granular permissions; their
  // authority is the isPlatformAdmin flag itself (§19), so listing role grants
  // for them would misrepresent how they are authorized.
  const activeRole = memberships.find((m) => m.status === "active")?.role?.key;
  const permissions = user.isPlatformAdmin
    ? []
    : activeRole
      ? [...(ROLE_GRANTS[activeRole as keyof typeof ROLE_GRANTS] ?? [])]
      : [];

  return {
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      emailId: user.emailId,
      phoneNo: user.phoneNo,
      userType: String(user.userType),
      isPlatformAdmin: user.isPlatformAdmin,
      isMailVerified: String(user.isMailVerified) === "true_",
      isUserVerified: String(user.isUserVerified) === "true_",
      isActive: String(user.status) === "true_",
      // Only whether MFA is on. The secret itself is never read here.
      mfaEnabled: user.mfaEnabledAt !== null,
      createdAt: user.createdAt,
    },
    memberships: memberships.map((m) => ({
      tenantId: m.tenant.id,
      tenantName: m.tenant.name,
      tenantSlug: m.tenant.slug,
      tenantStatus: String(m.tenant.status),
      role: m.role?.key ?? null,
      membershipStatus: String(m.status),
    })),
    permissions,
    sessions: sessionRows.map((s) => ({
      ...s,
      state: sessionState(s, now),
    })),
    activity: { items: activityItems, total: activityTotal },
  };
}
