import { afterAll, beforeAll, describe, expect, test } from "vitest";
import prisma from "../src/config/prisma";
import { ingestMeasurements } from "../src/modules/measurements/ingest.service";
import { getSeries, getLatestReadings } from "../src/modules/measurements/history.service";
import type { AuthContext } from "../src/modules/rbac/rbac.service";

/**
 * A platform operator can read stored measurements.
 *
 * This guards a failure that is invisible from the outside. The history
 * queries are hand-written SQL and cannot spread the Prisma tenantScope()
 * fragment, so the tenant filter was written literally as
 * `"tenantId" = ctx.tenantId ?? -1`. A platform operator's tenantId is null,
 * which made that `-1`: assertSensorInScope ADMITTED them (tenantScope grants
 * an operator unrestricted access) and then the row filter discarded every row.
 * The endpoint answered 200 with an empty series, which reads as "this sensor
 * has no readings" rather than "you were filtered out" — so every chart an
 * operator opened was silently blank.
 *
 * The companion assertion matters just as much: a member of ANOTHER tenant
 * must still see nothing. The fix must widen access for the operator without
 * turning the filter off for everyone.
 */

const SUFFIX = Date.now();
const ownerEmail = `series-owner-${SUFFIX}@example.com`;
const outsiderEmail = `series-outsider-${SUFFIX}@example.com`;

let tenantId = 0;
let otherTenantId = 0;
let sensorId = 0;
let structureId = 0;

/** Platform operator: no membership, so no tenant (§19). */
const operatorCtx: AuthContext = {
  userId: -1,
  tenantId: null,
  isPlatformAdmin: true,
  permissions: [],
} as AuthContext;

async function cleanup() {
  await prisma.measurement.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId].filter(Boolean) } } });
  await prisma.sensor.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId].filter(Boolean) } } });
  await prisma.user.deleteMany({ where: { emailId: { in: [ownerEmail, outsiderEmail] } } });
  await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId].filter(Boolean) } } });
}

beforeAll(async () => {
  const tenant = await prisma.tenant.create({
    data: { publicId: `tn_series_${SUFFIX}`, name: "Series Co", slug: `series-co-${SUFFIX}`, status: "active" },
  });
  tenantId = tenant.id;

  const other = await prisma.tenant.create({
    data: { publicId: `tn_other_${SUFFIX}`, name: "Other Co", slug: `other-co-${SUFFIX}`, status: "active" },
  });
  otherTenantId = other.id;

  const sensorType = await prisma.sensorType.findFirst();
  if (!sensorType) throw new Error("Reference sensor types are not seeded");

  const sensor = await prisma.sensor.create({
    data: { tenantId, sensorName: `Series Sensor ${SUFFIX}`, sensorTypeID: sensorType.id, unit: "uS" },
  });
  sensorId = sensor.id;

  const structure = await prisma.structure.findFirst({ where: { tenantId } });
  structureId = structure?.id ?? 0;

  const now = Date.now();
  await ingestMeasurements(
    [0, 1, 2].map((i) => ({
      ts: new Date(now - (3 - i) * 60_000),
      sensorId,
      value: 10 + i,
    })) as never,
    { tenantId },
  );
});

afterAll(cleanup);

describe("history reads for a platform operator", () => {
  test("getSeries returns the tenant's points to an operator with no tenant", async () => {
    const result = await getSeries(operatorCtx, {
      sensorId,
      from: new Date(Date.now() - 3600_000),
      to: new Date(),
    });

    const total = result.points.reduce((sum, p) => sum + p.count, 0);
    expect(total).toBeGreaterThan(0);
  });

  test("getLatestReadings returns rows to an operator with no tenant", async () => {
    const rows = await getLatestReadings(operatorCtx, structureId || undefined);
    const mine = rows.find((r) => r.sensorId === sensorId);
    expect(mine).toBeDefined();
  });

  test("a member of another tenant still sees nothing", async () => {
    const outsiderCtx: AuthContext = {
      userId: -2,
      tenantId: otherTenantId,
      isPlatformAdmin: false,
      permissions: [],
    } as AuthContext;

    // The sensor is not theirs, so the scope check refuses before any row is read.
    await expect(
      getSeries(outsiderCtx, {
        sensorId,
        from: new Date(Date.now() - 3600_000),
        to: new Date(),
      }),
    ).rejects.toThrow();
  });
});
