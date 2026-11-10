import { Injectable } from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client.js";
import { logger } from "../logger.js";
import { PrismaService } from "../prisma/prisma.service.js";

type Db = Pick<PrismaService, "auditLog">;

export interface AuditEntry {
  actorId?: string | null;
  target?: string | null;
  ip?: string | null;
  meta?: Prisma.InputJsonValue;
}

// Security-relevant events and every admin write (§10).
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(action: string, entry: AuditEntry = {}, db: Db = this.prisma) {
    try {
      await db.auditLog.create({
        data: { action, actorId: entry.actorId ?? null, target: entry.target ?? null, ip: entry.ip ?? null, meta: entry.meta },
      });
    } catch (err) {
      // An audit write failing must not break the user's request.
      logger.error({ err, action }, "audit write failed");
    }
  }
}
