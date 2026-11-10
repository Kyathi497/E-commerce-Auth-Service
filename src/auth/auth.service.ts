import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { AppError } from "../lib/common/index.js";
import { OAuth2Client } from "google-auth-library";
import { AuditService } from "../audit/audit.service.js";
import { config, googleTestMode } from "../config.js";
import { Prisma, type User } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { LoginDto } from "./dto/login.dto.js";
import type { RegisterDto } from "./dto/register.dto.js";
import { hashPassword, verifyPassword } from "./secrets.js";
import { type ClientMeta, TokensService } from "./tokens.service.js";
import { VerificationService } from "./verification.service.js";

// Lockout (§6.2): every 5th wrong password in a row locks the account for 15 minutes.
const LOCK_AFTER = 5;
const LOCK_MS = 15 * 60 * 1000;

const invalidCredentials = () =>
  new AppError(401, "INVALID_CREDENTIALS", "That email and password don't match. Check them and try again.");

const accountLocked = () =>
  new AppError(403, "ACCOUNT_LOCKED", "This account has been locked. Please contact us on WhatsApp to unlock it.");

export const emailTaken = () =>
  new AppError(409, "EMAIL_TAKEN", "An account with this email already exists.", {
    email: "This email already has an account. Log in instead.",
  });

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

