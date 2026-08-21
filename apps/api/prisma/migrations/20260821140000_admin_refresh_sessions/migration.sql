CREATE TABLE `AdminRefreshSession` (
    `id` VARCHAR(191) NOT NULL,
    `adminUserId` VARCHAR(191) NOT NULL,
    `familyId` VARCHAR(64) NOT NULL,
    `tokenDigest` VARCHAR(64) NOT NULL,
    `sessionVersion` INTEGER NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `lastUsedAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AdminRefreshSession_tokenDigest_key`(`tokenDigest`),
    INDEX `AdminRefreshSession_adminUserId_revokedAt_expiresAt_idx`(`adminUserId`, `revokedAt`, `expiresAt`),
    INDEX `AdminRefreshSession_familyId_revokedAt_idx`(`familyId`, `revokedAt`),
    INDEX `AdminRefreshSession_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`),
    CONSTRAINT `AdminRefreshSession_adminUserId_fkey`
      FOREIGN KEY (`adminUserId`) REFERENCES `AdminUser`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
