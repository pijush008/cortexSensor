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

/**
 * The transport.
 *
 * Gmail stays the default so existing setups keep working, but the service is no
 * longer hardwired: setting SMTP_HOST switches to any provider. Hardwiring it
 * meant a deployment could only ever send through a Google account, and Google
 * requires an App Password rather than the account password, which is a common
 * reason mail silently fails to send.
 */
const transporter = nodemailer.createTransport(
  config.email.host
    ? {
        host: config.email.host,
        port: config.email.port,
        secure: config.email.secure,
        auth: { user: config.email.account, pass: config.email.password },
      }
    : {
        service: "gmail",
        auth: { user: config.email.account, pass: config.email.password },
      },
);

/** Whether outbound mail can be sent at all. Exported so callers can tell the
 *  difference between "sent" and "there is nowhere to send from". */
export function isEmailConfigured(): boolean {
  return Boolean(config.email.account && config.email.password);
}

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
export interface WelcomeEmailInput {
  firstName: string;
  companyName: string;
  planName: string;
  /** Integer minor units, as stored on the plan. */
  amountPaise: number;
  currency: string;
  validTill: Date;
  signInUrl: string;
}

/**
 * The "your account is ready" mail, sent once payment has been confirmed.
 *
 * Rendering is separated from sending so the wording can be tested without
 * SMTP, and so a send failure cannot be mistaken for a rendering failure.
 */
export function renderWelcomeEmail(input: WelcomeEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const amount = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: input.currency,
    minimumFractionDigits: 0,
  }).format(input.amountPaise / 100);

  const validTill = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(input.validTill);

  const subject = `${input.companyName} is ready — ${input.planName} plan active`;

  const html = `
    <p>Hello ${input.firstName},</p>
    <p>Your account has been created successfully and
       <strong>${input.companyName}</strong> is now active on the Cloudglance
       structural health monitoring platform.</p>
    <table cellpadding="6" style="border-collapse:collapse">
      <tr><td>Plan</td><td><strong>${input.planName}</strong></td></tr>
      <tr><td>Amount paid</td><td>${amount}</td></tr>
      <tr><td>Valid till</td><td>${validTill}</td></tr>
    </table>
    <p><a href="${input.signInUrl}">Open your dashboard</a></p>
    <p>You can now create projects, and add contractor and authority users to
       them.</p>
  `.trim();

  const text = [
    `Hello ${input.firstName},`,
    ``,
    `Your account has been created successfully and ${input.companyName} is now active on the Cloudglance structural health monitoring platform.`,
    ``,
    `Plan: ${input.planName}`,
    `Amount paid: ${amount}`,
    `Valid till: ${validTill}`,
    ``,
    `Open your dashboard: ${input.signInUrl}`,
  ].join("\n");

  return { subject, html, text };
}
