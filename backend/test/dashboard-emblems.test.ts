import request from "supertest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import app from "../src/app";
import prisma from "../src/config/prisma";
import { TINY_PNG } from "./fixtures/registration";
import { deleteEmptyTenants, tenantIdsFor } from "./fixtures/tenants";

/**
 * The three parties' emblems on the project dashboard.
 *
 * The header shows a logo for the admin, the contractor and the authority. It
 * had been reading User.profileImage — a personal avatar nobody sets — while
 * the platform records what these emblems actually want in User.companyLogo,
 * written by the invitation flow and edited on the profile page. Every emblem
 * therefore fell back to initials even where a logo existed.
 *
 * The admin is the one exception: an organization admin supplies a logo when
 * they register, so theirs falls back to the organization's before initials.
 */

const ADMIN_EMAIL = "emb-admin@example.com";
const CONTRACTOR_EMAIL = "emb-contractor@example.com";
const AUTHORITY_EMAIL = "emb-authority@example.com";
const PASSWORD = "Password1!";
const ALL = [ADMIN_EMAIL, CONTRACTOR_EMAIL, AUTHORITY_EMAIL];

function cookieHeader(raw: unknown): string {
  const cookie = Array.isArray(raw) ? raw.join(";") : (raw as string);
  if (!cookie) throw new Error("No auth cookies returned");
  return cookie;
}

let adminCookie = "";
let adminId = 0;
let tenantId = 0;
let uniqueId = "";
let projectId = 0;

async function makeParty(email: string, role: "contractor" | "authority", opts: {
  companyLogo?: string | null;
  profileImage?: string | null;
}) {
  const bcrypt = await import("bcryptjs");
  return prisma.user.create({
    data: {
      userType: role,
      firstName: role === "contractor" ? "Con" : "Auth",
      lastName: "Party",
      emailId: email,
      phoneNo: "9000000000",
      password: await bcrypt.default.hash(PASSWORD, 10),
      status: "true_" as never,
      isMailVerified: "true_" as never,
      isUserVerified: "true_" as never,
      isDelete: "false_" as never,
      companyLogo: opts.companyLogo ?? null,
      profileImage: opts.profileImage ?? null,
    },
  });
}

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { emailId: { in: ALL } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length === 0) return;
  const tenantIds = await tenantIdsFor(ids);

  const projects = await prisma.project.findMany({
    where: { createdBy: { in: ids } },
    select: { id: true },
  });
  const pids = projects.map((p) => p.id);
  await prisma.projectInvitation.deleteMany({ where: { projectId: { in: pids } } }).catch(() => {});
  await prisma.projectEmail.deleteMany({ where: { projectId: { in: pids } } }).catch(() => {});
  await prisma.project.deleteMany({ where: { id: { in: pids } } }).catch(() => {});
  await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await prisma.auditLog.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await prisma.membership.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await prisma.subscription.deleteMany({ where: { adminId: { in: ids } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
  await deleteEmptyTenants(tenantIds);
}

beforeAll(async () => {
  await prisma.$connect();
  await cleanup();

  await request(app).post("/api/register/admin").send({
    companyName: `Emb Org ${Date.now()}`,
    companyLogo: TINY_PNG,
    firstName: "Emb",
    lastName: "Admin",
    emailId: ADMIN_EMAIL,
    phoneNo: "1234567890",
    password: PASSWORD,
  });
  const admin = await prisma.user.findUnique({ where: { emailId: ADMIN_EMAIL } });
  adminId = admin!.id;
  await prisma.user.update({
    where: { id: adminId },
    data: { isMailVerified: "true_", isUserVerified: "true_" },
  });
  const membership = await prisma.membership.findFirst({
    where: { userId: adminId },
    select: { tenantId: true },
  });
  tenantId = membership!.tenantId;

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

  // A contractor with a company logo, and an authority with only the old
  // personal avatar — so the fallback order is exercised, not just the happy path.
  const contractor = await makeParty(CONTRACTOR_EMAIL, "contractor", {
    companyLogo: "uploads/users/contractor-logo.png",
  });
  const authority = await makeParty(AUTHORITY_EMAIL, "authority", {
    profileImage: "uploads/users/authority-avatar.png",
  });

  const created = await request(app)
    .post("/api/project")
    .set("Cookie", adminCookie)
    .send({ projectName: `Emblem Project ${Date.now()}`, projectLocation: "Kolkata" });
  projectId = created.body.projectId;

  const project = await prisma.project.update({
    where: { id: projectId },
    data: { contractorId: contractor.id, authorityId: authority.id },
    select: { uniqueId: true },
  });
  uniqueId = project.uniqueId!;
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("the dashboard's party emblems", () => {
  test("a contractor's company logo is what the dashboard shows", async () => {
    const res = await request(app)
      .get(`/api/dashboard/${uniqueId}`)
      .set("Cookie", adminCookie);
    expect(res.status).toBe(200);

    const d = res.body.projectDetail[0];
    // The column the invitation flow and the profile editor actually write.
    expect(d.contractorImg).toContain("contractor-logo.png");
  });

  test("a personal avatar is still used when there is no company logo", async () => {
    const res = await request(app)
      .get(`/api/dashboard/${uniqueId}`)
      .set("Cookie", adminCookie);
    const d = res.body.projectDetail[0];
    expect(d.authorityImg).toContain("authority-avatar.png");
  });

  test("an admin with no logo of their own falls back to the organization's", async () => {
    const res = await request(app)
      .get(`/api/dashboard/${uniqueId}`)
      .set("Cookie", adminCookie);
    const d = res.body.projectDetail[0];

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { logoPath: true },
    });
    expect(tenant?.logoPath).toBeTruthy();
    // Registration collected it; an admin should not have to upload the same
    // logo twice for it to appear beside their own project.
    expect(d.adminImg).toContain(tenant!.logoPath!.split("/").pop()!);
  });

  test("an admin's own company logo wins over the organization's", async () => {
    await prisma.user.update({
      where: { id: adminId },
      data: { companyLogo: "uploads/users/admin-own-logo.png" },
    });

    const res = await request(app)
      .get(`/api/dashboard/${uniqueId}`)
      .set("Cookie", adminCookie);
    expect(res.body.projectDetail[0].adminImg).toContain("admin-own-logo.png");

    await prisma.user.update({ where: { id: adminId }, data: { companyLogo: null } });
  });

  test("the project detail endpoint agrees with the dashboard", async () => {
    // The same mapping lives in two places; they must not drift.
    const res = await request(app)
      .get(`/api/project/${projectId}`)
      .set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    const detail = res.body.data ?? res.body;
    expect(JSON.stringify(detail)).toContain("contractor-logo.png");
  });
});
