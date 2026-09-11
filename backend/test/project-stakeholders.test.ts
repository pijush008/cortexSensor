import bcrypt from "bcryptjs";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import app from "../src/app";
import prisma from "../src/config/prisma";
import { TINY_PNG } from "./fixtures/registration";
import { deleteEmptyTenants, tenantIdsFor } from "./fixtures/tenants";

/**
 * Taking a contractor or an authority OFF a project.
 *
 * The interesting part is not clearing the column — it is deciding what that
 * says about the person's place in the organization. Someone removed from
 * their only project has no further business being a member; someone still
 * working on another project plainly does; and an organization's own admin
 * must never be evicted from their organization by being taken off one job.
 */

const ADMIN_EMAIL = "rm-admin@example.com";
const OTHER_ADMIN_EMAIL = "rm-other-admin@example.com";
const SOLO_EMAIL = "rm-solo@example.com";
const BUSY_EMAIL = "rm-busy@example.com";
const PASSWORD = "Password1!";
const INVITEE_PASSWORD = "ChosenByMe9!";

const ALL_EMAILS = [ADMIN_EMAIL, OTHER_ADMIN_EMAIL, SOLO_EMAIL, BUSY_EMAIL];

function cookieHeader(raw: unknown): string {
  const cookie = Array.isArray(raw) ? raw.join(";") : (raw as string);
  if (!cookie) throw new Error("No auth cookies returned");
  return cookie;
}

async function login(email: string, password = PASSWORD): Promise<string> {
  const res = await request(app)
    .post("/api/commonLogin")
    .send({ username: email, password });
  expect(res.status).toBe(200);
  return cookieHeader(res.headers["set-cookie"]);
}

async function registerAdmin(email: string) {
  const res = await request(app)
    .post("/api/register/admin")
    .send({
      companyName: `Rm Org ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      companyLogo: TINY_PNG,
      firstName: "Rm",
      lastName: "Admin",
      emailId: email,
      phoneNo: "1234567890",
      password: PASSWORD,
    });
  expect([200, 400]).toContain(res.status);

  const user = await prisma.user.findUnique({ where: { emailId: email } });
  await prisma.user.update({
    where: { id: user!.id },
    data: { isMailVerified: "true_", isUserVerified: "true_" },
  });

  const membership = await prisma.membership.findFirst({
    where: { userId: user!.id },
    select: { tenantId: true },
  });

  const plan = await prisma.billingPlan.findFirst({
    where: { maxStructures: null },
    select: { id: true },
  });
  await prisma.subscription.upsert({
    where: { adminId: user!.id },
    update: { planId: plan!.id, status: "active" },
    create: { adminId: user!.id, planId: plan!.id, status: "active" },
  });

  return { userId: user!.id, tenantId: membership!.tenantId };
}

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { emailId: { in: ALL_EMAILS } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length === 0) return;

  // Read before the memberships go: they are the only link back to the
  // organizations these fixtures created.
  const tenantIds = await tenantIdsFor(ids);

  const projects = await prisma.project.findMany({
    where: { createdBy: { in: ids } },
    select: { id: true },
  });
  const projectIds = projects.map((p) => p.id);

  await prisma.projectInvitation
    .deleteMany({ where: { projectId: { in: projectIds } } })
    .catch(() => {});
  await prisma.project
    .updateMany({
      where: { id: { in: projectIds } },
      data: { contractorId: null, authorityId: null },
    })
    .catch(() => {});
  await prisma.projectEmail
    .deleteMany({ where: { projectId: { in: projectIds } } })
    .catch(() => {});
  await prisma.project.deleteMany({ where: { id: { in: projectIds } } }).catch(() => {});
  await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await prisma.auditLog.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await prisma.membership.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await prisma.subscription.deleteMany({ where: { adminId: { in: ids } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
  await deleteEmptyTenants(tenantIds);
}

let adminCookie = "";
let adminId = 0;
let tenantId = 0;

beforeAll(async () => {
  await prisma.$connect();
  await cleanup();
  const admin = await registerAdmin(ADMIN_EMAIL);
  adminId = admin.userId;
  tenantId = admin.tenantId;
  adminCookie = await login(ADMIN_EMAIL);
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

async function createProject(name: string) {
  const res = await request(app)
    .post("/api/project")
    .set("Cookie", adminCookie)
    .send({
      projectName: `${name} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      projectLocation: "Kolkata",
    });
  expect(res.status).toBe(200);
  return res.body.projectId as number;
}

/** Invites somebody and walks them all the way through acceptance. */
async function assign(
  projectId: number,
  role: "contractor" | "authority",
  emailId: string,
  profile?: { firstName: string; lastName: string },
) {
  const created = await request(app)
    .post(`/api/project/${projectId}/invitation`)
    .set("Cookie", adminCookie)
    .send({ role, emailId });
  expect(created.status).toBe(200);

  const invitationId = created.body.data.invitationId;
  const verify = await request(app)
    .post(`/api/project/${projectId}/invitation/${invitationId}/verify`)
    .set("Cookie", adminCookie)
    .send({ otp: created.body.data.devOtp });
  expect(verify.status).toBe(200);

  const body = verify.body.data.needsProfile
    ? {
        firstName: profile?.firstName ?? "Sam",
        lastName: profile?.lastName ?? "Stone",
        phoneNo: "9876500000",
        password: INVITEE_PASSWORD,
      }
    : {};
  const complete = await request(app)
    .post(`/api/project/${projectId}/invitation/${invitationId}/complete`)
    .set("Cookie", adminCookie)
    .send(body);
  expect(complete.status).toBe(200);

  const user = await prisma.user.findUnique({ where: { emailId } });
  return user!.id;
}

