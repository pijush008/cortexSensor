import { RoleKey } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import app from "../src/app";
import prisma from "../src/config/prisma";

/**
 * Structures and locations — the first module built entirely on the tenancy
 * layer from slice 1.
 *
 * The assertions that matter are the negative ones: tenant B must not be able
 * to read, edit, delete or attach to tenant A's structures even with a valid
 * session and a correct id. If tenantScope() ever regresses, these fail.
 */

const EMAIL_A = "struct-admin-a@example.com";
const EMAIL_B = "struct-admin-b@example.com";
const EMAIL_VIEWER = "struct-viewer-a@example.com";
const PASSWORD = "Password1!";

function cookieHeader(raw: unknown): string {
  const cookie = Array.isArray(raw) ? raw.join(";") : typeof raw === "string" ? raw : "";
  if (!cookie) throw new Error("No auth cookies returned");
  return cookie;
}

async function registerAndLogin(email: string, kind: "admin" | "authority", adminId?: number) {
  await request(app)
    .post(`/api/v1/register/${kind}`)
    .send({
      firstName: "Struct",
      lastName: "Test",
      emailId: email,
      phoneNo: "1234567890",
      password: PASSWORD,
      ...(adminId ? { admin_id: String(adminId) } : {}),
    });

  const user = await prisma.user.findUniqueOrThrow({ where: { emailId: email } });
  await prisma.user.update({
    where: { id: user.id },
    data: { isMailVerified: "true_", isUserVerified: "true_" },
  });

  const login = await request(app)
    .post("/api/v1/commonLogin")
    .send({ username: email, password: PASSWORD });
  expect(login.status, JSON.stringify(login.body)).toBe(200);

  const membership = await prisma.membership.findFirst({
    where: { userId: user.id },
    select: { tenantId: true },
  });

  return {
    userId: user.id,
    tenantId: membership?.tenantId ?? null,
    cookie: cookieHeader(login.headers["set-cookie"]),
  };
}

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { emailId: { in: [EMAIL_A, EMAIL_B, EMAIL_VIEWER] } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  const tenantIds = (
    await prisma.membership
      .findMany({ where: { userId: { in: ids } }, select: { tenantId: true } })
      .catch(() => [] as { tenantId: number }[])
  ).map((m) => m.tenantId);

  await prisma.location.deleteMany({ where: { tenantId: { in: tenantIds } } }).catch(() => {});
  await prisma.structure.deleteMany({ where: { tenantId: { in: tenantIds } } }).catch(() => {});
  await prisma.project.deleteMany({ where: { tenantId: { in: tenantIds } } }).catch(() => {});
  await prisma.invoice
    .deleteMany({ where: { subscription: { adminId: { in: ids } } } })
    .catch(() => {});
  await prisma.subscription.deleteMany({ where: { adminId: { in: ids } } }).catch(() => {});
  await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await prisma.auditLog.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await prisma.membership.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } }).catch(() => {});
}

