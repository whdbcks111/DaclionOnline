# Scripts Overview

운영 데이터의 일회성·idempotent 변환 스크립트를 둔다.

- `migrateItemMetadataDeltas.ts`: `items`와 `equipments`의 구형 전체 metadata JSON을 현재 `ItemData.baseMetadata`와 비교해 버전 1 delta payload로 변환한다. 이미 변환된 행과 `null` 행은 건너뛰며 `--dry-run`은 변경 없이 대상 수만 출력한다.
- `resetGameData.ts`: User 계정 행은 그대로 두고 Player와 cascade된 아이템·장비·Progress·Skill·Quest를 초기화한다. 기본 실행은 대상 count만 출력하는 dry-run이며 정확한 `--confirm RESET-DACLION-GAME-DATA`가 있어야 트랜잭션 삭제한다. 서버를 중지한 상태에서만 실행한다.
- `validateMasterData.ts`: DB 없이 모든 코드 마스터를 로드하고 `locations.json`과 Lv.500 이후 생성 권역을 합친 참조·필수 아이콘을 검사한다. `npm run data:validate`에서 issue가 하나라도 있으면 종료 코드 1을 반환한다.
- `reportBalance.ts`: 서버나 DB 없이 직업·스킬·아이템·몬스터 마스터를 로드해 개별 기준선과 추천 장비/동레벨 일반·보스/평타+전체 스킬 로테이션을 출력한다. 일반은 30초, 보스는 240초 분석창을 쓰고 각 행에 실제 `report.duration`을 표시한다. 프로파일 행은 평균 DPS 외에 실제 처치 시각, 양쪽 HP, 최대 선공과 한 방 여부, 첫 반격 전 피해, 피격 회피·확정 회피 가동률·방어기 포함 생존을 함께 비교한다. 기본 장비와 황혼왕릉부터 카미하라 숲까지의 직업별 성장 장비를 같은 기준으로 비교하고, 지역 전승 기술은 실제 상대 속도 회피·스킬 고유 관통·회피 불가·소모·쿨다운을 별도 출력한다. `npm run balance:report -- 50`은 단일 레벨, `-- all`은 공용 `BALANCE_PROFILE_LEVELS`의 Lv.20/50/75/100/140/180/200/350/500/750/1000 및 Lv.200 이상 엘리트 20조합을 비교한다. `-- pressure`는 같은 55개 일반전의 레벨별 순 HP 소모 p25·중앙값·p75와 예상 사망 수를 출력한다.

운영 스크립트는 재실행해도 같은 결과여야 하며 서버를 중지한 뒤 DB 스키마 migration 적용 및 Prisma Client 생성 이후 실행한다. 스크립트 추가·변경 시 [`docs/data/database.md`](../../../docs/data/database.md)와 배포 명령을 함께 갱신한다.
