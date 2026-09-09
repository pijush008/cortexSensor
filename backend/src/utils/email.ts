import nodemailer from "nodemailer";
import { config } from "../config";
import { logger } from "./logger";

export interface MailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  bcc?: string;
}

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: config.email.account,
    pass: config.email.password,
  },
});

/**
 * Whether outbound mail is configured at all.
 *
 * Without this check every send attempts a real SMTP connection and fails with
 * an EAUTH stack trace — which happens on every registration in the test suite,
 * burying real failures in noise, and in a misconfigured deployment produces a
 * stack trace per email instead of one clear statement of the problem.
 */
const emailConfigured = Boolean(config.email.account && config.email.password);

let warnedUnconfigured = false;

export async function sendEmail({
  to,
  subject,
  html,
  text,
  bcc,
}: MailOptions): Promise<boolean> {
  if (!emailConfigured) {
    // Warn once, not once per message.
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      logger.warn(
        "Email is not configured (GMAIL_ACCOUNT / GMAIL_PASSWORD unset); outbound mail is being skipped.",
      );
    }
    return false;
  }

  try {
    const info = await transporter.sendMail({
      from: config.email.from,
      to,
      subject,
      html,
      text,
      bcc,
    });
    logger.info(`Email sent to ${to}: ${info.messageId}`);
    return true;
  } catch (err) {
    logger.error(`Failed to send email to ${to}`, err as Error);
    return false;
  }
}