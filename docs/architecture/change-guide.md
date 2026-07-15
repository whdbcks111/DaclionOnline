# 기능별 변경 가이드

새 기능을 만들 때 아래 순서로 관련 계층을 찾는다. 각 변경 후에는 수정한 폴더의 `Overview.md`와 해당 중앙 문서를 갱신한다.

구현 전 [`docs/README.md`의 필수 구현 원칙](../README.md#필수-구현-원칙)을 적용한다. 특히 기존 공개 API를 먼저 찾고, 다른 기능의 raw 배열/Map/DB 데이터에 직접 의존하지 않는다. 필요한 연산은 상태를 소유한 모델 또는 모듈에 짧은 목적형 API로 추가한다.

## Socket.io 기능 추가

1. `shared/types.ts`의 `ClientToServerEvents` 또는 `ServerToClientEvents`에 이벤트와 payload를 정의한다.
2. `server/src/modules/`의 책임에 맞는 모듈에 검증·세션/권한 확인·처리를 추가한다. 새 모듈이면 `server/src/index.ts`에서 초기화한다.
3. `client/src/pages/`, `components/`, `context/` 중 상태 소유 위치에서 `emit/on`을 연결하고 cleanup에서 `off`한다.
4. [api/socket-events.md](../api/socket-events.md)의 생산자/소비자 표를 갱신한다.

## 채팅 명령어 추가

1. 일반, 플레이어, 위치, 상점, 관리자 중 책임에 맞는 `server/src/commands/*.ts`에서 `registerCommand()`를 호출한다.
2. `name`, `aliases`, `description`, `permission`, `showCommandUse`, `args`, `handler`를 정한다. 자동완성은 정적 배열 또는 `(userId, args, raw) => CompletionItem[]`로 제공한다.
3. 새 명령 파일이면 `server/src/commands/index.ts`에 초기화 함수를 등록한다.
4. 출력은 `modules/message.ts`와 `utils/chatBuilder.ts`를 사용한다. 상태 변경은 직접 DB보다 `Player` 등 도메인 모델을 우선한다.

## 아이템/사용 효과 추가

1. `models/Item.ts`의 `ItemData` 계약을 확인한다.
2. `data/items.ts`에 `defineItem()`을 추가하고 `client/public/icons/items/{itemDataId}.png` 128×128 투명 배경 아이콘을 같이 생성한다.
3. 사용형 아이템이면 `modules/itemUse.ts`의 레지스트리에 `registerItemUse()` 핸들러를 등록하고 반드시 `finish()`가 모든 종료 경로에서 호출되게 한다.
4. 영속 필드가 더 필요하면 `prisma/schema.prisma`, `Inventory` load/save, DB 문서를 함께 수정한다.

## 제작법 추가

1. `data/crafting.ts`에 `defineCraftingRecipe()`로 `namespace:path` ID, predicate 재료, 1개당 시간, 결과 factory를 등록한다.
2. 결과 이름과 아이콘이 일반 아이템이면 `resultItemDataId`를 지정하고 `name`은 생략한다. 특수 발견 조건은 `discoveryCondition`으로 기본 재료 소지 조건을 대체한다.
3. factory는 `ingredients` 인자의 실제 `Item`을 통해 내구도·metadata·태그 승계 결과를 만들고 `ItemSnapshot` 또는 배열을 반환한다.
4. Inventory raw 배열을 직접 필터링/수정하지 않고 `selectItems/replaceSelectedItems`를 사용한다. 정의·저장·실행 규칙은 [systems/crafting.md](../systems/crafting.md)와 동기화한다.

## 몬스터/자원/전투 추가

1. `data/monsters.ts`에 `defineMonster()` 마스터 데이터를 추가한다.
2. 공통 전투 공식은 `models/Entity.ts`, 몬스터 AI·보상·드롭은 `models/Monster.ts`에 둔다.
3. 비공격 자원은 `data/resources.ts`의 `defineResource()`로 능력치·필수 주무기 도구 태그·가중치 드롭·경험치 범위를 정의한다. 선택형 동작은 `registerResourceInteraction(key, handler)`에 등록한다.
4. 위치 배치는 `data/locations.json`의 `objects`에 `type: monster | resource`와 `dataId/maxCount/respawnTime`을 넣는다.
5. UI에 새 상태가 필요하면 공유 payload → `modules/player.ts` → `HudContext` → HUD 컴포넌트 순서로 확장한다.

## 투사체/기본 공격 무기 추가

1. 공용 투사체 템플릿은 `data/projectiles.ts`에서 `defineProjectileData()`로 등록한다. 임의 스킬은 `spawnProjectile` 또는 `spawnProjectileFromData`를 직접 호출한다.
2. 아이템 기본 공격이면 `basicAttackOverride`를 `modules/itemAttack.ts`의 등록 key와 연결한다. 새 동작은 `registerItemAttackOverride()`로 추가하고 미처리 시 `false`를 반환해 근접 폴백을 보존한다.
3. 탄약형은 무기의 `projectileAttack.ammunitionItemId`와 탄약의 `projectile` 참조를 사용한다. 무탄약형은 무기의 `projectileAttack.projectile`에 같은 참조를 직접 둔다.
4. 상성 태그와 관통 등은 owner 장비를 참조하지 말고 ProjectileData/metadata override에 정의한다. 보상·어그로만 `attackOwner`를 사용한다.
5. 새 metadata 필드는 `Item.getMetadata`와 검증 parser로 읽고 Inventory raw 배열을 직접 순회하거나 수정하지 않는다.

## 태그/속성 효과 추가

1. 기존 공용 ID가 필요하면 `shared/tags.ts::GameTags`를 추가하고, 객체 정의의 `tags`에 부여한다. 동적 콘텐츠 태그는 `namespace:path` 문자열을 그대로 등록할 수 있다.
2. 상성·저항·면역을 별도 시스템으로 나누지 않고 `data/tagEffects.ts`에서 `defineTagEffectModifier(source, target, modifier)` 단방향 행을 추가한다.
3. 대미지 외 효과값은 raw 태그 배열을 읽지 않고 `applyTagEffectValue`를 사용하며, 완전 무효화 시 `effective`도 검사한다.
4. 영속 태그 소유 객체를 추가하면 메모리 `TagCollection`, dirty callback, Prisma/JSON 저장과 이동 snapshot을 함께 연결한다.
5. 규칙과 대표 데이터는 [systems/tags-effects.md](../systems/tags-effects.md)에 동기화하고 중첩·방향성 테스트를 추가한다.

## 이벤트/통계/플래그 추가

1. 다른 기능에 직접 결합하지 않을 의미 있는 도메인 동작은 `models/GameEvent.ts::GameEventIds`에 ID를 추가하고 상태가 확정되는 모델에서 `emitGameEvent()`를 호출한다.
2. 누적 통계는 `data/progress.ts`에서 `defineStatistic()`으로 이벤트와 연결한다. 임의 flag/state는 `defineProgress()`로 타입과 표시 metadata를 먼저 등록한다.
3. 변경은 `PlayerProgress`의 counter/flag/state 공개 API만 사용한다. 내부 Map과 `player_progress` Prisma row를 직접 읽지 않는다.
4. 고빈도 handler에서는 DB I/O를 하지 않는다. 메모리 dirty 변경은 Player의 30초/unload/종료 flush가 저장한다.
5. 이벤트/진행 상태 ID와 사용처를 [systems/progress-skills.md](../systems/progress-skills.md)에 기록한다.

## 스킬 추가

1. `data/skills.ts`에 `defineSkill()` 마스터 데이터를 등록한다. base metadata, 계산 필드, 설명/소모/발동 조건 템플릿과 수명주기 callback을 필요한 만큼만 정의한다.
2. 스킬 숫자는 설명 문자열에 중복 하드코딩하지 않고 `{{calc.field}}` 또는 `{{meta.field}}`로 치환한다. 색상은 `[color=orange]...[/color]` 같은 기존 채팅 문법을 사용한다.
3. 자동 획득은 `autoAcquire.watchedProgress`를 좁게 지정하고 `PlayerProgress` API로 조건을 검사한다. 직접 메시지 발동은 `activateOnMessage`, 런타임 조건 발동은 `autoActivate`를 사용한다.
4. 공격 스킬은 방어·상성·내구도·이벤트를 우회하지 않도록 `Entity.attack()` 또는 Projectile 공개 API를 사용한다. 일회성 Attribute modifier는 고유 source로 추가하고 `finally`에서 제거한다.
5. 인스턴스 metadata는 `Skill.get/set/resetMetadata`, 목록과 획득/발동은 `SkillBook` API만 사용한다. raw Map/DB row 접근은 금지한다.
6. [systems/progress-skills.md](../systems/progress-skills.md)와 data/models/commands Overview를 갱신하고 템플릿·delta·전투 옵션 테스트를 추가한다.

## 위치/이동 추가

1. `data/locations.json`에 좌표, 연결, 통합 `objects` 배치, 상점 ID를 정의한다. 연결은 필요한 방향마다 명시한다.
2. 조건부 연결은 `data/locations.ts`에서 `registerConnectionCondition(conditionId, handler)`로 등록한다.
3. 런타임 동작은 `models/Location.ts`, 소켓 기반 관리자 저장은 `modules/location.ts`, 사용자 명령은 `commands/location.ts`에서 다룬다.
4. `LocationData` 구조 변경 시 `shared/types.ts`와 `LocationEditor.tsx`도 함께 수정한다. 런타임 오브젝트는 raw 배열 대신 `Location.getObjects/getObject/hasObject/addObject/removeObject`를 사용한다.

## HUD 추가

1. `HudContext.tsx`의 `HUD_DEFINITIONS`, 기본 설정, 필요한 상태를 추가한다.
2. `components/hud/huds/`에 HUD를 만들고 `HudContainer.tsx` 매핑에 연결한다.
3. 서버 데이터가 필요하면 공유 이벤트 payload와 `modules/player.ts` 전송 로직을 추가한다.
4. 설정 UI가 필요하면 `HudSettings.tsx`를 확장한다.

## 채팅 노드/태그 추가

1. `shared/types.ts`의 `ChatNode` union을 확장한다.
2. 문자열 태그가 필요하면 `utils/chatParser.ts`, 서버 빌더가 필요하면 `utils/chatBuilder.ts`를 확장한다.
3. `client/src/components/chat/nodes/`에 렌더러를 만들고 `ChatMessage.tsx::renderNode`에 연결한다.

## DB 필드 추가

1. `server/prisma/schema.prisma`를 수정하고 프로젝트의 Prisma 마이그레이션/동기화 절차를 수행한다.
2. 관련 모델의 load/create/save 경로를 모두 갱신한다.
3. 메모리 상태의 dirty 추적과 자동 저장 범위에 포함되는지 확인한다.
4. [data/database.md](../data/database.md)를 갱신한다.
