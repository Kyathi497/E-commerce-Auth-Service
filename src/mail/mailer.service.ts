import { Injectable } from "@nestjs/common";
import nodemailer, { type Transporter } from "nodemailer";
import { config } from "../config.js";
import { logger } from "../logger.js";

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

// Sends account emails through the SMTP server configured in SMTP_*.
// Phase 5 moves this behind notification-service events; callers stay the same.
@Injectable()
export class MailerService {
  private readonly transport: Transporter | null = config.SMTP_HOST
    ? nodemailer.createTransport({
        host: config.SMTP_HOST,
        port: config.SMTP_PORT,
        secure: config.SMTP_SECURE,
        auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
      })
    : null;

  async send(mail: Mail) {
    if (!this.transport) {
      // Dev without SMTP: the text (with its link) goes to the log so the flow can be finished by hand.
      logger.warn({ subject: mail.subject, text: mail.text }, "SMTP_HOST not set; email not sent");
      return;
    }
    await this.transport.sendMail({ from: config.MAIL_FROM, ...mail });
  }

  // For flows where the user shouldn't wait on (or learn about) delivery.
  sendInBackground(mail: Mail) {
    this.send(mail).catch((err) => logger.error({ err, subject: mail.subject }, "email failed"));
  }
}
