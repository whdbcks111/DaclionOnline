# Scripts Overview

운영 데이터의 일회성·idempotent 변환 스크립트를 둔다.

- `migrateItemMetadataDeltas.ts`: `items`와 `equipments`의 구형 전체 metadata JSON을 현재 `ItemData.baseMetadata`와 비교해 버전 1 delta payload로 변환한다. 이미 변환된 행과 `null` 행은 건너뛰며 `--dry-run`은 변경 없이 대상 수만 출력한다.

운영 스크립트는 재실행해도 같은 결과여야 하며 서버를 중지한 뒤 DB 스키마 migration 적용 및 Prisma Client 생성 이후 실행한다. 스크립트 추가·변경 시 [`docs/data/database.md`](../../../docs/data/database.md)와 배포 명령을 함께 갱신한다.
