import prisma from "../../src/config/prisma";

/**
 * Tenant cleanup for suites that register organizations.
 *
 * Registering an admin provisions a Tenant as part of the same business event,
 * so any suite that signs one up has created an organization whether it meant
 * to or not. Deleting the user and their membership leaves that organization
 * behind, and because the names carry a timestamp every run leaves a NEW one.
 *
 * That is not merely untidy. These suites share a development database with the
 * running application, and the platform-operator screens list every tenant on
 * the deployment — so leaked fixtures show up in the product, in a chooser a
 * human being has to pick their own organization out of. Thirty-two
 * accumulated in a single afternoon before this existed.
 */

/** The tenants these users belong to. Call BEFORE deleting their memberships. */
export async function tenantIdsFor(userIds: number[]): Promise<number[]> {
  if (userIds.length === 0) return [];
  const memberships = await prisma.membership.findMany({
    where: { userId: { in: userIds } },
    select: { tenantId: true },
  });
  return [...new Set(memberships.map((m) => m.tenantId))];
}

/**
 * Delete the given tenants, skipping any that something still points at.
 *
 * Safety is delegated to the database rather than to a list of tables checked
 * here. A tenant with any row still referencing it fails its foreign key and is
 * left alone, so this can never remove an organization that holds real data —
 * and it cannot fall out of date as new tenant-owned tables are added.
 */
export async function deleteEmptyTenants(tenantIds: number[]): Promise<void> {
  for (const id of tenantIds) {
    await prisma.tenant.delete({ where: { id } }).catch(() => {
      // Still referenced: not ours to remove.
    });
  }
}
