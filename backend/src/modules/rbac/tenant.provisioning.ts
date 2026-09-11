import { randomBytes } from "crypto";
import { MembershipStatus, Prisma, RoleKey, TenantStatus } from "@prisma/client";
import prisma from "../../config/prisma";
import { BadRequestError } from "../../utils/AppError";
import { config } from "../../config";

/**
 * Plan a newly-registered organization starts on. Must match the fallback in
 * subscription.service.ts; the two are the same business decision.
 */
// Single source of truth: checkout charges for the same plan sign-up assigns.
const DEFAULT_PLAN_CODE = config.billing.signupPlanCode;

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
  /**
   * Relative path to the organization's logo, already validated and written to
   * disk by the caller. A PATH, not a data URI — decoding an image here would
   * pull upload validation into a module about tenancy and roles.
   *
   * Optional with a default so the seeds and any future caller compile
   * unchanged; today the only caller is auth.service.ts.
   */
  logoPath: string | null = null,
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
      logoPath,
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

  // The organization's billing record is created with the organization itself.
  // Without it there is nothing for a checkout to attach a provider id to, and
  // therefore nothing a later webhook can be matched against — the payment
  // would arrive with no way to tell whose account to open.
  //
  // It starts `pending`: the account exists, and grants nothing until a
  // verified webhook confirms the charge settled.
  // The SAME default the subscription service uses, by CODE.
  //
  // Picking "the first active plan by id" instead put every new organization on
  // `complimentary` — the unlimited internal plan — which silently disabled
  // every plan limit for new customers. A default this consequential has to be
  // named, not inferred from row order.
  const plan = await prisma.billingPlan.findFirst({
    where: { code: DEFAULT_PLAN_CODE, isActive: true },
  });

  if (plan) {
    await prisma.subscription.upsert({
      where: { adminId: userId },
      update: { tenantId: tenant.id },
      create: {
        adminId: userId,
        tenantId: tenant.id,
        planId: plan.id,
        status: "pending",
        startsOn: new Date(),
        autoRenew: true,
      },
    });
  }

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

/**
 * Place a user into a tenant named DIRECTLY, rather than one derived from
 * another user's membership.
 *
 * addMemberToAdminTenant reads the tenant off a parent admin, which works when
 * an admin adds a colleague but not when a PLATFORM OPERATOR invites someone:
 * an operator deliberately holds no membership (rbac.service resolves their
 * tenantId to null), so there is no parent row to read a tenant from. The
 * caller has already established which tenant it is acting on and passes it.
 */
export async function addMemberToTenant(
  userId: number,
  tenantId: number,
  roleKey: RoleKey = RoleKey.VIEWER,
  /**
   * The caller's transaction, when the membership must commit or fail together
   * with whatever else that caller is writing. Project invitations need this:
   * an acceptance that marked the invitation spent but left the invitee out of
   * the tenant would be worse than one that failed outright.
   */
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<number> {
  const roleId = await roleIdFor(roleKey);

  await client.membership.upsert({
    where: { userId_tenantId: { userId, tenantId } },
    // The role is set only when the membership is CREATED.
    //
    // Overwriting it on update looks harmless and is not: an organization's own
    // admin who accepts a project invitation — as the authority on a job they
    // run, say — already holds a membership, and rewriting its role would
    // silently demote them from ORGANIZATION_ADMIN to VIEWER in their own
    // organization. Joining a project is not a statement about someone's
    // standing in the organization they are already part of.
    //
    // The status IS refreshed, so re-inviting somebody whose membership was
    // disabled brings them back rather than leaving them locked out.
    update: { status: MembershipStatus.active },
    create: { userId, tenantId, roleId, status: MembershipStatus.active },
  });

  return tenantId;
}

/**
 * The organization that holds a platform operator's own projects.
 *
 * An operator belongs to no organization — rbac.service resolves their tenantId
 * to null on purpose, so that running the platform never quietly becomes being
 * an admin inside one customer's organization. But a project must belong to
 * somewhere: Tenant is the isolation root and Project.tenantId is NOT NULL.
 *
 * So the operator's work lives in an organization of its own, identified by a
 * reserved slug rather than by giving the operator a Membership.
 * resolveAuthContext short-circuits on isPlatformAdmin before it ever reads
 * memberships, so a membership row would in fact be inert — but the code states
 * plainly that an operator holds none, and a convention keeps that true instead
 * of merely harmless.
 *
 * One organization, shared by every operator, not one per operator: two people
 * administering the same deployment are running the same thing, and splitting
 * their projects into private silos would hide each from the other.
 */
export const OPERATOR_TENANT_SLUG = "platform-operator";

const OPERATOR_TENANT_NAME = "Cloudglance Sensinglab Pvt Ltd";

export async function getOrCreateOperatorTenant(): Promise<number> {
  const existing = await prisma.tenant.findUnique({
    where: { slug: OPERATOR_TENANT_SLUG },
    select: { id: true, status: true },
  });

  if (existing) {
    // Reactivated rather than refused: an operator organization that somebody
    // suspended would otherwise leave the platform's own projects uncreatable
    // with no obvious cause.
    if (existing.status !== TenantStatus.active) {
      await prisma.tenant.update({
        where: { id: existing.id },
        data: { status: TenantStatus.active },
      });
    }
    return existing.id;
  }

  const tenant = await prisma.tenant.create({
    data: {
      publicId: generateTenantPublicId(),
      name: OPERATOR_TENANT_NAME,
      slug: OPERATOR_TENANT_SLUG,
      status: TenantStatus.active,
    },
  });

  return tenant.id;
}
