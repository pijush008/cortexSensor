import { promises as fs } from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { BadRequestError } from "./AppError";

/**
 * Validated image upload.
 *
 * A deliberately separate helper from `saveBase64Image` in helper.ts, which
 * validates NOTHING — no size cap, no type check, and it interpolates a
 * caller-supplied prefix straight into the filename. That helper has five
 * existing callers (projects, sensor types, user avatars) whose payloads are not
 * known to satisfy stricter rules, so tightening it in place risks breaking
 * working paths for no benefit to this change. New code uses this one; the old
 * callers can be migrated deliberately, one at a time.
 *
 * This matters more than the usual "validate your inputs" because the first
 * caller is organization registration, which is UNAUTHENTICATED. Without these
 * checks that endpoint is an anonymous write-to-disk primitive with whatever
 * allowance the JSON body parser happens to have.
 */

/** Generous for a logo, small enough that abuse is bounded. */
export const DEFAULT_MAX_BYTES = 600 * 1024;

interface Signature {
  ext: string;
  /** Returns true when the buffer begins with this format's magic bytes. */
  matches: (b: Buffer) => boolean;
}

/**
 * Formats accepted, identified by their MAGIC BYTES rather than by the
 * `data:image/...` prefix, which is supplied by the caller and therefore proves
 * nothing. A file claiming to be a PNG is only a PNG if it starts like one.
 *
 * SVG is absent on purpose. Uploads are served by express.static without
 * authentication; helmet's CSP currently blocks inline script and event
 * handlers, so an SVG is not an open hole today, but that protection is a
 * setting somebody could relax without realising it is load-bearing, SVG can
 * still reference external resources, and a raster format can be verified with
 * four bytes where SVG would need parsing. A company logo loses nothing by
 * being a PNG.
 */
const SIGNATURES: Signature[] = [
  {
    ext: "png",
    matches: (b) =>
      b.length > 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47 &&
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a,
  },
  {
    ext: "jpg",
    matches: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    ext: "webp",
    // "RIFF" .... "WEBP" — the size field sits between the two markers.
    matches: (b) =>
      b.length > 12 &&
      b.toString("ascii", 0, 4) === "RIFF" &&
      b.toString("ascii", 8, 12) === "WEBP",
  },
];

export const ACCEPTED_FORMATS = SIGNATURES.map((s) => s.ext).join(", ");

export interface SaveImageOptions {
  /** Destination directory, relative to the process working directory. */
  dir: string;
  /** Cap on the DECODED size. Defaults to DEFAULT_MAX_BYTES. */
  maxBytes?: number;
}

/**
 * Decodes, validates and stores an image supplied as a data URI.
 *
 * Returns the relative path to store in the database — the same shape
 * `saveBase64Image` returns, so it drops into the existing `formatImageUrl`
 * and `/api/uploads` serving path unchanged.
 *
 * Throws BadRequestError with a message safe to show a user.
 */
export async function saveImageUpload(
  dataUri: string,
  { dir, maxBytes = DEFAULT_MAX_BYTES }: SaveImageOptions,
): Promise<string> {
  if (typeof dataUri !== "string" || dataUri.length === 0) {
    throw new BadRequestError("No image was provided");
  }

  const match = /^data:image\/([a-zA-Z0-9.+-]+);base64,(.*)$/s.exec(dataUri.trim());
  if (!match) {
    throw new BadRequestError(
      `Upload a ${ACCEPTED_FORMATS} image file (the data was not a base64 image)`,
    );
  }

  const payload = match[2];

  // A cheap ceiling BEFORE allocating: base64 is 4 characters per 3 bytes, so
  // this rejects an oversized payload without decoding it into memory first.
  // Decoding a 50 MB string only to measure it is the denial-of-service this
  // check exists to avoid.
  if (Math.floor((payload.length * 3) / 4) > maxBytes * 1.1) {
    throw new BadRequestError(
      `That image is too large. The limit is ${Math.round(maxBytes / 1024)} KB.`,
    );
  }

  const buffer = Buffer.from(payload, "base64");

  // The real check, on the decoded bytes. base64 inflates by about a third, so
  // a limit on the string is not a limit on the file.
  if (buffer.length === 0) {
    throw new BadRequestError("That image could not be read");
  }
  if (buffer.length > maxBytes) {
    throw new BadRequestError(
      `That image is too large. The limit is ${Math.round(maxBytes / 1024)} KB.`,
    );
  }

  const signature = SIGNATURES.find((s) => s.matches(buffer));
  if (!signature) {
    // Deliberately does not repeat what the data URI claimed the type was —
    // the point is that the claim is irrelevant.
    throw new BadRequestError(`Upload a ${ACCEPTED_FORMATS} image file`);
  }

  // The filename comes from a UUID and the VERIFIED extension. Nothing the
  // caller supplied reaches the path, so there is no traversal to sanitise.
  const filename = `${uuidv4()}.${signature.ext}`;
  const relativePath = path.posix.join(dir, filename);

  await fs.mkdir(path.dirname(relativePath), { recursive: true });
  await fs.writeFile(relativePath, buffer);

  return relativePath;
}
