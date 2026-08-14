-- AlterTable
ALTER TABLE `CallbackEvent` ADD COLUMN `payloadCiphertext` TEXT NULL;
ALTER TABLE `CallbackEvent` ADD COLUMN `payloadSchema` VARCHAR(32) NULL;
ALTER TABLE `CallbackEvent` ADD COLUMN `payloadRetainUntil` DATETIME(3) NULL;
