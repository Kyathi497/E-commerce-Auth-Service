import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { TOKEN_AUDIENCE, TOKEN_ISSUER } from "../lib/auth-guard/index.js";
import { AppError } from "../lib/common/index.js";
import { SignJWT } from "jose";
import { AuditService } from "../audit/audit.service.js";
import { config } from "../config.js";
import type { User } from "../generated/prisma/client.js";
import { signingKeys } from "../keys.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { hashToken, newToken } from "./secrets.js";

export interface ClientMeta {
  ip?: string;
  userAgent?: string;
}

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

// Two requests refreshing with the same token at once (two tabs, a retry) is
// a race, not theft: inside this window the loser gets 409 and retries with
// the cookies the winner received.
const RACE_WINDOW_MS = 10_000;

const refreshFailed = () => new AppError(401, "REFRESH_INVALID", "Your session has ended. Please log in again.");

type Tx = Parameters<Parameters<PrismaService["$transaction"]>[0]>[0];

@Injectable()
export class TokensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // RS256 access token (ACCESS_TOKEN_TTL_SECONDS). Role is read from the DB at
  // every refresh, so a role change applies within one token lifetime.
  signAccessToken(user: Pick<User, "id" | "role">) {
    return new SignJWT({ role: user.role })
      .setProtectedHeader({ alg: "RS256", kid: signingKeys.kid, typ: "JWT" })
      .setSubject(user.id)
      .setIssuer(TOKEN_ISSUER)
      .setAudience(TOKEN_AUDIENCE)
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime(`${config.ACCESS_TOKEN_TTL_SECONDS}s`)
      .sign(signingKeys.privateKey);
  }

  private async createRefreshToken(db: Tx | PrismaService, userId: string, familyId: string, meta: ClientMeta) {
    const token = newToken();
    const record = await db.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + config.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
        ip: meta.ip?.slice(0, 64),
        userAgent: meta.userAgent?.slice(0, 255),
      },
    });
    return { token, record };
  }

  // A fresh login: a new token family.
  async startSession(user: Pick<User, "id" | "role">, meta: ClientMeta): Promise<SessionTokens> {
    const { token } = await this.createRefreshToken(this.prisma, user.id, randomUUID(), meta);
    return { accessToken: await this.signAccessToken(user), refreshToken: token };
  }

  // Swaps a refresh token for a new pair. The old token is revoked and points
  // at its replacement; presenting it again later means it was copied, so the
  // whole family is revoked.
  async rotate(rawToken: string | undefined, meta: ClientMeta): Promise<{ user: User; tokens: SessionTokens }> {
    if (!rawToken) throw refreshFailed();
    const now = new Date();
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      include: { user: true },
    });
    if (!existing) throw refreshFailed();

    if (existing.revokedAt) {
      if (existing.replacedById && now.getTime() - existing.revokedAt.getTime() < RACE_WINDOW_MS) {
        throw new AppError(409, "REFRESH_RACE", "Your session was just refreshed. Please retry.");
      }
      if (existing.replacedById) {
        const revoked = await this.revokeFamily(existing.familyId);
        await this.audit.record("refresh.reuse_detected", {
          actorId: existing.userId,
          target: existing.userId,
          ip: meta.ip,
          meta: { familyId: existing.familyId, revoked },
        });
      }
      throw refreshFailed();
    }

    if (existing.expiresAt <= now || existing.user.status !== "active") {
      await this.revokeFamily(existing.familyId);
      throw refreshFailed();
    }

    const refreshToken = await this.prisma.$transaction(async (tx) => {
      const next = await this.createRefreshToken(tx, existing.userId, existing.familyId, meta);
      // Conditional update: if another request rotated this token first, the
      // count is 0 and this transaction rolls back.
      const { count } = await tx.refreshToken.updateMany({
        where: { id: existing.id, revokedAt: null },
        data: { revokedAt: now, replacedById: next.record.id },
      });
      if (count !== 1) throw new AppError(409, "REFRESH_RACE", "Your session was just refreshed. Please retry.");
      return next.token;
    });

    return { user: existing.user, tokens: { accessToken: await this.signAccessToken(existing.user), refreshToken } };
  }

  async revokeFamily(familyId: string) {
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return count;
  }

  // Logs out the session that owns this refresh token. Unknown tokens are ignored.
  async revokeByToken(rawToken: string | undefined) {
    if (!rawToken) return;
    const existing = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(rawToken) } });
    if (existing) await this.revokeFamily(existing.familyId);
  }

  async revokeAllForUser(userId: string, db: Tx | PrismaService = this.prisma) {
    const { count } = await db.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return count;
  }
}
