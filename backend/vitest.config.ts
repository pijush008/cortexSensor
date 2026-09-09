import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Runs before any test module is imported, so environment-derived config
    // (which src/config snapshots at import) is in place first.
    setupFiles: ["./test/setup.ts"],
    // The suites share one Postgres database and clean up by fixture email, so
    // they must not interleave: two files creating and deleting rows at the
    // same time would see each other's half-finished cleanup.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
