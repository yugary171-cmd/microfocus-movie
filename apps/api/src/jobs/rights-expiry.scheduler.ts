import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { hostname } from "node:os";
import { PrismaService } from "../prisma/prisma.service.js";
import { runRightsExpiryJob } from "./rights-expiry.js";

const TICK_MS = 60_000;

@Injectable()
export class RightsExpiryScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RightsExpiryScheduler.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === "test") return;
    this.timer = setInterval(() => {
      void this.tick();
    }, TICK_MS);
    void this.tick();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const result = await runRightsExpiryJob(this.prisma as never, {
        ownerId: `${hostname()}:${process.pid}`
      });
      if (result.acquired && (result.offlined > 0 || result.expiredRights > 0)) {
        this.logger.log(
          `rights expiry job offlined=${result.offlined} expiredRights=${result.expiredRights}`
        );
      }
    } catch (error) {
      this.logger.error("rights expiry job failed", error instanceof Error ? error.stack : error);
    } finally {
      this.running = false;
    }
  }
}
