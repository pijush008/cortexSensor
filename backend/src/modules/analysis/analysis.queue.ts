import { Queue, Worker, type JobsOptions } from "bullmq";
import { config } from "../../config";
import { logger } from "../../utils/logger";
import { executeRun } from "./analysis.service";
import { generateReport } from "../reports/report-generator.service";

/**
 * Background execution for analysis runs (§57).
 *
 * A spectrum over a long window is CPU and memory heavy. Running it inside a
 * request would hold a connection open, risk a proxy timeout, and let one
 * expensive analysis degrade the whole API. The request enqueues; a worker does
 * the work; the client polls the run.
 *
 * BullMQ on Redis, because Redis is already a dependency and the alternative —
 * a database-polled queue — adds load to the same Postgres the analysis is
 * reading from.
 *
 * Degrades deliberately: with no Redis the queue is unavailable and the caller
 * is told so, rather than the API silently accepting work it will never do.
 */

export const ANALYSIS_QUEUE = "shm-analysis";

let queue: Queue | null = null;
let worker: Worker | null = null;

function connection() {
  const url = process.env.REDIS_URL || "";
  if (!url) return null;
  return {
    // BullMQ requires this to be null: it uses blocking commands that must not
    // be aborted by a retry limit.
    maxRetriesPerRequest: null as null,
    url,
  };
}

export function getAnalysisQueue(): Queue | null {
  if (queue) return queue;
  const conn = connection();
  if (!conn || !config.analysisQueueEnabled) return null;

  queue = new Queue(ANALYSIS_QUEUE, {
    connection: { url: conn.url, maxRetriesPerRequest: null },
    defaultJobOptions: {
      attempts: 3,
      // Exponential backoff: a transient engine restart should not fail a run,
      // but a genuinely bad window should stop retrying quickly.
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 500 },
    } satisfies JobsOptions,
  });
  return queue;
}

export async function enqueueRun(runId: number): Promise<boolean> {
  const q = getAnalysisQueue();
  if (!q) return false;
  await q.add("spectrum", { runId }, { jobId: `run-${runId}` });
  return true;
}

/**
 * Report generation shares this queue rather than getting its own.
 *
 * Both are the same kind of work — a long database read plus computation that
 * must not run in a request — and a second queue would mean a second worker,
 * a second set of Redis connections and a second failure mode to operate, for
 * no separation that matters at this volume.
 */
export async function enqueueReport(reportId: number): Promise<boolean> {
  const q = getAnalysisQueue();
  if (!q) return false;
  await q.add("report", { reportId }, { jobId: `report-${reportId}` });
  return true;
}

/**
 * Starts the in-process worker.
 *
 * Deployed as a separate `worker` service in production (§74); running it in
 * the API process is a development convenience and is opt-out via env.
 */
export function startAnalysisWorker(): void {
  if (worker) return;
  const conn = connection();
  if (!conn || !config.analysisQueueEnabled || !config.analysisWorkerEnabled) {
    logger.warn(
      "Analysis worker not started (no REDIS_URL, or disabled by configuration)",
    );
    return;
  }

  worker = new Worker(
    ANALYSIS_QUEUE,
    async (job) => {
      if (job.name === "report") {
        const reportId = Number((job.data as { reportId: number }).reportId);
        logger.info(`Worker: generating report ${reportId}`);
        await generateReport(reportId);
        return;
      }
      const runId = Number((job.data as { runId: number }).runId);
      logger.info(`Worker: executing analysis run ${runId}`);
      await executeRun(runId);
    },
    {
      connection: { url: conn.url, maxRetriesPerRequest: null },
      // Analysis is CPU bound; more concurrency than this simply contends for
      // the same cores and slows every run down.
      concurrency: config.analysisWorkerConcurrency,
    },
  );

  worker.on("failed", (job, err) => {
    logger.error(`Analysis job ${job?.id} failed: ${err.message}`);
  });

  logger.info(
    `Analysis worker started (concurrency ${config.analysisWorkerConcurrency})`,
  );
}

export async function stopAnalysisWorker(): Promise<void> {
  await worker?.close();
  await queue?.close();
  worker = null;
  queue = null;
}
