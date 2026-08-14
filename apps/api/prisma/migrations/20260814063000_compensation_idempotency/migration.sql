-- AlterTable
ALTER TABLE `EntitlementGrant` ADD COLUMN `compensationKey` VARCHAR(128) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `EntitlementGrant_compensationKey_key` ON `EntitlementGrant`(`compensationKey`);
