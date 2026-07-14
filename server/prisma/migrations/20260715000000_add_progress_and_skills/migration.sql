-- CreateTable
CREATE TABLE `player_progress` (
    `player_id` INTEGER NOT NULL,
    `key` VARCHAR(150) NOT NULL,
    `kind` VARCHAR(20) NOT NULL,
    `int_value` BIGINT NULL,
    `text_value` VARCHAR(255) NULL,
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `player_progress_key_int_value_idx`(`key` ASC, `int_value` ASC),
    PRIMARY KEY (`player_id` ASC, `key` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `player_skills` (
    `player_id` INTEGER NOT NULL,
    `skill_data_id` VARCHAR(100) NOT NULL,
    `level` INTEGER NOT NULL DEFAULT 1,
    `cooldown_ends_at` DATETIME(3) NULL,
    `metadata` JSON NULL,
    `tags` JSON NULL,
    `acquisition_source` VARCHAR(100) NULL,
    `acquired_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `player_skills_skill_data_id_idx`(`skill_data_id` ASC),
    PRIMARY KEY (`player_id` ASC, `skill_data_id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `player_progress` ADD CONSTRAINT `player_progress_player_id_fkey` FOREIGN KEY (`player_id`) REFERENCES `players`(`user_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `player_skills` ADD CONSTRAINT `player_skills_player_id_fkey` FOREIGN KEY (`player_id`) REFERENCES `players`(`user_id`) ON DELETE CASCADE ON UPDATE CASCADE;
