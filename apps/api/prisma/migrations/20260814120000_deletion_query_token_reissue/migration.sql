-- CreateTable
CREATE TABLE `DeletionQueryTokenReissue` (
    `id` VARCHAR(191) NOT NULL,
    `deletionRequestId` VARCHAR(191) NOT NULL,
    `operatorAdminId` VARCHAR(191) NOT NULL,
    `reason` VARCHAR(300) NOT NULL,
    `approvalNote` VARCHAR(300) NOT NULL,
    `confirmedUserId` VARCHAR(191) NOT NULL,
    `idempotencyKey` VARCHAR(128) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `DeletionQueryTokenReissue_idempotencyKey_key`(`idempotencyKey`),
    INDEX `DeletionQueryTokenReissue_deletionRequestId_createdAt_idx`(`deletionRequestId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `DeletionQueryTokenReissue` ADD CONSTRAINT `DeletionQueryTokenReissue_deletionRequestId_fkey` FOREIGN KEY (`deletionRequestId`) REFERENCES `DeletionRequest`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
