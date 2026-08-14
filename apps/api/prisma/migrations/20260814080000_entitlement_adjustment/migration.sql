-- CreateTable
CREATE TABLE `EntitlementAdjustment` (
    `id` VARCHAR(191) NOT NULL,
    `type` ENUM('FREEZE_REMAINDER', 'RELEASE_FREEZE', 'WRITE_OFF') NOT NULL,
    `grantId` VARCHAR(191) NOT NULL,
    `sourceFactType` ENUM('GRANT', 'DEBIT', 'ADJUSTMENT') NOT NULL,
    `sourceFactId` VARCHAR(191) NOT NULL,
    `freezeAdjustmentId` VARCHAR(191) NULL,
    `seconds` INTEGER NOT NULL,
    `reason` VARCHAR(300) NOT NULL,
    `approvalNote` VARCHAR(300) NULL,
    `operatorAdminId` VARCHAR(191) NOT NULL,
    `idempotencyKey` VARCHAR(128) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `EntitlementAdjustment_idempotencyKey_key`(`idempotencyKey`),
    INDEX `EntitlementAdjustment_grantId_type_createdAt_idx`(`grantId`, `type`, `createdAt`),
    INDEX `EntitlementAdjustment_freezeAdjustmentId_idx`(`freezeAdjustmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `EntitlementAdjustment` ADD CONSTRAINT `EntitlementAdjustment_grantId_fkey` FOREIGN KEY (`grantId`) REFERENCES `EntitlementGrant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EntitlementAdjustment` ADD CONSTRAINT `EntitlementAdjustment_freezeAdjustmentId_fkey` FOREIGN KEY (`freezeAdjustmentId`) REFERENCES `EntitlementAdjustment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
