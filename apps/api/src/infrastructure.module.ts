import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AppConfigService } from "./config/config.service.js";
import { VodProviderService, WechatProviderService } from "./providers/providers.js";
import { AdminRolesGuard, JwtAuthGuard, OptionalJwtAuthGuard } from "./security/security.js";
import { TotpService } from "./security/totp.service.js";

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({ secret: config.env.JWT_SECRET })
    })
  ],
  providers: [
    AppConfigService,
    WechatProviderService,
    VodProviderService,
    JwtAuthGuard,
    OptionalJwtAuthGuard,
    AdminRolesGuard,
    TotpService
  ],
  exports: [
    JwtModule,
    AppConfigService,
    WechatProviderService,
    VodProviderService,
    JwtAuthGuard,
    OptionalJwtAuthGuard,
    AdminRolesGuard,
    TotpService
  ]
})
export class InfrastructureModule {}
