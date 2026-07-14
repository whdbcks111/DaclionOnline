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
2. `data/items.ts`에 `defineItem()`을 추가한다.
3. 사용형 아이템이면 `modules/itemUse.ts`의 레지스트리에 `registerItemUse()` 핸들러를 등록하고 반드시 `finish()`가 모든 종료 경로에서 호출되게 한다.
4. 영속 필드가 더 필요하면 `prisma/schema.prisma`, `Inventory` load/save, DB 문서를 함께 수정한다.

## 몬스터/전투 추가

1. `data/monsters.ts`에 `defineMonster()` 마스터 데이터를 추가한다.
2. 공통 전투 공식은 `models/Entity.ts`, 몬스터 AI·보상·드롭은 `models/Monster.ts`에 둔다.
3. 위치 스폰은 `data/locations.json`의 `spawns`에서 연결한다.
4. UI에 새 상태가 필요하면 공유 payload → `modules/player.ts` → `HudContext` → HUD 컴포넌트 순서로 확장한다.

## 위치/이동 추가

1. `data/locations.json`에 좌표, 연결, 스폰, 상점 ID를 정의한다. 연결은 필요한 방향마다 명시한다.
2. 조건부 연결은 `data/locations.ts`에서 `registerConnectionCondition(conditionId, handler)`로 등록한다.
3. 런타임 동작은 `models/Location.ts`, 소켓 기반 관리자 저장은 `modules/location.ts`, 사용자 명령은 `commands/location.ts`에서 다룬다.
4. `LocationData` 구조 변경 시 `shared/types.ts`와 `LocationEditor.tsx`도 함께 수정한다.

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
