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

export async function sendEmail({
  to,
  subject,
  html,
  text,
  bcc,
}: MailOptions): Promise<boolean> {
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