import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { config } from "../config";
import path from "path";

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

export const formatImageUrl = (
  imagePath: string | null | undefined,
): string | null => {
  if (!imagePath) return null;
  if (/^https?:\/\//.test(imagePath)) return imagePath;
  return `${getBaseUrl()}/api/${imagePath}`;
};

export const saveBase64Image = async (
  base64: string,
  prefix: string,
  dir: string,
): Promise<string> => {
  const fs = await import("fs/promises");
  const mimeMatch = base64.match(/^data:(image\/\w+);base64,/);
  const ext =
    mimeMatch && mimeMatch[1] ? mimeMatch[1].split("/")[1] : "jpg";
  const safeExt = ext === "jpeg" ? "jpg" : ext;
  const imageBuffer = Buffer.from(
    mimeMatch ? base64.replace(/^data:image\/\w+;base64,/, "") : base64,
    "base64",
  );
  const filename = `${prefix}_${uuidv4()}.${safeExt}`;
  const relativePath = path.posix.join(dir, filename).replace(/\\/g, "/");
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