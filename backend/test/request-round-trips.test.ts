import request from "supertest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import app from "../src/app";
import prisma from "../src/config/prisma";
import { TINY_PNG } from "./fixtures/registration";

/**
 * How many database round trips a request costs BEFORE its route runs.
 *
 * The API's database is remote — Supabase, in another region — so every query
 * is a network round trip of hundreds of milliseconds, and sequential queries
 * add up linearly. Every authenticated request used to spend FIVE on
 * identifying the caller: the directory-only guard looked the user and their
 * membership up, `authenticate` looked the user up again, and the auth-context
 * resolver it then called looked both up a third time. From a developer's
 * machine that was about ten seconds per API call before the route had done
 * anything, which is what "the app is very slow" turned out to mean.
 *
 * The session is now loaded ONCE per request, in one query that carries the
 * memberships with it, and shared by every middleware that needs it. These
 * tests pin that number so it cannot creep back up one "harmless" lookup at a
 * time.
 */

const EMAIL = "round-trips@example.com";
const PASSWORD = "Password1!";

let cookie = "";
let userId = 0;
let tenantId = 0;
let ops: string[] = [];

function cookieHeader(raw: unknown): string {
  const c = Array.isArray(raw) ? raw.join(";") : typeof raw === "string" ? raw : "";
  if (!c) throw new Error("No auth cookies returned");
  return c;
}

async function cleanup() {
  const user = await prisma.user.findUnique({ where: { emailId: EMAIL }, select: { id: true } });
  if (!user) return;
  const memberships = await prisma.membership.findMany({ where: { userId: user.id }, select: { tenantId: true } });
  const wipe = (fn: () => Promise<unknown>) => fn().catch(() => undefined);
  await wipe(() => prisma.subscription.deleteMany({ where: { adminId: user.id } }));
  await wipe(() => prisma.refreshToken.deleteMany({ where: { userId: user.id } }));
  await wipe(() => prisma.auditLog.deleteMany({ where: { userId: user.id } }));
  await wipe(() => prisma.membership.deleteMany({ where: { userId: user.id } }));
  await wipe(() => prisma.user.delete({ where: { id: user.id } }));
  for (const m of memberships) await wipe(() => prisma.tenant.delete({ where: { id: m.tenantId } }));
}

beforeAll(async () => {
  await prisma.$connect();
  await cleanup();
  await request(app).post("/api/v1/register/admin").send({
    companyName: `Round Trips Org ${Date.now()}`,
    companyLogo: TINY_PNG,
    firstName: "Round",
    lastName: "Trips",
    emailId: EMAIL,
    phoneNo: "1234567890",
    password: PASSWORD,
  });
  const user = await prisma.user.update({
    where: { emailId: EMAIL },
    data: { isMailVerified: "true_", isUserVerified: "true_" },
  });
  userId = user.id;
  const login = await request(app).post("/api/v1/commonLogin").send({ username: EMAIL, password: PASSWORD });
  expect(login.status, JSON.stringify(login.body)).toBe(200);
  cookie = cookieHeader(login.headers["set-cookie"]);
  tenantId = (await prisma.membership.findFirstOrThrow({ where: { userId } })).tenantId;

  // Counts Prisma operations. Registered once; the array is reset per test.
  prisma.$use(async (params, next) => {
    ops.push(`${params.model ?? "raw"}.${params.action}`);
    return next(params);
  });
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

async function opsFor(path: string): Promise<{ status: number; ops: string[] }> {
  ops = [];
  const res = await request(app).get(path).set("Cookie", cookie);
  return { status: res.status, ops: [...ops] };
}

describe("database round trips per request", () => {
  test("identifying the caller costs one query, whatever the route", async () => {
    // A route that does nothing of its own, so every query counted is the
    // middleware chain's. 404 is fine: the chain has already run.
    const r = await opsFor("/api/v1/nonexistent-route");
    expect(r.status).toBe(404);
    expect(r.ops, r.ops.join(", ")).toEqual(["User.findUnique"]);
  });

  test("a list route pays for the session once, then only its own queries", async () => {
    const r = await opsFor("/api/v1/gateways");
    expect(r.status, r.ops.join(", ")).toBe(200);
    const session = r.ops.filter((o) => o.startsWith("User.") || o.startsWith("Membership."));
    expect(session, r.ops.join(", ")).toEqual(["User.findUnique"]);
    expect(r.ops.length, r.ops.join(", ")).toBeLessThanOrEqual(3);
  });

  test("the session's answer is unchanged: tenant, role and permissions resolve as before", async () => {
    const res = await request(app).get("/api/v1/me").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.tenant.id).toBe(tenantId);
    expect(res.body.data.role).toBe("ORGANIZATION_ADMIN");
    expect(res.body.data.permissions).toContain("GATEWAY_VIEW");
  });

  test("a disabled account is still refused, from the same single query", async () => {
    await prisma.user.update({ where: { id: userId }, data: { status: "false_" } });
    try {
      const r = await opsFor("/api/v1/gateways");
      expect(r.status).toBe(403);
      expect(r.ops).toEqual(["User.findUnique"]);
    } finally {
      await prisma.user.update({ where: { id: userId }, data: { status: "true_" } });
    }
  });
});
