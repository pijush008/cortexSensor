import bcrypt from "bcryptjs";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import app from "../src/app";
import prisma from "../src/config/prisma";
import { TINY_PNG } from "./fixtures/registration";
import { deleteEmptyTenants, tenantIdsFor } from "./fixtures/tenants";
import { OPERATOR_TENANT_SLUG } from "../src/modules/rbac/tenant.provisioning";

/**
 * Assigning a contractor or an authority to a project.
 *
 * An administrator names an email; the person who holds it proves control with
 * a mailed code and chooses their own password. What this suite pins down is
 * the part that is easy to get wrong: that an invitation confers nothing until
 * it is accepted, that a code cannot be guessed or bypassed, and that a
 * platform operator — who has no organization of their own — has to say which
 * organization they are acting for.
 *
 * Mail is deliberately unconfigured in test/setup, so createInvitation returns
 * the code and link it would otherwise have emailed. That escape hatch exists
 * for developers; here it is what makes the flow observable at all.
 */

const ADMIN_EMAIL = "inv-admin@example.com";
const OPERATOR_EMAIL = "inv-operator@example.com";
const CONTRACTOR_EMAIL = "inv-contractor@example.com";
const AUTHORITY_EMAIL = "inv-authority@example.com";
const RETURNING_EMAIL = "inv-returning@example.com";
const OUTSIDER_EMAIL = "inv-outsider@example.com";
/** Registers as an admin, then gets brought onto someone else's project. */
const ROLE_SWAP_EMAIL = "inv-role-swap@example.com";
const PASSWORD = "Password1!";
const INVITEE_PASSWORD = "ChosenByMe9!";

const ALL_EMAILS = [
  ADMIN_EMAIL,
  OPERATOR_EMAIL,
  CONTRACTOR_EMAIL,
  AUTHORITY_EMAIL,
  RETURNING_EMAIL,
  OUTSIDER_EMAIL,
  ROLE_SWAP_EMAIL,
];

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

/** Registers an organization through the real signup path. */
async function registerAdmin(email: string) {
  const res = await request(app)
    .post("/api/register/admin")
    .send({
      companyName: `Inv Org ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      companyLogo: TINY_PNG,
      firstName: "Inv",
      lastName: "Admin",
      emailId: email,
      phoneNo: "1234567890",
      password: PASSWORD,
    });
  expect([200, 400]).toContain(res.status);

  const user = await prisma.user.findUnique({ where: { emailId: email } });
  expect(user).toBeTruthy();
  await prisma.user.update({
    where: { id: user!.id },
    data: { isMailVerified: "true_", isUserVerified: "true_" },
  });

  const membership = await prisma.membership.findFirst({
    where: { userId: user!.id },
    select: { tenantId: true },
  });
  expect(membership).toBeTruthy();

  return { userId: user!.id, tenantId: membership!.tenantId };
}

/**
 * A platform operator, created directly rather than registered: there is no
 * signup path for one, which is the whole reason they hold no membership.
 */
async function createOperator(email: string) {
  const user = await prisma.user.create({
    data: {
      userType: "superadmin",
      firstName: "Inv",
      lastName: "Operator",
      emailId: email,
      phoneNo: "1234567890",
      password: await bcrypt.hash(PASSWORD, 10),
      status: "true_" as never,
      isMailVerified: "true_" as never,
      isUserVerified: "true_" as never,
      isDelete: "false_" as never,
      isPlatformAdmin: true,
    },
  });
  return user.id;
}

/**
 * Move the fixture admin onto a plan with no structure ceiling.
 *
 * The signup default is Starter, which allows three structures — fewer than
 * this suite creates. The limit itself is real and covered by the billing
 * suites; here it would only mean the sixth test failing for a reason that has
 * nothing to do with invitations.
 */
async function putOnUnlimitedPlan(adminId: number) {
  const plan = await prisma.billingPlan.findFirst({
    where: { maxStructures: null },
    select: { id: true },
  });
  if (!plan) throw new Error("No unlimited plan is seeded");

  await prisma.subscription.upsert({
    where: { adminId },
    update: { planId: plan.id, status: "active" },
    create: { adminId, planId: plan.id, status: "active" },
  });
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
    where: { OR: [{ createdBy: { in: ids } }] },
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
  await prisma.tempOtp.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await prisma.auditLog.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await prisma.membership.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await prisma.subscription.deleteMany({ where: { adminId: { in: ids } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
  await deleteEmptyTenants(tenantIds);
}

let adminCookie = "";
let adminTenantId = 0;
let operatorCookie = "";
let operatorId = 0;

beforeAll(async () => {
  await prisma.$connect();
  await cleanup();

  const admin = await registerAdmin(ADMIN_EMAIL);
  adminTenantId = admin.tenantId;
  adminCookie = await login(ADMIN_EMAIL);
  await putOnUnlimitedPlan(admin.userId);

  operatorId = await createOperator(OPERATOR_EMAIL);
  operatorCookie = await login(OPERATOR_EMAIL);
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

/** Creates a project owned by the registered admin and returns its id. */
async function createProject(name: string, body: Record<string, unknown> = {}) {
  const res = await request(app)
    .post("/api/project")
    .set("Cookie", adminCookie)
    .send({
      projectName: `${name} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      projectLocation: "Kolkata",
      ...body,
    });
  expect(res.status).toBe(200);
  return res.body;
}

