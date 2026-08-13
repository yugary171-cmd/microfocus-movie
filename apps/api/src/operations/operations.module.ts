import { Controller, Get, Module } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

@Controller()
export class OperationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("health")
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: "ok", database: "ok" };
  }
}

@Module({ controllers: [OperationsController] })
export class OperationsModule {}
