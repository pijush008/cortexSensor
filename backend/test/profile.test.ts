import bcrypt from "bcryptjs";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import app from "../src/app";
import prisma from "../src/config/prisma";
import { TINY_PNG } from "./fixtures/registration";
import { deleteEmptyTenants, tenantIdsFor } from "./fixtures/tenants";

/**
 * Editing your own account.
 *
 * The rule the whole surface rests on is that "your own" is decided by the
 * SESSION and never by anything the client sends. The password endpoint used to
 * take the target's id from the request body and check only that somebody was
 * signed in — which meant any account holder could aim password attempts at any
 * other account and read "Old password is incorrect" as a guessing oracle.
 */

const ME_EMAIL = "prof-me@example.com";
const OTHER_EMAIL = "prof-other@example.com";
const PASSWORD = "Password1!";
const OTHER_PASSWORD = "Different9!";

const ALL_EMAILS = [ME_EMAIL, OTHER_EMAIL];

function cookieHeader(raw: unknown): string {
  const cookie = Array.isArray(raw) ? raw.join(";") : (raw as string);
  if (!cookie) throw new Error("No auth cookies returned");
  return cookie;
}

async function makeUser(email: string, password: string) {
  return prisma.user.create({
    data: {
      userType: "contractor",
      firstName: "Before",
      lastName: "Change",
      emailId: email,
      phoneNo: "1111111111",
      password: await bcrypt.hash(password, 10),
      status: "true_" as never,
      isMailVerified: "true_" as never,
      isUserVerified: "true_" as never,
      isDelete: "false_" as never,
    },
  });
}

async function login(email: string, password: string): Promise<string> {
  const res = await request(app)
    .post("/api/commonLogin")
    .send({ username: email, password });
  expect(res.status).toBe(200);
  return cookieHeader(res.headers["set-cookie"]);
}

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { emailId: { in: ALL_EMAILS } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length === 0) return;
  const tenantIds = await tenantIdsFor(ids);

  await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await prisma.auditLog.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await prisma.membership.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
  await deleteEmptyTenants(tenantIds);
}

let meId = 0;
let otherId = 0;
let meCookie = "";

beforeAll(async () => {
  await prisma.$connect();
  await cleanup();
  meId = (await makeUser(ME_EMAIL, PASSWORD)).id;
  otherId = (await makeUser(OTHER_EMAIL, OTHER_PASSWORD)).id;
  meCookie = await login(ME_EMAIL, PASSWORD);
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("editing your own profile", () => {
  test("saves name, phone and company, and reports them back", async () => {
    const res = await request(app)
      .patch("/api/me")
      .set("Cookie", meCookie)
      .send({
        firstName: "Ravi",
        lastName: "Kumar",
        phoneNo: "9876543210",
        companyName: "Acme Infra",
      });
    expect(res.status).toBe(200);

    const row = await prisma.user.findUnique({ where: { id: meId } });
    expect(row?.firstName).toBe("Ravi");
    expect(row?.lastName).toBe("Kumar");
    expect(row?.phoneNo).toBe("9876543210");
    expect(row?.companyName).toBe("Acme Infra");

    // And the session's own view of itself agrees, so the page it feeds does
    // not have to guess what the save did.
    const me = await request(app).get("/api/me").set("Cookie", meCookie);
    expect(me.status).toBe(200);
    expect(me.body.data.user.firstName).toBe("Ravi");
    expect(me.body.data.user.phoneNo).toBe("9876543210");
    expect(me.body.data.user.companyName).toBe("Acme Infra");
  });

  test("stores the logo as a path, never the data URI", async () => {
    const res = await request(app)
      .patch("/api/me")
      .set("Cookie", meCookie)
      .send({ companyLogo: TINY_PNG });
    expect(res.status).toBe(200);

    const row = await prisma.user.findUnique({ where: { id: meId } });
    expect(row?.companyLogo).toBeTruthy();
    // A relative path on disk, matching Tenant.logoPath and Project.projectLogo.
    expect(row?.companyLogo).toMatch(/^uploads\/users\//);
    expect(row?.companyLogo).not.toContain("base64");

    const me = await request(app).get("/api/me").set("Cookie", meCookie);
    expect(me.body.data.user.companyLogoUrl).toContain("uploads/users/");
  });

  test("a rejected logo leaves the account unchanged", async () => {
    const before = await prisma.user.findUnique({ where: { id: meId } });

    const res = await request(app)
      .patch("/api/me")
      .set("Cookie", meCookie)
      .send({ firstName: "Should", companyLogo: "not-an-image" });
    expect(res.status).toBe(400);

    const after = await prisma.user.findUnique({ where: { id: meId } });
    expect(after?.firstName).toBe(before?.firstName);
    expect(after?.companyLogo).toBe(before?.companyLogo);
  });

  test("cannot edit anybody else, whatever the body says", async () => {
    const before = await prisma.user.findUnique({ where: { id: otherId } });

    const res = await request(app)
      .patch("/api/me")
      .set("Cookie", meCookie)
      .send({ id: otherId, userId: otherId, firstName: "Hijacked" });
    expect(res.status).toBe(200);

    // The caller's own row changed; the other account did not.
    const after = await prisma.user.findUnique({ where: { id: otherId } });
    expect(after?.firstName).toBe(before?.firstName);
    expect(
      (await prisma.user.findUnique({ where: { id: meId } }))?.firstName,
    ).toBe("Hijacked");
  });

  test("is refused without a session", async () => {
    const res = await request(app).patch("/api/me").send({ firstName: "Nobody" });
    expect(res.status).toBe(401);
  });
});

describe("changing your own password", () => {
  test("a signed-in user cannot aim it at another account", async () => {
    const before = await prisma.user.findUnique({ where: { id: otherId } });

    // Naming somebody else's id must not even attempt their password: the
    // response would otherwise say whether the guess was right.
    const res = await request(app)
      .post("/api/changePassword")
      .set("Cookie", meCookie)
      .send({
        userId: String(otherId),
        oldPassword: OTHER_PASSWORD,
        newPassword: "Hijacked9!",
      });

    // Whatever it answers, the other account's password is untouched.
    const after = await prisma.user.findUnique({ where: { id: otherId } });
    expect(after?.password).toBe(before?.password);
    expect(res.status).not.toBe(500);

    // And they can still sign in with what they had.
    const stillWorks = await request(app)
      .post("/api/commonLogin")
      .send({ username: OTHER_EMAIL, password: OTHER_PASSWORD });
    expect(stillWorks.status).toBe(200);
  });

  test("the wrong current password is refused", async () => {
    const res = await request(app)
      .post("/api/changePassword")
      .set("Cookie", meCookie)
      .send({ oldPassword: "NotMyPassword1!", newPassword: "Brand9New!" });
    expect(res.status).toBe(400);
  });

  test("the right current password changes it", async () => {
    const res = await request(app)
      .post("/api/changePassword")
      .set("Cookie", meCookie)
      .send({ oldPassword: PASSWORD, newPassword: "Brand9New!" });
    expect(res.status).toBe(200);

    const signIn = await request(app)
      .post("/api/commonLogin")
      .send({ username: ME_EMAIL, password: "Brand9New!" });
    expect(signIn.status).toBe(200);
  });
});
