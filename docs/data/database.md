# 데이터베이스와 영속성

Prisma 스키마는 `server/prisma/schema.prisma`, 런타임 클라이언트 설정은 `server/src/config/prisma.ts`에 있다. datasource provider는 `mysql`이며 MariaDB adapter를 사용한다. 런타임 adapter는 `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME`, Prisma CLI는 `DATABASE_URL`을 읽는다.

## 모델

| 모델/테이블 | 키와 관계 | 주요 필드 |
| --- | --- | --- |
| `User` / `users` | `id`, Player 1:0..1 | username, email, passwordHash/salt, nickname/nicknameChangedAt, profileImage, permission, timestamps |
| `Player` / `players` | `userId` PK/FK | level, exp, maxWeight, stats/tags JSON, locationId, life/mentality/thirsty/hungry, statPoint, gold, karma/karmaUpdatedAt, rankingMetrics/rankingVisibility/hudPresets/statusEffects JSON |
| `Item` / `items` | id, Player N:1 cascade | itemDataId, count, durability, metadata/tags JSON, sortOrder, timestamps |
| `Equipment` / `equipments` | id, Player N:1 cascade | itemDataId, count, slot, slotIndex, durability, metadata/tags JSON; `(playerId, slot, slotIndex)` unique |
| `PlayerProgress` / `player_progress` | `(playerId, key)` 복합 PK, Player N:1 cascade | kind, intValue, textValue, updatedAt |
| `PlayerSkill` / `player_skills` | `(playerId, skillDataId)` 복합 PK, Player N:1 cascade | level, experience, cooldownEndsAt, metadata/tags JSON, acquisitionSource, timestamps |
| `PlayerQuest` / `player_quests` | `(playerId, questDataId)` 복합 PK, Player N:1 cascade | status, currentStageId, objectiveProgress/metadata/tags JSON, completionCount, 수락·보고·완료·반복 시각 |
| `MailboxMessage` / `mailbox_messages` | id, Player N:1 cascade, `(recipientId, sourceKey)` unique | 발신 표시·제목·본문, versioned attachments JSON/수량, 읽음·수령·만료·archive 시각 |

`itemDataId`는 DB 외래키가 아니라 코드의 `data/economy/items.ts` 마스터 데이터 ID다. `locationId`도 JSON 마스터 데이터 ID다. 마스터 ID 변경 시 기존 DB 레코드 호환을 직접 처리해야 한다.

Item/Equipment의 `metadata` JSON은 전체 유효값이 아니라 `{ "__daclionItemMetadata": 1, "values": { ...delta } }` 형식의 top-level delta만 저장한다. 런타임 `Item`이 `ItemData.baseMetadata`와 합쳐 읽으며, Item setter callback이 Inventory/Equipment dirty 상태를 만든다. `PlayerSkill.metadata`도 같은 공용 codec으로 `{ "__daclionSkillMetadata": 1, "values": { ...delta } }`만 저장한다. 이 구조 덕분에 delta에 없는 기본 필드는 기존 아이템과 스킬에도 최신 마스터 값이 적용된다.

`items.sort_order`는 `/인벤토리정리`로 정한 인벤토리 표시 순서를 저장한다. 기존 행은 migration 기본값 0과 ID 보조 정렬로 종전 획득 순서를 유지하며, 최초 정리나 아이템 추가·제거 뒤 Inventory dirty flush가 0부터 시작하는 순서로 다시 저장한다.

`mailbox_messages.attachments`는 기존 `{ version: 1, items: ItemSnapshot[] }`과 복합 `{ version: 2, items, gold, titleIds, skills }`를 함께 읽는다. 한 통당 아이템 snapshot 20개·생성 Item 행 100개·총수량 1,000,000개·Gold 10억·칭호/스킬 각 20개·JSON 32KiB 상한을 적용한다. 첨부 수령은 온라인 Player dirty 저장을 먼저 기다린 뒤 `claimed_at IS NULL` 조건 갱신, 실제 `items` 행 생성, `players.gold` 증가, 칭호 `player_progress`, 스킬 `player_skills` 최소 레벨을 하나의 Prisma transaction에서 확정한다. commit 후 온라인 Player 메모리를 같은 결과로 동기화하며 프로세스가 종료돼도 다음 로그인 load가 DB 지급 상태를 복원한다. `source_key`가 있는 멱등 보상 우편은 정리·관리자 삭제 시 `archived_at`만 설정해 unique tombstone을 보존하고, source key 없는 일반 우편은 실제 삭제한다.

