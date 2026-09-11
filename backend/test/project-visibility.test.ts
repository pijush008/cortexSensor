import request from "supertest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import app from "../src/app";
import prisma from "../src/config/prisma";
import { TINY_PNG } from "./fixtures/registration";
import { deleteEmptyTenants, tenantIdsFor } from "./fixtures/tenants";

/**
 * A project you just created has to be a project you can see.
 *
 * It was not. `createProject` wrote isRegistered: false, and every read path —
 * the list, the dashboard, the scheduled status sweep — requires
 * isRegistered: true. The only code that ever set it was `projectSetup`, the
 * legacy "attach a device" step, which nothing in the current frontend calls.
 * So every project created through the UI was filed as a draft that no screen
 * would ever show and no wizard would ever finish.
 */

const ADMIN_EMAIL = "vis-admin@example.com";
const PASSWORD = "Password1!";

function cookieHeader(raw: unknown): string {
  const cookie = Array.isArray(raw) ? raw.join(";") : (raw as string);
  if (!cookie) throw new Error("No auth cookies returned");
  return cookie;
}

let adminCookie = "";
let adminId = 0;

async function cleanup() {
  const user = await prisma.user.findUnique({
    where: { emailId: ADMIN_EMAIL },
    select: { id: true },
  });
  if (!user) return;

  // Read before the membership goes: it is the only link back to the
  // organization this fixture created.
  const tenantIds = await tenantIdsFor([user.id]);

  const projects = await prisma.project.findMany({
    where: { createdBy: user.id },
    select: { id: true },
  });
  const ids = projects.map((p) => p.id);

  await prisma.projectInvitation.deleteMany({ where: { projectId: { in: ids } } }).catch(() => {});
  await prisma.projectEmail.deleteMany({ where: { projectId: { in: ids } } }).catch(() => {});
  await prisma.project.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
  await prisma.refreshToken.deleteMany({ where: { userId: user.id } }).catch(() => {});
  await prisma.auditLog.deleteMany({ where: { userId: user.id } }).catch(() => {});
  await prisma.membership.deleteMany({ where: { userId: user.id } }).catch(() => {});
  await prisma.subscription.deleteMany({ where: { adminId: user.id } }).catch(() => {});
  await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  await deleteEmptyTenants(tenantIds);
}

