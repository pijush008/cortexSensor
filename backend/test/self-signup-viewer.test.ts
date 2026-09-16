import { MembershipStatus, RoleKey, TenantStatus } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import request from "supertest";
import app from "../src/app";
import prisma from "../src/config/prisma";
import { resolveAuthContext } from "../src/modules/rbac/rbac.service";
import { hasPermission } from "../src/middleware/permissions";
import * as projectsService from "../src/modules/projects/projects.service";

/**
 * The self-service viewer: a Google sign-up belonging to no organization.
 *
 * Two properties are load-bearing and easy to break in opposite directions.
 *
 * It must see SOMETHING: an org-less session used to resolve to an empty
 * permission set, which left a real authenticated user with no page they were
 * allowed to open and produced an application that rendered nothing at all.
 *
 * It must see ONLY the directory: names, ids, locations and stakeholders —
 * never a project's measurements, dashboard or exports. The narrow grant
 * (PROJECT_BROWSE) must not drift into the wide one (PROJECT_VIEW).
 *
 * And the branch is shared with a case that must NOT get the grant: a member of
 * a suspended organization also has no active membership, and must keep no
 * permissions rather than gaining the run of the platform when their
 * subscription lapses.
 */

const VIEWER_EMAIL = "selfsignup-viewer@example.com";
const LAPSED_EMAIL = "selfsignup-lapsed@example.com";

let viewerId = 0;
let lapsedId = 0;
let lapsedTenantId = 0;

async function makeUser(email: string, userType: "viewer" | "contractor") {
  const u = await prisma.user.create({
    data: {
      userType: userType as never,
      firstName: "Test",
      lastName: "Person",
      emailId: email,
      phoneNo: "",
      password: "x".repeat(60),
      status: "true_" as never,
      isMailVerified: "true_" as never,
      isUserVerified: "true_" as never,
      isDelete: "false_" as never,
    },
    select: { id: true },
  });
  return u.id;
}

beforeAll(async () => {
  await prisma.user.deleteMany({
    where: { emailId: { in: [VIEWER_EMAIL, LAPSED_EMAIL] } },
  });

  viewerId = await makeUser(VIEWER_EMAIL, "viewer");

  // Someone who DOES belong to an organization, but whose organization is
  // suspended — the lapsed-customer case that shares the no-active-membership
  // branch with the viewer.
  lapsedId = await makeUser(LAPSED_EMAIL, "contractor");
  const tenant = await prisma.tenant.create({
    data: {
      publicId: `lapsed-${Date.now()}`,
      name: "Lapsed Org",
      slug: `lapsed-${Date.now()}`,
      status: TenantStatus.suspended,
    },
    select: { id: true },
  });
  lapsedTenantId = tenant.id;
  const role = await prisma.role.findFirst({
    where: { key: RoleKey.VIEWER },
    select: { id: true },
  });
  await prisma.membership.create({
    data: {
      userId: lapsedId,
      tenantId: tenant.id,
      roleId: role!.id,
      status: MembershipStatus.active,
    },
  });
});

afterAll(async () => {
  await prisma.membership.deleteMany({ where: { tenantId: lapsedTenantId } });
  await prisma.tenant.deleteMany({ where: { id: lapsedTenantId } });
  await prisma.user.deleteMany({
    where: { emailId: { in: [VIEWER_EMAIL, LAPSED_EMAIL] } },
  });
});

describe("an organization-less session", () => {
  test("may browse the project directory", async () => {
    const ctx = await resolveAuthContext(viewerId);
    expect(ctx.tenantId).toBeNull();
    expect(ctx.isPlatformAdmin).toBe(false);
    expect([...ctx.permissions]).toEqual(["PROJECT_BROWSE"]);
  });

  test("may NOT view a project's data", async () => {
    const ctx = await resolveAuthContext(viewerId);
    // The whole reason the two permissions are separate.
    expect(ctx.permissions.has("PROJECT_VIEW")).toBe(false);
    expect(ctx.permissions.has("REPORT_EXPORT")).toBe(false);
    expect(ctx.permissions.has("SENSOR_VIEW")).toBe(false);
  });
});

describe("a member of a SUSPENDED organization", () => {
  test("keeps no permissions and does not gain the directory", async () => {
    const ctx = await resolveAuthContext(lapsedId);
    // A lapsed subscription must not become a wider grant than an active one.
    expect([...ctx.permissions]).toEqual([]);
    expect(ctx.permissions.has("PROJECT_BROWSE")).toBe(false);
    expect(ctx.tenantId).toBeNull();
  });
});