@Injectable()
export class AuthService {
  private readonly google = new OAuth2Client();

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
    private readonly verification: VerificationService,
    private readonly audit: AuditService,
  ) {}

  async register({ name, email, password }: RegisterDto, meta: ClientMeta) {
    if (await this.prisma.user.findUnique({ where: { email } })) throw emailTaken();
    let user: User;
    try {
      user = await this.prisma.user.create({
        data: { name, email, passwordHash: await hashPassword(password) },
      });
    } catch (e) {
      // Two sign-ups with the same email at once: the unique index decides.
      if (isUniqueViolation(e)) throw emailTaken();
      throw e;
    }
    await this.verification.sendEmailVerification(user);
    return this.session(user, meta);
  }

  async login({ email, password }: LoginDto, meta: ClientMeta) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppError(429, "TOO_MANY_ATTEMPTS", "Too many wrong passwords. Please wait 15 minutes, or reset your password.");
    }

    // Always runs bcrypt, even for unknown emails, so timing doesn't reveal accounts.
    const ok = await verifyPassword(password, user?.passwordHash);

    if (user && !user.passwordHash && user.googleId) {
      throw new AppError(401, "USE_GOOGLE", "This email signs in with Google. Use “Continue with Google” above.");
    }
    if (!user || !ok || user.status === "deleted") {
      if (user) await this.recordFailedLogin(user.id, meta);
      throw invalidCredentials();
    }
    if (user.status === "locked") throw accountLocked();

    if (user.failedLogins > 0 || user.lockedUntil) {
      await this.prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
    }
    return this.session(user, meta);
  }

  private async recordFailedLogin(userId: string, meta: ClientMeta) {
    const { failedLogins } = await this.prisma.user.update({
      where: { id: userId },
      data: { failedLogins: { increment: 1 } },
      select: { failedLogins: true },
    });
    if (failedLogins % LOCK_AFTER === 0) {
      await this.prisma.user.update({ where: { id: userId }, data: { lockedUntil: new Date(Date.now() + LOCK_MS) } });
      await this.audit.record("login.locked_out", { target: userId, ip: meta.ip, meta: { failedLogins } });
    }
  }

  async googleLogin(idToken: string, meta: ClientMeta) {
    const audience = config.GOOGLE_CLIENT_ID;
    if (!audience) throw new AppError(503, "GOOGLE_NOT_CONFIGURED", "Google sign-in is not configured");

    let payload;
    try {
      const ticket = await this.google.verifyIdToken({ idToken, audience });
      payload = ticket.getPayload();
    } catch {
      throw new AppError(401, "GOOGLE_INVALID", "Invalid Google token");
    }
    if (!payload?.sub || !payload.email || !payload.email_verified) {
      throw new AppError(401, "GOOGLE_UNVERIFIED", "Google account email not verified");
    }

    const user = await this.upsertGoogleUser(payload.sub, payload.email.toLowerCase(), payload.name ?? payload.email);
    return this.session(user, meta);
  }

  // Test mode only: stands in for Google until real keys are added (dev, no GOOGLE_CLIENT_ID).
  async googleTestLogin(email: string, meta: ClientMeta) {
    if (!googleTestMode) throw new AppError(404, "NOT_FOUND", "Google sign-in is live; use the Google button.");

    // Never let the simulation take over an account that has a password.
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing?.passwordHash) {
      throw new AppError(409, "HAS_PASSWORD", "That email already has a password account. Log in with your password instead.");
    }
    const googleId = "test_" + createHash("sha256").update(email).digest("hex").slice(0, 16);
    const name = email.split("@")[0]!.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return this.session(await this.upsertGoogleUser(googleId, email, name), meta);
  }

  // Match on the Google account first, then on the (Google-verified) email,
  // linking it to the existing account; else create a new account.
  private async upsertGoogleUser(googleId: string, email: string, name: string): Promise<User> {
    const existing =
      (await this.prisma.user.findUnique({ where: { googleId } })) ??
      (await this.prisma.user.findUnique({ where: { email } }));
    if (existing?.status === "locked") throw accountLocked();
    if (existing) {
      if (existing.googleId && existing.emailVerifiedAt) return existing;
      return this.prisma.user.update({
        where: { id: existing.id },
        data: { googleId, emailVerifiedAt: existing.emailVerifiedAt ?? new Date() },
      });
    }
    try {
      return await this.prisma.user.create({
        data: { email, name: name.trim().slice(0, 80) || email, googleId, emailVerifiedAt: new Date() },
      });
    } catch (e) {
      if (isUniqueViolation(e)) return this.upsertGoogleUser(googleId, email, name);
      throw e;
    }
  }

  refresh(refreshToken: string | undefined, meta: ClientMeta) {
    return this.tokens.rotate(refreshToken, meta);
  }

  logout(refreshToken: string | undefined) {
    return this.tokens.revokeByToken(refreshToken);
  }

  async logoutAll(userId: string, meta: ClientMeta) {
    const revoked = await this.tokens.revokeAllForUser(userId);
    await this.audit.record("logout.all", { actorId: userId, target: userId, ip: meta.ip, meta: { revoked } });
  }

  // Always answers the same way, whether or not the email has an account.
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.status !== "active") return;
    if (await this.verification.sentRecently(user.id, "password_reset")) return;
    await this.verification.sendPasswordReset(user);
  }

  async resetPassword(token: string, password: string, meta: ClientMeta) {
    const passwordHash = await hashPassword(password);
    const user = await this.prisma.$transaction(async (tx) => {
      const owner = await this.verification.consume(token, "password_reset", tx);
      if (!owner || owner.status !== "active") return null;
      await this.tokens.revokeAllForUser(owner.id, tx);
      // Following the emailed link also proves the address.
      return tx.user.update({
        where: { id: owner.id },
        data: { passwordHash, failedLogins: 0, lockedUntil: null, emailVerifiedAt: owner.emailVerifiedAt ?? new Date() },
      });
    });
    if (!user) {
      throw new AppError(400, "TOKEN_INVALID", "This reset link has expired or was already used. Please ask for a new one.");
    }
    await this.audit.record("password.reset", { actorId: user.id, target: user.id, ip: meta.ip });
    return this.session(user, meta);
  }

  async verifyEmail(token: string) {
    const user = await this.prisma.$transaction(async (tx) => {
      const owner = await this.verification.consume(token, "email_verify", tx);
      if (!owner) return null;
      if (owner.emailVerifiedAt) return owner;
      return tx.user.update({ where: { id: owner.id }, data: { emailVerifiedAt: new Date() } });
    });
    if (!user) {
      throw new AppError(400, "TOKEN_INVALID", "This link has expired or was already used. Log in and we'll send a new one.");
    }
    return user;
  }

  async resendVerification(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.emailVerifiedAt) return { alreadyVerified: true };
    if (await this.verification.sentRecently(user.id, "email_verify")) {
      throw new AppError(429, "TOO_SOON", "We just sent one. Please wait a minute before asking again.");
    }
    await this.verification.sendEmailVerification(user);
    return { alreadyVerified: false };
  }

  private async session(user: User, meta: ClientMeta) {
    return { user, tokens: await this.tokens.startSession(user, meta) };
  }
}
