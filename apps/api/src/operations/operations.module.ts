import { Controller, Get, Module } from "@nestjs/common";
import { API_ROUTES } from "@microfocus/contracts";
import { controllerPath } from "../common/http.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { RightsExpiryScheduler } from "../jobs/rights-expiry.scheduler.js";
import { liveHealth, readyHealth } from "./health.js";
import { ProcessDrain } from "./process-drain.js";

@Controller()
export class OperationsController {
  private readonly prisma: PrismaService;
  private readonly drain: ProcessDrain;

  constructor(prisma: PrismaService, drain: ProcessDrain) {
    this.prisma = prisma;
    this.drain = drain;
  }

  @Get(controllerPath(API_ROUTES.health.live))
  live() {
    return liveHealth();
  }

  @Get(controllerPath(API_ROUTES.health.ready))
  ready() {
    return readyHealth(this.prisma as never, this.drain);
  }

  @Get(controllerPath(API_ROUTES.health.root))
  health() {
    return readyHealth(this.prisma as never, this.drain);
  }
}

@Module({
  controllers: [OperationsController],
  providers: [ProcessDrain, RightsExpiryScheduler]
})
export class OperationsModule {}
