import { PrismaClient, RoleKey } from "@prisma/client";
import { randomBytes } from "crypto";
import { BILLING_PLANS } from "./plans";
import {
  ALL_PERMISSIONS,
  PERMISSIONS,
  ROLE_DESCRIPTIONS,
  ROLE_GRANTS,
} from "../src/modules/rbac/permission.catalog";

const prisma = new PrismaClient();

const DEVICE_TYPES = [
  { deviceType: "Ackcio", deviceImage: null },
  { deviceType: "Device type 2", deviceImage: null },
  { deviceType: "Device type 3", deviceImage: null },
];

const SENSOR_TYPES = [
  { sensorType: "Temperature", sensorIcon: "uploads/sensors/1.png", calibrationValue: "1", unit: "°C" },
  { sensorType: "LVDT", sensorIcon: "uploads/sensors/2.png", calibrationValue: "1", unit: "mm" },
  { sensorType: "Accelerometer", sensorIcon: "uploads/sensors/3.png", calibrationValue: "1", unit: "m/s²" },
  { sensorType: "Strain Gauge", sensorIcon: "uploads/sensors/4.png", calibrationValue: "1", unit: "uS" },
  { sensorType: "Load Cell", sensorIcon: "uploads/sensors/5.png", calibrationValue: "1", unit: "uS" },
  { sensorType: "Inclinometer", sensorIcon: "uploads/sensors/6.png", calibrationValue: "1", unit: "°" },
  { sensorType: "Crack meter", sensorIcon: "uploads/sensors/7.png", calibrationValue: "1", unit: "mm" },
  { sensorType: "Torque Sensor", sensorIcon: "uploads/sensors/8.png", calibrationValue: "1", unit: "Nm" },
  { sensorType: "Humidity Sensor", sensorIcon: "uploads/sensors/9.png", calibrationValue: "1", unit: "%" },
];

async function seedReferenceData() {
  console.log("Seeding device types…");
  for (const dt of DEVICE_TYPES) {
    const existing = await prisma.deviceType.findFirst({
      where: { deviceType: dt.deviceType },
    });
    if (!existing) {
      await prisma.deviceType.create({
        data: { ...dt, status: "one" },
      });
    }
  }

  console.log("Seeding sensor types…");
  for (const st of SENSOR_TYPES) {
    const existing = await prisma.sensorType.findFirst({
      where: { sensorType: st.sensorType },
    });
    if (!existing) {
      await prisma.sensorType.create({
        data: { ...st, status: "one" },
      });
    }
  }
}

async function seedBillingPlans() {
  const PLANS = BILLING_PLANS;

  console.log("Seeding billing plans…");
  for (const plan of PLANS) {
    await prisma.billingPlan.upsert({
      where: { code: plan.code },
      update: { ...plan },
      create: { ...plan },
    });
  }

  // Existing admins without a subscription get a trial on Starter.
  console.log("Backfilling subscriptions for existing admins…");
  const admins = await prisma.user.findMany({
    where: { userType: "admin", isDelete: "false_" as never },
    select: { id: true },
  });
  const starter = await prisma.billingPlan.findUnique({
    where: { code: "starter" },
  });
  if (starter) {
    for (const admin of admins) {
      await prisma.subscription.upsert({
        where: { adminId: admin.id },
        update: {},
        create: {
          adminId: admin.id,
          planId: starter.id,
          status: "trial",
          startsOn: new Date(),
          renewsOn: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        },
      });
    }
  }
}


/**
 * Roles, permissions and the grant matrix.
 *
 * Idempotent: the catalog in src/modules/rbac/permission.catalog.ts is the
 * source of truth, and this reconciles the database to it. Grants that have
 * been removed from the catalog are deleted, so revoking a permission is a
 * one-line change here rather than a manual database edit.
 */