async function invite(
  projectId: number,
  role: "contractor" | "authority",
  emailId: string,
  cookie = adminCookie,
) {
  return request(app)
    .post(`/api/project/${projectId}/invitation`)
    .set("Cookie", cookie)
    .send({ role, emailId });
}

/** The administrator enters the code the invitee read back to them. */
function verifyCode(
  projectId: number,
  invitationId: number,
  otp: string,
  cookie = adminCookie,
) {
  return request(app)
    .post(`/api/project/${projectId}/invitation/${invitationId}/verify`)
    .set("Cookie", cookie)
    .send({ otp });
}

/** The administrator records the account and it is created. */
function completeInvitation(
  projectId: number,
  invitationId: number,
  body: Record<string, unknown>,
  cookie = adminCookie,
) {
  return request(app)
    .post(`/api/project/${projectId}/invitation/${invitationId}/complete`)
    .set("Cookie", cookie)
    .send(body);
}

describe("adding a contractor", () => {
  test("code, then details: creates the account and assigns the project", async () => {
    const project = await createProject("Invite Happy Path");
    const projectId = project.projectId;

    const created = await invite(projectId, "contractor", CONTRACTOR_EMAIL);
    expect(created.status).toBe(200);
    const { devOtp, invitationId } = created.body.data;
    expect(devOtp).toMatch(/^\d{6}$/);
    // No link is issued at all: there is nothing for the invitee to click.
    expect(created.body.data.devAcceptUrl).toBeUndefined();

    // Nothing is conferred yet.
    const beforeAccept = await prisma.project.findUnique({
      where: { id: projectId },
      select: { contractorId: true },
    });
    expect(beforeAccept?.contractorId).toBeNull();
    expect(
      await prisma.user.findUnique({ where: { emailId: CONTRACTOR_EMAIL } }),
    ).toBeNull();

    const verify = await verifyCode(projectId, invitationId, devOtp);
    expect(verify.status).toBe(200);
    expect(verify.body.data.needsProfile).toBe(true);

    const complete = await completeInvitation(projectId, invitationId, {
      firstName: "Ravi",
      lastName: "Kumar",
      companyName: "Acme Infra",
      phoneNo: "9876543210",
      password: INVITEE_PASSWORD,
    });
    expect(complete.status).toBe(200);
    expect(complete.body.data.accountCreated).toBe(true);

    const user = await prisma.user.findUnique({
      where: { emailId: CONTRACTOR_EMAIL },
    });
    expect(user).toBeTruthy();
    expect(user!.userType).toBe("contractor");
    expect(user!.firstName).toBe("Ravi");
    expect(user!.companyName).toBe("Acme Infra");

    // In the project's organization, not one derived from the inviter.
    const membership = await prisma.membership.findFirst({
      where: { userId: user!.id },
      select: { tenantId: true, status: true },
    });
    expect(membership?.tenantId).toBe(adminTenantId);
    expect(membership?.status).toBe("active");

    const afterAccept = await prisma.project.findUnique({
      where: { id: projectId },
      select: { contractorId: true },
    });
    expect(afterAccept?.contractorId).toBe(user!.id);

    // The password the ADMIN set is the one that signs them in, and they are
    // not made to change it.
    const signIn = await request(app)
      .post("/api/commonLogin")
      .send({ username: CONTRACTOR_EMAIL, password: INVITEE_PASSWORD });
    expect(signIn.status).toBe(200);

    // The invitation is spent: it cannot be completed a second time.
    const replay = await completeInvitation(projectId, invitationId, {});
    expect(replay.status).toBe(404);
  });

  test("an existing user is added without being asked for details again", async () => {
    // Onboarded once.
    const first = await createProject("Returning First");
    const firstInvite = await invite(first.projectId, "authority", RETURNING_EMAIL);
    await verifyCode(
      first.projectId,
      firstInvite.body.data.invitationId,
      firstInvite.body.data.devOtp,
    );
    await completeInvitation(first.projectId, firstInvite.body.data.invitationId, {
      firstName: "Asha",
      lastName: "Nair",
      companyName: "Nair Surveys",
      phoneNo: "9876500000",
      password: INVITEE_PASSWORD,
    });

    const before = await prisma.user.findUnique({
      where: { emailId: RETURNING_EMAIL },
      select: { id: true, password: true, companyName: true },
    });
    expect(before).toBeTruthy();

    // Added again, to a second project.
    const second = await createProject("Returning Second");
    const secondInvite = await invite(
      second.projectId,
      "authority",
      RETURNING_EMAIL,
    );

    const verify = await verifyCode(
      second.projectId,
      secondInvite.body.data.invitationId,
      secondInvite.body.data.devOtp,
    );
    expect(verify.status).toBe(200);
    // They already exist; the administrator is not asked to retype who they are.
    expect(verify.body.data.needsProfile).toBe(false);

    const complete = await completeInvitation(
      second.projectId,
      secondInvite.body.data.invitationId,
      {},
    );
    expect(complete.status).toBe(200);
    expect(complete.body.data.accountCreated).toBe(false);

    const after = await prisma.user.findUnique({
      where: { emailId: RETURNING_EMAIL },
      select: { id: true, password: true, companyName: true },
    });
    expect(after!.id).toBe(before!.id);
    expect(after!.password).toBe(before!.password);
    // Nor is anything about them overwritten.
    expect(after!.companyName).toBe(before!.companyName);

    const assigned = await prisma.project.findUnique({
      where: { id: second.projectId },
      select: { authorityId: true },
    });
    expect(assigned?.authorityId).toBe(before!.id);
  });
});

