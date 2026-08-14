-- AlterTable
ALTER TABLE `CallbackEvent` ADD COLUMN `status` ENUM('RECEIVED', 'PROCESSING', 'RETRYABLE_FAILURE', 'DEAD_LETTER', 'PROCESSED', 'REJECTED') NOT NULL DEFAULT 'RECEIVED';
ALTER TABLE `CallbackEvent` ADD COLUMN `payloadHash` VARCHAR(191) NULL;

UPDATE `CallbackEvent` SET `status` = 'PROCESSED' WHERE `processedAt` IS NOT NULL AND (`outcome` IS NULL OR `outcome` NOT IN ('REJECTED'));
UPDATE `CallbackEvent` SET `status` = 'REJECTED' WHERE `outcome` = 'REJECTED';
UPDATE `CallbackEvent` SET `status` = 'RETRYABLE_FAILURE' WHERE `processedAt` IS NULL AND `outcome` = 'RETRYABLE_FAILURE';
UPDATE `CallbackEvent` SET `status` = 'PROCESSING' WHERE `processedAt` IS NULL AND `processingUntil` IS NOT NULL AND (`outcome` IS NULL OR `outcome` NOT IN ('RETRYABLE_FAILURE', 'REJECTED'));

CREATE INDEX `CallbackEvent_status_receivedAt_idx` ON `CallbackEvent`(`status`, `receivedAt`);

-- CreateTable
CREATE TABLE `CallbackReplay` (
    `id` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `operatorAdminId` VARCHAR(191) NOT NULL,
    `reason` VARCHAR(300) NOT NULL,
    `approvalNote` VARCHAR(300) NULL,
    `idempotencyKey` VARCHAR(128) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `CallbackReplay_idempotencyKey_key`(`idempotencyKey`),
    INDEX `CallbackReplay_eventId_createdAt_idx`(`eventId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CallbackReplay` ADD CONSTRAINT `CallbackReplay_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `CallbackEvent`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