function removeStakeholder(
  projectId: number,
  role: string,
  cookie = adminCookie,
) {
  return request(app)
    .delete(`/api/project/${projectId}/stakeholder/${role}`)
    .set("Cookie", cookie);
}

describe("removing a stakeholder", () => {
  test("clears the slot and drops a membership that is now unused", async () => {
    const projectId = await createProject("Remove Solo");
    const userId = await assign(projectId, "contractor", SOLO_EMAIL);

    expect(
      (
        await prisma.membership.findFirst({ where: { userId, tenantId } })
      )?.userId,
    ).toBe(userId);

    const res = await removeStakeholder(projectId, "contractor");
    expect(res.status).toBe(200);

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { contractorId: true },
    });
    expect(project?.contractorId).toBeNull();

    // They hold nothing else in this organization, so they are no longer part
    // of it.
    expect(
      await prisma.membership.findFirst({ where: { userId, tenantId } }),
    ).toBeNull();

    // The account itself survives: removal from a project is not removal from
    // the platform.
    const user = await prisma.user.findUnique({ where: { id: userId } });
    expect(user).toBeTruthy();
    expect(String(user!.status)).toBe("true_");
  });

  test("keeps the membership when they still hold another project", async () => {
    const first = await createProject("Remove Busy A");
    const second = await createProject("Remove Busy B");

    const userId = await assign(first, "contractor", BUSY_EMAIL);
    // Same person, different project, and a different role — the check must
    // look at BOTH columns, not just the one being cleared.
    await assign(second, "authority", BUSY_EMAIL);

    const res = await removeStakeholder(first, "contractor");
    expect(res.status).toBe(200);

    expect(
      (await prisma.project.findUnique({ where: { id: first } }))?.contractorId,
    ).toBeNull();
    expect(
      (await prisma.project.findUnique({ where: { id: second } }))?.authorityId,
    ).toBe(userId);

    // Still working here, so still a member.
    expect(
      await prisma.membership.findFirst({ where: { userId, tenantId } }),
    ).toBeTruthy();
  });

  test("never evicts an organization's own admin from their organization", async () => {
    const projectId = await createProject("Remove Own Admin");

    // The admin assigns THEMSELF as the authority on their own project.
    const created = await request(app)
      .post(`/api/project/${projectId}/invitation`)
      .set("Cookie", adminCookie)
      .send({ role: "authority", emailId: ADMIN_EMAIL });
    expect(created.status).toBe(200);

    const invitationId = created.body.data.invitationId;
    await request(app)
      .post(`/api/project/${projectId}/invitation/${invitationId}/verify`)
      .set("Cookie", adminCookie)
      .send({ otp: created.body.data.devOtp });
    const complete = await request(app)
      .post(`/api/project/${projectId}/invitation/${invitationId}/complete`)
      .set("Cookie", adminCookie)
      .send({});
    expect(complete.status).toBe(200);

    // Accepting must not have lowered the role they already held.
    const afterAccept = await prisma.membership.findFirst({
      where: { userId: adminId, tenantId },
      select: { role: { select: { key: true } } },
    });
    expect(afterAccept?.role.key).toBe("ORGANIZATION_ADMIN");

    const res = await removeStakeholder(projectId, "authority");
    expect(res.status).toBe(200);

    // Removed from the project, still the admin of their organization.
    expect(
      (await prisma.project.findUnique({ where: { id: projectId } }))
        ?.authorityId,
    ).toBeNull();
    const afterRemove = await prisma.membership.findFirst({
      where: { userId: adminId, tenantId },
      select: { role: { select: { key: true } } },
    });
    expect(afterRemove?.role.key).toBe("ORGANIZATION_ADMIN");
  });

  test("removing an empty slot is refused", async () => {
    const projectId = await createProject("Remove Empty");
    const res = await removeStakeholder(projectId, "contractor");
    expect(res.status).toBe(400);
  });

  test("an unknown role is refused", async () => {
    const projectId = await createProject("Remove Bad Role");
    const res = await removeStakeholder(projectId, "admin");
    expect(res.status).toBe(400);
  });

  test("a contractor cannot remove anyone", async () => {
    const projectId = await createProject("Remove By Contractor");
    await assign(projectId, "contractor", SOLO_EMAIL);

    const contractorCookie = await login(SOLO_EMAIL, INVITEE_PASSWORD);
    const res = await removeStakeholder(projectId, "contractor", contractorCookie);
    expect(res.status).toBe(403);

    // And the assignment is untouched.
    expect(
      (await prisma.project.findUnique({ where: { id: projectId } }))
        ?.contractorId,
    ).not.toBeNull();
  });

  test("an admin cannot remove a stakeholder from someone else's project", async () => {
    const projectId = await createProject("Remove Cross Tenant");
    await assign(projectId, "contractor", SOLO_EMAIL);

    await registerAdmin(OTHER_ADMIN_EMAIL);
    const otherCookie = await login(OTHER_ADMIN_EMAIL);

    const res = await removeStakeholder(projectId, "contractor", otherCookie);
    expect([403, 404]).toContain(res.status);
  });
});
