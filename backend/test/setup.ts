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
//
// PINNED, not defaulted. The billing suite signs its payloads with this exact
// literal, so deferring to an ambient BILLING_WEBHOOK_SECRET means the tests
// verify a signature made with one key against another and every webhook comes
// back 401 — which is what happened when the suite was first run inside the
// backend container, where compose sets a different secret.
process.env.BILLING_ENABLED = "true";
process.env.BILLING_WEBHOOK_SECRET = "test-webhook-secret";

// The Razorpay adapter's webhook secret, pinned for the same reason: the suite
// signs payloads with this exact literal, so deferring to the ambient
// environment would verify a signature made with one key against another.
process.env.RAZORPAY_WEBHOOK_SECRET = "test-rzp-webhook-secret";

// PINNED for the same reason, and because the suite's webhook payloads are
// shaped for the generic envelope. Deferring to the ambient environment meant
// that the moment a developer put BILLING_PROVIDER=razorpay in backend/.env,
// every suite in the project failed at import time — the adapter selection
// changed underneath tests that never mentioned billing. Tests must not depend
// on a developer's .env. Razorpay-specific tests construct RazorpayProvider
// directly rather than going through selection.
process.env.BILLING_PROVIDER = "generic";

// Effectively unlimited registrations during a test run.
//
// Every suite shares one process (vitest.config.ts sets fileParallelism: false)
// and one in-memory limiter store (Redis is off, above), so the production
// default of 5 per hour would 429 the sixth admin registration of the ENTIRE run
// and fail most of the suite. The limiter's own behaviour is covered in
// isolation instead.
process.env.REGISTER_RATE_LIMIT_MAX = "100000";

// Keep the ingest path on its documented default so the contract tests and the
// legacy-key deprecation path behave predictably.
process.env.MQTT_INGEST_ENABLED = process.env.MQTT_INGEST_ENABLED ?? "false";
