import { CookieOptions, Response } from "express";
import { config } from "../config";

export const ACCESS_COOKIE = "shm_access";
export const REFRESH_COOKIE = "shm_refresh";

export function expiresInToMs(expiresIn: string): number {
  const value = Number(expiresIn.replace(/[a-z]/gi, ""));
  if (expiresIn.endsWith("s")) return value * 1000;
  if (expiresIn.endsWith("m")) return value * 60 * 1000;
  if (expiresIn.endsWith("h")) return value * 60 * 60 * 1000;
  if (expiresIn.endsWith("d")) return value * 24 * 60 * 60 * 1000;
  return value * 1000;
}

export function baseCookieOptions(maxAge: number): CookieOptions {
  return {
    httpOnly: true,
    secure: config.nodeEnv === "production",
    sameSite: "strict",
    path: "/",
    maxAge,
  };
}

export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
): void {
  res.cookie(
    ACCESS_COOKIE,
    accessToken,
    baseCookieOptions(expiresInToMs(config.jwtAccessExpiry)),
  );
  res.cookie(
    REFRESH_COOKIE,
    refreshToken,
    baseCookieOptions(expiresInToMs(config.jwtRefreshExpiry)),
  );
}

export function clearAuthCookies(res: Response): void {
  const opts = baseCookieOptions(0);
  res.clearCookie(ACCESS_COOKIE, opts);
  res.clearCookie(REFRESH_COOKIE, opts);
}