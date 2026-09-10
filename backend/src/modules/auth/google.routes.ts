import { Router, type Request, type Response } from "express";
import { config } from "../../config";
import { logger } from "../../utils/logger";
import { baseCookieOptions, setAuthCookies } from "../../utils/cookies";
import { auditLogger } from "../../utils/audit";
import { generateAccessToken } from "./auth.service";
import { issueRefreshToken } from "./refresh-token.service";
import {
  OAUTH_STATE_COOKIE,
  STATE_TTL_MS,
  authorizationUrl,
  createState,
  exchangeCode,
  isGoogleConfigured,
  resolveUser,
} from "./google.service";

const router = Router();

/** Where the browser is sent when the flow ends. */
function appUrl(path: string): string {
  return `${(config.appUrl ?? "http://localhost:3000").replace(/\/+$/, "")}${path}`;
}

/**
 * Whether the button should be shown at all.
 *
 * The frontend asks rather than guessing, so an unconfigured deployment does
 * not offer a control that cannot work.
 */
router.get("/auth/google/status", (_req: Request, res: Response) => {
  res.json({
    status_code: 200,
    message: null,
    data: { available: isGoogleConfigured() },
  });
});

/** Starts the flow. */
router.get("/auth/google", (_req: Request, res: Response) => {
  if (!isGoogleConfigured()) {
    // 503, not 500: the service is fine, this feature has no credentials.
    return res.status(503).json({
      status_code: 503,
      message:
        "Google sign-in is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
    });
  }

  const state = createState();

  // Held in a cookie rather than in server memory, so the check survives a
  // restart and works across instances behind a load balancer.
  res.cookie(OAUTH_STATE_COOKIE, state, {
    ...baseCookieOptions(STATE_TTL_MS),
    // Must survive the cross-site redirect back from Google, which "strict"
    // would drop — the returning request would arrive with no state at all and
    // every sign-in would fail the check it is supposed to pass.
    sameSite: "lax",
  });

  return res.redirect(authorizationUrl(state));
});

/** Google sends the browser back here with a one-time code. */
router.get("/auth/google/callback", async (req: Request, res: Response) => {
  if (!isGoogleConfigured()) {
    return res.redirect(appUrl("/login?error=google_unavailable"));
  }

  const cookies = (req.cookies ?? {}) as Record<string, string>;
  const expectedState = cookies[OAUTH_STATE_COOKIE];
  res.clearCookie(OAUTH_STATE_COOKIE, baseCookieOptions(0));

  const { code, state, error } = req.query as Record<string, string | undefined>;

  // The person pressed cancel on Google's screen. Not worth an error page.
  if (error) {
    return res.redirect(appUrl("/login?error=google_cancelled"));
  }

  // This check is what stops a third party completing the flow inside someone
  // else's browser and signing them into an account the attacker controls.
  if (!code || !state || !expectedState || state !== expectedState) {
    logger.warn("Google callback rejected: missing or mismatched state");
    return res.redirect(appUrl("/login?error=google_state"));
  }

  try {
    const identity = await exchangeCode(code);
    const userId = await resolveUser(identity);

    const accessToken = await generateAccessToken(userId);
    const refreshToken = await issueRefreshToken(userId);
    setAuthCookies(res, accessToken, refreshToken);

    await auditLogger.audit({
      userId,
      action: "verify",
      entity: "user",
      entityId: userId,
      newValue: { signedInWith: "google" },
      ...auditLogger.requestContext(req),
    });

    return res.redirect(appUrl("/dashboard"));
  } catch (err) {
    const message = (err as Error).message ?? "Google sign-in failed";
    logger.warn(`Google sign-in refused: ${message}`);

    // The reason travels as a fixed code, never as server text, so this URL
    // cannot be used to render arbitrary content on the login page.
    const reason = /administrator account/i.test(message)
      ? "google_admin"
      : /not verified/i.test(message)
        ? "google_unverified"
        : "google_failed";
    return res.redirect(appUrl(`/login?error=${reason}`));
  }
});

export default router;
