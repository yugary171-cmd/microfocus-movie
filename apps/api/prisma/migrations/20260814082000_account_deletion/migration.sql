-- AlterTable
ALTER TABLE `User` ADD COLUMN `status` ENUM('ACTIVE', 'DELETION_PENDING') NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE `DeletionRequest` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `idempotencyKey` VARCHAR(128) NOT NULL,
    `queryTokenHash` VARCHAR(64) NOT NULL,
    `tokenExpiresAt` DATETIME(3) NOT NULL,
    `lastQueriedAt` DATETIME(3) NULL,
    `processedAt` DATETIME(3) NULL,
    `statusReason` VARCHAR(300) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `DeletionRequest_idempotencyKey_key`(`idempotencyKey`),
    UNIQUE INDEX `DeletionRequest_queryTokenHash_key`(`queryTokenHash`),
    INDEX `DeletionRequest_userId_status_idx`(`userId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `DeletionRequest` ADD CONSTRAINT `DeletionRequest_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
