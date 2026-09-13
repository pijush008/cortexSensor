import fs from "fs";
import path from "path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import prisma from "../src/config/prisma";
import {
  OPERATOR_TENANT_SLUG,
  getOrCreateOperatorTenant,
} from "../src/modules/rbac/tenant.provisioning";

/**
 * The operator organization's logo.
 *
 * A customer's organization gets a logo because registration collects one. The
 * operator organization is provisioned by code instead, so it had none — which
 * left the Admin emblem blank on every project a platform operator creates,
 * while the contractor's and authority's logos sat beside it.
 *
 * That organization IS Cloudglance Sensinglab Pvt Ltd, so it carries the
 * company mark rather than waiting for somebody to upload one.
 */

let originalLogoPath: string | null | undefined;
let existed = false;

beforeAll(async () => {
  await prisma.$connect();
  const existing = await prisma.tenant.findUnique({
    where: { slug: OPERATOR_TENANT_SLUG },
    select: { logoPath: true },
  });
  existed = Boolean(existing);
  originalLogoPath = existing?.logoPath;
});

afterAll(async () => {
  // Restore whatever was there, so running the suite does not mutate the real
  // operator organization.
  if (existed) {
    await prisma.tenant.update({
      where: { slug: OPERATOR_TENANT_SLUG },
      data: { logoPath: originalLogoPath ?? null },
    });
  }
  await prisma.$disconnect();
});

describe("the operator organization", () => {
  test("is provisioned with the company mark", async () => {
    // Simulate the tenant as it was before: present, but with no logo.
    if (existed) {
      await prisma.tenant.update({
        where: { slug: OPERATOR_TENANT_SLUG },
        data: { logoPath: null },
      });
    }

    const tenantId = await getOrCreateOperatorTenant();

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, logoPath: true },
    });

    expect(tenant?.name).toBe("Cloudglance Sensinglab Pvt Ltd");
    // A RELATIVE path, matching Project.projectLogo and User.companyLogo — not
    // a URL, so the origin serving it can change without rewriting rows.
    expect(tenant?.logoPath).toMatch(/^uploads\/tenants\//);
    expect(tenant?.logoPath).not.toMatch(/^https?:/);
  });

  test("the file it points at actually exists on disk", async () => {
    const tenantId = await getOrCreateOperatorTenant();
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { logoPath: true },
    });

    // A path recorded for a file that was never written renders as a broken
    // image, which is worse than the initials it replaced.
    const onDisk = path.resolve(tenant!.logoPath!);
    expect(fs.existsSync(onDisk), `expected ${onDisk} to exist`).toBe(true);
    expect(fs.statSync(onDisk).size).toBeGreaterThan(0);
  });

  test("an existing logo is left alone rather than replaced each call", async () => {
    await getOrCreateOperatorTenant();
    const first = await prisma.tenant.findUnique({
      where: { slug: OPERATOR_TENANT_SLUG },
      select: { logoPath: true },
    });

    await getOrCreateOperatorTenant();
    const second = await prisma.tenant.findUnique({
      where: { slug: OPERATOR_TENANT_SLUG },
      select: { logoPath: true },
    });

    // Seeding on every call would write a new file per project creation and
    // fill uploads/tenants with copies of the same image.
    expect(second?.logoPath).toBe(first?.logoPath);
  });
});