`Equipment.count`는 미끼처럼 장착 가능한 스택 아이템의 남은 묶음 수량을 저장한다. 장착 시 인벤토리 스택 전체가 이동하고 `consumeEquippedItem(count)`는 필요한 수량만 차감해 남은 스택을 슬롯에 유지한다. 기존 장비 행은 `20260718000000_add_equipment_count` 마이그레이션의 기본값 1로 이행한다.

`player_progress`는 counter/flag를 `int_value`, state를 `text_value`에 저장한다. 등록된 기본값 `0/false/빈 문자열`은 row를 삭제하거나 만들지 않는다. `kind`가 직렬화 타입 경계이며 기능 코드는 Prisma row 대신 `PlayerProgress` API만 사용한다. `player:play_time_seconds` counter는 Player가 온라인이었던 누적 초를 30초 주기·unload·종료 저장에 합산하며 24시간 미만·Lv.30 미만 새싹 표시의 시간 원본이다. `combat:pvp_credit/last_respawn_at`과 공격자 Progress의 `combat:pvp_credit/last_victim/{victimUserId}` counter는 부활 직후·동일 상대 반복 PVP의 칭호 및 영웅 보상 제외 시각을 저장한다. `world:travel-hub/{locationId}` FLAG는 퀘스트·Gold로 영구 해금한 공간 중계소를, `world:residence-location` STATE는 사망 후 이동할 해금 거주점을 저장한다. `tutorial:status/step/content_done`과 지원품·성장 보상 FLAG는 새 Player의 첫 모험 안내 및 반복 보상을, `title-owned:*` FLAG와 `title:equipped` STATE는 칭호 소유·장착을 저장한다. `alchemy:reagent-experimented/{itemDataId}` 숨김 FLAG는 ready에서 실제 소비한 연금 reagent의 영구 실험 기록을 기존 30초·unload flush로 저장한다. 전문 도감은 `codex-entry:*` COUNTER와 `codex-rank:*` FLAG를 사용해 종별 횟수와 강등되지 않는 분류 보너스를 저장하며, 기존 `world:visited/*`만 탐험 기록으로 정확히 소급한다. `security:human_verification_required` FLAG는 페이지 종료로 검사 요구를 우회하지 못하게 하며 오답 횟수는 숨은 counter에 누적한다. 관리자에게 회수된 칭호는 `title-blocked:*` FLAG로 자동 재획득을 막고 재부여 시 해당 flag를 제거한다. 모두 기존 진행 테이블을 사용하므로 별도 스키마 변경은 없다.

사망한 Player의 `runtime:death_expires_at_ms` 숨김 STATE는 이미 지역 사망 패널티가 적용됐다는 표식과 실제 부활 절대 만료 시각을 겸한다. 적대 귀환 두루마리를 자동 소모한 경우 지역·카르마 포함 대기를 절반으로 줄인 뒤의 만료 시각을 저장한다. 주기 저장 및 unload에서 같은 시각을 유지하고 재접속 시 현재 시각과 비교하므로 별도 컬럼·migration 없이 중복 사망 처리·중복 손실·두루마리 재소모를 막는다. 부활하면 row를 삭제하며, 구형 `runtime:death_remaining_seconds` 값은 최초 복원 때 절대 시각으로 이전한다.
제작법 발견 여부도 `crafting:recipe/{namespace}/{path}` FLAG로 이 테이블에 저장되므로 제작 시스템 추가에 따른 별도 스키마 마이그레이션은 없다.
NPC 대화 결과 flag/state도 같은 `player_progress`에 저장한다. 진행 중인 대화 세션은 접속 중 메모리에만 존재하며 이동·사망·로그아웃·연결 이탈 시 폐기되므로 별도 NPC 마이그레이션은 없다.
지도 방문 기록은 `world:visited/{locationId}` FLAG로 같은 `player_progress`에 저장한다. Player가 로드된 현재 위치와 이후 도착 위치를 메모리에서 dirty 표시해 기존 30초/unload 저장 경로로 flush하므로 별도 지도 테이블이나 migration은 없다.
직업은 `career:main_job`, `career:sub_job`, `career:elite_job` STATE로 같은 `player_progress`에 저장한다. 원래 메인 ID를 보존해 엘리트 하위 계보 호환을 계산하며 별도 직업 테이블이나 migration은 없다.
ActionType 제한과 Monster/Resource의 StatusEffect 인스턴스는 런타임 메모리에만 존재한다. Player의 일반 유한 상태효과는 `players.status_effects`에 `{ version: 1, effects: [...] }` snapshot으로 저장한다. 각 효과는 ID·레벨·절대 만료 시각·최대 duration과 선택적 `sourcePlayerId`, 타입이 whitelist한 안전 metadata delta만 가진다. 공복·갈증·장소 환경처럼 다른 상태에서 재생성되는 효과와 시전·보호막에 묶인 전투 한정 효과는 저장하지 않는다. 로드는 버전·크기·개수·ID·중복·정책·수치·metadata를 현재 master data 기준으로 검증하고 만료된 효과를 버린다.
퀘스트는 코드 `QuestData`를 원본으로 삼고 `player_quests`에는 플레이어별 인스턴스만 저장한다. 목표 진행 JSON key는 `{stageId}/{objectiveId}`이며 metadata는 Item/Skill과 같은 versioned top-level delta다. 반복 완료 횟수와 재수락 가능 시각을 같은 행에 유지한다.

