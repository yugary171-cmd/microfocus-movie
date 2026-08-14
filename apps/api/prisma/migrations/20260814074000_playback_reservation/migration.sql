-- CreateTable
CREATE TABLE `PlaybackReservation` (
    `id` VARCHAR(191) NOT NULL,
    `leaseId` VARCHAR(191) NOT NULL,
    `windowIndex` INTEGER NOT NULL,
    `reservedSeconds` INTEGER NOT NULL,
    `status` ENUM('RESERVED', 'CONFIRMED', 'RELEASED', 'UNCONFIRMED') NOT NULL DEFAULT 'RESERVED',
    `expiresAt` DATETIME(3) NOT NULL,
    `confirmedHeartbeatId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PlaybackReservation_confirmedHeartbeatId_key`(`confirmedHeartbeatId`),
    INDEX `PlaybackReservation_leaseId_status_idx`(`leaseId`, `status`),
    UNIQUE INDEX `PlaybackReservation_leaseId_windowIndex_key`(`leaseId`, `windowIndex`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PlaybackRecoveryEvent` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `deviceId` VARCHAR(128) NOT NULL,
    `leaseId` VARCHAR(191) NOT NULL,
    `reason` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PlaybackRecoveryEvent_userId_deviceId_createdAt_idx`(`userId`, `deviceId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PlaybackReservation` ADD CONSTRAINT `PlaybackReservation_leaseId_fkey` FOREIGN KEY (`leaseId`) REFERENCES `PlaybackLease`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
