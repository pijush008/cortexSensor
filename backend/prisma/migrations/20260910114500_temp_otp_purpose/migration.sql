-- A one-time code is only valid for the thing it was issued for.
--
-- validateOTP trades a code for a password-reset token. Once sign-in also
-- mails a code, sharing this table without a discriminator would let a second
-- factor be redeemed as a password reset. Existing rows are password resets,
-- which is why that is the default.
ALTER TABLE "temp_otps" ADD COLUMN "purpose" VARCHAR(32) NOT NULL DEFAULT 'password_reset';
CREATE INDEX "temp_otps_userId_purpose_idx" ON "temp_otps"("userId", "purpose");
