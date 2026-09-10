import request from "supertest";
import bcrypt from "bcryptjs";
import { MembershipStatus, RoleKey } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import app from "../src/app";
import prisma from "../src/config/prisma";

/**
 * The rules a "view as" session must obey.
 *
 * Impersonation is the most dangerous capability on a multi-tenant platform: it
 * puts a platform operator inside a customer's account. These tests pin the
 * properties that make it safe to ship — not that the happy path works, but
 * that each way of abusing it is refused.
 */

const OPERATOR = "imp-operator@example.com";
const OTHER_OPERATOR = "imp-operator-2@example.com";
const MEMBER = "imp-member@example.com";
const OUTSIDER = "imp-outsider@example.com";
const PASSWORD = "Password1!";

const EMAILS = [OPERATOR, OTHER_OPERATOR, MEMBER, OUTSIDER];
const TEST_TENANT_NAME = "Impersonation Test Org";

let operatorCookies: string[] = [];
let outsiderCookies: string[] = [];
let operatorId = 0;
let memberId = 0;
let otherOperatorId = 0;

async function purge() {
  const users = await prisma.user.findMany({
    where: { emailId: { in: EMAILS } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length === 0) return;
  // Children before parents: audit entries, sessions and memberships all hold a
  // foreign key to the user.
  await prisma.auditLog.deleteMany({ where: { userId: { in: ids } } });
  await prisma.tempOtp.deleteMany({ where: { userId: { in: ids } } });
  await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
  await prisma.membership.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

async function makeUser(email: string, isPlatformAdmin: boolean) {
  return prisma.user.create({
    data: {
      emailId: email,
      firstName: "Imp",
      lastName: "Test",
      phoneNo: "0000000000",
      password: await bcrypt.hash(PASSWORD, 10),
      userType: isPlatformAdmin ? "superadmin" : "contractor",
      isPlatformAdmin,
      isMailVerified: "true_" as never,
      isUserVerified: "true_" as never,
      status: "true_" as never,
      isDelete: "false_" as never,
    },
  });
}

async function signIn(email: string): Promise<string[]> {
  const res = await request(app)
    .post("/api/v1/commonLogin")
    .send({ username: email, password: PASSWORD });
  expect(res.status).toBe(200);
  const raw = res.headers["set-cookie"];
  return Array.isArray(raw) ? raw : [raw as unknown as string];
}

/** Merges a later Set-Cookie batch over an earlier one, as a browser would. */
function mergeCookies(base: string[], extra: unknown): string[] {
  if (!extra) return base;
  const list = Array.isArray(extra) ? (extra as string[]) : [extra as string];
  const byName = new Map<string, string>();
  for (const c of [...base, ...list]) byName.set(c.split("=")[0], c);
  return [...byName.values()];
}

beforeAll(async () => {
  await prisma.$connect();
  await purge();

  const operator = await makeUser(OPERATOR, true);
  const otherOperator = await makeUser(OTHER_OPERATOR, true);
  const member = await makeUser(MEMBER, false);
  await makeUser(OUTSIDER, false);

  operatorId = operator.id;
  memberId = member.id;
  otherOperatorId = otherOperator.id;

  // A real tenant + role for the member, so viewing as them resolves to a
  // genuine tenant context rather than an empty one.
  const tenant = await prisma.tenant.create({
    data: {
      publicId: `tn_imp_${Date.now()}`,
      name: TEST_TENANT_NAME,
      slug: `imp-test-${Date.now()}`,
      status: "active",
    },
  });
  const role = await prisma.role.findFirst({ where: { key: RoleKey.TECHNICIAN } });
  if (role) {
    await prisma.membership.create({
      data: {
        userId: member.id,
        tenantId: tenant.id,
        roleId: role.id,
        status: MembershipStatus.active,
      },
    });
  }

  operatorCookies = await signIn(OPERATOR);
  outsiderCookies = await signIn(OUTSIDER);
});

afterAll(async () => {
  const tenants = await prisma.tenant.findMany({
    where: { name: TEST_TENANT_NAME },
    select: { id: true },
  });
  await purge();
  if (tenants.length > 0) {
    await prisma.tenant.deleteMany({
      where: { id: { in: tenants.map((t) => t.id) } },
    });
  }
  await prisma.$disconnect();
});

describe("view-as: who may open one", () => {
  test("a tenant member cannot open one", async () => {
    const res = await request(app)
      .post("/api/v1/admin/impersonation")
      .set("Cookie", outsiderCookies)
      .send({ userId: memberId });

    expect(res.status).toBe(403);
  });

  test("a tenant member cannot read another user's platform detail page", async () => {
    const res = await request(app)
      .get(`/api/v1/admin/users/${memberId}`)
      .set("Cookie", outsiderCookies);

    expect(res.status).toBe(403);
  });

  test("an operator cannot view as another platform operator", async () => {
    // The audit-laundering guard: otherwise operator A acts as operator B and
    // every entry afterwards names B.
    const res = await request(app)
      .post("/api/v1/admin/impersonation")
      .set("Cookie", operatorCookies)
      .send({ userId: otherOperatorId });

    expect(res.status).toBe(403);
  });
});

describe("view-as: what it can do", () => {
  let viewing: string[] = [];

  beforeAll(async () => {
    const res = await request(app)
      .post("/api/v1/admin/impersonation")
      .set("Cookie", operatorCookies)
      .send({ userId: memberId });

    expect(res.status).toBe(200);
    expect(res.body.data.readOnly).toBe(true);
    viewing = mergeCookies(operatorCookies, res.headers["set-cookie"]);
  });

  test("the session resolves to the viewed user, naming the operator", async () => {
    const res = await request(app).get("/api/v1/me").set("Cookie", viewing);

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(MEMBER);
    expect(res.body.data.impersonation.active).toBe(true);
    expect(res.body.data.impersonation.operator.email).toBe(OPERATOR);
  });

  test("reads are allowed — that is the point of the feature", async () => {
    const res = await request(app).get("/api/v1/structures").set("Cookie", viewing);
    expect(res.status).toBe(200);
  });

  test.each([
    ["post", "/api/v1/structures"],
    ["post", "/api/v1/project"],
    ["patch", "/api/v1/structures/1"],
    ["delete", "/api/v1/project/1"],
    // Both of these bypassed an earlier version of this guard: /logout declares
    // no auth middleware at all, and /changePassword uses optionalAuth, which
    // discards the error the guard raised. The rule now lives in global
    // middleware, ahead of every router, which is why they are listed here.
    ["post", "/api/v1/logout"],
    ["post", "/api/v1/changePassword"],
  ])("%s %s is refused", async (method, path) => {
    const agent = request(app) as unknown as Record<
      string,
      (p: string) => request.Test
    >;
    const res = await agent[method](path).set("Cookie", viewing).send({});

    expect(res.status).toBe(403);
    expect(String(res.body.message)).toMatch(/read-only view-as/i);
  });

  test("a second view-as cannot be nested inside the first", async () => {
    const res = await request(app)
      .post("/api/v1/admin/impersonation")
      .set("Cookie", viewing)
      .send({ userId: memberId });

    expect(res.status).toBe(403);
  });

  test("both ends are recorded against the operator, not the viewed user", async () => {
    const end = await request(app)
      .delete("/api/v1/admin/impersonation")
      .set("Cookie", viewing);
    expect(end.status).toBe(200);

    const entries = await prisma.auditLog.findMany({
      where: {
        action: { in: ["impersonate-start", "impersonate-end"] },
        userId: operatorId,
      },
      orderBy: { id: "desc" },
      take: 2,
    });

    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.action).sort()).toEqual([
      "impersonate-end",
      "impersonate-start",
    ]);
    for (const e of entries) {
      // Attributed to the operator; the viewed user is the SUBJECT, not the actor.
      expect(e.userId).toBe(operatorId);
      expect(e.entityId).toBe(memberId);
    }
  });
});
