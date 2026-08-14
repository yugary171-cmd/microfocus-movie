import { Controller, Get, Module, Param, UseGuards } from "@nestjs/common";
import { API_ROUTES, type EntitlementSummary } from "@microfocus/contracts";
import { controllerPath } from "../common/http.js";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  CurrentPrincipal,
  JwtAuthGuard,
  type Principal
} from "../security/security.js";
import { requireUser } from "../history/history.module.js";
import { assertNamedRateLimit } from "../security/rate-limit.js";
import { requireEntityId } from "../common/entity-id.js";

@Controller()
@UseGuards(JwtAuthGuard)
export class EntitlementsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(controllerPath(API_ROUTES.entitlement(":dramaId")))
  async summary(
    @CurrentPrincipal() principal: Principal,
    @Param("dramaId") dramaId: string
  ): Promise<EntitlementSummary> {
    const userId = requireUser(principal);
    await assertNamedRateLimit(this.prisma, "entitlementSummary", `user:${userId}`);
    const id = requireEntityId(dramaId, "dramaId");
    const grants = await this.prisma.entitlementGrant.findMany({
      where: {
        userId,
        dramaId: id,
        expiresAt: { gt: new Date() },
        remainingSeconds: { gt: 0 }
      },
      orderBy: { expiresAt: "asc" }
    });
    return {
      dramaId: id,
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
