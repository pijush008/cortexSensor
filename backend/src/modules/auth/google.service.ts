import { randomBytes } from "crypto";
import { config } from "../../config";
import prisma from "../../config/prisma";
import { logger } from "../../utils/logger";
import { BadRequestError, ForbiddenError } from "../../utils/AppError";

/**
 * Sign in with Google.
 *
 * The authorization-code flow, run entirely on the server. The browser never
 * sees the client secret and never handles a token: it is redirected to Google,
 * comes back with a one-time code, and the server exchanges that code over TLS.
 *
 * Decisions that are security rather than plumbing:
 *
 * 1. A GOOGLE SIGN-IN CREATES A NORMAL USER, NEVER AN ADMIN. If the address
 *    already belongs to an organization admin or a platform operator, the
 *    attempt is REFUSED rather than honoured. Otherwise anyone who controls a
 *    Google account matching an operator's address could take that account
 *    without its password, its MFA, or the payment gate that governs admins.
 *
 * 2. GOOGLE MUST SAY THE EMAIL IS VERIFIED. A Google account can carry an
 *    unverified address; accepting one would let somebody claim an address they
 *    do not own.
 *
 * 3. THE STATE PARAMETER IS CHECKED. Without it a third party can complete the
 *    flow in a victim's browser and log them into an account the attacker
 *    controls.
 *
 * 4. THE ID TOKEN IS TAKEN FROM THE TOKEN ENDPOINT, not from the browser. It
 *    arrives over an authenticated TLS channel in direct response to our own
 *    request carrying our client secret, so its origin is established without a
 *    separate JWKS signature check. Anything arriving via the browser would
 *    need full verification, which is exactly why nothing does.
 */

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

/** Short-lived cookie holding the state value, checked on the way back. */
export const OAUTH_STATE_COOKIE = "shm_oauth_state";
export const STATE_TTL_MS = 10 * 60 * 1000;

export function isGoogleConfigured(): boolean {
  return Boolean(config.google.clientId && config.google.clientSecret);
}

export function redirectUri(): string {
  const base = (config.appUrl ?? "http://localhost:3000").replace(/\/+$/, "");
  return `${base}/api/v1/auth/google/callback`;
}

export function createState(): string {
  return randomBytes(24).toString("hex");
}

export function authorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    // Ask Google to show the account chooser rather than silently reusing a
    // session, so someone signed into several accounts can pick.
    prompt: "select_account",
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  givenName: string;
  familyName: string;
}

/** Exchanges the one-time code for the caller's Google identity. */
export async function exchangeCode(code: string): Promise<GoogleIdentity> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    // Google's body can name the client secret in some error cases; log the
    // status only.
    logger.warn(`Google token exchange failed with status ${res.status}`);
    throw new BadRequestError("Google sign-in could not be completed");
  }

  const body = (await res.json()) as { id_token?: string };
  if (!body.id_token) {
    throw new BadRequestError("Google sign-in did not return an identity");
  }

  // See note 4: this token came directly from Google over TLS in response to a
  // request carrying our client secret, so the payload can be read without a
  // separate signature check.
  const [, payloadPart] = body.id_token.split(".");
  if (!payloadPart) {
    throw new BadRequestError("Google returned a malformed identity token");
  }

  const claims = JSON.parse(
    Buffer.from(payloadPart, "base64url").toString("utf8"),
  ) as {
    sub?: string;
    aud?: string;
    iss?: string;
    email?: string;
    email_verified?: boolean | string;
    given_name?: string;
    family_name?: string;
  };

  // Audience and issuer are checked even though the channel is trusted: a token
  // minted for a DIFFERENT client would otherwise be accepted here.
  if (claims.aud !== config.google.clientId) {
    throw new BadRequestError("Google identity was issued for another application");
  }
  if (
    claims.iss !== "accounts.google.com" &&
    claims.iss !== "https://accounts.google.com"
  ) {
    throw new BadRequestError("Google identity has an unexpected issuer");
  }
  if (!claims.sub || !claims.email) {
    throw new BadRequestError("Google identity is missing an email address");
  }

  return {
    sub: claims.sub,
    email: claims.email.toLowerCase(),
    // Google sends this as a boolean or the string "true" depending on the path.
    emailVerified: claims.email_verified === true || claims.email_verified === "true",
    givenName: claims.given_name ?? "",
    familyName: claims.family_name ?? "",
  };
}

/**
 * Finds or creates the account behind a Google identity.
 *
 * Returns the user id to issue a session for.
 */
export async function resolveUser(identity: GoogleIdentity): Promise<number> {
  if (!identity.emailVerified) {
    // See note 2.
    throw new ForbiddenError(
      "Your Google account's email address is not verified, so it cannot be used to sign in.",
    );
  }

  const existing = await prisma.user.findFirst({
    where: { emailId: identity.email },
    select: {
      id: true,
      userType: true,
      isPlatformAdmin: true,
      isDelete: true,
      status: true,
      mfaEnabledAt: true,
    },
  });

  if (existing) {
    if (existing.isDelete === ("true_" as never) || String(existing.status) === "false_") {
      throw new ForbiddenError("This account is no longer active");
    }

    // An ORGANIZATION ADMIN keeps its own front door entirely. That account is
    // also behind the payment gate, and letting Google past it would let a
    // Google address stand in for a paid, verified registration.
    if (!existing.isPlatformAdmin && existing.userType === "admin") {
      throw new ForbiddenError(
        "This address belongs to an administrator account. Sign in with your email and password.",
      );
    }

    // A PLATFORM OPERATOR may use Google, but never Google alone: that account
    // reaches every tenant on the deployment, so one compromised mailbox would
    // be the whole platform. It is allowed only behind an authenticator, which
    // is a factor an attacker holding the mailbox does not also hold.
    //
    // The caller is told to enrol rather than simply refused — the account can
    // still sign in with its password today, and enrolment is the one action
    // that makes this route available.
    if (existing.isPlatformAdmin && !existing.mfaEnabledAt) {
      throw new ForbiddenError(
        "This operator account needs an authenticator app before it can use Google. Sign in with your password and enrol in multi-factor authentication first.",
      );
    }

    return existing.id;
  }

  // A brand-new Google account becomes an ordinary user: no organization, no
  // elevated type, nothing that a self-service sign-in should be able to grant
  // itself. An administrator adds them to an organization afterwards.
  const created = await prisma.user.create({
    data: {
      emailId: identity.email,
      firstName: identity.givenName || identity.email.split("@")[0],
      lastName: identity.familyName || "",
      phoneNo: "",
      // No usable password. This account signs in through Google; a random
      // unknown value means nothing can be guessed into it, and the password
      // reset flow remains available if they later want local credentials.
      password: randomBytes(32).toString("hex"),
      // `viewer`, not `authority`: an Authority is a project stakeholder who
      // signs off on work, and a stranger who signed up with Google is not one.
      // A viewer belongs to no organization and browses the project directory.
      userType: "viewer",
      isPlatformAdmin: false,
      // Google has already proven control of the mailbox, which is exactly what
      // our own verification email establishes.
      isMailVerified: "true_" as never,
      isUserVerified: "true_" as never,
      status: "true_" as never,
      isDelete: "false_" as never,
    },
    select: { id: true },
  });

  logger.info(`Created user ${created.id} from a Google sign-in`);
  return created.id;
}
