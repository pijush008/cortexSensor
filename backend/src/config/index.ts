import dotenv from "dotenv";

dotenv.config();

export function expiresInMs(expiresIn: string): number {
  const value = Number(expiresIn.replace(/[a-z]/gi, ""));
  if (expiresIn.endsWith("s")) return value * 1000;
  if (expiresIn.endsWith("m")) return value * 60 * 1000;
  if (expiresIn.endsWith("h")) return value * 60 * 60 * 1000;
  if (expiresIn.endsWith("d")) return value * 24 * 60 * 60 * 1000;
  return value * 1000;
}

export const config = {
  port: Number(process.env.PORT) || 3001,
  nodeEnv: process.env.NODE_ENV || "development",
  databaseUrl: process.env.DATABASE_URL || "",
  jwtSecret:
    process.env.JWT_SECRET ||
    (process.env.NODE_ENV === "production" ? "" : "dev-jwt-change-me"),
  jwtRefreshSecret:
    process.env.JWT_REFRESH_SECRET ||
    (process.env.NODE_ENV === "production" ? "" : "dev-refresh-change-me"),
  jwtAccessExpiry: process.env.JWT_ACCESS_EXPIRY || "15m",
  jwtRefreshExpiry: process.env.JWT_REFRESH_EXPIRY || "7d",
  expiresInMs,
  mqtt: {
    brokerUrl: process.env.MQTT_BROKER_URL || "",
    username: process.env.MQTT_USERNAME || "",
    password: process.env.MQTT_PASSWORD || "",
    // Live device-to-cloud ingestion (ESP32 / Raspberry Pi gateways)
    ingestEnabled: process.env.MQTT_INGEST_ENABLED !== "false",
    ingestTopics: (process.env.MQTT_INGEST_TOPICS || "shm/ingest/#")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    ingestClientId: process.env.MQTT_INGEST_CLIENT_ID || "shm-backend-ingest",
  },
  email: {
    /**
     * SMTP credentials. GMAIL_* are the historical names and still work; the
     * SMTP_* aliases exist because the transport was hardwired to Gmail, which
     * ruled out every other provider — SendGrid, Mailgun, SES, or a company's
     * own mail server.
     */
    account: process.env.SMTP_USER || process.env.GMAIL_ACCOUNT || "",
    password: process.env.SMTP_PASSWORD || process.env.GMAIL_PASSWORD || "",
    from: process.env.EMAIL_FROM || "",
    /**
     * Leave SMTP_HOST unset to keep using Gmail. Set it to use any other
     * provider; port defaults to 587 (STARTTLS), the usual submission port.
     */
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT ?? 587),
    /** True for port 465 (implicit TLS); false for 587, which upgrades. */
    secure: process.env.SMTP_SECURE === "true",
  },
  uploadDir: process.env.UPLOAD_DIR || "./uploads",
  maxFileSize: Number(process.env.MAX_FILE_SIZE) || 10485760,
  allowedOrigins: (
    process.env.ALLOWED_ORIGINS || "http://localhost:3000"
  ).split(","),
  iotApiKey: process.env.IOT_API_KEY || "change-me",
  /**
   * Whether the deprecated fleet-wide ingest key is still accepted. Devices
   * should present a per-device credential instead; set to "false" once no
   * deployed hardware relies on the shared key.
   */
  allowLegacyIngestKey: process.env.ALLOW_LEGACY_INGEST_KEY !== "false",
  /** The Python SHM engine (§74): spectral estimation lives out of process. */
  shmEngineUrl: process.env.SHM_ENGINE_URL || "http://localhost:8000",
  shmEngineTimeoutMs: Number(process.env.SHM_ENGINE_TIMEOUT_MS) || 60_000,
  analysisQueueEnabled: process.env.ANALYSIS_QUEUE_ENABLED !== "false",
  /** Disable in the API process when a dedicated worker service runs it. */
  analysisWorkerEnabled: process.env.ANALYSIS_WORKER_ENABLED !== "false",
  analysisWorkerConcurrency: Number(process.env.ANALYSIS_WORKER_CONCURRENCY) || 2,
  /**
   * Number of reverse proxies in front of the API. 1 for the bundled nginx.
   * Raise it only to the number of proxies you actually control — each extra
   * hop is one more X-Forwarded-For entry taken on trust.
   */
  trustProxyHops: Number(process.env.TRUST_PROXY_HOPS ?? 1),
  /**
   * Where the FRONTEND is served. Used to build links that are emailed to
   * people — password resets, email verification — which must open the app,
   * not the API. Wrong here means a working token inside a dead link.
   */
  appUrl: process.env.APP_URL || "http://localhost:3000",
  /**
   * Organization registrations allowed per IP per hour.
   *
   * Configurable rather than hard-coded because the test suite runs every file
   * in ONE process with an in-memory limiter store (test/setup.ts disables
   * Redis, vitest.config.ts sets fileParallelism: false), so all suites share a
   * single counter. A hard 5 would 429 the sixth registration of the whole run
   * and take out most of the suite.
   */
  registerRateLimitMax: Number(process.env.REGISTER_RATE_LIMIT_MAX ?? 5),
  billing: {
    /** Master switch; billing endpoints refuse rather than pretend when off. */
    enabled: process.env.BILLING_ENABLED === "true",
    /** HMAC secret the provider signs webhook bodies with. */
    webhookSecret: process.env.BILLING_WEBHOOK_SECRET || "",
    /**
     * Which adapter handles checkout and webhooks. "razorpay" once credentials
     * exist; "generic" is the documented HMAC envelope used by the tests, and
     * is the default so a deployment without credentials refuses cleanly rather
     * than half-working.
     */
    provider: process.env.BILLING_PROVIDER || "generic",
    /**
     * Plan every new organization is put on at sign-up, BY CODE.
     *
     * Named rather than inferred: picking "the first active plan" once put new
     * customers on `complimentary`, the unlimited internal plan, silently
     * removing every limit. Changing the price is an UPDATE on the row; this
     * only chooses which row.
     */
    signupPlanCode: process.env.DEFAULT_SIGNUP_PLAN || "starter",
    /**
     * Plans offered on the sign-up page, in display order, BY CODE.
     *
     * Named explicitly rather than "every active plan": billing_plans also
     * holds `complimentary` (the unlimited internal plan) and `enterprise`
     * (priced on contact, 0 in the table). Listing active plans would put a
     * free unlimited option on a public page.
     */
    signupPlanCodes: (process.env.SIGNUP_PLAN_CODES || "starter,professional")
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean),
    razorpay: {
      keyId: process.env.RAZORPAY_KEY_ID || "",
      /** Server-side only. Never sent to the browser. */
      keySecret: process.env.RAZORPAY_KEY_SECRET || "",
      /** Separate from the API secret; Razorpay signs webhooks with its own. */
      webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || "",
    },
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  },
  /**
   * Whether platform operators must enrol in MFA (§94). Configurable so a
   * first-run deployment can create its initial operator before an
   * authenticator app is available; it should be true everywhere else.
   */
  requireMfaForPlatformAdmins:
    process.env.REQUIRE_MFA_FOR_PLATFORM_ADMINS !== "false",
};
