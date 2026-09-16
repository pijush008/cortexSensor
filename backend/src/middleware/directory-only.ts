import prisma from "../config/prisma";
import { AuthRequest } from "./auth";
import { ForbiddenError } from "../utils/AppError";
import { ACCESS_COOKIE } from "../utils/cookies";
import { verifyAccessToken } from "../utils/jwt";
import { IMPERSONATION_COOKIE, verifyImpersonationToken } from "../modules/platform/impersonation.service";
import { resolveAuthContext } from "../modules/rbac/rbac.service";

/**
 * Confines an organization-less session to the project directory.
 *
 * A self-service sign-up (Google) is a real authenticated user who belongs to
 * no organization. Authentication alone is therefore no longer evidence of any
 * relationship with the platform's data, and a large number of routes guard
 * themselves with `authenticate` and nothing else — the dashboard graph
 * endpoints, the raw sensor and node data, project mutations, stakeholder
 * management. Before self-service sign-up every authenticated user was someone
 * an administrator had deliberately created, so that was merely loose; with
 * self-service sign-up it would mean anyone holding a Google account could read
 * measurements and edit projects.
 *
 * Rather than add a permission to forty routes and depend on every future route
 * remembering one, this is mounted globally, exactly as
 * `enforceImpersonationReadOnly` is and for the same reason: a rule enforced in
 * one place cannot be forgotten by a route that has not been written yet.
 *
 * It is deny-by-default. A tenantless, non-platform session may reach only the
 * paths named below; everything else is refused, including every write.
 */

/** Read-only paths a directory-only session may reach. */
const ALLOWED_GET = [
  // The directory listing itself — the one feature this session has.
  /^\/projects\/\d+$/,
  // Who am I, so the client can render the shell and the sign-out control.
  /^\/me$/,
  /^\/auth\/google\/status$/,
  /^\/health$/,
  /^\/ready$/,
];

/**
 * Paths reachable with any method.
 *
 * Owning an account is not the same as having access to data. Someone with no
 * organization must still be able to correct their own name, change their own
 * password and end their own session — refusing those turns a narrow data
 * restriction into an account they cannot administer at all, which is how this
 * middleware first broke the profile suite.
 */
const ALLOWED_ANY = [
  /^\/logout$/,
  /^\/refresh$/,
  /^\/me$/,
  /^\/changePassword$/,
  /^\/mfa\/(enrol|confirm|disable)$/,
];

/** Strips the mount prefix so one pattern covers /api and /api/v1 alike. */
function normalize(path: string): string {
  return path.replace(/^\/api(\/v1)?/, "") || "/";
}

export const restrictDirectoryOnlySessions = async (
  req: AuthRequest,
  _res: unknown,
  next: (err?: Error) => void,
): Promise<void> => {
  try {
    // Mounted globally, so it runs BEFORE any route's own `authenticate` and
    // cannot read req.auth. The session is resolved from the cookie here for
    // the same reason enforceImpersonationReadOnly does: a rule that depends on
    // a route remembering to authenticate is not a rule.
    //
    // Only sessions this middleware can identify are constrained. An
    // unauthenticated or unreadable request is passed through to the route's
    // own auth, which refuses it; this must never become a second, weaker
    // authentication path.
    const cookies = req.cookies as Record<string, string> | undefined;
    const header = req.headers["authorization"];
    const bearer =
      header?.startsWith("Bearer ") === true ? header.slice(7) : null;
    const token = bearer ?? cookies?.[ACCESS_COOKIE];
    if (!token) return next();

    // A view-as session is the platform operator's, already constrained to
    // read-only elsewhere. It is not a directory-only session.
    if (verifyImpersonationToken(cookies?.[IMPERSONATION_COOKIE])) return next();

    let userId: number;
    try {
      userId = verifyAccessToken(token).userId;
    } catch {
      // Expired or forged: not this middleware's to judge.
      return next();
    }
    if (!userId) return next();

    const ctx = await resolveAuthContext(userId);
    if (ctx.isPlatformAdmin) return next();
    if (ctx.tenantId !== null) return next();

    // Tenantless, but holding permissions from a role: not a directory-only
    // session. Leave it to the ordinary permission checks.
    if (!ctx.permissions.has("PROJECT_BROWSE") || ctx.permissions.size !== 1) {
      return next();
    }

    // The legacy userType and isPlatformAdmin can disagree — an operator
    // account predating the flag carries `superadmin` without it. Confining
    // such an account would lock platform staff out of the platform, so the
    // elevated legacy roles are never treated as directory-only. An account an
    // administrator created deliberately is not a self-service sign-up.
    const account = await prisma.user.findUnique({
      where: { id: userId },
      select: { userType: true },
    });
    if (account?.userType !== "viewer") return next();

    const path = normalize(req.path);
    if (ALLOWED_ANY.some((p) => p.test(path))) return next();
    if (req.method === "GET" && ALLOWED_GET.some((p) => p.test(path))) {
      return next();
    }

    return next(
      new ForbiddenError(
        "This account can browse the project directory only. Ask an administrator to add you to an organization.",
      ),
    );
  } catch {
    // A failure to resolve must not open the door.
    return next(new ForbiddenError("Access could not be determined"));
  }
};
