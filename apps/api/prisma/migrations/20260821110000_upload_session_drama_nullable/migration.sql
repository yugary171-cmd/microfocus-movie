-- Allow poster uploads to be issued before a new drama has an id.
ALTER TABLE `UploadSession` MODIFY `dramaId` VARCHAR(191) NULL;
