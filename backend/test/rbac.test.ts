import { RoleKey } from "@prisma/client";
import { beforeAll, afterAll, describe, expect, test } from "vitest";
import request from "supertest";
import app from "../src/app";
import prisma from "../src/config/prisma";
import {
  ALL_PERMISSIONS,
  ROLE_GRANTS,
  type PermissionKey,
} from "../src/modules/rbac/permission.catalog";
import {
  can,
  ownsTenantRow,
  resolveAuthContext,
  tenantScope,
} from "../src/modules/rbac/rbac.service";
import { evaluateMfaGate, verifyToken } from "../src/modules/auth/mfa.service";
import { authenticator } from "otplib";
import { TINY_PNG } from "./fixtures/registration";

/**
 * Tenancy and RBAC.
 *
 * The property under test is the one that matters commercially: a request can
 * only ever reach its own tenant's rows, and it can only do what its role
 * grants. These are asserted against the resolver and scope helper directly —
 * not only through HTTP — because these functions are what every future module
 * will build on, and a regression here is a cross-tenant data leak.
 */

const EMAIL_OWNER = "rbac-owner@example.com";
const EMAIL_VIEWER = "rbac-viewer@example.com";
const EMAIL_PLATFORM = "rbac-platform@example.com";
const PASSWORD = "Password1!";

let ownerId = 0;
let viewerId = 0;
let platformId = 0;
let tenantId = 0;
let otherTenantId = 0;

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { emailId: { in: [EMAIL_OWNER, EMAIL_VIEWER, EMAIL_PLATFORM] } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);

  const tenantIds = (
    await prisma.membership
      .findMany({ where: { userId: { in: ids } }, select: { tenantId: true } })
      .catch(() => [] as { tenantId: number }[])
  ).map((m) => m.tenantId);

  // Dependents must go before the users themselves. Registering a member under
  // an admin lazily provisions that admin's subscription, whose FK would
  // otherwise block the delete and silently leave stale users behind — which
  // then makes the next run's registration fail with "Email already exists".
  await prisma.invoice
    .deleteMany({ where: { subscription: { adminId: { in: ids } } } })
    .catch(() => {});
  await prisma.subscription.deleteMany({ where: { adminId: { in: ids } } }).catch(() => {});
  await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await prisma.tempOtp.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await prisma.firebaseToken.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await prisma.auditLog.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await prisma.membership.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
  await prisma.tenant
    .deleteMany({ where: { id: { in: [...tenantIds, otherTenantId].filter(Boolean) } } })
    .catch(() => {});
  await prisma.tenant.deleteMany({ where: { slug: "rbac-other-tenant" } }).catch(() => {});
}

