import { promises as fs } from "fs";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import app from "../src/app";
import prisma from "../src/config/prisma";
import { TINY_PNG, adminRegistration } from "./fixtures/registration";

/**
 * What an organization brings with it at registration, and what is refused.
 *
 * The upload rules matter more here than they would elsewhere, because
 * POST /register/admin is UNAUTHENTICATED. Without them it is an anonymous
 * write-to-disk endpoint, so these tests are the ones standing between that and
 * a validated one.
 */

const LOGO_DIR = "uploads/tenants";
const EMAILS: string[] = [];

/** A registration body for a fresh address, remembered for cleanup. */
function fresh(overrides: Record<string, unknown> = {}) {
  const body = adminRegistration(overrides as never);
  EMAILS.push(body.emailId);
  return body;
}

async function logoFiles(): Promise<string[]> {
  try {
    return await fs.readdir(LOGO_DIR);
  } catch {
    return [];
  }
}

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  const users = await prisma.user.findMany({
    where: { emailId: { in: EMAILS } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length > 0) {
    const memberships = await prisma.membership.findMany({
      where: { userId: { in: ids } },
      select: { tenantId: true },
    });
    const tenantIds = memberships.map((m) => m.tenantId);

    // Remove the logo files this suite wrote, so it does not grow the working
    // tree a little on every run.
    const tenants = await prisma.tenant.findMany({
      where: { id: { in: tenantIds } },
      select: { logoPath: true },
    });
    for (const t of tenants) {
      if (t.logoPath) await fs.unlink(t.logoPath).catch(() => {});
    }

    await prisma.subscription.deleteMany({ where: { adminId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: ids } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.membership.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    if (tenantIds.length > 0) {
      await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    }
  }
  await prisma.$disconnect();
});

describe("an organization registration", () => {
  test("stores the company name and logo on the TENANT, not the user", async () => {
    const body = fresh({ companyName: "Acme Structures Pvt Ltd" });

    const res = await request(app).post("/api/v1/register/admin").send(body);
    expect(res.status).toBe(200);

    const user = await prisma.user.findFirstOrThrow({
      where: { emailId: body.emailId },
    });
    const membership = await prisma.membership.findFirstOrThrow({
      where: { userId: user.id },
    });
    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { id: membership.tenantId },
    });

    // The organization is named after the COMPANY. It used to be named after
    // the person, because the name was derived from firstName + lastName.
    expect(tenant.name).toBe("Acme Structures Pvt Ltd");
    expect(tenant.logoPath).toMatch(/^uploads\/tenants\/[0-9a-f-]{36}\.png$/);

    // The logo belongs to the company; it is not copied onto the person.
    expect(user.profileImage).toBeNull();

    // And the bytes are really on disk.
    await expect(fs.access(tenant.logoPath as string)).resolves.toBeUndefined();
  });

  test("is refused without a company name", async () => {
    const { companyName, ...body } = fresh();
    void companyName;

    const res = await request(app).post("/api/v1/register/admin").send(body);
    expect(res.status).toBe(400);
    expect(String(res.body.message)).toMatch(/company name/i);
  });

  test("is refused without a logo", async () => {
    const { companyLogo, ...body } = fresh();
    void companyLogo;

    const res = await request(app).post("/api/v1/register/admin").send(body);
    expect(res.status).toBe(400);
    expect(String(res.body.message)).toMatch(/logo/i);
  });
});

describe("the logo upload rules", () => {
  test("refuses bytes that are not the image type they claim, and writes nothing", async () => {
    // The check that matters. A `data:image/png` prefix is written by whoever
    // is calling; only the bytes are evidence. Here they are an SVG — the one
    // format deliberately excluded, since uploads are served from our origin.
    const svg = Buffer.from("<svg onload=alert(1)></svg>").toString("base64");
    const before = await logoFiles();

    const res = await request(app)
      .post("/api/v1/register/admin")
      .send(fresh({ companyLogo: `data:image/png;base64,${svg}` }));

    expect(res.status).toBe(400);
    expect(String(res.body.message)).toMatch(/png|jpg|webp/i);

    // No partial write: a rejected upload must not leave a file behind.
    expect(await logoFiles()).toEqual(before);
  });

  test("refuses an image over the size cap", async () => {
    // A real PNG header followed by padding, so it fails on SIZE rather than on
    // the signature — otherwise this would pass for the wrong reason.
    const header = Buffer.from(TINY_PNG.split(",")[1], "base64");
    const oversized = Buffer.concat([header, Buffer.alloc(700 * 1024, 0x41)]);

    const res = await request(app)
      .post("/api/v1/register/admin")
      .send(fresh({ companyLogo: `data:image/png;base64,${oversized.toString("base64")}` }));

    expect(res.status).toBe(400);
    expect(String(res.body.message)).toMatch(/too large/i);
  });

  test("refuses something that is not a data URI at all", async () => {
    const res = await request(app)
      .post("/api/v1/register/admin")
      .send(fresh({ companyLogo: "https://example.com/logo.png" }));

    expect(res.status).toBe(400);
  });

  test("the company name cannot influence the stored filename", async () => {
    // saveBase64Image interpolates a caller-supplied prefix into the filename;
    // the strict helper never does. This pins that difference.
    const body = fresh({ companyName: "../../etc/passwd" });

    const res = await request(app).post("/api/v1/register/admin").send(body);
    expect(res.status).toBe(200);

    const user = await prisma.user.findFirstOrThrow({
      where: { emailId: body.emailId },
    });
    const membership = await prisma.membership.findFirstOrThrow({
      where: { userId: user.id },
    });
    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { id: membership.tenantId },
    });

    expect(tenant.logoPath).toMatch(/^uploads\/tenants\/[0-9a-f-]{36}\.png$/);
    expect(tenant.logoPath).not.toContain("..");
  });
});

