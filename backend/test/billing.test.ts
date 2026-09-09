import request from "supertest";
import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import app from "../src/app";
import prisma from "../src/config/prisma";
import { assertWithinLimits, countUsage } from "../src/modules/subscription/subscription.service";

const EMAIL_P = "bill-admin-p@example.com"; // starts on Starter (trial)
const EMAIL_Q = "bill-admin-q@example.com"; // other tenant for invoice scoping
const EMAIL_SUPER = "bill-super@example.com";
const EMAIL_CONTRACTOR = "bill-contractor-p@example.com";
const PASSWORD = "Password1!";

const STAKES = [EMAIL_P, EMAIL_Q, EMAIL_SUPER, EMAIL_CONTRACTOR];

function cookieHeader(raw: unknown): string {
  const cookie = Array.isArray(raw)
    ? raw.join(";")
    : typeof raw === "string"
      ? raw
      : undefined;
  if (!cookie) throw new Error("No auth cookies returned");
  return cookie;
}

async function registerAndLogin(
  email: string,
  userType: "admin" | "contractor" | "authority",
  adminId?: string,
) {
  const reg = await request(app).post(`/api/register/${userType}`).send({
    firstName: "Bill",
    lastName: "Test",
    emailId: email,
    phoneNo: "1234567890",
    password: PASSWORD,
    admin_id: adminId ?? null,
  });
  expect([200, 400, 402]).toContain(reg.status);

  const user = await prisma.user.findUnique({ where: { emailId: email } });
  if (reg.status === 200) {
    expect(user).toBeTruthy();
    await prisma.user.update({
      where: { id: user!.id },
      data: { isMailVerified: "true_", isUserVerified: "true_" },
    });
  }

  const login = await request(app)
    .post("/api/commonLogin")
    .send({ username: email, password: PASSWORD });
  expect(login.status).toBe(200);
  return {
    userId: user?.id ?? -1,
    cookie: cookieHeader(login.headers["set-cookie"]),
    regStatus: reg.status,
  };
}

async function cleanupTestData() {
  const bills = await prisma.user.findMany({
    where: { emailId: { in: STAKES } },
    select: { id: true },
  });
  const ids = bills.map((u) => u.id);

  wrap(() =>
    prisma.invoice.deleteMany({
      where: { subscription: { adminId: { in: ids } } },
    }),
  );
  wrap(() => prisma.subscription.deleteMany({ where: { adminId: { in: ids } } }));
  wrap(() => prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } }));
  wrap(() => prisma.tempOtp.deleteMany({ where: { userId: { in: ids } } }));
  wrap(() => prisma.firebaseToken.deleteMany({ where: { userId: { in: ids } } }));
  wrap(() => prisma.auditLog.deleteMany({ where: { userId: { in: ids } } }));
  wrap(() =>
    prisma.project.deleteMany({
      where: { createdBy: { in: ids } },
    }),
  );
  wrap(() =>
    prisma.sensor.deleteMany({ where: { assignedAdmin: { in: ids } } }),
  );
  wrap(() =>
    prisma.user.deleteMany({ where: { parentId: { in: ids } } }),
  );
  wrap(() => prisma.user.deleteMany({ where: { id: { in: ids } } }));
}

function wrap(task: () => Promise<unknown>) {
  task().catch(() => {});
}

async function createDirectly(
  userType: "superadmin" | "admin" | "contractor",
  email: string,
  parentId = 0,
) {
  return prisma.user.create({
    data: {
      userType,
      parentId,
      firstName: "Bill",
      lastName: "Direct",
      emailId: email,
      phoneNo: "1234567890",
      isMailVerified: "true_",
      isUserVerified: "true_",
      password: "unused-hash",
      status: "true_",
      isDelete: "false_",
    },
  });
}