describe("tenancy and RBAC", () => {
  beforeAll(async () => {
    await prisma.$connect();
    await cleanup();

    // Registering an admin must provision their organization (§93).
    const registration = await request(app).post("/api/register/admin").send({
      companyName: `Test Org ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      companyLogo: TINY_PNG,
      firstName: "Rbac",
      lastName: "Owner",
      emailId: EMAIL_OWNER,
      phoneNo: "1234567890",
      password: PASSWORD,
    });
    // Asserted so a cleanup failure surfaces here rather than as a confusing
    // "No Membership found" further down.
    expect(registration.status, JSON.stringify(registration.body)).toBe(200);
    const owner = await prisma.user.findUniqueOrThrow({
      where: { emailId: EMAIL_OWNER },
    });
    ownerId = owner.id;
    // Registration leaves the account unverified; verify it so login reaches
    // the MFA gate rather than failing earlier on "Email Not Verified".
    await prisma.user.update({
      where: { id: ownerId },
      data: { isMailVerified: "true_", isUserVerified: "true_" },
    });

    const membership = await prisma.membership.findFirstOrThrow({
      where: { userId: ownerId },
    });
    tenantId = membership.tenantId;

    // A member of the same tenant, downgraded to VIEWER.
    //
    // Added while signed in as the owner: the organization a member joins now
    // comes from the inviting admin's SESSION, not from `admin_id` in the body.
    const ownerLogin = await request(app)
      .post("/api/commonLogin")
      .send({ username: EMAIL_OWNER, password: PASSWORD });
    expect(ownerLogin.status).toBe(200);
    const ownerCookieRaw = ownerLogin.headers["set-cookie"];
    const ownerCookie = (Array.isArray(ownerCookieRaw) ? ownerCookieRaw : [])
      .map((c: string) => c.split(";")[0])
      .join("; ");

    await request(app)
      .post("/api/register/authority")
      .set("Cookie", ownerCookie)
      .send({
      companyName: `Test Org ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      companyLogo: TINY_PNG,
      firstName: "Rbac",
      lastName: "Viewer",
      emailId: EMAIL_VIEWER,
      phoneNo: "1234567890",
      password: PASSWORD,
      admin_id: String(ownerId),
    });
    const viewer = await prisma.user.findUniqueOrThrow({
      where: { emailId: EMAIL_VIEWER },
    });
    viewerId = viewer.id;

    const platform = await prisma.user.create({
      data: {
        userType: "superadmin",
        isPlatformAdmin: true,
        firstName: "Rbac",
        lastName: "Platform",
        emailId: EMAIL_PLATFORM,
        phoneNo: "1234567890",
        password: "unused",
        status: "true_",
        isMailVerified: "true_",
        isUserVerified: "true_",
        isDelete: "false_",
      },
    });
    platformId = platform.id;

    const other = await prisma.tenant.create({
      data: {
        publicId: "tn_rbac_other_fixture",
        name: "Other Org",
        slug: "rbac-other-tenant",
        status: "active",
      },
    });
    otherTenantId = other.id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  test("registering an admin provisions a tenant and makes them its administrator", async () => {
    const ctx = await resolveAuthContext(ownerId);
    expect(ctx.tenantId).toBe(tenantId);
    expect(ctx.role).toBe(RoleKey.ORGANIZATION_ADMIN);
    expect(ctx.isPlatformAdmin).toBe(false);
  });

  test("a member registered under an admin joins that admin's tenant as VIEWER", async () => {
    const ctx = await resolveAuthContext(viewerId);
    expect(ctx.tenantId).toBe(tenantId);
    expect(ctx.role).toBe(RoleKey.VIEWER);
  });

  test("tenantScope confines a query to the caller's tenant", async () => {
    const ctx = await resolveAuthContext(ownerId);
    expect(tenantScope(ctx)).toEqual({ tenantId });
  });

  test("a platform operator holds no tenant and no tenant role", async () => {
    const ctx = await resolveAuthContext(platformId);
    expect(ctx.isPlatformAdmin).toBe(true);
    expect(ctx.tenantId).toBeNull();
    expect(ctx.role).toBeNull();
    // Unrestricted scope, but by explicit short-circuit rather than by being
    // granted every tenant permission.
    expect(tenantScope(ctx)).toEqual({});
    expect(ctx.permissions.size).toBe(0);
    expect(can(ctx, "PROJECT_DELETE")).toBe(true);
  });

  test("a user with no membership fails CLOSED, not open", async () => {
    const orphan = await prisma.user.create({
      data: {
        userType: "authority",
        firstName: "No",
        lastName: "Membership",
        emailId: "rbac-orphan@example.com",
        phoneNo: "1",
        password: "unused",
        status: "true_",
        isDelete: "false_",
      },
    });
    try {
      const ctx = await resolveAuthContext(orphan.id);
      expect(ctx.tenantId).toBeNull();
      // An impossible predicate, NOT {} — a missing membership must never
      // widen a query to every tenant's rows.
      expect(tenantScope(ctx)).toEqual({ tenantId: { in: [] } });
      expect(can(ctx, "PROJECT_VIEW")).toBe(false);
    } finally {
      await prisma.user.delete({ where: { id: orphan.id } });
    }
  });

  test("a suspended tenant revokes its members' access", async () => {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { status: "suspended" },
    });
    try {
      const ctx = await resolveAuthContext(ownerId);
      expect(ctx.tenantId).toBeNull();
      expect(tenantScope(ctx)).toEqual({ tenantId: { in: [] } });
    } finally {
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { status: "active" },
      });
    }
  });

  test("ownsTenantRow rejects a row from another tenant", async () => {
    const ctx = await resolveAuthContext(ownerId);
    expect(ownsTenantRow(ctx, { tenantId })).toBe(true);
    expect(ownsTenantRow(ctx, { tenantId: otherTenantId })).toBe(false);
    expect(ownsTenantRow(ctx, null)).toBe(false);
  });

  test("VIEWER can read but cannot mutate", async () => {
    const ctx = await resolveAuthContext(viewerId);
    expect(can(ctx, "PROJECT_VIEW")).toBe(true);
    expect(can(ctx, "PROJECT_CREATE")).toBe(false);
    expect(can(ctx, "PROJECT_DELETE")).toBe(false);
    expect(can(ctx, "BILLING_MANAGE")).toBe(false);
    expect(can(ctx, "USER_MANAGE")).toBe(false);
  });

  test("a technician manages hardware but cannot resolve a structural finding", () => {
    const grants = new Set(ROLE_GRANTS[RoleKey.TECHNICIAN]);
    expect(grants.has("DEVICE_PROVISION")).toBe(true);
    expect(grants.has("SENSOR_CALIBRATE")).toBe(true);
    expect(grants.has("ALERT_ACKNOWLEDGE")).toBe(true);
    // Closing a structural finding is an engineering decision (§88).
    expect(grants.has("ALERT_RESOLVE")).toBe(false);
    expect(grants.has("BILLING_MANAGE")).toBe(false);
  });

  test("an engineer analyses and adjudicates but does not provision hardware", () => {
    const grants = new Set(ROLE_GRANTS[RoleKey.SHM_ENGINEER]);
    expect(grants.has("SHM_ANALYZE")).toBe(true);
    expect(grants.has("ALERT_RESOLVE")).toBe(true);
    expect(grants.has("REPORT_CREATE")).toBe(true);
    expect(grants.has("DEVICE_PROVISION")).toBe(false);
    expect(grants.has("BILLING_MANAGE")).toBe(false);
  });

  test("every granted permission exists in the catalog", () => {
    const catalog = new Set<PermissionKey>(ALL_PERMISSIONS);
    for (const role of Object.keys(ROLE_GRANTS) as RoleKey[]) {
      for (const grant of ROLE_GRANTS[role]) {
        expect(catalog.has(grant)).toBe(true);
      }
    }
  });

  test("the seeded grant matrix matches the catalog", async () => {
    for (const role of Object.keys(ROLE_GRANTS) as RoleKey[]) {
      const row = await prisma.role.findUnique({
        where: { key: role },
        include: { permissions: { include: { permission: true } } },
      });
      expect(row).toBeTruthy();
      const seeded = new Set(row!.permissions.map((p) => p.permission.key));
      expect(seeded).toEqual(new Set(ROLE_GRANTS[role]));
    }
  });

  test("MFA is not enforced until enrolment is confirmed", () => {
    expect(evaluateMfaGate({ isPlatformAdmin: false, mfaEnabledAt: null })).toEqual({
      required: false,
      enrolmentRequired: false,
    });
    // Secret stored but unconfirmed: still not enforced, so a half-finished
    // enrolment cannot lock a user out.
    expect(evaluateMfaGate({ isPlatformAdmin: true, mfaEnabledAt: null })).toEqual({
      required: false,
      enrolmentRequired: true,
    });
    expect(
      evaluateMfaGate({ isPlatformAdmin: false, mfaEnabledAt: new Date() }),
    ).toEqual({ required: true, enrolmentRequired: false });
  });

  test("TOTP verification accepts a current code and rejects malformed input", () => {
    const secret = authenticator.generateSecret();
    expect(verifyToken(secret, authenticator.generate(secret))).toBe(true);
    expect(verifyToken(secret, "000000")).toBe(false);
    expect(verifyToken(secret, "abc")).toBe(false);
    expect(verifyToken(secret, "")).toBe(false);
    expect(verifyToken(secret, "12345678")).toBe(false);
  });

  test("login is rejected without a code once MFA is enabled", async () => {
    const secret = authenticator.generateSecret();
    await prisma.user.update({
      where: { id: ownerId },
      data: { mfaSecret: secret, mfaEnabledAt: new Date() },
    });
    try {
      const denied = await request(app)
        .post("/api/commonLogin")
        .send({ username: EMAIL_OWNER, password: PASSWORD });
      expect(denied.status).toBe(401);

      const wrong = await request(app)
        .post("/api/commonLogin")
        .send({ username: EMAIL_OWNER, password: PASSWORD, mfaToken: "000000" });
      expect([400, 401]).toContain(wrong.status);

      const ok = await request(app)
        .post("/api/commonLogin")
        .send({
          username: EMAIL_OWNER,
          password: PASSWORD,
          mfaToken: authenticator.generate(secret),
        });
      expect(ok.status).toBe(200);
    } finally {
      await prisma.user.update({
        where: { id: ownerId },
        data: { mfaSecret: null, mfaEnabledAt: null },
      });
    }
  });

  test("the versioned API serves the same routes as the legacy path", async () => {
    const versioned = await request(app).get("/api/v1/projects/0");
    const legacy = await request(app).get("/api/projects/0");
    // Both unauthenticated, so both must refuse identically — proving the
    // versioned mount is the same middleware chain, not an unguarded alias.
    expect(versioned.status).toBe(legacy.status);
    expect(versioned.status).toBe(401);
  });
});
