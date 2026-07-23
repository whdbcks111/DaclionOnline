-- 카르마는 Player aggregate가 메모리에서 변경하고 주기 저장한다.
-- 기준 시각을 함께 저장해 매 tick DB write 없이 온라인·오프라인 자연 감소를 계산한다.
ALTER TABLE `players`
    ADD COLUMN `karma` DOUBLE NOT NULL DEFAULT 0,
    ADD COLUMN `karma_updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
