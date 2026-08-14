import { Body, Controller, Get, Headers, Module, Param, Post, UseGuards } from "@nestjs/common";
import {
  DELETION_CONFIRMATION,
  type CreateDeletionRequest,
  type CreateDeletionRequestResponse,
  type DeletionRequestView
} from "@microfocus/contracts";
import { Equals, IsString } from "class-validator";
import { requireUser } from "../history/history.module.js";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  CurrentPrincipal,
  JwtAuthGuard,
  type Principal
} from "../security/security.js";
import { createDeletionRequest, lookupDeletionRequest } from "./deletion.js";

class CreateDeletionDto implements CreateDeletionRequest {
  @IsString()
  @Equals(DELETION_CONFIRMATION)
  confirmation!: typeof DELETION_CONFIRMATION;
}

@Controller("v1/me/deletion-requests")
export class DeletionController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @CurrentPrincipal() principal: Principal,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: CreateDeletionDto
  ): Promise<CreateDeletionRequestResponse> {
    return createDeletionRequest(this.prisma, {
      userId: requireUser(principal),
      confirmation: body.confirmation,
      ...(idempotencyKey ? { idempotencyKey } : {})
    });
  }

  @Get(":deletionRequestId")
  lookup(
    @Param("deletionRequestId") deletionRequestId: string,
    @Headers("x-deletion-query-token") queryToken: string | undefined
  ): Promise<DeletionRequestView> {
    return lookupDeletionRequest(this.prisma, {
      deletionRequestId,
      queryToken: queryToken ?? ""
    });
  }
}

@Module({ controllers: [DeletionController] })
export class PrivacyModule {}