describe("resisting a guessed code", () => {
  test("five wrong codes lock the invitation, and the right code no longer works", async () => {
    const project = await createProject("Invite Brute Force");
    const created = await invite(project.projectId, "contractor", OUTSIDER_EMAIL);
    const { devOtp, invitationId } = created.body.data;

    const wrong = devOtp === "000000" ? "111111" : "000000";

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const res = await verifyCode(project.projectId, invitationId, wrong);
      expect(res.status).toBe(400);
    }

    // The cap is on the row, not merely on the request rate, so the CORRECT
    // code is refused too. Guessing does not become viable by guessing well.
    const withCorrect = await verifyCode(project.projectId, invitationId, devOtp);
    expect(withCorrect.status).toBe(403);

    const row = await prisma.projectInvitation.findUnique({
      where: { id: invitationId },
    });
    expect(row?.otpVerifiedAt).toBeNull();
    expect(row?.status).toBe("pending");
  });

  test("completion is refused when the code was never verified", async () => {
    const project = await createProject("Invite Skip Verify");
    const created = await invite(project.projectId, "contractor", OUTSIDER_EMAIL);

    const complete = await completeInvitation(
      project.projectId,
      created.body.data.invitationId,
      {
        firstName: "Not",
        lastName: "Verified",
        phoneNo: "9999999999",
        password: INVITEE_PASSWORD,
      },
    );
    expect(complete.status).toBe(403);

    expect(
      await prisma.user.findUnique({ where: { emailId: OUTSIDER_EMAIL } }),
    ).toBeNull();
  });

  test("revoked and expired invitations refuse the same way", async () => {
    const project = await createProject("Invite Revoked");
    const created = await invite(project.projectId, "contractor", OUTSIDER_EMAIL);
    const invitationId = created.body.data.invitationId;

    const revoke = await request(app)
      .delete(`/api/project/${project.projectId}/invitation/${invitationId}`)
      .set("Cookie", adminCookie);
    expect(revoke.status).toBe(200);

    const revoked = await verifyCode(
      project.projectId,
      invitationId,
      created.body.data.devOtp,
    );
    expect(revoked.status).toBe(404);
    const revokedMessage = revoked.body.message;

    const expiring = await invite(project.projectId, "authority", OUTSIDER_EMAIL);
    await prisma.projectInvitation.update({
      where: { id: expiring.body.data.invitationId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expired = await verifyCode(
      project.projectId,
      expiring.body.data.invitationId,
      expiring.body.data.devOtp,
    );
    expect(expired.status).toBe(404);
    expect(expired.body.message).toBe(revokedMessage);
  });

  test("an invitation cannot be reached through another project", async () => {
    const mine = await createProject("Invite Scope Mine");
    const other = await createProject("Invite Scope Other");
    const created = await invite(mine.projectId, "contractor", OUTSIDER_EMAIL);

    // Same id, wrong project: an administrator must not reach an invitation by
    // guessing a small integer under a project they happen to have access to.
    const res = await verifyCode(
      other.projectId,
      created.body.data.invitationId,
      created.body.data.devOtp,
    );
    expect(res.status).toBe(404);
  });

  test("a contractor cannot verify or complete an invitation", async () => {
    const project = await createProject("Invite Perm");
    const created = await invite(project.projectId, "contractor", OUTSIDER_EMAIL);

    // A user who is not an administrator at all.
    const outsider = await prisma.user.create({
      data: {
        userType: "contractor",
        firstName: "Out",
        lastName: "Sider",
        emailId: OUTSIDER_EMAIL,
        phoneNo: "9000000000",
        password: await bcrypt.hash(PASSWORD, 10),
        status: "true_" as never,
        isMailVerified: "true_" as never,
        isUserVerified: "true_" as never,
        isDelete: "false_" as never,
      },
    });
    const theirCookie = await login(OUTSIDER_EMAIL);

    const res = await verifyCode(
      project.projectId,
      created.body.data.invitationId,
      created.body.data.devOtp,
      theirCookie,
    );
    expect([403, 404]).toContain(res.status);

    await prisma.refreshToken.deleteMany({ where: { userId: outsider.id } });
    await prisma.membership.deleteMany({ where: { userId: outsider.id } });
    await prisma.user.delete({ where: { id: outsider.id } });
  });
});

describe("who a project belongs to", () => {
  test("an operator's project lands in the operator organization", async () => {
    const res = await request(app)
      .post("/api/project")
      .set("Cookie", operatorCookie)
      .send({
        projectName: `Operator Project ${Date.now()}`,
        projectLocation: "Kolkata",
        contractorEmail: AUTHORITY_EMAIL,
      });
    expect(res.status).toBe(200);

    const project = await prisma.project.findUnique({
      where: { id: res.body.projectId },
      select: { tenantId: true, createdBy: true },
    });
    expect(project?.createdBy).toBe(operatorId);

    // A platform operator holds no membership, so the project cannot land in
    // "their" organization the way an admin's does. It goes to the operator
    // organization, which is provisioned on first use and reused thereafter.
    const operatorTenant = await prisma.tenant.findUnique({
      where: { slug: OPERATOR_TENANT_SLUG },
      select: { id: true },
    });
    expect(operatorTenant).toBeTruthy();
    expect(project?.tenantId).toBe(operatorTenant!.id);

    // An invitee joins that same organization, not the operator's absence of one.
    const invitation = await prisma.projectInvitation.findFirst({
      where: { projectId: res.body.projectId },
    });
    expect(invitation?.tenantId).toBe(operatorTenant!.id);
    expect(invitation?.emailId).toBe(AUTHORITY_EMAIL);
    expect(invitation?.invitedBy).toBe(operatorId);
  });

  test("a second operator project reuses the same organization", async () => {
    const first = await request(app)
      .post("/api/project")
      .set("Cookie", operatorCookie)
      .send({
        projectName: `Operator Reuse A ${Date.now()}`,
        projectLocation: "Kolkata",
      });
    const second = await request(app)
      .post("/api/project")
      .set("Cookie", operatorCookie)
      .send({
        projectName: `Operator Reuse B ${Date.now()}`,
        projectLocation: "Kolkata",
      });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const [a, b] = await Promise.all([
      prisma.project.findUnique({
        where: { id: first.body.projectId },
        select: { tenantId: true },
      }),
      prisma.project.findUnique({
        where: { id: second.body.projectId },
        select: { tenantId: true },
      }),
    ]);
    // One organization, not one per project.
    expect(a?.tenantId).toBe(b?.tenantId);

    const count = await prisma.tenant.count({
      where: { slug: OPERATOR_TENANT_SLUG },
    });
    expect(count).toBe(1);
  });

  test("an ordinary admin's project lands in their own organization", async () => {
    // A second organization the admin has nothing to do with. The form no
    // longer offers a tenant field at all, but the endpoint is still public,
    // so a body naming someone else's organization must change nothing (§17).
    const otherTenant = await prisma.tenant.create({
      data: {
        publicId: `inv${Date.now()}`.slice(0, 30),
        name: `Inv Other Org ${Date.now()}`,
        slug: `inv-other-${Date.now()}`,
        status: "active",
      },
    });

    const res = await request(app)
      .post("/api/project")
      .set("Cookie", adminCookie)
      .send({
        projectName: `Admin Body Tenant ${Date.now()}`,
        projectLocation: "Kolkata",
        tenantId: otherTenant.id,
      });
    expect(res.status).toBe(200);

    const project = await prisma.project.findUnique({
      where: { id: res.body.projectId },
      select: { tenantId: true },
    });
    expect(project?.tenantId).toBe(adminTenantId);

    await prisma.project.delete({ where: { id: res.body.projectId } });
    await prisma.tenant.delete({ where: { id: otherTenant.id } });
  });
});

describe("an invitation confers nothing on its own", () => {
  test("an invited contractor has no access until they accept", async () => {
    const project = await createProject("Invite No Early Access");

    // Give the invited address an account already, so the only thing missing
    // is the acceptance itself rather than the user row.
    const outsider = await prisma.user.create({
      data: {
        userType: "contractor",
        firstName: "Out",
        lastName: "Sider",
        emailId: OUTSIDER_EMAIL,
        phoneNo: "9000000000",
        password: await bcrypt.hash(PASSWORD, 10),
        status: "true_" as never,
        isMailVerified: "true_" as never,
        isUserVerified: "true_" as never,
        isDelete: "false_" as never,
      },
    });

    const created = await invite(
      project.projectId,
      "contractor",
      OUTSIDER_EMAIL,
    );
    expect(created.status).toBe(200);

    const outsiderCookie = await login(OUTSIDER_EMAIL);
    const res = await request(app)
      .get(`/api/project/${project.projectId}`)
      .set("Cookie", outsiderCookie);
    expect([403, 404]).toContain(res.status);

    await prisma.projectInvitation.deleteMany({
      where: { projectId: project.projectId },
    });
    // Signing in above issued a refresh token, which holds a reference to the
    // row about to be removed.
    await prisma.refreshToken.deleteMany({ where: { userId: outsider.id } });
    await prisma.membership.deleteMany({ where: { userId: outsider.id } });
    await prisma.user.delete({ where: { id: outsider.id } });
  });
});

describe("assignment settles the role", () => {
  test("an existing account becomes the role it was assigned", async () => {
    // Registered as an admin of their own organization, then brought onto
    // somebody else's project as its contractor.
    const other = await registerAdmin(ROLE_SWAP_EMAIL);
    expect(
      (await prisma.user.findUnique({ where: { id: other.userId } }))?.userType,
    ).toBe("admin");

    const project = await createProject("Role Settles");
    const created = await invite(
      project.projectId,
      "contractor",
      ROLE_SWAP_EMAIL,
    );
    const invitationId = created.body.data.invitationId;

    const verify = await verifyCode(
      project.projectId,
      invitationId,
      created.body.data.devOtp,
    );
    expect(verify.status).toBe(200);
    // They already exist, so no details are asked for.
    expect(verify.body.data.needsProfile).toBe(false);

    const complete = await completeInvitation(
      project.projectId,
      invitationId,
      {},
    );
    expect(complete.status).toBe(200);

    // The role follows the assignment.
    const after = await prisma.user.findUnique({
      where: { id: other.userId },
      select: { userType: true },
    });
    expect(after?.userType).toBe("contractor");

    // Which is the point: assertProjectAccess matches role AND slot together,
    // so an account left as "admin" in a contractor's slot could not open the
    // project it had just been put on.
    const theirCookie = await login(ROLE_SWAP_EMAIL);
    const res = await request(app)
      .get(`/api/project/${project.projectId}`)
      .set("Cookie", theirCookie);
    expect(res.status).toBe(200);
  });

  test("a platform operator is never re-roled", async () => {
    const project = await createProject("Role Operator");
    const created = await invite(
      project.projectId,
      "authority",
      OPERATOR_EMAIL,
    );
    const invitationId = created.body.data.invitationId;

    await verifyCode(project.projectId, invitationId, created.body.data.devOtp);
    const complete = await completeInvitation(
      project.projectId,
      invitationId,
      {},
    );
    expect(complete.status).toBe(200);

    // Stripping "superadmin" from userType would lock the operator out of
    // every project on the deployment: assertProjectAccess short-circuits on
    // exactly that value.
    const after = await prisma.user.findUnique({
      where: { id: operatorId },
      select: { userType: true, isPlatformAdmin: true },
    });
    expect(after?.userType).toBe("superadmin");
    expect(after?.isPlatformAdmin).toBe(true);

    // And they are still assigned, which is what was asked for.
    expect(
      (await prisma.project.findUnique({ where: { id: project.projectId } }))
        ?.authorityId,
    ).toBe(operatorId);
  });
});
