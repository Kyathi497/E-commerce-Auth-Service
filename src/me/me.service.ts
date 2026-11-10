import { Injectable } from "@nestjs/common";
import { unauthenticated } from "../lib/auth-guard/index.js";
import { AppError } from "../lib/common/index.js";
import { AuditService } from "../audit/audit.service.js";
import { hashPassword, verifyPassword } from "../auth/secrets.js";
import { type ClientMeta, TokensService } from "../auth/tokens.service.js";
import { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { toUserView } from "../users/user-view.js";
import { toAddressView } from "./addresses.service.js";
import type { ChangePasswordDto, DeleteMeDto, UpdateMeDto } from "./dto/me.dto.js";

@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
    private readonly audit: AuditService,
  ) {}

  // An access token outlives a deletion or lock by up to one access-token lifetime; this
  // closes that gap for everything under /me.
  async activeUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status === "deleted") throw unauthenticated();
    if (user.status === "locked") {
      throw new AppError(403, "ACCOUNT_LOCKED", "This account has been locked. Please contact us on WhatsApp to unlock it.");
    }
    return user;
  }

  async update(userId: string, dto: UpdateMeDto) {
    await this.activeUser(userId);
    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.phone !== undefined && { phone: dto.phone }),
          ...(dto.marketingOptIn !== undefined && { marketingOptIn: dto.marketingOptIn }),
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new AppError(409, "PHONE_TAKEN", "Please check the highlighted fields.", {
          phone: "This number is already on another account.",
        });
      }
      throw e;
    }
  }

  // Signs out every other device and starts a fresh session for this one.
  async changePassword(userId: string, dto: ChangePasswordDto, meta: ClientMeta) {
    const user = await this.activeUser(userId);
    if (user.passwordHash && !(await verifyPassword(dto.currentPassword ?? "", user.passwordHash))) {
      throw new AppError(422, "VALIDATION_FAILED", "Please check the highlighted fields.", {
        currentPassword: "That isn't your current password.",
      });
    }
    const passwordHash = await hashPassword(dto.newPassword);
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.tokens.revokeAllForUser(userId, tx);
      return tx.user.update({ where: { id: userId }, data: { passwordHash } });
    });
    await this.audit.record("password.changed", { actorId: userId, target: userId, ip: meta.ip });
    return { user: updated, tokens: await this.tokens.startSession(updated, meta) };
  }

  // DPDP Act: everything we hold about the person, in one file.
  async export(userId: string) {
    const user = await this.activeUser(userId);
    const [addresses, sessions] = await Promise.all([
      this.prisma.address.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      this.prisma.refreshToken.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true, expiresAt: true, revokedAt: true, ip: true, userAgent: true },
      }),
    ]);
    return {
      exportedAt: new Date().toISOString(),
      profile: { ...toUserView(user), emailVerifiedAt: user.emailVerifiedAt, updatedAt: user.updatedAt },
      addresses: addresses.map(toAddressView),
      sessions,
      note: "Orders and invoices are kept by the order service and are not part of this export yet.",
    };
  }

  // DPDP Act: deleting anonymises the account. Orders stay (tax law) but no
  // longer point at a person.
  async delete(userId: string, dto: DeleteMeDto, meta: ClientMeta) {
    const user = await this.activeUser(userId);
    if (user.role === "admin") {
      throw new AppError(409, "ADMIN_DELETE", "Admin accounts can't be deleted here. Ask another admin to change your role first.");
    }
    if (user.passwordHash && !(await verifyPassword(dto.password ?? "", user.passwordHash))) {
      throw new AppError(422, "VALIDATION_FAILED", "Please check the highlighted fields.", {
        password: "That isn't your password.",
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.address.deleteMany({ where: { userId } });
      await tx.verificationToken.deleteMany({ where: { userId } });
      await tx.refreshToken.deleteMany({ where: { userId } });
      await tx.user.update({
        where: { id: userId },
        data: {
          email: `deleted+${userId}@deleted.invalid`,
          name: "Deleted user",
          passwordHash: null,
          googleId: null,
          phone: null,
          status: "deleted",
          marketingOptIn: false,
          emailVerifiedAt: null,
        },
      });
    });
    await this.audit.record("account.deleted", { actorId: userId, target: userId, ip: meta.ip });
  }
}
