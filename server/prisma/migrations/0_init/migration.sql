-- CreateTable
CREATE TABLE `equipments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `player_id` INTEGER NOT NULL,
    `item_data_id` VARCHAR(100) NOT NULL,
    `slot` VARCHAR(50) NOT NULL,
    `slot_index` INTEGER NOT NULL DEFAULT 0,
    `metadata` LONGTEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `durability` INTEGER NULL,

    INDEX `equipments_player_id_idx`(`player_id` ASC),
    UNIQUE INDEX `equipments_player_id_slot_slot_index_key`(`player_id` ASC, `slot` ASC, `slot_index` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `count` INTEGER NOT NULL DEFAULT 1,
    `item_data_id` VARCHAR(100) NOT NULL,
    `metadata` LONGTEXT NULL,
    `player_id` INTEGER NOT NULL,
    `durability` INTEGER NULL,

    INDEX `items_player_id_idx`(`player_id` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `players` (
    `user_id` INTEGER NOT NULL,
    `level` INTEGER NOT NULL DEFAULT 1,
    `exp` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `max_weight` DOUBLE NOT NULL DEFAULT 100,
    `stats` LONGTEXT NULL,
    `location_id` VARCHAR(100) NOT NULL DEFAULT 'town_square',
    `hungry` DOUBLE NOT NULL DEFAULT 100,
    `life` DOUBLE NOT NULL DEFAULT 100,
    `mentality` DOUBLE NOT NULL DEFAULT 50,
    `stat_point` INTEGER NOT NULL DEFAULT 0,
    `thirsty` DOUBLE NOT NULL DEFAULT 100,
    `gold` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`user_id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(50) NOT NULL,
    `email` VARCHAR(100) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `passwordSalt` VARCHAR(128) NOT NULL,
    `nickname` VARCHAR(50) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `profile_image` VARCHAR(255) NULL,
    `permission` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `users_email_key`(`email` ASC),
    UNIQUE INDEX `users_nickname_key`(`nickname` ASC),
    UNIQUE INDEX `users_username_key`(`username` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `equipments` ADD CONSTRAINT `equipments_player_id_fkey` FOREIGN KEY (`player_id`) REFERENCES `players`(`user_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `items` ADD CONSTRAINT `items_player_id_fkey` FOREIGN KEY (`player_id`) REFERENCES `players`(`user_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `players` ADD CONSTRAINT `players_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
