import { Body, Controller, Get, Headers, Module, Param, Post, Req, UseGuards } from "@nestjs/common";
import {
  API_ROUTES,
  DELETION_CONFIRMATION,
  WECHAT_CODE_MAX_LENGTH,
  type CreateDeletionRequest,
  type CreateDeletionRequestResponse,
  type DeletionRequestView
} from "@microfocus/contracts";
import { Equals, IsString, MaxLength, MinLength } from "class-validator";
import { controllerPath } from "../common/http.js";
import { normalizeIdempotencyKey } from "../common/idempotency.js";
import { AppConfigService } from "../config/config.service.js";
import { requireUser } from "../history/history.module.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { WechatProviderService } from "../providers/providers.js";
import {
  CurrentPrincipal,
  JwtAuthGuard,
  type Principal
} from "../security/security.js";
import { requestIpKey, type SocketRequest } from "../security/rate-limit.js";
import { createDeletionRequest, lookupDeletionRequest } from "./deletion.js";

class CreateDeletionDto implements CreateDeletionRequest {
  @IsString()
  @Equals(DELETION_CONFIRMATION)
  confirmation!: typeof DELETION_CONFIRMATION;

  @IsString()
  @MinLength(1)
  @MaxLength(WECHAT_CODE_MAX_LENGTH)
  wechatCode!: string;
}

@Controller()
export class DeletionController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wechat: WechatProviderService,
    private readonly config: AppConfigService
  ) {}

  @Post(controllerPath(API_ROUTES.deletionRequests))
  @UseGuards(JwtAuthGuard)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: CreateDeletionDto
  ): Promise<CreateDeletionRequestResponse> {
    return createDeletionRequest(this.prisma, {
      userId: requireUser(principal),
      confirmation: body.confirmation,
      wechatCode: body.wechatCode,
      wechatMode: this.config.env.WECHAT_MODE,
      wechat: this.wechat,
      idempotencyKey: normalizeIdempotencyKey(idempotencyKey)
    });
  }

  @Get(controllerPath(API_ROUTES.deletionRequest(":deletionRequestId")))
  lookup(
    @Req() request: SocketRequest,
    @Param("deletionRequestId") deletionRequestId: string,
    @Headers("x-deletion-query-token") queryToken: string | undefined
  ): Promise<DeletionRequestView> {
    return lookupDeletionRequest(this.prisma, {
      deletionRequestId,
      queryToken: queryToken ?? "",
      ipKey: requestIpKey(request)
    });
  }
}

@Module({ controllers: [DeletionController] })
export class PrivacyModule {}