describe("structures and locations", () => {
  let adminA: Awaited<ReturnType<typeof registerAndLogin>>;
  let adminB: Awaited<ReturnType<typeof registerAndLogin>>;
  let viewerA: Awaited<ReturnType<typeof registerAndLogin>>;
  let projectA = 0;
  let projectB = 0;
  let structureA = 0;
  let locationA = 0;

  beforeAll(async () => {
    await prisma.$connect();
    await cleanup();

    adminA = await registerAndLogin(EMAIL_A, "admin");
    adminB = await registerAndLogin(EMAIL_B, "admin");
    viewerA = await registerAndLogin(EMAIL_VIEWER, "authority", adminA.userId);

    const mkProject = async (tenantId: number, createdBy: number, name: string) =>
      prisma.project.create({
        data: {
          projectName: name,
          projectLocation: "Test",
          startDate: new Date("2026-01-01"),
          status: "start",
          isDelete: false,
          isRegistered: true,
          createdBy,
          tenantId,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

    projectA = (await mkProject(adminA.tenantId!, adminA.userId, "Struct Project A")).id;
    projectB = (await mkProject(adminB.tenantId!, adminB.userId, "Struct Project B")).id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  test("an admin can register a structure under their own project", async () => {
    const res = await request(app)
      .post("/api/v1/structures")
      .set("Cookie", adminA.cookie)
      .send({
        projectId: projectA,
        name: "Kali River Bridge",
        code: "BR-NH48-017",
        type: "bridge",
        spanCount: 7,
        lengthMetres: 412.5,
        latitude: 28.6139,
        longitude: 77.209,
        status: "monitoring",
      });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data.code).toBe("BR-NH48-017");
    expect(res.body.data.publicId).toMatch(/^st_[0-9a-f]{24}$/);
    expect(res.body.data.locationCount).toBe(0);
    // Decimals must cross the API as numbers, not Prisma Decimal objects.
    expect(res.body.data.lengthMetres).toBe(412.5);
    structureA = res.body.data.id;
  });

  test("asset codes are unique within a tenant but not across them", async () => {
    const duplicate = await request(app)
      .post("/api/v1/structures")
      .set("Cookie", adminA.cookie)
      .send({ projectId: projectA, name: "Duplicate", code: "BR-NH48-017" });
    expect(duplicate.status).toBe(400);

    // A different tenant may legitimately use the same asset code.
    const otherTenant = await request(app)
      .post("/api/v1/structures")
      .set("Cookie", adminB.cookie)
      .send({ projectId: projectB, name: "Their Bridge", code: "BR-NH48-017" });
    expect(otherTenant.status, JSON.stringify(otherTenant.body)).toBe(201);
  });

  test("a structure cannot be attached to another tenant's project", async () => {
    const res = await request(app)
      .post("/api/v1/structures")
      .set("Cookie", adminA.cookie)
      .send({ projectId: projectB, name: "Hijack", code: "HIJACK-1" });
    expect(res.status).toBe(404);
  });

  test("tenant B cannot read, edit or delete tenant A's structure", async () => {
    const read = await request(app)
      .get(`/api/v1/structures/${structureA}`)
      .set("Cookie", adminB.cookie);
    expect(read.status).toBe(404);

    const edit = await request(app)
      .patch(`/api/v1/structures/${structureA}`)
      .set("Cookie", adminB.cookie)
      .send({ name: "Renamed by intruder" });
    expect(edit.status).toBe(404);

    const del = await request(app)
      .delete(`/api/v1/structures/${structureA}`)
      .set("Cookie", adminB.cookie);
    expect(del.status).toBe(404);

    // And the row is untouched.
    const row = await prisma.structure.findUniqueOrThrow({ where: { id: structureA } });
    expect(row.name).toBe("Kali River Bridge");
  });

  test("the list endpoint returns only the caller's tenant", async () => {
    const a = await request(app).get("/api/v1/structures").set("Cookie", adminA.cookie);
    const b = await request(app).get("/api/v1/structures").set("Cookie", adminB.cookie);

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);

    const codesA = a.body.items.map((s: { code: string }) => s.code);
    const codesB = b.body.items.map((s: { code: string }) => s.code);
    expect(codesA).toContain("BR-NH48-017");
    expect(a.body.items.every((s: { projectId: number }) => s.projectId === projectA)).toBe(true);
    expect(b.body.items.every((s: { projectId: number }) => s.projectId === projectB)).toBe(true);
    expect(codesB).not.toContain(undefined);
  });

  test("a VIEWER may read structures but not create them", async () => {
    const ctx = await prisma.membership.findFirstOrThrow({
      where: { userId: viewerA.userId },
      include: { role: true },
    });
    expect(ctx.role.key).toBe(RoleKey.VIEWER);

    const read = await request(app)
      .get("/api/v1/structures")
      .set("Cookie", viewerA.cookie);
    expect(read.status).toBe(200);

    const write = await request(app)
      .post("/api/v1/structures")
      .set("Cookie", viewerA.cookie)
      .send({ projectId: projectA, name: "Viewer attempt", code: "VIEWER-1" });
    expect(write.status).toBe(403);
  });

  test("locations attach to a structure and carry survey metadata", async () => {
    const res = await request(app)
      .post(`/api/v1/structures/${structureA}/locations`)
      .set("Cookie", adminA.cookie)
      .send({
        name: "Pier P-17 / North Bearing",
        code: "P17-NB",
        stationMetres: 214.5,
        elevationMetres: 12.25,
      });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data.code).toBe("P17-NB");
    expect(res.body.data.stationMetres).toBe(214.5);
    expect(res.body.data.isActive).toBe(true);
    locationA = res.body.data.id;

    const listed = await request(app)
      .get(`/api/v1/structures/${structureA}/locations`)
      .set("Cookie", adminA.cookie);
    expect(listed.body.data).toHaveLength(1);
  });

  test("tenant B cannot list or add locations on tenant A's structure", async () => {
    const listed = await request(app)
      .get(`/api/v1/structures/${structureA}/locations`)
      .set("Cookie", adminB.cookie);
    expect(listed.status).toBe(404);

    const added = await request(app)
      .post(`/api/v1/structures/${structureA}/locations`)
      .set("Cookie", adminB.cookie)
      .send({ name: "Intruder point", code: "X-1" });
    expect(added.status).toBe(404);

    const edited = await request(app)
      .patch(`/api/v1/locations/${locationA}`)
      .set("Cookie", adminB.cookie)
      .send({ name: "Renamed" });
    expect(edited.status).toBe(404);
  });

  test("a structure with locations cannot be deleted by accident", async () => {
    const blocked = await request(app)
      .delete(`/api/v1/structures/${structureA}`)
      .set("Cookie", adminA.cookie);
    expect(blocked.status).toBe(400);
    expect(String(blocked.body.message)).toMatch(/monitoring location/i);

    await request(app)
      .delete(`/api/v1/locations/${locationA}`)
      .set("Cookie", adminA.cookie)
      .expect(200);

    const allowed = await request(app)
      .delete(`/api/v1/structures/${structureA}`)
      .set("Cookie", adminA.cookie);
    expect(allowed.status).toBe(200);
  });

  test("invalid input is rejected per field, not with a generic error", async () => {
    const res = await request(app)
      .post("/api/v1/structures")
      .set("Cookie", adminA.cookie)
      .send({
        projectId: projectA,
        name: "",
        code: "bad code with spaces",
        latitude: 999,
      });
    expect(res.status).toBe(400);
    const fields = (res.body.fields as { field: string }[]).map((f) => f.field);
    expect(fields).toContain("name");
    expect(fields).toContain("code");
    expect(fields).toContain("latitude");
  });

  test("unauthenticated requests are refused", async () => {
    await request(app).get("/api/v1/structures").expect(401);
    await request(app).post("/api/v1/structures").send({}).expect(401);
  });
});
