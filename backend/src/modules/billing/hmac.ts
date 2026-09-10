import crypto from "crypto";

/**
 * HMAC-SHA256 over the raw request body, compared in constant time.
 *
 * Lives in its own module so both `provider.ts` and the concrete adapters can
 * use it without importing each other. It previously sat in `provider.ts`,
 * which forced the Razorpay adapter to import from there and `provider.ts` to
 * load the adapter back with a lazy `require()` to dodge the cycle — that
 * `require` then failed under the ESM test runner the moment the Razorpay
 * provider was actually selected.
 *
 * The RAW body matters: verifying a re-serialized object compares a signature
 * against bytes the provider never signed, and key ordering or whitespace
 * differences would break it non-deterministically.
 */
export function verifyHmacSignature(
  rawBody: string,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature || !secret) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");

  const given = signature.trim().toLowerCase();
  const expectedBuf = Buffer.from(expected, "utf8");
  const givenBuf = Buffer.from(given, "utf8");

  // Length is checked first because timingSafeEqual throws on a mismatch, and
  // the length of a signature is not a secret.
  if (expectedBuf.length !== givenBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, givenBuf);
}
