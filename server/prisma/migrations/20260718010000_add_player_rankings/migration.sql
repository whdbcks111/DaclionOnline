-- 플레이어가 오프라인이어도 계산 능력치 순위를 조회할 수 있도록 마지막 저장 snapshot을 보관한다.
ALTER TABLE `players`
    ADD COLUMN `ranking_metrics` JSON NULL,
    ADD COLUMN `ranking_visibility` JSON NULL;
