# Scripts Overview

운영 데이터의 일회성·idempotent 변환 스크립트를 둔다.

- `migrateItemMetadataDeltas.ts`: `items`와 `equipments`의 구형 전체 metadata JSON을 현재 `ItemData.baseMetadata`와 비교해 버전 1 delta payload로 변환한다. 이미 변환된 행과 `null` 행은 건너뛰며 `--dry-run`은 변경 없이 대상 수만 출력한다.
- `validateMasterData.ts`: DB 없이 모든 코드 마스터를 로드하고 `locations.json`을 포함한 참조·필수 아이콘을 검사한다. `npm run data:validate`에서 issue가 하나라도 있으면 종료 코드 1을 반환한다.
- `reportBalance.ts`: 서버나 DB 없이 직업·스킬·아이템 마스터를 로드해 `Balance` 공개 API의 레벨별 1차 직업과 주력 장비·버프 아이템 전후 기준선을 출력한다. Lv.200 이상에서는 대장장이를 포함한 순서 있는 엘리트 조합 20개의 전용 액티브를 포함한 실측도 함께 출력한다. `npm run balance:report -- 50`처럼 사용하며 계수 변경 전후 결과를 비교한다.

운영 스크립트는 재실행해도 같은 결과여야 하며 서버를 중지한 뒤 DB 스키마 migration 적용 및 Prisma Client 생성 이후 실행한다. 스크립트 추가·변경 시 [`docs/data/database.md`](../../../docs/data/database.md)와 배포 명령을 함께 갱신한다.
