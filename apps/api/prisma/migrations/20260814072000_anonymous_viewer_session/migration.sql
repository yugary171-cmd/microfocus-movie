-- AlterTable
ALTER TABLE `PlaybackLease` DROP FOREIGN KEY `PlaybackLease_userId_fkey`;

-- AlterTable
ALTER TABLE `PlaybackLease` MODIFY `userId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `AnonymousViewerSession` (
    `id` VARCHAR(191) NOT NULL,
    `deviceId` VARCHAR(128) NOT NULL,
    `sessionId` VARCHAR(128) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `lastIssuedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AnonymousViewerSession_deviceId_sessionId_key`(`deviceId`, `sessionId`),
    INDEX `AnonymousViewerSession_deviceId_createdAt_idx`(`deviceId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `PlaybackLease` ADD COLUMN `viewerSessionId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `PlaybackLease_viewerSessionId_status_idx` ON `PlaybackLease`(`viewerSessionId`, `status`);

-- AddForeignKey
ALTER TABLE `PlaybackLease` ADD CONSTRAINT `PlaybackLease_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlaybackLease` ADD CONSTRAINT `PlaybackLease_viewerSessionId_fkey` FOREIGN KEY (`viewerSessionId`) REFERENCES `AnonymousViewerSession`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
