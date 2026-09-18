import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { Prisma } from "@prisma/client";
import prisma from "../../config/prisma";
import { config } from "../../config";
import { logger } from "../../utils/logger";
import { tenantScope, type AuthContext } from "../rbac/rbac.service";
import { ingestAckcioPayload, type IngestSummary } from "../ackcio/ackcio.service";
import { ackcioEnvelopeSchema } from "../ackcio/ackcio.types";
import { csvToEnvelope, parseFileName, parseUtcOffset, sensorIndexForCode } from "./ackcio-csv";

/**
 * The FTP drop: files the gateway uploaded, processed exactly once.
 *
 *   vsftpd writes  →  <dir>/incoming/<file>.csv
 *   this service   →  reads it, stores its rows, moves it to
 *                     <dir>/processed/<date>/, <dir>/failed/ or <dir>/unknown/
 *
 * Every file gets a row in ingestion_files keyed by its content hash: the
 * same upload twice is stored once; a file that could not be handled is kept
 * with its error for an administrator; a file from a gateway nobody has
 * registered is kept, recorded as unknown and never attached to a project.
 * The rows themselves go through the same ingest service as an HTTP push,
 * so nothing about storage differs between the two transports.
 */

export const SUBDIRS = {
  incoming: "incoming",
  processed: "processed",
  failed: "failed",
  unknown: "unknown",
} as const;

export interface ProcessedFile {
  fileName: string;
  status: "processed" | "failed" | "unknown_gateway" | "duplicate" | "skipped";
  rowsTotal: number;
  rowsStored: number;
  rowsDuplicate: number;
  error?: string;
}

async function ensureDirs(root: string): Promise<void> {
  for (const sub of Object.values(SUBDIRS)) {
    await fs.mkdir(path.join(root, sub), { recursive: true });
  }
}

/** A destination that does not clobber an earlier file of the same name. */
async function uniqueDestination(dir: string, fileName: string): Promise<string> {
  await fs.mkdir(dir, { recursive: true });
  const ext = path.extname(fileName);
  const stem = fileName.slice(0, fileName.length - ext.length);
  let candidate = path.join(dir, fileName);
  for (let n = 1; ; n++) {
    try {
      await fs.access(candidate);
      candidate = path.join(dir, `${stem}-${n}${ext}`);
    } catch {
      return candidate;
    }
  }
}

async function moveTo(root: string, sub: string, filePath: string, dated: boolean): Promise<string> {
  const day = new Date().toISOString().slice(0, 10);
  const dir = dated ? path.join(root, sub, day) : path.join(root, sub);
  const dest = await uniqueDestination(dir, path.basename(filePath));
  await fs.rename(filePath, dest);
  return dest;
}

/**
 * Sensor indexes for codes already known on this node, so a CSV upload lands
 * on the same channel as an HTTP push for the same sensor rather than
 * creating a second one.
 */
async function knownSensorIndexes(gatewayId: number, nodeKey: string | null): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!nodeKey) return map;
  const device = await prisma.device.findFirst({
    where: { gatewayId, deviceId: nodeKey, isDelete: "false_" },
    select: { id: true },
  });
  if (!device) return map;
  const channels = await prisma.deviceChannel.findMany({
    where: { deviceId: String(device.id) },
    select: { channelNumber: true, channelName: true },
  });
  for (const ch of channels) {
    const code = (ch.channelName ?? "").split(" · ")[0].trim();
    const idx = Number(ch.channelNumber.split(".")[0]);
    if (code && Number.isInteger(idx) && !map.has(code)) map.set(code, idx);
  }
  return map;
}

/**
 * Handles one file from the incoming directory. Never throws for a bad file:
 * the outcome is recorded and the file moved, so one broken upload cannot
 * stall the rest.
 */
