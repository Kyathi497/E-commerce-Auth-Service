import { Injectable } from "@nestjs/common";
import { AppError, decodeCursor, toPage } from "../lib/common/index.js";
import { AuditService } from "../audit/audit.service.js";
import { TokensService } from "../auth/tokens.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import { toAddressView } from "../me/addresses.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { toAdminUserView } from "../users/user-view.js";
import type { ListUsersQuery, UpdateUserDto } from "./dto/admin-users.dto.js";

const notFound = () => new AppError(404, "USER_NOT_FOUND", "We couldn't find that customer.");

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListUsersQuery) {
    const limit = query.limit ?? 20;
    const cursor = decodeCursor<{ createdAt: string; id: string }>(query.cursor);
    const and: Prisma.UserWhereInput[] = [];
    if (query.q) {
      and.push({ OR: [{ email: { contains: query.q } }, { name: { contains: query.q } }, { phone: { contains: query.q } }] });
    }
    if (query.role) and.push({ role: query.role });
    if (query.status) and.push({ status: query.status });
    if (cursor) {
      const createdAt = new Date(cursor.createdAt);
      and.push({ OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: cursor.id } }] });
    }
    const rows = await this.prisma.user.findMany({
      where: { AND: and },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    const page = toPage(rows, limit, (u) => ({ createdAt: u.createdAt.toISOString(), id: u.id }));
    return { items: page.items.map(toAdminUserView), nextCursor: page.nextCursor };
  }

  async get(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw notFound();
    const [addresses, activeSessions, activity] = await Promise.all([
      this.prisma.address.findMany({ where: { userId: id }, orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] }),
      this.prisma.refreshToken.count({ where: { userId: id, revokedAt: null, expiresAt: { gt: new Date() } } }),
      this.prisma.auditLog.findMany({ where: { target: id }, orderBy: { at: "desc" }, take: 20 }),
    ]);
    return { user: toAdminUserView(user), addresses: addresses.map(toAddressView), activeSessions, activity };
  }

  async update(actorId: string, id: string, dto: UpdateUserDto, ip?: string) {
    // Stops an admin from locking themselves out or removing the last admin by accident.
    if (actorId === id && (dto.role !== undefined || dto.status !== undefined)) {
      throw new AppError(409, "SELF_CHANGE", "You can't change your own role or status. Ask another admin.");
    }
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw notFound();
    if (user.status === "deleted") throw new AppError(409, "USER_DELETED", "This account was deleted and can't be changed.");

    const data: Prisma.UserUpdateInput = {};
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.status === "locked") data.status = "locked";
    if (dto.status === "active") Object.assign(data, { status: "active", failedLogins: 0, lockedUntil: null });

    const updated = await this.prisma.user.update({ where: { id }, data });
    const revoked =
      dto.status === "locked" || dto.revokeSessions ? await this.tokens.revokeAllForUser(id) : 0;

    await this.audit.record("admin.user_updated", {
      actorId,
      target: id,
      ip,
      meta: {
        ...(dto.role !== undefined && { role: { from: user.role, to: dto.role } }),
        ...(dto.status !== undefined && { status: { from: user.status, to: dto.status } }),
        revokedSessions: revoked,
      },
    });
    return { user: toAdminUserView(updated) };
  }
}
