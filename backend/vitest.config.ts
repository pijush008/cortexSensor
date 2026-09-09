import { defineConfig } from "vitest/config";

// The suites share a single PostgreSQL instance (docker compose). Running test
// FILES in parallel causes cross-suite cleanup/registration races, so serialize
// files while keeping each file's internal parallelism.
export default defineConfig({
  test: {
    fileParallelism: false,
    testTimeout: 120000,
    hookTimeout: 120000,
    env: {
      // Keep rate-limit counters/caches per test run (Redis is shared infra).
      REDIS_ENABLED: "false",
    },
  },
});