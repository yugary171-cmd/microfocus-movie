-- Expand AdminUser first so existing administrator rows remain deployable.
ALTER TABLE `AdminUser`
    ADD COLUMN `displayName` VARCHAR(191) NULL,
    MODIFY COLUMN `passwordHash` VARCHAR(191) NULL,
    ADD COLUMN `setupCompletedAt` DATETIME(3) NULL,
    ADD COLUMN `sessionVersion` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `lastLoginAt` DATETIME(3) NULL,
    ADD COLUMN `updatedAt` DATETIME(3) NULL;

-- Existing accounts are already provisioned; preserve their login behavior.
UPDATE `AdminUser`
SET
    `displayName` = `email`,
    `setupCompletedAt` = `createdAt`,
    `sessionVersion` = 1,
    `updatedAt` = `createdAt`
WHERE `displayName` IS NULL;

ALTER TABLE `AdminUser`
    MODIFY COLUMN `displayName` VARCHAR(191) NOT NULL,
    MODIFY COLUMN `updatedAt` DATETIME(3) NOT NULL;

CREATE INDEX `AdminUser_role_active_setupCompletedAt_idx`
    ON `AdminUser`(`role`, `active`, `setupCompletedAt`);

-- Raw setup tokens and TOTP secrets are never stored; only a SHA-256 digest
-- and an AES-GCM encrypted TOTP secret are persisted.
CREATE TABLE `AdminSetupToken` (
    `id` VARCHAR(191) NOT NULL,
    `adminUserId` VARCHAR(191) NOT NULL,
    `purpose` ENUM('INVITE', 'CREDENTIAL_RESET') NOT NULL,
    `tokenDigest` VARCHAR(64) NOT NULL,
    `totpSecretEncrypted` TEXT NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdByAdminId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AdminSetupToken_tokenDigest_key`(`tokenDigest`),
    INDEX `AdminSetupToken_adminUserId_purpose_createdAt_idx`(`adminUserId`, `purpose`, `createdAt`),
    INDEX `AdminSetupToken_createdByAdminId_createdAt_idx`(`createdByAdminId`, `createdAt`),
    INDEX `AdminSetupToken_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `AdminSetupToken`
    ADD CONSTRAINT `AdminSetupToken_adminUserId_fkey`
    FOREIGN KEY (`adminUserId`) REFERENCES `AdminUser`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