export async function processFile(root: string, filePath: string): Promise<ProcessedFile> {
  const fileName = path.basename(filePath);
  const content = await fs.readFile(filePath);
  // Name AND content: the name carries the identity (gateway, node, sensor),
  // so the same readings under another name are a different file.
  const sha256 = crypto.createHash("sha256").update(fileName).update("\n").update(content).digest("hex");

  // The nodes this gateway has already reported anchor the file name parse,
  // since the gateway's own ids are not always distinguishable from a word.
  const preliminary = parseFileName(fileName);
  const knownNodes = preliminary
    ? (
        await prisma.device.findMany({
          where: { gateway: { gatewayKey: { equals: preliminary.gatewayKey, mode: "insensitive" } }, isDelete: "false_" },
          select: { deviceId: true },
        })
      )
        .map((d) => d.deviceId)
        .filter((k): k is string => Boolean(k))
    : [];
  const parsedName = parseFileName(fileName, knownNodes);

  // The ledger entry first. Its unique hash is the duplicate check: a second
  // upload of identical content cannot get a row, so it cannot be processed.
  let ledgerId: number;
  try {
    const row = await prisma.ingestionFile.create({
      data: {
        fileName,
        filePath,
        sha256,
        sizeBytes: content.length,
        fileType: parsedName?.fileType ?? "Unknown",
        gatewayKey: parsedName?.gatewayKey ?? null,
        nodeKey: parsedName?.nodeKey ?? null,
        status: "received",
      },
      select: { id: true },
    });
    ledgerId = row.id;
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      const dest = await moveTo(root, SUBDIRS.processed, filePath, true);
      logger.info(`FTP ingest: ${fileName} has the same content as an earlier file; skipped (${dest})`);
      return { fileName, status: "duplicate", rowsTotal: 0, rowsStored: 0, rowsDuplicate: 0 };
    }
    throw err;
  }

  const finish = async (
    status: "processed" | "failed" | "unknown_gateway",
    data: Partial<Prisma.IngestionFileUpdateInput>,
  ) => {
    const sub = status === "processed" ? SUBDIRS.processed : status === "failed" ? SUBDIRS.failed : SUBDIRS.unknown;
    const dest = await moveTo(root, sub, filePath, status === "processed");
    await prisma.ingestionFile.update({
      where: { id: ledgerId },
      data: { status, filePath: dest, processedAt: new Date(), ...data },
    });
  };

  if (!parsedName) {
    const error = "File name is not one the Ackcio gateway writes (expected SensorData_, NodeData_, NetworkData_, HeartbeatData_ or ErrorSensorData_)";
    await finish("failed", { error });
    logger.warn(`FTP ingest: ${fileName} refused: ${error}`);
    return { fileName, status: "failed", rowsTotal: 0, rowsStored: 0, rowsDuplicate: 0, error };
  }

  const gateway = await prisma.gateway.findFirst({
    where: { gatewayKey: { equals: parsedName.gatewayKey, mode: "insensitive" } },
    select: { id: true, tenantId: true, gatewayKey: true, status: true, projectId: true },
  });

  if (!gateway || gateway.status === "decommissioned") {
    // Kept, recorded, and NOT attached to anything. An administrator decides
    // what this gateway is; the file waits for them.
    const error = gateway
      ? `Gateway ${parsedName.gatewayKey} is decommissioned`
      : `Gateway ${parsedName.gatewayKey} is not registered`;
    await finish("unknown_gateway", { error });
    logger.warn(`FTP ingest: ${fileName} kept in unknown/: ${error}`);
    return { fileName, status: "unknown_gateway", rowsTotal: 0, rowsStored: 0, rowsDuplicate: 0, error };
  }

  try {
    const known = await knownSensorIndexes(gateway.id, parsedName.nodeKey);
    const conversion = csvToEnvelope(fileName, content.toString("utf8"), {
      defaultOffsetMinutes: parseUtcOffset(config.ftpIngest.utcOffset) ?? 0,
      sensorIndexFor: (code) => known.get(code) ?? sensorIndexForCode(code),
      knownNodeKeys: knownNodes,
    });
    const envelope = ackcioEnvelopeSchema.parse(conversion.envelope);
    const summary: IngestSummary = await ingestAckcioPayload(envelope, {
      id: gateway.id,
      tenantId: gateway.tenantId,
      gatewayKey: gateway.gatewayKey,
    });

    const notes = [...conversion.skipped, ...summary.notes];
    await finish("processed", {
      tenantId: gateway.tenantId,
      gatewayId: gateway.id,
      projectId: gateway.projectId,
      rowsTotal: conversion.rowsTotal,
      rowsStored: summary.stored,
      rowsDuplicate: summary.duplicates,
      error: notes.length ? notes.slice(0, 20).join("; ") : null,
    });
    logger.info(
      `FTP ingest: ${fileName}: ${summary.stored} stored, ${summary.duplicates} already seen, ${summary.ignored + conversion.skipped.length} skipped`,
    );
    return {
      fileName,
      status: "processed",
      rowsTotal: conversion.rowsTotal,
      rowsStored: summary.stored,
      rowsDuplicate: summary.duplicates,
    };
  } catch (err) {
    const error = (err as Error).message.slice(0, 2000);
    await finish("failed", { tenantId: gateway.tenantId, gatewayId: gateway.id, error });
    logger.error(`FTP ingest: ${fileName} failed: ${error}`);
    return { fileName, status: "failed", rowsTotal: 0, rowsStored: 0, rowsDuplicate: 0, error };
  }
}

