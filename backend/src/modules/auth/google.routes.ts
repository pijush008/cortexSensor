import { Router, type Request, type Response } from "express";
import { config } from "../../config";
import prisma from "../../config/prisma";
import { logger } from "../../utils/logger";
import { ForbiddenError } from "../../utils/AppError";
import { signPendingMfaToken, verifyPendingMfaToken } from "../../utils/jwt";
import { verifyUserToken } from "./mfa.service";
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

/**
 * Carries a Google sign-in that still owes an authenticator code.
 *
 * httpOnly, so the page collecting the code cannot read it — the browser simply
 * returns it with the request. Short-lived to match the token inside it: this
 * is the gap between picking a Google account and typing six digits.
 *
 * `lax`, not `strict`: the browser arrives here on a redirect FROM Google, and
 * a strict cookie is withheld on a cross-site navigation — the flow would lose
 * it at the only moment it matters.
 */
export const PENDING_MFA_COOKIE = "shm_pending_mfa";

function pendingMfaCookieOptions() {
  return {
    ...baseCookieOptions(2 * 60 * 1000),
    sameSite: "lax" as const,
  };
}

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

    // A platform operator owes a second factor before any session exists.
    //
    // NO cookies are set on this branch. Issuing a session here and asking for
    // the code afterwards would make the code decorative: the browser would
    // already hold a working operator session while the form was on screen.
    const account = await prisma.user.findUnique({
      where: { id: userId },
      select: { isPlatformAdmin: true, mfaEnabledAt: true },
    });

    if (account?.isPlatformAdmin) {
      // resolveUser already refused an operator with no authenticator, so
      // reaching here without one would be a bug rather than a user error.
      if (!account.mfaEnabledAt) {
        throw new ForbiddenError(
          "This operator account needs an authenticator app before it can use Google.",
        );
      }
      const pending = await signPendingMfaToken(userId);
      res.cookie(PENDING_MFA_COOKIE, pending, pendingMfaCookieOptions());
      return res.redirect(appUrl("/login?mfa=google"));
    }

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
    const reason = /authenticator app/i.test(message)
      ? "google_mfa_required"
      : /administrator account/i.test(message)
        ? "google_admin"
        : /not verified/i.test(message)
          ? "google_unverified"
          : "google_failed";
    return res.redirect(appUrl(`/login?error=${reason}`));
  }
});

/**
 * Second leg of an operator's Google sign-in: check the authenticator code.
 *
 * This is the ONLY place a session is issued for that path. The account is
 * identified by the signed pending cookie, never by anything the client sends,
 * so submitting somebody else's user id proves nothing.
 *
 * The pending cookie is cleared on every outcome. Leaving it after a failure
 * would let an attacker who reached this screen keep retrying codes against a
 * still-valid pending token for as long as it lived.
 */
router.post("/auth/google/mfa", async (req: Request, res: Response) => {
  const pending = (req.cookies as Record<string, string> | undefined)?.[
    PENDING_MFA_COOKIE
  ];
  const clear = () => res.clearCookie(PENDING_MFA_COOKIE, pendingMfaCookieOptions());

  if (!pending) {
    return res.status(401).json({
      status_code: 401,
      message: "Start the Google sign-in again",
    });
  }

  const token = String((req.body as { mfaToken?: unknown })?.mfaToken ?? "").trim();
  if (!/^\d{6}$/.test(token)) {
    return res
      .status(400)
      .json({ status_code: 400, message: "Enter the 6-digit code from your authenticator" });
  }

  let userId: number;
  try {
    userId = Number(verifyPendingMfaToken(pending).userId);
  } catch {
    clear();
    return res
      .status(401)
      .json({ status_code: 401, message: "That sign-in expired. Start again." });
  }

  try {
    await verifyUserToken(userId, token);
  } catch {
    // The pending token is spent whether or not the code was right, so a wrong
    // code costs a fresh trip through Google rather than another guess.
    clear();
    return res
      .status(401)
      .json({ status_code: 401, message: "That code is not correct. Start the sign-in again." });
  }

  const accessToken = await generateAccessToken(userId);
  const refreshToken = await issueRefreshToken(userId);
  setAuthCookies(res, accessToken, refreshToken);
  clear();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { userType: true },
  });

  await auditLogger.audit({
    userId,
    action: "verify",
    entity: "user",
    entityId: userId,
    // Security-relevant: records that a platform operator cleared a second
    // factor, which is the moment a cross-tenant session begins.
    newValue: { signedInWith: "google", secondFactor: "totp" },
    ...auditLogger.requestContext(req),
  });

  return res.status(200).json({
    status_code: 200,
    message: null,
    error: null,
    userID: userId,
    type: user?.userType ?? null,
  });
});

export default router;
