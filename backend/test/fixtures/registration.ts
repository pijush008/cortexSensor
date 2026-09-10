/**
 * Shared registration payloads.
 *
 * Registering an organization now requires a company name and a logo, which
 * every suite that creates an admin has to supply. Putting the body in one
 * place means a future required field is one edit rather than nineteen.
 *
 * This file is a plain module, not a suite: vitest's default `include` only
 * collects `*.test.ts` / `*.spec.ts`, so it is imported and never run.
 */

/**
 * A real 1×1 PNG, 70 bytes decoded.
 *
 * It has to be genuinely valid, not a placeholder string: the server verifies
 * MAGIC BYTES rather than the data-URI's claimed type, so `data:image/png` in
 * front of arbitrary base64 is rejected — which is the point of that check.
 */
export const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export interface AdminRegistration {
  firstName: string;
  lastName: string;
  emailId: string;
  phoneNo: string;
  password: string;
  companyName: string;
  companyLogo: string;
}

/**
 * A complete organization-admin registration body.
 *
 * The company name defaults to something unique per call. `uniqueSlug` derives
 * the tenant slug from it and probes for collisions up to fifty times before
 * falling back to random hex, so hundreds of fixtures all called "Test Org"
 * would put that loop on the hot path of the whole suite.
 */
export function adminRegistration(
  overrides: Partial<AdminRegistration> = {},
): AdminRegistration {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    firstName: "Test",
    lastName: "Admin",
    emailId: `test-admin-${unique}@example.com`,
    phoneNo: "1234567890",
    password: "Password1!",
    companyName: `Test Org ${unique}`,
    companyLogo: TINY_PNG,
    ...overrides,
  };
}
