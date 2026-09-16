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

// PINNED EMPTY, for two reasons.
//
// Correctness: outbound mail decides behaviour now — a platform admin is sent
// a sign-in code only when mail is configured — so leaving this ambient means
// the suite takes a different path on a machine that happens to have SMTP
// credentials in .env. That is exactly what happened: adding real Gmail
// credentials turned every platform-admin sign-in into a two-step flow and
// broke suites that never mentioned email.
//
// And restraint: with real credentials present, a test run SENDS REAL MAIL to
// whatever address a fixture invents. A test suite must not be able to email
// strangers.
process.env.GMAIL_ACCOUNT = "";
process.env.GMAIL_PASSWORD = "";
process.env.SMTP_USER = "";
process.env.SMTP_PASSWORD = "";

// Effectively unlimited registrations during a test run.
//
// Every suite shares one process (vitest.config.ts sets fileParallelism: false)
// and one in-memory limiter store (Redis is off, above), so the production
// default of 5 per hour would 429 the sixth admin registration of the ENTIRE run
// and fail most of the suite. The limiter's own behaviour is covered in
// isolation instead.
process.env.REGISTER_RATE_LIMIT_MAX = "100000";


// PINNED, for the same reason as the webhook secrets above: the suite must not
// depend on a developer's .env.
//
// integration.test.ts sends `process.env.IOT_API_KEY || "dev-iot-key"` while
// src/config defaults to "change-me". On a machine with backend/.env both sides
// read the same real value and the request is authorised; on CI, which has no
// .env, the two fallbacks disagree and ingest returns 401. The test was passing
// only because a file that is not in the repository happened to exist.
process.env.IOT_API_KEY = process.env.IOT_API_KEY ?? "dev-iot-key";

// Effectively unlimited code-bearing requests during a test run, for the same
// reason REGISTER_RATE_LIMIT_MAX is raised above: one process, one in-memory
// limiter store and one source address mean the production ceiling of 10 per
// quarter-hour is reached partway through the invitation suite and every later
// request 429s. The limiter's own behaviour is covered in isolation instead.
process.env.OTP_RATE_LIMIT_MAX = "100000";

// ── Refuse to run against a database that is not local ──────────────────────
//
// The suites are DESTRUCTIVE: they share one database and clean up with
// deleteMany. That is fine against a throwaway local Postgres and catastrophic
// against a hosted one — and the only thing standing between the two is which
// DATABASE_URL happens to be in .env at the time.
//
// With the project's .env now pointing at Supabase so the app reads live data,
// a developer running `npm test` out of habit would have deleted production
// rows with no warning and no undo. So the suite checks where it is pointed and
// refuses anything that is not loopback or the compose service name.
//
// Set ALLOW_REMOTE_TEST_DB=1 to override, which should only ever be done
// against a database created for the purpose.
{
  const url = process.env.DATABASE_URL || "";
  const LOCAL = new Set(["localhost", "127.0.0.1", "::1", "postgres", ""]);
  let host = "";
  try {
    host = url ? new URL(url).hostname : "";
  } catch {
    host = "";
  }
  if (url && !LOCAL.has(host) && process.env.ALLOW_REMOTE_TEST_DB !== "1") {
    throw new Error(
      `Refusing to run the test suite against a non-local database (${host}).\n` +
        "These tests delete rows. Point DATABASE_URL at a local Postgres, e.g.\n" +
        '  DATABASE_URL="postgresql://shm:shm_pass@127.0.0.1:5432/shm_dev?schema=public" npm run test:run\n' +
        "or set ALLOW_REMOTE_TEST_DB=1 if the target really is disposable.",
    );
  }
}

// Object storage OFF, pinned empty.
//
// Same reasoning as the mail credentials above, and it is not hypothetical: the
// first run after Supabase Storage was wired up wrote 44 images into the
// project's real bucket, because the suite inherited SUPABASE_* from .env and
// every fixture that uploads an avatar or a company logo went straight to
// production. A test suite must not be able to write to a live bucket any more
// than it may email strangers.
//
// Pinning these also keeps the upload helpers on their documented local-disk
// behaviour, which is what the assertions about `uploads/...` paths describe.
process.env.SUPABASE_URL = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";
process.env.SUPABASE_STORAGE_BUCKET = "";
