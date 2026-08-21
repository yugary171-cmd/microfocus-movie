import { Module } from "@nestjs/common";
import { AdminModule } from "./admin/admin.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { CallbacksModule } from "./callbacks/callbacks.module.js";
import { CatalogModule } from "./catalog/catalog.module.js";
import { EntitlementsModule } from "./entitlements/entitlements.module.js";
import { HistoryModule } from "./history/history.module.js";
import { ProfileModule } from "./profile/profile.module.js";
import { SocialModule } from "./social/social.module.js";
import { OperationsModule } from "./operations/operations.module.js";
import { InfrastructureModule } from "./infrastructure.module.js";
import { PlaybackModule } from "./playback/playback.module.js";
import { PrivacyModule } from "./privacy/privacy.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { RewardsModule } from "./rewards/rewards.module.js";
import { NotificationsModule } from "./notifications/notifications.module.js";

@Module({
  imports: [
    PrismaModule,
    InfrastructureModule,
    AuthModule,
    CatalogModule,
    HistoryModule,
    ProfileModule,
    SocialModule,
    EntitlementsModule,
    RewardsModule,
    PlaybackModule,
    PrivacyModule,
    CallbacksModule,
    AdminModule,
    OperationsModule,
    NotificationsModule
  ]
})
export class AppModule {}