describe("the profile image on the same unauthenticated route", () => {
  test("a crafted first name cannot write outside the uploads directory", async () => {
    // saveBase64Image put the caller's `firstName` straight into the filename,
    // so "../../../../tmp/evil" resolved to a path outside the app entirely —
    // and this route takes no credentials. Verified arithmetic before the fix:
    //   path.posix.join("uploads/users", "../../../../tmp/evil_uuid.png")
    //     -> "../../tmp/evil_uuid.png"
    const body = fresh({ firstName: "../../../../tmp/evil" });

    const res = await request(app)
      .post("/api/v1/register/admin")
      .send({ ...body, profileImage: TINY_PNG });

    expect(res.status).toBe(200);

    const user = await prisma.user.findFirstOrThrow({
      where: { emailId: body.emailId },
    });

    // Contained, and the traversal is gone from the name entirely.
    expect(user.profileImage).toMatch(/^uploads\/users\//);
    expect(user.profileImage).not.toContain("..");
    await expect(fs.access(user.profileImage as string)).resolves.toBeUndefined();
  });

  test("the stored extension comes from an allow-list, not the caller", async () => {
    // The extension was read straight out of the data URI, so `image/php`
    // produced a .php file and `image/html` an .html one.
    const payload = Buffer.from("not really an image").toString("base64");
    const body = fresh();

    const res = await request(app)
      .post("/api/v1/register/admin")
      .send({ ...body, profileImage: `data:image/php;base64,${payload}` });

    expect(res.status).toBe(200);

    const user = await prisma.user.findFirstOrThrow({
      where: { emailId: body.emailId },
    });
    expect(user.profileImage).not.toMatch(/\.php$/);
    expect(user.profileImage).toMatch(/\.(png|jpg|webp|gif)$/);
  });
});

describe("members of an existing organization", () => {
  test("cannot be registered by a stranger", async () => {
    // The hole this closes: POST /register/contractor was unauthenticated and
    // took the target organization from `admin_id` in the BODY, so anyone could
    // grant themselves an active VIEWER membership inside any tenant by naming
    // its admin's id.
    const res = await request(app).post("/api/v1/register/contractor").send({
      firstName: "Un",
      lastName: "Invited",
      emailId: `stranger-${Date.now()}@example.com`,
      phoneNo: "1234567890",
      password: "Password1!",
      admin_id: "1",
    });

    expect(res.status).toBe(403);
    expect(String(res.body.message)).toMatch(/signed in/i);
  });

  test("are added to the INVITING admin's organization, whatever the body says", async () => {
    // Register and activate an admin, then add a member as them.
    const adminBody = fresh();
    expect(
      (await request(app).post("/api/v1/register/admin").send(adminBody)).status,
    ).toBe(200);
    const admin = await prisma.user.findFirstOrThrow({
      where: { emailId: adminBody.emailId },
    });
    await prisma.user.update({
      where: { id: admin.id },
      data: { isMailVerified: "true_" as never, isUserVerified: "true_" as never },
    });
    const adminMembership = await prisma.membership.findFirstOrThrow({
      where: { userId: admin.id },
    });

    const login = await request(app)
      .post("/api/v1/commonLogin")
      .send({ username: adminBody.emailId, password: adminBody.password });
    expect(login.status).toBe(200);
    const raw = login.headers["set-cookie"];
    const cookie = (Array.isArray(raw) ? raw : [])
      .map((c: string) => c.split(";")[0])
      .join("; ");

    const memberEmail = `member-${Date.now()}@example.com`;
    EMAILS.push(memberEmail);

    const res = await request(app)
      .post("/api/v1/register/contractor")
      .set("Cookie", cookie)
      .send({
        firstName: "Real",
        lastName: "Member",
        emailId: memberEmail,
        phoneNo: "1234567890",
        password: "Password1!",
        // Names somebody else's organization on purpose. It must be ignored.
        admin_id: "1",
        // Company fields are stripped for a member; no tenant is created.
        companyName: "Should Be Ignored",
        companyLogo: TINY_PNG,
      });

    expect(res.status).toBe(200);

    const member = await prisma.user.findFirstOrThrow({
      where: { emailId: memberEmail },
    });
    const memberMembership = await prisma.membership.findFirstOrThrow({
      where: { userId: member.id },
    });

    // The session decided the organization, not the body.
    expect(memberMembership.tenantId).toBe(adminMembership.tenantId);
    expect(await prisma.tenant.findFirst({ where: { name: "Should Be Ignored" } })).toBeNull();
  });
});