## 계정 보존 운영 초기화

`npm run db:reset:game`은 기본적으로 User와 Player 하위 테이블의 count만 출력하고 변경하지 않는다. 서버를 중지한 뒤 `--confirm RESET-DACLION-GAME-DATA`를 붙였을 때만 하나의 DB 트랜잭션에서 `players`를 삭제한다. `items`, `equipments`, `player_progress`, `player_skills`, `player_quests`, `mailbox_messages`는 FK cascade로 함께 삭제되며 트랜잭션 안에서 모두 0인지와 `users` count가 변하지 않았는지 검증한다.

`users`의 ID, username/email, password hash/salt, nickname, profile image, permission과 생성·수정 시각은 보존된다. 업로드 파일과 코드 마스터 데이터는 DB 초기화 대상이 아니다. 서버가 실행 중이면 메모리 Player와 저장 작업이 삭제된 행을 계속 참조할 수 있으므로 실제 초기화 전 서버 중지가 필수다. 다음 로그인에서 `Player.create()`가 기본 상태를 만들고 첫 모험 안내, 일회성 지원품과 새싹 누적 시간이 처음부터 시작된다.

`players.ranking_metrics`는 마지막 Player 저장 시 레벨·골드와 모든 스탯·계산 능력치를 저장한 순위 전용 snapshot이다. 온라인 순위는 이 값 대신 현재 메모리 Player snapshot을 사용한다. `ranking_visibility`는 `{ defaultPublic, overrides }` 구조이며 기본 전체 공개와 반대되는 카테고리 예외만 보관한다. 두 필드는 Player/RankingVisibility dirty 상태를 기존 30초·unload 경로에서 함께 flush한다.

`players.karma`와 `karma_updated_at`은 자연 감소의 기준값과 기준 시각이다. 런타임 `KarmaState`가 경과 초에 `0.003`을 곱해 읽을 때 감소시키므로 매 tick dirty 또는 DB write가 발생하지 않는다. 악행·사망 감소·기부·관리자 설정처럼 명시적인 변경만 Player dirty를 만들고 기존 aggregate 저장에서 현재 계산값과 새 기준 시각을 함께 flush한다. 재접속 시 오프라인 경과 시간도 같은 계산에 포함된다.

`players.hud_presets`는 `{ [프리셋 이름]: { updatedAt, preset } }` JSON으로 계정당 최대 10개의 HUD snapshot을 저장한다. `HudPresetBook`이 이름·개수·좌표·크기·배열 상한을 검증하고 Player dirty 상태를 소유한다. 저장·삭제 버튼은 결과를 즉시 확정하기 위해 `Player.save()`를 호출하며, 로그인 때 목록만 조회하고 저장된 프리셋을 자동 적용하지 않는다.

## 로드와 저장

