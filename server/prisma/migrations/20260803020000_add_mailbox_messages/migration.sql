CREATE TABLE `mailbox_messages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `recipient_id` INTEGER NOT NULL,
    `sender_label` VARCHAR(50) NOT NULL,
    `subject` VARCHAR(120) NOT NULL,
    `body` TEXT NOT NULL,
    `attachments` JSON NULL,
    `attachment_count` INTEGER NOT NULL DEFAULT 0,
    `source_key` VARCHAR(150) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `read_at` DATETIME(3) NULL,
    `claimed_at` DATETIME(3) NULL,
    `expires_at` DATETIME(3) NULL,
    `archived_at` DATETIME(3) NULL,

    UNIQUE INDEX `mailbox_messages_recipient_id_source_key_key`(`recipient_id`, `source_key`),
    INDEX `mailbox_messages_recipient_id_archived_at_created_at_idx`(`recipient_id`, `archived_at`, `created_at`),
    INDEX `mailbox_messages_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `mailbox_messages`
    ADD CONSTRAINT `mailbox_messages_recipient_id_fkey`
    FOREIGN KEY (`recipient_id`) REFERENCES `players`(`user_id`)
    ON DELETE CASCADE ON UPDATE CASCADE;
