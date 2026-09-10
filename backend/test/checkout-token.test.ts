import { describe, expect, test } from "vitest";
import {
  signAccessToken,
  signCheckoutToken,
  signPasswordResetToken,
  verifyCheckoutToken,
} from "../src/utils/jwt";

describe("checkout token", () => {
  test("round-trips the user id", async () => {
    const token = await signCheckoutToken(4242);
    expect(verifyCheckoutToken(token).userId).toBe(4242);
  });

  test("rejects an access token — a session is not permission to charge", async () => {
    const access = await signAccessToken(4242);
    expect(() => verifyCheckoutToken(access)).toThrow();
  });

  test("rejects a password-reset token: same secret, different purpose", async () => {
    const reset = await signPasswordResetToken(4242);
    expect(() => verifyCheckoutToken(reset)).toThrow(/purpose/i);
  });

  test("rejects a tampered token", async () => {
    const token = await signCheckoutToken(4242);
    const tampered = token.slice(0, -3) + "aaa";
    expect(() => verifyCheckoutToken(tampered)).toThrow();
  });
});
