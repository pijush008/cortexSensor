import app from "./app";
import { config } from "./config";
import prisma from "./config/prisma";
import { logger } from "./utils/logger";
import { logStorageMode } from "./utils/object-storage";
import { initEventBus } from "./modules/stream/event-bus";
import { startAnalysisWorker } from "./modules/analysis/analysis.queue";
import { startFtpIngest } from "./modules/ingestion/ingestion.service";

async function main() {
  try {
    await prisma.$connect();
    logger.info("Connected to PostgreSQL via Prisma");
    logStorageMode();

    initEventBus();


    // Background analysis. In production this runs as its own `worker`
    // service; in development it runs here for convenience.
    startAnalysisWorker();

    // The Ackcio FTP drop, when a directory is configured.
    startFtpIngest();

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
