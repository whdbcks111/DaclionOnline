-- CreateTable
CREATE TABLE `player_quests` (
    `player_id` INTEGER NOT NULL,
    `quest_data_id` VARCHAR(100) NOT NULL,
    `status` VARCHAR(20) NOT NULL,
    `current_stage_id` VARCHAR(100) NOT NULL,
    `objective_progress` JSON NULL,
    `metadata` JSON NULL,
    `tags` JSON NULL,
    `completion_count` INTEGER NOT NULL DEFAULT 0,
    `accepted_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ready_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `repeat_available_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `player_quests_quest_data_id_status_idx`(`quest_data_id` ASC, `status` ASC),
    PRIMARY KEY (`player_id` ASC, `quest_data_id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `player_quests` ADD CONSTRAINT `player_quests_player_id_fkey` FOREIGN KEY (`player_id`) REFERENCES `players`(`user_id`) ON DELETE CASCADE ON UPDATE CASCADE;
