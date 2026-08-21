-- Add durable provider upload sessions and optional promotional poster URL.
ALTER TABLE `Drama` ADD COLUMN `promoCoverUrl` VARCHAR(2048) NULL;

CREATE TABLE `UploadSession` (
    `id` VARCHAR(191) NOT NULL,
    `provider` ENUM('COS', 'VOD') NOT NULL,
    `kind` ENUM('POSTER_COVER', 'POSTER_PROMO', 'VOD_MEDIA') NOT NULL,
    `status` ENUM('ISSUED', 'UPLOADED', 'COMPLETED', 'FAILED', 'EXPIRED') NOT NULL DEFAULT 'ISSUED',
    `adminId` VARCHAR(191) NOT NULL,
    `dramaId` VARCHAR(191) NOT NULL,
    `episodeId` VARCHAR(191) NULL,
    `uploadId` VARCHAR(191) NOT NULL,
    `objectKey` VARCHAR(512) NULL,
    `fileId` VARCHAR(191) NULL,
    `fileName` VARCHAR(255) NOT NULL,
    `contentType` VARCHAR(128) NOT NULL,
    `size` BIGINT NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `UploadSession_uploadId_key`(`uploadId`),
    INDEX `UploadSession_dramaId_status_expiresAt_idx`(`dramaId`, `status`, `expiresAt`),
    INDEX `UploadSession_episodeId_status_idx`(`episodeId`, `status`),
    INDEX `UploadSession_provider_fileId_idx`(`provider`, `fileId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
