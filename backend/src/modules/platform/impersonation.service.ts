import jwt from "jsonwebtoken";
import type { Response } from "express";
import prisma from "../../config/prisma";
import { config } from "../../config";
import { ForbiddenError, NotFoundError } from "../../utils/AppError";
import { baseCookieOptions, expiresInToMs } from "../../utils/cookies";
import type { AuthContext } from "../rbac/rbac.service";

/**
 * "View as" — a platform operator seeing the console as one user sees it.
 *
 * The rules this enforces, and why each exists:
 *
 * 1. READ ONLY. Enforced centrally in `authenticate`, not by hiding buttons.
 *    A customer's audit trail must never contain an action they did not take,
 *    and a support session is not a licence to modify a tenant's data.
 *
 * 2. A SEPARATE COOKIE. Overwriting the operator's own access cookie would
 *    destroy their real session, leaving them no way back and no identity to
 *    attribute the exit to. `authenticate` prefers this cookie when present,
 *    so ending the session is simply clearing it — the operator's own session
 *    was never touched.
 *
 * 3. SHORT LIVED. A view-as session is for answering a question, not a standing
 *    key to someone's account, and an unattended browser should not keep one
 *    open indefinitely.
 *
 * 4. NO OPERATOR MAY IMPERSONATE ANOTHER OPERATOR. Otherwise the audit trail
 *    can be laundered: operator A views as operator B and every subsequent
 *    entry names B.
 *
 * 5. BOTH ENDS ARE AUDITED, attributed to the OPERATOR, never to the target.
 */

export const IMPERSONATION_COOKIE = "shm_impersonation";

/** Deliberately short. Long enough to look at a problem, not to hold a session. */
export const IMPERSONATION_EXPIRY = "15m";

export interface ImpersonationClaims {
  /** The user being viewed. Becomes req.userId for the request. */
  userId: number;
  /** The platform operator who opened the session. Never overwritten. */
  impersonatorId: number;
  /** Marks the token as an impersonation token; a normal access token has no such claim. */
  imp: true;
}

function signImpersonationToken(
  targetUserId: number,
  operatorId: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const payload: ImpersonationClaims = {
      userId: targetUserId,
      impersonatorId: operatorId,
      imp: true,
    };
    jwt.sign(
      payload,
      config.jwtSecret,
      {
        expiresIn: IMPERSONATION_EXPIRY as jwt.SignOptions["expiresIn"],
        audience: targetUserId.toString(),
        issuer: "shm-api",
      },
      (err, token) => (err || !token ? reject(err ?? new Error("Token generation failed")) : resolve(token)),
    );
  });
}

/**
 * Verifies an impersonation token.
 *
 * Returns null rather than throwing when the token is absent, malformed or
 * expired: an expired view-as session should drop the operator back into their
 * OWN session, not log them out of the product.
 */
export function verifyImpersonationToken(
  token: string | undefined,
): ImpersonationClaims | null {
  if (!token) return null;
  try {
    const claims = jwt.verify(token, config.jwtSecret, {
      issuer: "shm-api",
    }) as Partial<ImpersonationClaims>;

    // The `imp` claim is what separates this from a normal access token. Without
    // this check a plain access token placed in the impersonation cookie would
    // be honoured, and its bearer would gain the read-only exemption path.
    if (claims.imp !== true) return null;
    if (typeof claims.userId !== "number") return null;
    if (typeof claims.impersonatorId !== "number") return null;

    return {
      userId: claims.userId,
      impersonatorId: claims.impersonatorId,
      imp: true,
    };
  } catch {
    return null;
  }
}

export interface StartResult {
  token: string;
  expiresAt: Date;
  target: { id: number; emailId: string; firstName: string; lastName: string };
}

export async function startImpersonation(
  operator: AuthContext,
  targetUserId: number,
): Promise<StartResult> {
  if (!operator.isPlatformAdmin) {
    throw new ForbiddenError("Platform administrator access required");
  }

  if (targetUserId === operator.userId) {
    throw new ForbiddenError("You cannot view as yourself");
  }

  const target = await prisma.user.findFirst({
    where: { id: targetUserId, isDelete: "false_" as never },
    select: {
      id: true,
      emailId: true,
      firstName: true,
      lastName: true,
      status: true,
      isPlatformAdmin: true,
    },
  });

  if (!target) throw new NotFoundError("User not found");

  if (target.isPlatformAdmin) {
    // See rule 4 above: this is the audit-laundering guard, not a courtesy.
    throw new ForbiddenError("A platform administrator cannot be viewed as");
  }

  if (String(target.status) === "false_") {
    throw new ForbiddenError("This account is disabled");
  }

  const token = await signImpersonationToken(target.id, operator.userId);

  return {
    token,
    expiresAt: new Date(Date.now() + expiresInToMs(IMPERSONATION_EXPIRY)),
    target: {
      id: target.id,
      emailId: target.emailId,
      firstName: target.firstName,
      lastName: target.lastName,
    },
  };
}

export function setImpersonationCookie(res: Response, token: string): void {
  res.cookie(
    IMPERSONATION_COOKIE,
    token,
    baseCookieOptions(expiresInToMs(IMPERSONATION_EXPIRY)),
  );
}

export function clearImpersonationCookie(res: Response): void {
  res.clearCookie(IMPERSONATION_COOKIE, baseCookieOptions(0));
}
