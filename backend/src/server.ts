import app from "./app";
import { config } from "./config";
import prisma from "./config/prisma";
import { logger } from "./utils/logger";
import { startMqttIngest } from "./modules/iot/mqtt-ingest";

async function main() {
  try {
    await prisma.$connect();
    logger.info("Connected to PostgreSQL via Prisma");

    // Live device-to-cloud ingestion: subscribes to the MQTT topics that
    // ESP32 nodes / Raspberry Pi gateways publish telemetry to. Non-fatal:
    // the API keeps serving even if the broker is temporarily unavailable.
    startMqttIngest();

    app.listen(config.port, () => {
      logger.info(`SHM API running on port ${config.port} [${config.nodeEnv}]`);
    });
  } catch (err) {
    logger.error("Failed to start server", err as Error);
    process.exit(1);
  }
}

process.on("unhandledRejection", (err) => {
  logger.error("Unhandled Rejection", err as Error);
  process.exit(1);
});

process.on("uncaughtException", (err) => {
  logger.error("Uncaught Exception", err);
  process.exit(1);
});

main();