/**
 * One pass over the incoming directory. Files still changing (younger than
 * the settle time) are left for the next pass, so a file mid-upload over FTP
 * is never read half-written.
 */
export async function scanOnce(root: string, settleMs = config.ftpIngest.settleMs): Promise<ProcessedFile[]> {
  await ensureDirs(root);
  const incoming = path.join(root, SUBDIRS.incoming);
  const names = (await fs.readdir(incoming)).filter((n) => !n.startsWith(".")).sort();
  const results: ProcessedFile[] = [];
  const now = Date.now();
  for (const name of names) {
    const full = path.join(incoming, name);
    const stat = await fs.stat(full).catch(() => null);
    if (!stat || !stat.isFile()) continue;
    // A settle time of 0 means "everything": a file written an instant ago
    // can carry a modification time a fraction of a millisecond AHEAD of the
    // clock reading above, and must not be skipped for it.
    if (settleMs > 0 && now - stat.mtimeMs < settleMs) {
      results.push({ fileName: name, status: "skipped", rowsTotal: 0, rowsStored: 0, rowsDuplicate: 0 });
      continue;
    }
    try {
      results.push(await processFile(root, full));
    } catch (err) {
      // A fault outside the per-file handling (disk, database down). Leave
      // the file where it is; the next pass retries it.
      logger.error(`FTP ingest: could not process ${name}: ${(err as Error).message}`);
      results.push({ fileName: name, status: "failed", rowsTotal: 0, rowsStored: 0, rowsDuplicate: 0, error: (err as Error).message });
    }
  }
  return results;
}

let timer: NodeJS.Timeout | null = null;
let running = false;

/** Starts the periodic scan, when a drop directory is configured. */
export function startFtpIngest(): void {
  const root = config.ftpIngest.dir;
  if (!root) {
    logger.info("FTP ingest: FTP_INGEST_DIR not set; the CSV drop is disabled");
    return;
  }
  if (timer) return;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await scanOnce(root);
    } catch (err) {
      logger.error(`FTP ingest: scan failed: ${(err as Error).message}`);
    } finally {
      running = false;
    }
  };
  timer = setInterval(tick, config.ftpIngest.intervalMs);
  timer.unref();
  void tick();
  logger.info(`FTP ingest: watching ${path.join(root, SUBDIRS.incoming)} every ${config.ftpIngest.intervalMs / 1000}s`);
}

export function stopFtpIngest(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

// ─── The ledger, for the console ─────────────────────────────────────────────

export interface ListIngestionQuery {
  status?: string;
  page: number;
  limit: number;
}

/**
 * Files the caller may see: their organization's, and for a platform operator
 * everything, including the unknown-gateway files that belong to nobody yet.
 */
export async function listIngestionFiles(ctx: AuthContext, query: ListIngestionQuery) {
  const scope = tenantScope(ctx);
  const where: Prisma.IngestionFileWhereInput = ctx.isPlatformAdmin ? {} : { tenantId: scope.tenantId ?? -1 };
  if (query.status) where.status = query.status as Prisma.IngestionFileWhereInput["status"];

  const [total, rows, unknownCount] = await Promise.all([
    prisma.ingestionFile.count({ where }),
    prisma.ingestionFile.findMany({
      where,
      orderBy: { receivedAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    ctx.isPlatformAdmin ? prisma.ingestionFile.count({ where: { status: "unknown_gateway" } }) : Promise.resolve(0),
  ]);

  return {
    items: rows,
    page: query.page,
    limit: query.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.limit)),
    /** Files from gateways nobody has registered, needing an administrator. */
    unknownGatewayFiles: unknownCount,
  };
}
