import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { saveBase64Image } from "../src/utils/helper";

/**
 * saveBase64Image must never write outside uploads/, whichever backend it uses.
 *
 * `dir` is caller-supplied. Today every caller passes a literal, but the
 * containment assertion exists so that stays true if one ever stops. This test
 * exists because that assertion was, for a while, unreachable: the
 * object-storage branch returned above it, so enabling Supabase Storage — the
 * production configuration — skipped the check for every upload.
 *
 * Both backends are exercised deliberately. A test that only covered local disk
 * would have passed throughout the window in which the guard was bypassed.
 */
const ONE_PX_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const TRAVERSAL = [
  "uploads/../../etc",
  "../../../../tmp/evil",
  "uploads/../..",
];

describe("saveBase64Image containment", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env.SUPABASE_URL = saved.SUPABASE_URL ?? "";
    process.env.SUPABASE_SERVICE_ROLE_KEY = saved.SUPABASE_SERVICE_ROLE_KEY ?? "";
    process.env.SUPABASE_STORAGE_BUCKET = saved.SUPABASE_STORAGE_BUCKET ?? "";
  });

  describe("with object storage OFF (local disk)", () => {
    beforeEach(() => {
      process.env.SUPABASE_URL = "";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "";
      process.env.SUPABASE_STORAGE_BUCKET = "";
    });

    for (const dir of TRAVERSAL) {
      test(`refuses to escape uploads/ via "${dir}"`, async () => {
        await expect(saveBase64Image(ONE_PX_PNG, "x", dir)).rejects.toThrow(
          /Invalid upload location/,
        );
      });
    }

    test("accepts a legitimate directory", async () => {
      const p = await saveBase64Image(ONE_PX_PNG, "logo", "uploads/tenants");
      expect(p).toMatch(/^uploads\/tenants\/logo_[0-9a-f-]+\.png$/);
    });
  });

  describe("with object storage ON", () => {
    beforeEach(() => {
      // Pointed at a host that is never reached: the guard must reject before
      // any upload is attempted, so an unreachable endpoint proves the throw
      // came from the check and not from the network.
      process.env.SUPABASE_URL = "https://storage.invalid";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
      process.env.SUPABASE_STORAGE_BUCKET = "test-bucket";
    });

    for (const dir of TRAVERSAL) {
      test(`refuses to escape uploads/ via "${dir}"`, async () => {
        await expect(saveBase64Image(ONE_PX_PNG, "x", dir)).rejects.toThrow(
          /Invalid upload location/,
        );
      });
    }
  });
});