describe("billing (plan enrollment, enforcement, invoices)", () => {
  let adminP: { userId: number; cookie: string };
  let adminQ: { userId: number; cookie: string };
  let superCookie: string;

  beforeAll(async () => {
    await prisma.$connect();
    await cleanupTestData();

    // Admins register as usual → subscription is lazily created on first fetch.
    adminP = await registerAndLogin(EMAIL_P, "admin");
    adminQ = await registerAndLogin(EMAIL_Q, "admin");

    const superHasher = await bcrypt.hash(PASSWORD, 4);
    await prisma.user.create({
      data: {
        userType: "superadmin",
        parentId: 0,
        firstName: "Bill",
        lastName: "Super",
        emailId: EMAIL_SUPER,
        phoneNo: "1234567890",
        isMailVerified: "true_",
        isUserVerified: "true_",
        password: superHasher,
        status: "true_",
        isDelete: "false_",
      },
    });
    const loginSuper = await request(app)
      .post("/api/commonLogin")
      .send({ username: EMAIL_SUPER, password: PASSWORD });
    expect(loginSuper.status).toBe(200);
    superCookie = cookieHeader(loginSuper.headers["set-cookie"]);
  }, 60000);

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  }, 60000);

  test("admin gets a default Starter trial plan with zero usage", async () => {
    const res = await request(app)
      .get("/api/subscription/plan")
      .set("Cookie", adminP.cookie);
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.scheme).toBe("subscription");
    expect(data.plan.code).toBe("starter");
    expect(data.status).toBe("trial");
    expect(data.plan.limits.structures).toBe(3);
    expect(data.usage).toEqual({ structures: 0, sensors: 0, users: 0 });
  });

  test("contractor members cannot read the billing admin endpoint", async () => {
    const contractor = await registerAndLogin(EMAIL_CONTRACTOR, "contractor");
    const res = await request(app)
      .get("/api/subscription/plan")
      .set("Cookie", contractor.cookie);
    expect(res.status).toBe(403);
  });

  test("member-add beyond plan limit is blocked with 402", async () => {
    // Starter allows maxUsers = 5. Fill 5 seats directly, 6th via API is blocked.
    for (let i = 1; i <= 5; i++) {
      await createDirectly("contractor", `bill-seat-${i}@example.com`, adminP.userId);
    }
    const users = await prisma.user.count({
      where: { parentId: adminP.userId, isDelete: "false_" as never },
    });
    expect(users).toBe(5);

    const attempt = await request(app)
      .post("/api/register/contractor")
      .send({
        firstName: "Over",
        lastName: "Limit",
        emailId: "bill-overlimit@example.com",
        phoneNo: "1234567890",
        password: PASSWORD,
        admin_id: String(adminP.userId),
      });
    expect(attempt.status).toBe(402);

    const countAfter = await prisma.user.count({
      where: { parentId: adminP.userId, isDelete: "false_" as never },
    });
    expect(countAfter).toBe(5);
  });

  test("structure limit enforcement works at the service layer", async () => {
    // create 3 structures on Starter → 4th is over the limit.
    for (let i = 0; i < 3; i++) {
      await prisma.project.create({
        data: {
          projectName: `Bill-Proj-${i}`,
          projectLocation: "Test",
          startDate: new Date("2026-01-01"),
          status: "not_start",
          isDelete: false,
          createdBy: adminP.userId,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    }
    expect((await countUsage(adminP.userId)).structures).toBe(3);
    await expect(
      assertWithinLimits(adminP.userId, { structures: 1 }),
    ).rejects.toMatchObject({ statusCode: 402 });
    await expect(
      assertWithinLimits(adminP.userId, { structures: 0 }),
    ).resolves.toBeUndefined();
  });

  test("admin switches plan to Professional and gets an OPEN invoice", async () => {
    const before = await request(app)
      .get("/api/subscription/invoices")
      .set("Cookie", adminP.cookie);
    expect(before.status).toBe(200);
    // No invoices were generated so far (trial Starter creates none).
    expect(before.body.data).toHaveLength(0);

    const res = await request(app)
      .post("/api/subscription/plan")
      .set("Cookie", adminP.cookie)
      .send({ planCode: "professional" });
    expect(res.status).toBe(200);
    expect(res.body.plan).toBe("professional");

    const plan = await request(app)
      .get("/api/subscription/plan")
      .set("Cookie", adminP.cookie);
    expect(plan.status).toBe(200);
    expect(plan.body.data.plan.code).toBe("professional");
    expect(plan.body.data.plan.limits.structures).toBe(20);
    expect(plan.body.data.status).toBe("active");

    const invoices = await request(app)
      .get("/api/subscription/invoices")
      .set("Cookie", adminP.cookie);
    expect(invoices.body.data).toHaveLength(1);
    expect(invoices.body.data[0].status).toBe("OPEN");
  });

  test("invoice CSV download is scoped to the owning admin", async () => {
    const invoices = await request(app)
      .get("/api/subscription/invoices")
      .set("Cookie", adminP.cookie);
    const invoiceNo = invoices.body.data[0].invoiceNo as string;
    expect(invoiceNo).toBeTruthy();

    const own = await request(app)
      .post(`/api/subscription/invoices/${invoiceNo}/download`)
      .set("Cookie", adminP.cookie);
    expect(own.status).toBe(200);
    expect(own.headers["content-type"]).toContain("text/csv");
    expect(own.text).toContain(invoiceNo);
    expect(own.text).toContain("Professional");

    // Another admin must not be able to pull this invoice.
    const other = await request(app)
      .post(`/api/subscription/invoices/${invoiceNo}/download`)
      .set("Cookie", adminQ.cookie);
    expect(other.status).toBe(404);
  });

  test("superadmin gets a complimentary plan and cannot switch", async () => {
    const plan = await request(app)
      .get("/api/subscription/plan")
      .set("Cookie", superCookie);
    expect(plan.status).toBe(200);
    expect(plan.body.data.scheme).toBe("complimentary");
    expect(plan.body.data.plan.priceLabel).toBe("FREE");

    const switchRes = await request(app)
      .post("/api/subscription/plan")
      .set("Cookie", superCookie)
      .send({ planCode: "enterprise" });
    expect(switchRes.status).toBe(400);
  });
});