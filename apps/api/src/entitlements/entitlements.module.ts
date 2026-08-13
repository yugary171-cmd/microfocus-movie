import { Controller, Get, Module, Param, UseGuards } from "@nestjs/common";
import { type EntitlementSummary } from "@microfocus/contracts";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  CurrentPrincipal,
  JwtAuthGuard,
  type Principal
} from "../security/security.js";
import { requireUser } from "../history/history.module.js";

@Controller("v1/entitlements")
@UseGuards(JwtAuthGuard)
export class EntitlementsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(":dramaId")
  async summary(
    @CurrentPrincipal() principal: Principal,
    @Param("dramaId") dramaId: string
  ): Promise<EntitlementSummary> {
    const userId = requireUser(principal);
    const grants = await this.prisma.entitlementGrant.findMany({
      where: {
        userId,
        dramaId,
        expiresAt: { gt: new Date() },
        remainingSeconds: { gt: 0 }
      },
      orderBy: { expiresAt: "asc" }
    });
    return {
      dramaId,
      remainingSeconds: grants.reduce(
        (sum, grant) => sum + Math.max(0, grant.remainingSeconds),
        0
      ),
      nearestExpiresAt: grants[0]?.expiresAt.toISOString() ?? null,
      grants: grants.map((grant) => ({
        id: grant.id,
        grantedSeconds: grant.grantedSeconds,
        remainingSeconds: Math.max(0, grant.remainingSeconds),
        grantedAt: grant.grantedAt.toISOString(),
        expiresAt: grant.expiresAt.toISOString(),
        source: grant.source
      }))
    };
  }
}

@Module({ controllers: [EntitlementsController] })
export class EntitlementsModule {}
