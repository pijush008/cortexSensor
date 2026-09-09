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
    account: process.env.GMAIL_ACCOUNT || "",
    password: process.env.GMAIL_PASSWORD || "",
    from: process.env.EMAIL_FROM || "",
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
  billing: {
    /** Master switch; billing endpoints refuse rather than pretend when off. */
    enabled: process.env.BILLING_ENABLED === "true",
    /** HMAC secret the provider signs webhook bodies with. */
    webhookSecret: process.env.BILLING_WEBHOOK_SECRET || "",
  },
  /**
   * Whether platform operators must enrol in MFA (§94). Configurable so a
   * first-run deployment can create its initial operator before an
   * authenticator app is available; it should be true everywhere else.
   */
  requireMfaForPlatformAdmins:
    process.env.REQUIRE_MFA_FOR_PLATFORM_ADMINS !== "false",
};
