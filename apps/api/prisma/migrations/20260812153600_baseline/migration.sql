-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `openId` VARCHAR(191) NOT NULL,
    `displayName` VARCHAR(191) NOT NULL,
    `avatarUrl` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_openId_key`(`openId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AdminUser` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `role` ENUM('EDITOR', 'REVIEWER', 'ADMIN') NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `totpEnabled` BOOLEAN NOT NULL DEFAULT false,
    `totpSecretEncrypted` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AdminUser_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Drama` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `summary` TEXT NOT NULL,
    `coverUrl` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `tagsJson` JSON NOT NULL,
    `recommendationRank` INTEGER NOT NULL DEFAULT 0,
    `contentVersion` INTEGER NOT NULL DEFAULT 1,
    `status` ENUM('DRAFT', 'UPLOADING', 'PROCESSING', 'PENDING_REVIEW', 'PENDING_WECHAT', 'READY', 'PUBLISHED', 'OFFLINE', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `editorId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `publishedAt` DATETIME(3) NULL,

    INDEX `Drama_status_recommendationRank_idx`(`status`, `recommendationRank`),
    INDEX `Drama_category_status_idx`(`category`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RightsRecord` (
    `id` VARCHAR(191) NOT NULL,
    `dramaId` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `status` ENUM('DRAFT', 'ACTIVE', 'EXPIRED', 'REVOKED') NOT NULL DEFAULT 'DRAFT',
    `rightsHolder` VARCHAR(191) NOT NULL,
    `validFrom` DATETIME(3) NOT NULL,
    `validUntil` DATETIME(3) NOT NULL,
    `territory` VARCHAR(191) NOT NULL,
    `allowsWechatDistribution` BOOLEAN NOT NULL,
    `allowsAdMonetization` BOOLEAN NOT NULL,
    `allowsTranscoding` BOOLEAN NOT NULL,
    `allowsPromotionalMaterial` BOOLEAN NOT NULL,
    `licenseNumber` VARCHAR(191) NOT NULL,
    `reportNumber` VARCHAR(191) NOT NULL,
    `materialObjectKey` VARCHAR(191) NOT NULL,
    `materialDigestSha256` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `RightsRecord_dramaId_status_validUntil_idx`(`dramaId`, `status`, `validUntil`),
    UNIQUE INDEX `RightsRecord_dramaId_version_key`(`dramaId`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Episode` (
    `id` VARCHAR(191) NOT NULL,
    `dramaId` VARCHAR(191) NOT NULL,
    `episodeNumber` INTEGER NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `durationSeconds` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Episode_dramaId_episodeNumber_idx`(`dramaId`, `episodeNumber`),
    UNIQUE INDEX `Episode_dramaId_episodeNumber_key`(`dramaId`, `episodeNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MediaAsset` (
    `id` VARCHAR(191) NOT NULL,
    `episodeId` VARCHAR(191) NOT NULL,
    `fileId` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `isCurrent` BOOLEAN NOT NULL DEFAULT false,
    `mediaStatus` ENUM('CREATED', 'UPLOADING', 'PROCESSING', 'REVIEW_REJECTED', 'PENDING_MANUAL_REVIEW', 'PENDING_WECHAT', 'READY', 'FAILED') NOT NULL DEFAULT 'CREATED',
    `transcodeStatus` ENUM('PENDING', 'PROCESSING', 'READY', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `machineReviewStatus` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `manualReviewStatus` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `wechatReviewStatus` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MediaAsset_fileId_key`(`fileId`),
    INDEX `MediaAsset_episodeId_isCurrent_idx`(`episodeId`, `isCurrent`),
    UNIQUE INDEX `MediaAsset_episodeId_version_key`(`episodeId`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DramaReview` (
    `id` VARCHAR(191) NOT NULL,
    `dramaId` VARCHAR(191) NOT NULL,
    `reviewerId` VARCHAR(191) NOT NULL,
    `contentVersion` INTEGER NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RewardChallenge` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `dramaId` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `nonceHash` VARCHAR(191) NOT NULL,
    `pendingKey` VARCHAR(191) NULL,
    `status` ENUM('PENDING', 'COMPLETED', 'EXPIRED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `verificationMode` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,
    `completedAt` DATETIME(3) NULL,
    `verifiedAt` DATETIME(3) NULL,
    `completionKey` VARCHAR(191) NULL,

    UNIQUE INDEX `RewardChallenge_nonceHash_key`(`nonceHash`),
    UNIQUE INDEX `RewardChallenge_pendingKey_key`(`pendingKey`),
    UNIQUE INDEX `RewardChallenge_completionKey_key`(`completionKey`),
    INDEX `RewardChallenge_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EntitlementGrant` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `dramaId` VARCHAR(191) NOT NULL,
    `challengeId` VARCHAR(191) NULL,
    `source` ENUM('REWARDED_AD', 'COMPENSATION') NOT NULL,
    `grantedSeconds` INTEGER NOT NULL,
    `remainingSeconds` INTEGER NOT NULL,
    `grantedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,
    `note` VARCHAR(191) NULL,

    UNIQUE INDEX `EntitlementGrant_challengeId_key`(`challengeId`),
    INDEX `EntitlementGrant_userId_dramaId_expiresAt_idx`(`userId`, `dramaId`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PlaybackLease` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `episodeId` VARCHAR(191) NOT NULL,
    `deviceId` VARCHAR(191) NOT NULL,
    `status` ENUM('ACTIVE', 'REVOKED', 'CLOSED', 'EXPIRED') NOT NULL DEFAULT 'ACTIVE',
    `activeKey` VARCHAR(191) NULL,
    `lastSeq` INTEGER NOT NULL DEFAULT 0,
    `lastMediaPosition` DECIMAL(12, 3) NOT NULL DEFAULT 0,
    `lastHeartbeatAt` DATETIME(3) NOT NULL,
    `tokenExpiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `closedAt` DATETIME(3) NULL,

    UNIQUE INDEX `PlaybackLease_activeKey_key`(`activeKey`),
    INDEX `PlaybackLease_userId_status_idx`(`userId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PlaybackHeartbeat` (
    `id` VARCHAR(191) NOT NULL,
    `leaseId` VARCHAR(191) NOT NULL,
    `seq` INTEGER NOT NULL,
    `mediaPositionSeconds` DECIMAL(12, 3) NOT NULL,
    `debitedSeconds` INTEGER NOT NULL,
    `remainingSeconds` INTEGER NULL,
    `mayContinue` BOOLEAN NOT NULL,
    `reason` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PlaybackHeartbeat_leaseId_seq_key`(`leaseId`, `seq`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EntitlementDebit` (
    `id` VARCHAR(191) NOT NULL,
    `grantId` VARCHAR(191) NOT NULL,
    `leaseId` VARCHAR(191) NOT NULL,
    `heartbeatId` VARCHAR(191) NOT NULL,
    `heartbeatSeq` INTEGER NOT NULL,
    `seconds` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `EntitlementDebit_leaseId_heartbeatSeq_idx`(`leaseId`, `heartbeatSeq`),
    UNIQUE INDEX `EntitlementDebit_grantId_leaseId_heartbeatSeq_key`(`grantId`, `leaseId`, `heartbeatSeq`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WatchProgress` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `dramaId` VARCHAR(191) NOT NULL,
    `episodeId` VARCHAR(191) NOT NULL,
    `mediaPositionSeconds` DECIMAL(12, 3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `WatchProgress_userId_updatedAt_idx`(`userId`, `updatedAt`),
    UNIQUE INDEX `WatchProgress_userId_dramaId_key`(`userId`, `dramaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CallbackEvent` (
    `id` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `eventType` VARCHAR(191) NOT NULL,
    `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `processingUntil` DATETIME(3) NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `processedAt` DATETIME(3) NULL,
    `outcome` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `adminId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `targetType` VARCHAR(191) NOT NULL,
    `targetId` VARCHAR(191) NOT NULL,
    `metadataJson` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OperationalEvent` (
    `id` VARCHAR(191) NOT NULL,
    `eventType` VARCHAR(191) NOT NULL,
    `actorType` VARCHAR(191) NULL,
    `actorId` VARCHAR(191) NULL,
    `entityType` VARCHAR(191) NULL,
    `entityId` VARCHAR(191) NULL,
    `requestId` VARCHAR(191) NULL,
    `value` INTEGER NULL,
    `metadataJson` JSON NULL,
    `occurredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `OperationalEvent_eventType_occurredAt_idx`(`eventType`, `occurredAt`),
    INDEX `OperationalEvent_entityType_entityId_idx`(`entityType`, `entityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CircuitBreaker` (
    `provider` VARCHAR(191) NOT NULL,
    `state` ENUM('CLOSED', 'OPEN') NOT NULL DEFAULT 'CLOSED',
    `reason` VARCHAR(191) NULL,
    `openedAt` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`provider`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Drama` ADD CONSTRAINT `Drama_editorId_fkey` FOREIGN KEY (`editorId`) REFERENCES `AdminUser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RightsRecord` ADD CONSTRAINT `RightsRecord_dramaId_fkey` FOREIGN KEY (`dramaId`) REFERENCES `Drama`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Episode` ADD CONSTRAINT `Episode_dramaId_fkey` FOREIGN KEY (`dramaId`) REFERENCES `Drama`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MediaAsset` ADD CONSTRAINT `MediaAsset_episodeId_fkey` FOREIGN KEY (`episodeId`) REFERENCES `Episode`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DramaReview` ADD CONSTRAINT `DramaReview_dramaId_fkey` FOREIGN KEY (`dramaId`) REFERENCES `Drama`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DramaReview` ADD CONSTRAINT `DramaReview_reviewerId_fkey` FOREIGN KEY (`reviewerId`) REFERENCES `AdminUser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RewardChallenge` ADD CONSTRAINT `RewardChallenge_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RewardChallenge` ADD CONSTRAINT `RewardChallenge_dramaId_fkey` FOREIGN KEY (`dramaId`) REFERENCES `Drama`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EntitlementGrant` ADD CONSTRAINT `EntitlementGrant_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EntitlementGrant` ADD CONSTRAINT `EntitlementGrant_dramaId_fkey` FOREIGN KEY (`dramaId`) REFERENCES `Drama`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EntitlementGrant` ADD CONSTRAINT `EntitlementGrant_challengeId_fkey` FOREIGN KEY (`challengeId`) REFERENCES `RewardChallenge`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlaybackLease` ADD CONSTRAINT `PlaybackLease_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlaybackLease` ADD CONSTRAINT `PlaybackLease_episodeId_fkey` FOREIGN KEY (`episodeId`) REFERENCES `Episode`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlaybackHeartbeat` ADD CONSTRAINT `PlaybackHeartbeat_leaseId_fkey` FOREIGN KEY (`leaseId`) REFERENCES `PlaybackLease`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EntitlementDebit` ADD CONSTRAINT `EntitlementDebit_grantId_fkey` FOREIGN KEY (`grantId`) REFERENCES `EntitlementGrant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EntitlementDebit` ADD CONSTRAINT `EntitlementDebit_leaseId_fkey` FOREIGN KEY (`leaseId`) REFERENCES `PlaybackLease`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EntitlementDebit` ADD CONSTRAINT `EntitlementDebit_heartbeatId_fkey` FOREIGN KEY (`heartbeatId`) REFERENCES `PlaybackHeartbeat`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WatchProgress` ADD CONSTRAINT `WatchProgress_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WatchProgress` ADD CONSTRAINT `WatchProgress_dramaId_fkey` FOREIGN KEY (`dramaId`) REFERENCES `Drama`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WatchProgress` ADD CONSTRAINT `WatchProgress_episodeId_fkey` FOREIGN KEY (`episodeId`) REFERENCES `Episode`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `AdminUser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

