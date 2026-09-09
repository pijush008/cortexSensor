/**
 * Test environment, applied before any module is imported.
 *
 * `src/config` snapshots process.env at import time, exactly as it does in
 * production. Setting a variable inside a `beforeAll` is therefore too late —
 * the config object already exists. A setup file runs first, which is the only
 * point at which the environment can be configured the way a real deployment
 * configures it: before the process loads its code.
 */

// Redis is disabled so rate-limit counters stay per-run instead of leaking
// between suites through a shared server.
process.env.REDIS_ENABLED = process.env.REDIS_ENABLED ?? "false";

// Billing is exercised end to end, so the webhook secret must exist before the
// provider reads it.
process.env.BILLING_ENABLED = "true";
process.env.BILLING_WEBHOOK_SECRET =
  process.env.BILLING_WEBHOOK_SECRET ?? "test-webhook-secret";

// Keep the ingest path on its documented default so the contract tests and the
// legacy-key deprecation path behave predictably.
process.env.MQTT_INGEST_ENABLED = process.env.MQTT_INGEST_ENABLED ?? "false";
