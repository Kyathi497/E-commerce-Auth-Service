import { Injectable, type OnApplicationBootstrap, type OnApplicationShutdown } from "@nestjs/common";
import { logger } from "../logger.js";
import { PrismaService } from "../prisma/prisma.service.js";

const EVERY_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Deletes refresh and email tokens that can no longer be used. Rows are kept a
// week past expiry so reuse detection and support questions still have them.
// Safe to run on every replica at once. Moves to a BullMQ job with the rest of
// the scheduled work later.
@Injectable()
export class CleanupService implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => void this.run(), EVERY_MS);
    this.timer.unref();
  }

  onApplicationShutdown() {
    clearInterval(this.timer);
  }

  async run() {
    const cutoff = new Date(Date.now() - 7 * DAY_MS);
    try {
      const [refresh, verification] = await Promise.all([
        this.prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: cutoff } } }),
        this.prisma.verificationToken.deleteMany({ where: { expiresAt: { lt: cutoff } } }),
      ]);
      logger.info({ refresh: refresh.count, verification: verification.count }, "expired tokens removed");
    } catch (err) {
      logger.error({ err }, "token cleanup failed");
    }
  }
}
