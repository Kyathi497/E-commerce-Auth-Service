import { Injectable } from "@nestjs/common";
import { config } from "../config.js";
import type { User, VerificationType } from "../generated/prisma/client.js";
import { MailerService } from "../mail/mailer.service.js";
import { passwordResetMail, verifyEmailMail } from "../mail/templates.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { hashToken, newToken } from "./secrets.js";

type Tx = Parameters<Parameters<PrismaService["$transaction"]>[0]>[0];

export const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
// One email of each kind per minute per account.
const RESEND_GAP_MS = 60 * 1000;

// Single-use, hashed, expiring tokens for email links (§6.2). The token goes in
// the URL fragment (#token=…), which browsers never send to a server, so it
// can't end up in access logs or Referer headers.
@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
  ) {}

  async sentRecently(userId: string, type: VerificationType) {
    const last = await this.prisma.verificationToken.findFirst({
      where: { userId, type },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    return last !== null && Date.now() - last.createdAt.getTime() < RESEND_GAP_MS;
  }

  // Issuing a new token retires any older unused one of the same type.
  async issue(userId: string, type: VerificationType, ttlMs: number) {
    const token = newToken();
    await this.prisma.$transaction([
      this.prisma.verificationToken.updateMany({
        where: { userId, type, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.verificationToken.create({
        data: { userId, type, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + ttlMs) },
      }),
    ]);
    return token;
  }

  // Marks the token used and returns its user, or null if it is unknown,
  // expired, already used or of another type.
  async consume(rawToken: string, type: VerificationType, tx: Tx) {
    const record = await tx.verificationToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      include: { user: true },
    });
    if (!record || record.type !== type || record.usedAt || record.expiresAt <= new Date()) return null;
    const { count } = await tx.verificationToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    return count === 1 ? record.user : null;
  }

  async sendEmailVerification(user: Pick<User, "id" | "email" | "name">) {
    const token = await this.issue(user.id, "email_verify", EMAIL_VERIFY_TTL_MS);
    this.mailer.sendInBackground(verifyEmailMail(user.email, user.name, `${config.FRONTEND_URL}/verify-email#token=${token}`));
  }

  async sendPasswordReset(user: Pick<User, "id" | "email" | "name">, ttlMs = PASSWORD_RESET_TTL_MS) {
    const token = await this.issue(user.id, "password_reset", ttlMs);
    const link = `${config.FRONTEND_URL}/reset-password#token=${token}`;
    const validFor = ttlMs >= 60 * 60 * 1000 ? `${Math.round(ttlMs / 3_600_000)} hours` : `${Math.round(ttlMs / 60_000)} minutes`;
    this.mailer.sendInBackground(passwordResetMail(user.email, user.name, link, validFor));
    return link;
  }
}
