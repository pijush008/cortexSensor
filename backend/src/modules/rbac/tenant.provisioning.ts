import { randomBytes } from "crypto";
import { MembershipStatus, RoleKey, TenantStatus } from "@prisma/client";
import prisma from "../../config/prisma";
import { BadRequestError } from "../../utils/AppError";

/**
 * Tenant provisioning at sign-up.
 *
 * "Register an organization admin" and "create their organization" are the same
 * business event (§93: sign up → create organization). Doing it here, in the
 * registration path, is what makes every project, device and sensor created
 * afterwards land in a tenant automatically — rather than relying on a backfill
 * to repair rows that were created without one.
 */

/** Immutable external identifier. Names are editable; ids are not (§15). */
export function generateTenantPublicId(): string {
  return `tn_${randomBytes(12).toString("hex")}`;
}

/**
 * Slugs are derived from the organization name but must be unique, so a
 * numeric suffix is appended on collision. The slug is a convenience handle —
 * `publicId` is the stable identifier.
 */
async function uniqueSlug(base: string): Promise<string> {
  const root =
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "org";

  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = attempt === 0 ? root : `${root}-${attempt + 1}`;
    const clash = await prisma.tenant.findUnique({ where: { slug: candidate } });
    if (!clash) return candidate;
  }
  return `${root}-${randomBytes(4).toString("hex")}`;
}

async function roleIdFor(key: RoleKey): Promise<number> {
  const role = await prisma.role.findUnique({ where: { key } });
  if (!role) {
    // Roles are reference data seeded from the permission catalog. If they are
    // missing the deployment is misconfigured, and silently continuing would
    // create members with no permissions at all.
    throw new BadRequestError(
      `Role ${key} is not configured. Run the database seed before registering users.`,
    );
  }
  return role.id;
}

/**
 * Creates the organization for a new admin and makes them its administrator.
 * Idempotent per user: an admin who already has a membership keeps it.
 */
export async function provisionTenantForAdmin(
  userId: number,
  organizationName: string,
): Promise<number> {
  const existing = await prisma.membership.findFirst({
    where: { userId },
    select: { tenantId: true },
  });
  if (existing) return existing.tenantId;

  const roleId = await roleIdFor(RoleKey.ORGANIZATION_ADMIN);
  const slug = await uniqueSlug(organizationName);

  const tenant = await prisma.tenant.create({
    data: {
      publicId: generateTenantPublicId(),
      name: organizationName || slug,
      slug,
      status: TenantStatus.active,
    },
  });

  await prisma.membership.create({
    data: {
      userId,
      tenantId: tenant.id,
      roleId,
      status: MembershipStatus.active,
    },
  });

  return tenant.id;
}

/**
 * Adds a member to the tenant owned by `parentAdminId`.
 *
 * Legacy `contractor` and `authority` users both map to VIEWER: their
 * permission sets were identical, and what actually distinguished them was a
 * per-project stakeholder link (Project.contractorId / authorityId), which is
 * a separate concept from role and is preserved unchanged.
 */
export async function addMemberToAdminTenant(
  userId: number,
  parentAdminId: number,
  roleKey: RoleKey = RoleKey.VIEWER,
): Promise<number | null> {
  const parentMembership = await prisma.membership.findFirst({
    where: { userId: parentAdminId },
    select: { tenantId: true },
  });
  if (!parentMembership) return null;

  const roleId = await roleIdFor(roleKey);

  await prisma.membership.upsert({
    where: {
      userId_tenantId: { userId, tenantId: parentMembership.tenantId },
    },
    update: { roleId, status: MembershipStatus.active },
    create: {
      userId,
      tenantId: parentMembership.tenantId,
      roleId,
      status: MembershipStatus.active,
    },
  });

  return parentMembership.tenantId;
}
