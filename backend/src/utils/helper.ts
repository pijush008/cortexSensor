import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { config } from "../config";
import path from "path";
import { BadRequestError } from "./AppError";
import { objectStorageEnabled, putObject } from "./object-storage";

export const generateRandomPassword = (length = 6): string => {
  const digits = "0123456789";
  return Array.from({ length }, () =>
    digits.charAt(crypto.randomInt(0, digits.length)),
  ).join("");
};

export const generateVerificationToken = (userId: number): string => {
  const verificationSecret =
    process.env.USER_VERIFICATION_TOKEN_SECRET || config.jwtSecret;
  return jwt.sign({ ID: userId }, verificationSecret, { expiresIn: "24h" });
};

export const verifyVerificationToken = (token: string): { ID: number } => {
  const verificationSecret =
    process.env.USER_VERIFICATION_TOKEN_SECRET || config.jwtSecret;
  return jwt.verify(token, verificationSecret) as { ID: number };
};

export const getBaseUrl = (): string => {
  return process.env.BASE_URL || `http://localhost:${config.port}`;
};

/**
 * A stored upload path as the BROWSER should request it.
 *
 * Relative, deliberately. `formatImageUrl` below builds an ABSOLUTE url from
 * BASE_URL, which is unset in every environment here and so resolves to
 * http://localhost:3001 — the backend's own port. The app is served on :3000
 * (Next, which proxies /api) and on :80 (nginx), so an absolute URL from a
 * third origin fails for everyone except a developer on the same machine.
 *
 * A relative path resolves against whatever origin served the page, which is
 * the same invariant NEXT_PUBLIC_API_URL="/api" already relies on. Verified to
 * return 200 image/png on :3000, :80 and :3001 alike.
 *
 * `formatImageUrl` is left alone: nine project and sensor response fields still
 * use it, and changing its shape is a separate change with its own consumers.
 */
export const toPublicImagePath = (
  imagePath: string | null | undefined,
): string | null => {
  if (!imagePath) return null;
  if (/^https?:\/\//.test(imagePath)) return imagePath;
  return `/api/${imagePath.replace(/^\/+/, "")}`;
};

export const formatImageUrl = (
  imagePath: string | null | undefined,
): string | null => {
  if (!imagePath) return null;
  if (/^https?:\/\//.test(imagePath)) return imagePath;
  return `${getBaseUrl()}/api/${imagePath}`;
};

/** Extensions this helper will write. Anything else is stored as .jpg. */
const ALLOWED_IMAGE_EXTENSIONS = new Set(["png", "jpg", "webp", "gif"]);

/**
 * Turns a caller-supplied filename prefix into something safe to put in a path.
 *
 * Callers pass user-controlled text here — `input.firstName` at registration,
 * `input.sensorType` for sensor icons — and registration is UNAUTHENTICATED.
 * Before this existed, a first name of `../../../../tmp/evil` produced the path
 * `../../tmp/evil_<uuid>.png`, which `fs.mkdir(..., { recursive: true })` then
 * created and `writeFile` wrote to. Since ./backend is bind-mounted into the
 * container, that reached the host filesystem.
 */
const sanitizeFilenamePrefix = (prefix: string): string =>
  String(prefix ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || "img";

export const saveBase64Image = async (
  base64: string,
  prefix: string,
  dir: string,
): Promise<string> => {
  const fs = await import("fs/promises");
  const mimeMatch = base64.match(/^data:(image\/\w+);base64,/);
  const rawExt =
    mimeMatch && mimeMatch[1] ? mimeMatch[1].split("/")[1].toLowerCase() : "jpg";
  const normalised = rawExt === "jpeg" ? "jpg" : rawExt;

  // The extension came from the caller's own data URI, so `image/php` yielded a
  // .php file and `image/html` an .html one. Allow-listed rather than trusted.
  const safeExt = ALLOWED_IMAGE_EXTENSIONS.has(normalised) ? normalised : "jpg";

  const imageBuffer = Buffer.from(
    mimeMatch ? base64.replace(/^data:image\/\w+;base64,/, "") : base64,
    "base64",
  );
  const filename = `${sanitizeFilenamePrefix(prefix)}_${uuidv4()}.${safeExt}`;
  const relativePath = path.posix.join(dir, filename).replace(/\\/g, "/");

  // Belt and braces: even with the prefix sanitised, `dir` is caller-supplied.
  // This assertion is what still holds if someone later reintroduces an
  // unsanitised path segment, so it is the check that actually guarantees
  // containment rather than merely making traversal inconvenient.
  //
  // It runs BEFORE the object-storage branch below, and must stay there. The
  // branch was originally added above this check, which skipped it for every
  // upload once Supabase Storage was configured — i.e. in production. putObject
  // strips a leading slash but does not resolve "..", so the one guarantee this
  // function makes about where a file lands was silently not being made.
  const uploadsRoot = path.resolve("uploads");
  const absolute = path.resolve(relativePath);
  if (absolute !== uploadsRoot && !absolute.startsWith(uploadsRoot + path.sep)) {
    throw new BadRequestError("Invalid upload location");
  }

  // Object storage when it is configured. The returned https URL travels back
  // through the same field the relative path used to, and both formatImageUrl
  // and toPublicImagePath already pass absolute URLs through unchanged — so no
  // caller and no response shape has to know which of the two is in use.
  if (objectStorageEnabled()) {
    return putObject(relativePath, imageBuffer);
  }

  await fs.mkdir(path.dirname(relativePath), { recursive: true });
  await fs.writeFile(relativePath, imageBuffer);
  return relativePath;
};

export const capitalizeFirstLetter = (str: string): string =>
  str.charAt(0).toUpperCase() + str.slice(1);

export const pick = <T, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> => {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (obj[key] !== undefined) {
      result[key] = obj[key];
    }
  }
  return result;
};