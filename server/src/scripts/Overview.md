# Scripts Overview

운영 데이터의 일회성·idempotent 변환 스크립트를 둔다.

- `migrateItemMetadataDeltas.ts`: `items`와 `equipments`의 구형 전체 metadata JSON을 현재 `ItemData.baseMetadata`와 비교해 버전 1 delta payload로 변환한다. 이미 변환된 행과 `null` 행은 건너뛰며 `--dry-run`은 변경 없이 대상 수만 출력한다.
- `validateMasterData.ts`: DB 없이 모든 코드 마스터를 로드하고 `locations.json`을 포함한 참조·필수 아이콘을 검사한다. `npm run data:validate`에서 issue가 하나라도 있으면 종료 코드 1을 반환한다.
- `reportBalance.ts`: 서버나 DB 없이 직업·스킬·아이템·몬스터 마스터를 로드해 개별 기준선과 추천 장비/동레벨 일반·보스/평타+전체 스킬 60초 로테이션을 출력한다. 기본 장비와 각 선택 권역·역설기계고의 직업별 성장 장비를 같은 기준으로 비교하고, 역설기계고 전승 기술은 실제 상대 속도 회피·스킬 고유 관통·회피 불가·소모·쿨다운을 별도 출력한다. `npm run balance:report -- 50`은 단일 레벨, `-- all`은 Lv.20/50/100/150/200 및 Lv.200 엘리트 20조합을 비교한다.

운영 스크립트는 재실행해도 같은 결과여야 하며 서버를 중지한 뒤 DB 스키마 migration 적용 및 Prisma Client 생성 이후 실행한다. 스크립트 추가·변경 시 [`docs/data/database.md`](../../../docs/data/database.md)와 배포 명령을 함께 갱신한다.