```text
login/session restore
  -> Player.loadByUserId
     -> Inventory.load
     -> Equipment.load
     -> PlayerProgress.load
     -> SkillBook.load
     -> QuestBook.load
     -> versioned status effect snapshot restore
  -> online Player Map

30초 / logout / process signal
  -> Player.save
     -> player row + stats JSON
        + karma 기준값/시각
        + ranking metrics/visibility JSON
        + named HUD presets JSON
        + absolute-expiry status effects JSON
     -> Inventory.save
     -> Equipment.save
     -> PlayerProgress.save
     -> SkillBook.save
     -> QuestBook.save
```

- Player scalar setter와 Player/Item/Skill/Quest 영속 태그·metadata·내구도 callback, Stat/Inventory/Equipment/PlayerProgress/SkillBook/QuestBook, `WALL_CLOCK` 상태효과의 구조 변경이 dirty 상태를 추적한다. 상태효과의 tick별 duration 감소와 비영속 효과 변경은 dirty가 아니며 unload·종료 저장에서 현재 절대 만료 시각과 whitelist metadata를 계산한다.
- 동일 Player의 save 호출은 진행 중 promise를 공유하고 겹친 요청을 다음 pass로 예약해 자동 저장·보상 저장·unload 저장을 직렬화한다. Player scalar는 revision을 기록해 `prisma.player.update` 도중 골드·생존 상태가 바뀌면 dirty를 지우지 않고 다음 pass를 강제한다. Inventory 변경 구독도 진행 중 Player 저장에 다음 pass를 예약한다. Inventory는 저장 시작 시 dirty snapshot과 revision을 잡고 하나의 transaction에서 `playerId` 범위의 멱등 삭제·수정·누락 행 복구를 처리하며, 저장 중 변경은 Clean으로 덮지 않는다. 신규 Equipment는 `(playerId, slot, slotIndex)` upsert를 사용해 이미 생성된 슬롯 행과 충돌해도 복구한다.
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
- 플레이어 퀘스트 인스턴스 테이블 migration은 `20260716000000_add_player_quests`다.
- 초월은 새 스키마를 추가하지 않는다. `ascension:rank`는 기존 PlayerProgress COUNTER에, 재도달 후 열린 역지옥문 권한은 `ascension:upper-dimension-expedition-unlocked` FLAG에 저장한다. 환생 시 Player 본체 레벨·경험치·스탯을 갱신하며 SkillBook 행과 QuestBook 행을 각각 삭제 대상으로 flush한다. 인벤토리로 돌아간 장비와 귀속 아티팩트도 기존 Equipment/Inventory 저장 경계를 사용하고 환생 및 최초 상위차원 이동 성공 직후 Player aggregate 저장을 요청한다.
- 시스템 우편과 원자적 아이템 첨부 수령 테이블 migration은 `20260803020000_add_mailbox_messages`다.
- 플레이어 스킬 경험치 컬럼 migration은 `20260717000000_add_skill_experience`다.
- 장착 스택 수량 컬럼 migration은 `20260718000000_add_equipment_count`다.
- 순위 지표·공개 설정 JSON migration은 `20260718010000_add_player_rankings`다.
- 닉네임 24시간 변경 제한 시각 migration은 `20260725000000_add_nickname_change_cooldown`이다.
- 인벤토리 표시 순서 컬럼 migration은 `20260726000000_add_inventory_sort_order`다.
- 카르마 기준값·감소 기준 시각 migration은 `20260723000000_add_player_karma`다.
- 계정별 이름 있는 HUD 프리셋 JSON migration은 `20260731000000_add_player_hud_presets`다.
- Player 상태효과 snapshot JSON migration은 `20260805000000_add_player_status_effects`다.
- 일반 운영 배포에서는 `cd server && npm run db:migrate:deploy`를 실행한다. 이 명령은 pending schema migration 적용, Prisma Client 생성, 아이템 metadata delta 데이터 마이그레이션을 순서대로 실행한다.
- metadata 데이터 마이그레이션은 `src/scripts/migrateItemMetadataDeltas.ts`가 담당한다. 이미 버전 1인 행과 `null` 행은 건너뛰므로 재실행할 수 있다. 구형 전체 metadata 중 현재 `baseMetadata`와 같은 값은 기본값으로 간주해 제거하므로, 기본 metadata를 변경하기 전에 서버를 중지한 상태에서 운영 명령을 먼저 실행해야 한다.
- `migrate reset`은 전체 데이터를 삭제하므로 운영 DB에서 금지한다.
