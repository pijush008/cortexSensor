/**
 * DEVELOPMENT FIXTURES — one login per role.
 *
 * Isolated from prisma/seed.ts on purpose (§63). `seed.ts` loads reference data
 * a real deployment needs — device types, sensor types, billing plans. This
 * file creates *people with known passwords*, which must never run against a
 * production database, so it is a separate script that has to be asked for by
 * name and refuses to run unless explicitly allowed.
 *
 *   npm run seed:demo-users
 *
 * It creates no measurements, alerts or analyses. Those come from the real
 * ingest and analysis paths; inventing them here would put fabricated
 * engineering data in the product through the back door.
 */

import { MembershipStatus, PrismaClient, RoleKey } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();

/** Shared by every demo account. Development only. */
const PASSWORD = "ShmDemo!2026";

const TENANT_NAME = "Demo Infrastructure";
const TENANT_SLUG = "demo-infrastructure";

interface DemoUser {
  email: string;
  firstName: string;
  lastName: string;
  /** Null for the platform operator, who belongs to no organization (§19). */
  role: RoleKey | null;
  isPlatformAdmin: boolean;
  /** Legacy column, kept in sync while the frontend still reads it. */
  userType: "superadmin" | "admin" | "contractor" | "authority";
}

const USERS: DemoUser[] = [
  {
    email: "superadmin@shm.local",
    firstName: "Platform",
    lastName: "Operator",
    role: null,
    isPlatformAdmin: true,
    userType: "superadmin",
  },
  {
    email: "admin@shm.local",
    firstName: "Org",
    lastName: "Admin",
    role: RoleKey.ORGANIZATION_ADMIN,
    isPlatformAdmin: false,
    userType: "admin",
  },
  {
    email: "engineer@shm.local",
    firstName: "SHM",
    lastName: "Engineer",
    role: RoleKey.SHM_ENGINEER,
    isPlatformAdmin: false,
    userType: "contractor",
  },
  {
    email: "technician@shm.local",
    firstName: "Field",
    lastName: "Technician",
    role: RoleKey.TECHNICIAN,
    isPlatformAdmin: false,
    userType: "contractor",
  },
  {
    email: "viewer@shm.local",
    firstName: "Read Only",
    lastName: "Viewer",
    role: RoleKey.VIEWER,
    isPlatformAdmin: false,
    userType: "authority",
  },
];

async function main() {
  if (process.env.ALLOW_DEMO_USERS !== "true") {
    console.error(
      "Refusing to run: these are accounts with known passwords.\n" +
        "Set ALLOW_DEMO_USERS=true to confirm this is a development database.",
    );
    process.exit(1);
  }

  const hashed = await bcrypt.hash(PASSWORD, 10);

  const tenant = await prisma.tenant.upsert({
    where: { slug: TENANT_SLUG },
    update: {},
    create: {
      publicId: `tn_${randomBytes(12).toString("hex")}`,
      name: TENANT_NAME,
      slug: TENANT_SLUG,
      status: "active",
    },
  });

  const roles = await prisma.role.findMany();
  const roleIdByKey = new Map(roles.map((r) => [r.key, r.id]));
  if (roleIdByKey.size === 0) {
    console.error("Roles are not seeded. Run `npm run prisma:seed` first.");
    process.exit(1);
  }

  console.log(`Organization: ${tenant.name} (${tenant.slug})\n`);

  for (const spec of USERS) {
    const user = await prisma.user.upsert({
      where: { emailId: spec.email },
      update: {
        password: hashed,
        // Verified so the account can sign in immediately; the real signup
        // flow still requires email verification.
        isMailVerified: "true_",
        isUserVerified: "true_",
        isDelete: "false_",
        status: "true_",
        isPlatformAdmin: spec.isPlatformAdmin,
        userType: spec.userType,
      },
      create: {
        emailId: spec.email,
        firstName: spec.firstName,
        lastName: spec.lastName,
        phoneNo: "0000000000",
        password: hashed,
        userType: spec.userType,
        isPlatformAdmin: spec.isPlatformAdmin,
        isMailVerified: "true_",
        isUserVerified: "true_",
        status: "true_",
        isDelete: "false_",
      },
    });

    if (spec.role) {
      const roleId = roleIdByKey.get(spec.role);
      if (!roleId) throw new Error(`Role ${spec.role} is missing`);
      await prisma.membership.upsert({
        where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
        update: { roleId, status: MembershipStatus.active },
        create: {
          userId: user.id,
          tenantId: tenant.id,
          roleId,
          status: MembershipStatus.active,
        },
      });
    } else {
      // A platform operator holds no membership (§19). Remove any that exists
      // so re-running never leaves them scoped into an organization.
      await prisma.membership.deleteMany({ where: { userId: user.id } });
    }

    console.log(
      `  ${spec.email.padEnd(24)} ${spec.role ?? "SUPER_ADMIN (platform)"}`,
    );
  }

  console.log(`\nPassword for all accounts: ${PASSWORD}`);
  console.log("Development fixtures only — never load these into production.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
