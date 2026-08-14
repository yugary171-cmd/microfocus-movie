-- CreateTable
CREATE TABLE `BackgroundJobLease` (
    `jobName` VARCHAR(64) NOT NULL,
    `ownerId` VARCHAR(128) NOT NULL,
    `lockedUntil` DATETIME(3) NOT NULL,
    `lastRunAt` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`jobName`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
