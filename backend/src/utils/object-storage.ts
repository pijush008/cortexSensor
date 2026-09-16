import { logger } from "./logger";

/**
 * Supabase Storage, for the images that used to be written to local disk.
 *
 * Why this exists at all: `saveBase64Image` wrote into ./uploads and
 * `express.static` served it back. That is a single-instance design. Two API
 * instances behind nginx do not share a filesystem, so an image uploaded to
 * instance A 404s for anyone routed to instance B, and every container restart
 * on an ephemeral filesystem loses the lot. The uploads directory was the one
 * thing preventing this service from being replicated.
 *
 * The return value is a fully-qualified https URL. That is what makes this a
 * drop-in: `formatImageUrl` and `toPublicImagePath` both already pass absolute
 * URLs through untouched, so every existing consumer keeps working without
 * changing a single response shape.
 *
 * Reads its configuration lazily, on purpose — see the note in config/redis.ts
 * about a module-level `const` capturing process.env before dotenv has run.
 */

interface StorageConfig {
  url: string;
  key: string;
  bucket: string;
}

function storageConfig(): StorageConfig | null {
  const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "";
  if (!url || !key || !bucket) return null;
  return { url, key, bucket };
}

/** True when uploads should go to Supabase rather than the local filesystem. */
export function objectStorageEnabled(): boolean {
  return storageConfig() !== null;
}

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
};

export function contentTypeFor(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

/**
 * Stores an object and returns its public URL.
 *
 * Throws on failure rather than falling back to disk. A silent fallback would
 * write the file somewhere only one instance can see while telling the caller
 * everything worked — the exact failure this module exists to remove.
 */
export async function putObject(
  key: string,
  body: Buffer,
  contentType = contentTypeFor(key),
): Promise<string> {
  const cfg = storageConfig();
  if (!cfg) throw new Error("Object storage is not configured");

  const clean = key.replace(/^\/+/, "");
  const endpoint = `${cfg.url}/storage/v1/object/${cfg.bucket}/${clean}`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.key}`,
      apikey: cfg.key,
      "Content-Type": contentType,
      // Overwrite rather than 409 on a repeated key. Keys carry a uuid, so a
      // collision means a retry of the same upload, not a different image.
      "x-upsert": "true",
    },
    body: new Uint8Array(body),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Supabase Storage upload failed (${res.status}) for ${clean}: ${detail.slice(0, 200)}`,
    );
  }

  return publicUrlFor(clean);
}

/** The CDN-backed public URL for a stored object. */
export function publicUrlFor(key: string): string {
  const cfg = storageConfig();
  if (!cfg) throw new Error("Object storage is not configured");
  return `${cfg.url}/storage/v1/object/public/${cfg.bucket}/${key.replace(/^\/+/, "")}`;
}

/** Logged once at start-up so it is obvious which mode a deployment is in. */
export function logStorageMode(): void {
  const cfg = storageConfig();
  if (cfg) {
    logger.info(`Image uploads -> Supabase Storage (bucket "${cfg.bucket}")`);
  } else {
    logger.warn(
      "Image uploads -> local ./uploads (set SUPABASE_URL, " +
        "SUPABASE_SERVICE_ROLE_KEY and SUPABASE_STORAGE_BUCKET to use object " +
        "storage; local disk cannot be shared between API instances)",
    );
  }
}
