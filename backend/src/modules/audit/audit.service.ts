import { Prisma } from "@prisma/client";
import prisma from "../../config/prisma";
import { tenantScope, type AuthContext } from "../rbac/rbac.service";

/**
 * Audit log reads (§60).
 *
 * Capture has worked since early on — utils/audit.ts writes on every user,
 * project, device, sensor, alert and analysis mutation. This is the read side,
 * which is what the audit screen was missing.
 *
 * Scoping is the delicate part. AuditLog has no tenantId of its own: it records
 * WHO acted, and a user belongs to a tenant. So the scope is derived from
 * membership — an organization sees the actions of its own members, a platform
 * operator sees everything. Rows with no actor (an unauthenticated registration
 * attempt, say) are visible only to platform operators, because they cannot be
 * attributed to any organization and showing them as an org's own activity
 * would be wrong.
 */

export interface AuditFilters {
  entity?: string;
  action?: string;
  actorId?: number;
  from?: Date;
  to?: Date;
  limit?: number;
  cursor?: number;
}

export interface AuditEntry {
  id: number;
  action: string;
  entity: string;
  entityId: number | null;
  actor: { id: number; name: string; email: string } | null;
  ipAddress: string | null;
  userAgent: string | null;
  newValue: unknown;
  createdAt: string;
}

export async function listAuditLog(
  ctx: AuthContext,
  filters: AuditFilters = {},
): Promise<{ items: AuditEntry[]; nextCursor: number | null }> {
  const where: Prisma.AuditLogWhereInput = {};

  if (!ctx.isPlatformAdmin) {
    if (ctx.tenantId === null) return { items: [], nextCursor: null };
    const members = await prisma.membership.findMany({
      where: { tenantId: ctx.tenantId },
      select: { userId: true },
    });
    const memberIds = members.map((m) => m.userId);
    if (memberIds.length === 0) return { items: [], nextCursor: null };
    where.userId = { in: memberIds };
  }

  if (filters.entity) where.entity = filters.entity;
  if (filters.action) where.action = filters.action;
  if (filters.actorId) where.userId = filters.actorId;
  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    };
  }
  // Cursor pagination on a descending id: stable even as new rows arrive,
  // which offset pagination on a growing log is not.
  if (filters.cursor) where.id = { lt: filters.cursor };

  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);

  const rows = await prisma.auditLog.findMany({
    where,
    include: {
      user: {
        select: { id: true, firstName: true, lastName: true, emailId: true },
      },
    },
    orderBy: { id: "desc" },
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return {
    items: page.map((row) => ({
      id: row.id,
      action: row.action,
      entity: row.entity,
      entityId: row.entityId,
      actor: row.user
        ? {
            id: row.user.id,
            name: `${row.user.firstName} ${row.user.lastName}`.trim(),
            email: row.user.emailId,
          }
        : null,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      newValue: row.newValue,
      createdAt: row.createdAt.toISOString(),
    })),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}

/** Distinct entities and actions present, for building filter menus. */
export async function auditFacets(ctx: AuthContext) {
  const { items } = await listAuditLog(ctx, { limit: 200 });
  return {
    entities: [...new Set(items.map((i) => i.entity))].sort(),
    actions: [...new Set(items.map((i) => i.action))].sort(),
  };
}
