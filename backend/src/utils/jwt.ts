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