async function seedRbac() {
  console.log("Seeding permissions…");
  for (const key of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key },
      update: { description: PERMISSIONS[key] },
      create: { key, description: PERMISSIONS[key] },
    });
  }

  console.log("Seeding roles…");
  for (const key of Object.keys(ROLE_GRANTS) as RoleKey[]) {
    const meta = ROLE_DESCRIPTIONS[key];
    await prisma.role.upsert({
      where: { key },
      update: { name: meta.name, description: meta.description },
      create: { key, name: meta.name, description: meta.description },
    });
  }

  console.log("Reconciling role → permission grants…");
  const permissionRows = await prisma.permission.findMany({
    select: { id: true, key: true },
  });
  const permissionIdByKey = new Map(permissionRows.map((p) => [p.key, p.id]));

  for (const roleKey of Object.keys(ROLE_GRANTS) as RoleKey[]) {
    const role = await prisma.role.findUnique({ where: { key: roleKey } });
    if (!role) continue;

    const desired = new Set(
      ROLE_GRANTS[roleKey]
        .map((k) => permissionIdByKey.get(k))
        .filter((id): id is number => typeof id === "number"),
    );

    const existing = await prisma.rolePermission.findMany({
      where: { roleId: role.id },
      select: { permissionId: true },
    });
    const existingIds = new Set(existing.map((e) => e.permissionId));

    const toAdd = [...desired].filter((id) => !existingIds.has(id));
    const toRemove = [...existingIds].filter((id) => !desired.has(id));

    if (toAdd.length) {
      await prisma.rolePermission.createMany({
        data: toAdd.map((permissionId) => ({ roleId: role.id, permissionId })),
        skipDuplicates: true,
      });
    }
    if (toRemove.length) {
      await prisma.rolePermission.deleteMany({
        where: { roleId: role.id, permissionId: { in: toRemove } },
      });
    }
  }
}

function tenantPublicId(): string {
  return `tn_${randomBytes(12).toString("hex")}`;
}

/**
 * Migrates the pre-tenancy user model onto tenants.
 *
 * Mapping, and why:
 *   superadmin           -> isPlatformAdmin, NO membership. A platform operator
 *                           administers the SaaS, not an organization (§19).
 *   admin                -> one tenant each, ORGANIZATION_ADMIN of it. Under the
 *                           old model an admin WAS the organization.
 *   contractor/authority -> VIEWER in their parent admin's tenant. Both had
 *                           identical read-only permissions; their difference is
 *                           a per-project stakeholder link (contractorId /
 *                           authorityId), which is a separate concept from role.
 *
 * Idempotent, so it is safe to re-run.
 */
async function backfillTenancy() {
  console.log("Backfilling tenants and memberships…");

  await prisma.user.updateMany({
    where: { userType: "superadmin" },
    data: { isPlatformAdmin: true },
  });

  const roles = await prisma.role.findMany({ select: { id: true, key: true } });
  const roleIdByKey = new Map(roles.map((r) => [r.key, r.id]));
  const orgAdminRoleId = roleIdByKey.get(RoleKey.ORGANIZATION_ADMIN);
  const viewerRoleId = roleIdByKey.get(RoleKey.VIEWER);
  if (!orgAdminRoleId || !viewerRoleId) {
    throw new Error("Roles must be seeded before tenancy backfill");
  }

  const admins = await prisma.user.findMany({
    where: { userType: "admin", isDelete: "false_" as never },
    select: { id: true, firstName: true, lastName: true, emailId: true },
  });

  for (const admin of admins) {
    const slug = `org-${admin.id}`;
    const displayName =
      [admin.firstName, admin.lastName].filter(Boolean).join(" ").trim() ||
      admin.emailId;

    const tenant = await prisma.tenant.upsert({
      where: { slug },
      update: {},
      create: {
        publicId: tenantPublicId(),
        name: displayName,
        slug,
        status: "active",
      },
    });

    await prisma.membership.upsert({
      where: { userId_tenantId: { userId: admin.id, tenantId: tenant.id } },
      update: { roleId: orgAdminRoleId, status: "active" },
      create: {
        userId: admin.id,
        tenantId: tenant.id,
        roleId: orgAdminRoleId,
        status: "active",
      },
    });

    // Tenant-owned rows that used to be identified by the admin's user id.
    await prisma.project.updateMany({
      where: { createdBy: admin.id },
      data: { tenantId: tenant.id },
    });
    await prisma.device.updateMany({
      where: { assignedAdmin: admin.id },
      data: { tenantId: tenant.id },
    });
    await prisma.sensor.updateMany({
      where: { assignedAdmin: admin.id },
      data: { tenantId: tenant.id },
    });
    await prisma.subscription.updateMany({
      where: { adminId: admin.id },
      data: { tenantId: tenant.id },
    });

    // Members below this admin join the same tenant as viewers.
    const members = await prisma.user.findMany({
      where: {
        parentId: admin.id,
        isDelete: "false_" as never,
        userType: { in: ["contractor", "authority"] },
      },
      select: { id: true },
    });

    for (const member of members) {
      await prisma.membership.upsert({
        where: { userId_tenantId: { userId: member.id, tenantId: tenant.id } },
        update: { status: "active" },
        create: {
          userId: member.id,
          tenantId: tenant.id,
          roleId: viewerRoleId,
          status: "active",
        },
      });
    }
  }
}

async function main() {
  await seedReferenceData();
  await seedRbac();
  await seedBillingPlans();
  await backfillTenancy();
  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());