beforeAll(async () => {
  await prisma.$connect();
  await cleanup();

  await request(app)
    .post("/api/register/admin")
    .send({
      companyName: `Vis Org ${Date.now()}`,
      companyLogo: TINY_PNG,
      firstName: "Vis",
      lastName: "Admin",
      emailId: ADMIN_EMAIL,
      phoneNo: "1234567890",
      password: PASSWORD,
    });

  const user = await prisma.user.findUnique({ where: { emailId: ADMIN_EMAIL } });
  adminId = user!.id;
  await prisma.user.update({
    where: { id: adminId },
    data: { isMailVerified: "true_", isUserVerified: "true_" },
  });

  const plan = await prisma.billingPlan.findFirst({
    where: { maxStructures: null },
    select: { id: true },
  });
  await prisma.subscription.upsert({
    where: { adminId },
    update: { planId: plan!.id, status: "active" },
    create: { adminId, planId: plan!.id, status: "active" },
  });

  const login = await request(app)
    .post("/api/commonLogin")
    .send({ username: ADMIN_EMAIL, password: PASSWORD });
  adminCookie = cookieHeader(login.headers["set-cookie"]);
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("a newly created project", () => {
  test("appears in the project list straight away", async () => {
    const projectName = `Visible Project ${Date.now()}`;

    const created = await request(app)
      .post("/api/project")
      .set("Cookie", adminCookie)
      .send({ projectName, projectLocation: "Kolkata" });
    expect(created.status).toBe(200);

    const list = await request(app)
      .get(`/api/projects/${adminId}`)
      .set("Cookie", adminCookie);
    expect(list.status).toBe(200);

    // The list is returned unwrapped under projectDetail, with the page of
    // rows in currentData — not under `data` like most other endpoints.
    const rows = list.body?.projectDetail?.currentData ?? [];
    const names = rows.map((p: { projectName: string }) => p.projectName);
    expect(names).toContain(projectName);
  });

  test("is reachable by its own id", async () => {
    const projectName = `Reachable Project ${Date.now()}`;
    const created = await request(app)
      .post("/api/project")
      .set("Cookie", adminCookie)
      .send({ projectName, projectLocation: "Kolkata" });
    expect(created.status).toBe(200);

    const detail = await request(app)
      .get(`/api/project/${created.body.projectId}`)
      .set("Cookie", adminCookie);
    expect(detail.status).toBe(200);
  });

  test("a second project cannot reuse the name", async () => {
    // The duplicate check also filters on isRegistered, so a draft-forever
    // project silently permitted unlimited projects with identical names.
    const projectName = `Duplicate Project ${Date.now()}`;
    const first = await request(app)
      .post("/api/project")
      .set("Cookie", adminCookie)
      .send({ projectName, projectLocation: "Kolkata" });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post("/api/project")
      .set("Cookie", adminCookie)
      .send({ projectName, projectLocation: "Kolkata" });
    expect(second.status).toBe(400);
    expect(second.body.message).toMatch(/already exists/i);
  });
});

describe("project names across organizations", () => {
  test("two organizations may each have a project with the same name", async () => {
    // A project name identifies a structure inside ONE organization. Two
    // unrelated customers both monitoring a bridge they each call "Kolkata"
    // is ordinary, and a platform that refuses the second is also telling the
    // second customer that somebody else already uses that name.
    const projectName = `Shared Name ${Date.now()}`;

    const mine = await request(app)
      .post("/api/project")
      .set("Cookie", adminCookie)
      .send({ projectName, projectLocation: "Kolkata" });
    expect(mine.status).toBe(200);

    // A second organization, with its own admin.
    const otherEmail = "vis-other-admin@example.com";
    await request(app)
      .post("/api/register/admin")
      .send({
        companyName: `Vis Other Org ${Date.now()}`,
        companyLogo: TINY_PNG,
        firstName: "Vis",
        lastName: "Other",
        emailId: otherEmail,
        phoneNo: "1234567890",
        password: PASSWORD,
      });
    const otherUser = await prisma.user.findUnique({
      where: { emailId: otherEmail },
    });
    await prisma.user.update({
      where: { id: otherUser!.id },
      data: { isMailVerified: "true_", isUserVerified: "true_" },
    });
    const plan = await prisma.billingPlan.findFirst({
      where: { maxStructures: null },
      select: { id: true },
    });
    await prisma.subscription.upsert({
      where: { adminId: otherUser!.id },
      update: { planId: plan!.id, status: "active" },
      create: { adminId: otherUser!.id, planId: plan!.id, status: "active" },
    });
    const otherLogin = await request(app)
      .post("/api/commonLogin")
      .send({ username: otherEmail, password: PASSWORD });
    const otherCookie = cookieHeader(otherLogin.headers["set-cookie"]);

    const theirs = await request(app)
      .post("/api/project")
      .set("Cookie", otherCookie)
      .send({ projectName, projectLocation: "Delhi" });
    expect(theirs.status).toBe(200);

    // Cleanup for this second organization.
    const theirTenants = await tenantIdsFor([otherUser!.id]);
    await prisma.project.deleteMany({ where: { createdBy: otherUser!.id } });
    await prisma.refreshToken.deleteMany({ where: { userId: otherUser!.id } });
    await prisma.auditLog.deleteMany({ where: { userId: otherUser!.id } });
    await prisma.membership.deleteMany({ where: { userId: otherUser!.id } });
    await prisma.subscription.deleteMany({ where: { adminId: otherUser!.id } });
    await prisma.user.delete({ where: { id: otherUser!.id } });
    await deleteEmptyTenants(theirTenants);
  });
});
