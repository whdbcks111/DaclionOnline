# 데이터베이스와 영속성

Prisma 스키마는 `server/prisma/schema.prisma`, 런타임 클라이언트 설정은 `server/src/config/prisma.ts`에 있다. datasource provider는 `mysql`이며 MariaDB adapter를 사용한다. 런타임 adapter는 `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME`, Prisma CLI는 `DATABASE_URL`을 읽는다.

## 모델

| 모델/테이블 | 키와 관계 | 주요 필드 |
| --- | --- | --- |
| `User` / `users` | `id`, Player 1:0..1 | username, email, passwordHash/salt, nickname, profileImage, permission, timestamps |
| `Player` / `players` | `userId` PK/FK | level, exp, maxWeight, stats/tags JSON, locationId, life/mentality/thirsty/hungry, statPoint, gold |
| `Item` / `items` | id, Player N:1 cascade | itemDataId, count, durability, metadata/tags JSON, timestamps |
| `Equipment` / `equipments` | id, Player N:1 cascade | itemDataId, slot, slotIndex, durability, metadata/tags JSON; `(playerId, slot, slotIndex)` unique |
| `PlayerProgress` / `player_progress` | `(playerId, key)` 복합 PK, Player N:1 cascade | kind, intValue, textValue, updatedAt |
| `PlayerSkill` / `player_skills` | `(playerId, skillDataId)` 복합 PK, Player N:1 cascade | level, cooldownEndsAt, metadata/tags JSON, acquisitionSource, timestamps |

`itemDataId`는 DB 외래키가 아니라 코드의 `data/items.ts` 마스터 데이터 ID다. `locationId`도 JSON 마스터 데이터 ID다. 마스터 ID 변경 시 기존 DB 레코드 호환을 직접 처리해야 한다.

Item/Equipment의 `metadata` JSON은 전체 유효값이 아니라 `{ "__daclionItemMetadata": 1, "values": { ...delta } }` 형식의 top-level delta만 저장한다. 런타임 `Item`이 `ItemData.baseMetadata`와 합쳐 읽으며, Item setter callback이 Inventory/Equipment dirty 상태를 만든다. `PlayerSkill.metadata`도 같은 공용 codec으로 `{ "__daclionSkillMetadata": 1, "values": { ...delta } }`만 저장한다. 이 구조 덕분에 delta에 없는 기본 필드는 기존 아이템과 스킬에도 최신 마스터 값이 적용된다.

`player_progress`는 counter/flag를 `int_value`, state를 `text_value`에 저장한다. 등록된 기본값 `0/false/빈 문자열`은 row를 삭제하거나 만들지 않는다. `kind`가 직렬화 타입 경계이며 기능 코드는 Prisma row 대신 `PlayerProgress` API만 사용한다.
제작법 발견 여부도 `crafting:recipe/{namespace}/{path}` FLAG로 이 테이블에 저장되므로 제작 시스템 추가에 따른 별도 스키마 마이그레이션은 없다.

## 로드와 저장

```text
login/session restore
  -> Player.loadByUserId
     -> Inventory.load
     -> Equipment.load
     -> PlayerProgress.load
     -> SkillBook.load
  -> online Player Map

30초 / logout / process signal
  -> Player.save
     -> player row + stats JSON
     -> Inventory.save
     -> Equipment.save
     -> PlayerProgress.save
     -> SkillBook.save
```

- Player scalar setter와 Player/Item/Skill 영속 태그·metadata·내구도 callback, Stat/Inventory/Equipment/PlayerProgress/SkillBook이 dirty 상태를 추적한다.
- `fetchPlayerByUserId()`는 오프라인 Player를 DB에서 읽지만 온라인 Map에는 올리지 않는다.
- 위치 JSON, 채팅/세션/온라인 상태, 몬스터/드롭, 상점 재고는 DB에 저장되지 않는다.
- 회원가입은 User와 Player를 nested create하므로 기본 Player 레코드가 즉시 생긴다.

## 스키마 변경 체크리스트

1. `schema.prisma`와 필요한 migration/schema sync를 준비한다.
2. Player/Inventory/Equipment의 load, create, save를 모두 확인한다.
3. 기본값이 기존 레코드와 신규 레코드 모두에 안전한지 확인한다.
4. JSON 필드는 런타임 타입(`StatRecord`, item metadata)과 호환되는지 확인한다.
5. `server/database/schema.sql`을 계속 참조용으로 유지한다면 함께 동기화한다.
6. 이 문서와 관련 `Overview.md`를 갱신하고 서버 build를 실행한다.

## Migration 운영

- `server/prisma/migrations/0_init`은 Prisma Migrate 도입 전부터 존재하던 DB 구조의 baseline이다. 기존 운영 DB에는 SQL을 다시 실행하지 않고 `prisma migrate resolve --applied 0_init`으로 최초 한 번만 적용 이력을 등록한다.
- 빈 DB에서는 `0_init`부터 모든 migration이 순서대로 실행되어 전체 스키마를 만든다.
- 태그 JSON 컬럼 추가 migration은 `20260714000000_add_object_tags`다.
- 통계·플래그와 스킬 인스턴스 테이블 migration은 `20260715000000_add_progress_and_skills`다.
- 일반 운영 배포에서는 `cd server && npm run db:migrate:deploy`를 실행한다. 이 명령은 pending schema migration 적용, Prisma Client 생성, 아이템 metadata delta 데이터 마이그레이션을 순서대로 실행한다.
- metadata 데이터 마이그레이션은 `src/scripts/migrateItemMetadataDeltas.ts`가 담당한다. 이미 버전 1인 행과 `null` 행은 건너뛰므로 재실행할 수 있다. 구형 전체 metadata 중 현재 `baseMetadata`와 같은 값은 기본값으로 간주해 제거하므로, 기본 metadata를 변경하기 전에 서버를 중지한 상태에서 운영 명령을 먼저 실행해야 한다.
- `migrate reset`은 전체 데이터를 삭제하므로 운영 DB에서 금지한다.
