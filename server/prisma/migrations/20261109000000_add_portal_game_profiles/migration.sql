CREATE TABLE `game_profiles` (
    `user_id` INTEGER NOT NULL,
    `game_id` VARCHAR(50) NOT NULL,
    `nickname` VARCHAR(50) NOT NULL,
    `nickname_changed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `game_profiles_game_id_nickname_key`(`game_id`, `nickname`),
    PRIMARY KEY (`user_id`, `game_id`),
    CONSTRAINT `game_profiles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 기존 캐릭터만 자동 연결한다. 계정 ID와 비밀번호, 모든 게임 진행 행은 그대로 둔다.
INSERT INTO `game_profiles` (`user_id`, `game_id`, `nickname`, `nickname_changed_at`, `created_at`, `updated_at`)
SELECT u.id, 'daclion', u.nickname, u.nickname_changed_at, p.created_at, CURRENT_TIMESTAMP(3)
FROM users u INNER JOIN players p ON p.user_id = u.id;
