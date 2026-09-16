import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { config } from "../config";
import { JwtPayload } from "../types";

export function signAccessToken(userId: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const payload: JwtPayload = { userId };
    const options: jwt.SignOptions = {
      expiresIn: config.jwtAccessExpiry as jwt.SignOptions["expiresIn"],
      audience: userId.toString(),
      issuer: "shm-api",
    };
    jwt.sign(payload, config.jwtSecret, options, (err, token) => {
      if (err || !token) {
        reject(err || new Error("Token generation failed"));
      } else {
        resolve(token);
      }
    });
  });
}

export function signRefreshToken(userId: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const payload: JwtPayload & { jti: string } = {
      userId,
      jti: uuidv4(),
    };
    const options: jwt.SignOptions = {
      expiresIn: config.jwtRefreshExpiry as jwt.SignOptions["expiresIn"],
      audience: userId.toString(),
      issuer: "shm-api",
    };
    jwt.sign(payload, config.jwtRefreshSecret, options, (err, token) => {
      if (err || !token) {
        reject(err || new Error("Token generation failed"));
      } else {
        resolve(token);
      }
    });
  });
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, config.jwtSecret, {
    issuer: "shm-api",
  }) as JwtPayload;
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, config.jwtRefreshSecret, {
    issuer: "shm-api",
  }) as JwtPayload;
}

export function signPasswordResetToken(userId: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const payload: JwtPayload & { purpose: string } = {
      userId,
      purpose: "password_reset",
    };
    const options: jwt.SignOptions = {
      expiresIn: "10m",
      issuer: "shm-api",
    };
    jwt.sign(payload, config.jwtRefreshSecret, options, (err, token) => {
      if (err || !token) {
        reject(err || new Error("Reset token generation failed"));
      } else {
        resolve(token);
      }
    });
  });
}

export function verifyPasswordResetToken(token: string): JwtPayload & {
  purpose: string;
} {
  return jwt.verify(token, config.jwtRefreshSecret, {
    issuer: "shm-api",
  }) as JwtPayload & { purpose: string };
}

/**
 * Authorises ONE thing: starting payment for the account that just registered.
 *
 * A new organization admin cannot sign in — the account is inactive until a
 * webhook confirms payment — so there is no session to authenticate a checkout
 * with. This token fills exactly that hole and nothing wider: no session, no
 * read access, thirty minutes.
 *
 * Signed with the refresh secret and stamped with a purpose, like the
 * password-reset token, so an access token cannot be presented in its place.
 */
export function signCheckoutToken(userId: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const payload: JwtPayload & { purpose: string } = {
      userId,
      purpose: "checkout",
    };
    const options: jwt.SignOptions = { expiresIn: "30m", issuer: "shm-api" };
    jwt.sign(payload, config.jwtRefreshSecret, options, (err, token) => {
      if (err || !token) {
        reject(err || new Error("Checkout token generation failed"));
      } else {
        resolve(token);
      }
    });
  });
}

export function verifyCheckoutToken(token: string): JwtPayload & {
  purpose: string;
} {
  const decoded = jwt.verify(token, config.jwtRefreshSecret, {
    issuer: "shm-api",
  }) as JwtPayload & { purpose?: string };

  // Checked explicitly: the reset token is signed with the same secret and
  // would otherwise verify here, letting a password-reset link start a charge.
  if (decoded.purpose !== "checkout") {
    throw new Error("Token purpose is not checkout");
  }
  return decoded as JwtPayload & { purpose: string };
}

/**
 * Authorises ONE thing: finishing a Google sign-in that still owes a
 * multi-factor code.
 *
 * A platform operator may sign in with Google, but Google alone must not be
 * enough — it would make one mailbox the single key to every tenant on the
 * platform. The callback therefore issues NO session; it issues this, and the
 * session is created only once the authenticator code is verified.
 *
 * Two minutes: this is the gap between picking an account and typing six
 * digits, not a session. Signed with the refresh secret and stamped with a
 * purpose, like the reset and checkout tokens, so an access token cannot be
 * presented in its place — and so this cannot be presented as one.
 */
export function signPendingMfaToken(userId: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const payload: JwtPayload & { purpose: string } = {
      userId,
      purpose: "pending_mfa",
    };
    const options: jwt.SignOptions = { expiresIn: "2m", issuer: "shm-api" };
    jwt.sign(payload, config.jwtRefreshSecret, options, (err, token) => {
      if (err || !token) {
        reject(err || new Error("Pending MFA token generation failed"));
      } else {
        resolve(token);
      }
    });
  });
}

export function verifyPendingMfaToken(token: string): JwtPayload & {
  purpose: string;
} {
  const payload = jwt.verify(token, config.jwtRefreshSecret, {
    issuer: "shm-api",
  }) as JwtPayload & { purpose: string };
  // Checked here rather than at the call site: a token minted for a password
  // reset must not finish a sign-in.
  if (payload.purpose !== "pending_mfa") {
    throw new Error("Token is not a pending multi-factor token");
  }
  return payload;
}
