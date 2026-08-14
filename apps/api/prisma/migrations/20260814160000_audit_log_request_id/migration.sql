-- AlterTable
ALTER TABLE `AuditLog` ADD COLUMN `requestId` VARCHAR(128) NULL;

CREATE INDEX `AuditLog_requestId_idx` ON `AuditLog`(`requestId`);
