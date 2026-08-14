import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { hostname } from "node:os";
import { PrismaService } from "../prisma/prisma.service.js";
import { ProcessDrain } from "../operations/process-drain.js";
import { runCallbackPayloadPurgeJob } from "./callback-payload-purge.js";
import { runRightsExpiryJob } from "./rights-expiry.js";

const TICK_MS = 60_000;

@Injectable()
export class RightsExpiryScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RightsExpiryScheduler.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly drain: ProcessDrain
  ) {}

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
    if (this.running || this.drain.isDraining()) return;
    this.running = true;
    try {
      const ownerId = `${hostname()}:${process.pid}`;
      const rights = await runRightsExpiryJob(this.prisma as never, { ownerId });
      if (rights.acquired && (rights.offlined > 0 || rights.expiredRights > 0)) {
        this.logger.log(
          `rights expiry job offlined=${rights.offlined} expiredRights=${rights.expiredRights}`
        );
      }
      const purge = await runCallbackPayloadPurgeJob(this.prisma as never, { ownerId });
      if (purge.acquired && purge.purged > 0) {
        this.logger.log(`callback payload purge job purged=${purge.purged}`);
      }
    } catch (error) {
      this.logger.error("background jobs failed", error instanceof Error ? error.stack : error);
    } finally {
      this.running = false;
    }
  }
}