describe("the legacy route matrix", () => {
  test("lets a viewer reach the directory listing only", () => {
    expect(hasPermission("viewer" as never, "BROWSE_PROJECTS")).toBe(true);
    expect(hasPermission("viewer" as never, "VIEW_PROJECTS")).toBe(false);
    expect(hasPermission("viewer" as never, "MANAGE_PROJECTS")).toBe(false);
    expect(hasPermission("viewer" as never, "PROJECT_REPORTS")).toBe(false);
  });

  test("does not narrow any existing role", () => {
    for (const role of ["superadmin", "admin", "contractor", "authority"]) {
      expect(hasPermission(role as never, "BROWSE_PROJECTS")).toBe(true);
    }
  });
});

describe("the project directory", () => {
  test("is not filtered by ownership for a viewer", async () => {
    const total = await prisma.project.count({
      where: { isDelete: false, isRegistered: true },
    });
    if (total === 0) return; // nothing seeded to compare against

    const listed = await projectsService.getProjectList(String(viewerId), {
      page: 1,
      limit: 1000,
    } as never);
    // A viewer owns no project, so any ownership filter would yield zero.
    expect(listed.totalItems).toBe(total);
  });

  test("matches on location, not only name and id", async () => {
    const withLocation = await prisma.project.findFirst({
      where: { isDelete: false, isRegistered: true, projectLocation: { not: "" } },
      select: { projectLocation: true },
    });
    if (!withLocation?.projectLocation) return;

    const term = withLocation.projectLocation.slice(0, 4);
    const listed = await projectsService.getProjectList(String(viewerId), {
      page: 1,
      limit: 1000,
      searchTerm: term,
    } as never);
    expect(listed.totalItems).toBeGreaterThan(0);
  });
});

/**
 * The global confinement.
 *
 * A large number of routes are guarded by `authenticate` alone. That was merely
 * loose while every account was created by an administrator; with self-service
 * sign-up it would mean anyone holding a Google account could read measurements
 * and edit projects. These assert the confinement over the real HTTP stack,
 * because the whole point is that it does not depend on the route.
 */
describe("a directory-only session over HTTP", () => {
  let cookie = "";

  beforeAll(async () => {
    const { signAccessToken } = await import("../src/utils/jwt");
    cookie = `shm_access=${await signAccessToken(viewerId)}`;
  });

  test("may read the project directory", async () => {
    const res = await request(app)
      .get(`/api/projects/${viewerId}`)
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
  });

  test("may read its own identity, so the app can render and sign out", async () => {
    const res = await request(app).get("/api/me").set("Cookie", cookie);
    expect(res.status).toBe(200);
  });

  test.each([
    ["get", "/api/beamNodeData"],
    ["get", "/api/beamGetSensorData"],
    ["get", "/api/channelList/1"],
    ["get", "/api/getEmailSetting/abc"],
    ["get", "/api/project/1"],
    ["get", "/api/subscription/plan"],
    ["get", "/api/admin/sensor/1"],
  ])("cannot read %s %s", async (method, path) => {
    const r = await request(app)[method as "get"](path).set("Cookie", cookie);
    expect(r.status).toBe(403);
  });

  test.each([
    ["post", "/api/"],
    ["post", "/api/project_graph"],
    ["post", "/api/device_graph"],
    ["post", "/api/sensor_graph"],
  ])("cannot reach the dashboard graph %s %s", async (method, path) => {
    const r = await request(app)[method as "post"](path).set("Cookie", cookie).send({});
    expect(r.status).toBe(403);
  });

  test.each([
    ["patch", "/api/project/1"],
    ["patch", "/api/channelList"],
    ["put", "/api/channelSwap"],
    ["patch", "/api/emailSetting"],
    ["delete", "/api/beamNodeData"],
    ["delete", "/api/project/1/stakeholder/contractor"],
  ])("cannot write %s %s", async (method, path) => {
    const r = await request(app)[method as "patch"](path).set("Cookie", cookie).send({});
    // Refused before the handler, so nothing is mutated.
    expect(r.status).toBe(403);
  });

  test("may always end its own session", async () => {
    const r = await request(app).post("/api/logout").set("Cookie", cookie);
    expect(r.status).toBeLessThan(400);
  });
});
