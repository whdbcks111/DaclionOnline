# 서버 내부 API 인덱스

외부 이벤트가 아닌 서버 코드끼리 호출하는 주요 공개 API를 계층별로 정리한다. 정확한 타입과 세부 동작은 링크된 소스를 기준으로 한다.

## 애플리케이션 모듈 (`server/src/modules`)

| 영역 | 주요 API | 용도 |
| --- | --- | --- |
| Socket | `initSocket`, `getIO` | Socket.io 초기화와 전역 서버 접근 |
| Login | `getSession`, `getSessionByUserId`, `createSession`, `removeSession`, `getUserPermission` | 인메모리 세션/권한 조회 |
| Online | `setUserOnline`, `setUserOffline`, `isUserOnline`, `broadcastUserCount` | 사용자별 연결 수와 접속 인원 |
| Player | `loadPlayerByUserId`, `unloadPlayerByUserId`, `getPlayerByUserId`, `getOnlinePlayers`, `fetchPlayerByUserId`, `saveAllPlayers` | Player 수명과 저장 |
| HUD | `sendPlayerStats`, `sendLocationInfo` | 특정 사용자의 모든 소켓에 HUD payload 전송 |
| Command | `registerCommand`, `handleCommand`, `getCommandList`, `getCommandListFiltered` | 명령 등록/파싱/실행/목록 |
| Channel | `getUserChannel`, `setUserChannel`, `getChannelRoomKey`, `getChannelHistory`, `getFilteredHistoryForUser` | room과 히스토리 상태 |
| Message | `sendMessageToChannel`, `broadcastMessageAll`, `sendMessageFiltered`, `sendMessageToUser` | 일반 메시지 전송 |
| Bot message | `sendBotMessageToChannel`, `broadcastBotMessageAll`, `sendBotMessageFiltered`, `sendBotMessageToUser` | 파싱된 시스템 메시지 전송 |
| Notification | `broadcastNotification`, `sendNotificationFiltered`, `sendNotificationToUser` | 화면 알림 전송 |
| Message mutation | `editMessage`, `deleteMessage` | 히스토리 수정 후 이벤트 브로드캐스트 |
| Coroutine | `startCoroutine`, `Wait`, `tickCoroutines` | 게임 루프 기반 지연 작업 |
| Location service | `loadLocationsFromJson`, `updateLocations`, `initLocation` | JSON/소켓/프레임 조정 |
| Item use | `registerItemUse`, `executeItemUse`, `hasItemUseHandler` | 아이템 효과 ID와 실행 함수 연결 |
| Mail | `loadTemplate`, `sendMail` | 공유 HTML 템플릿과 Nodemailer |

## 게임 모델 (`server/src/models`)

| 모델/레지스트리 | 주요 API | 용도 |
| --- | --- | --- |
| `Entity` | `hasTag`, `getTags`, `damage`, `attack`, `earlyUpdate/update/lateUpdate`, `onDeath`, `respawn`, `getMaxExpOfLevel` | 본체+장비 유효 태그, 속성 배율·관통·치명타를 포함한 공통 전투와 생명주기 |
| Combat | `applyCritical`, `calculateFinalDamage` | 부작용 없는 치명타 판정과 방어/관통 최종 대미지 계산 |
| Tag effects | `defineTagEffectModifier`, `resolveTagEffect`, `applyTagEffectValue`, `getAllTagEffectModifiers` | 단방향 source→target 효과 배율 등록·판정·수치 적용 |
| `Player` | `loadByUserId`, `create`, `save`, `gainExp`, `allocateStat` | 영속 플레이어와 성장 |
| `AttributeType`, `Attribute` | `values/fromKey`, `get`, `setBase`, `addModifier(s)`, `removeBySource` | 클래스형 능력치 메타데이터와 기본값 + add/multiply 수정자 계산 |
| `StatType`, `Stat` | `values/fromKey/fromInput`, `get/set/add`, `applyModifiers(entity)` | 클래스형 5종 스탯과 Entity 기반 Attribute 변환 |
| `Inventory` | `getItem*`, `getCount`, `setItemMetadata/resetItemMetadata`, `canAdd`, `canAddSnapshot(s)`, `addItem`, `addItemSnapshot`, `useItem`, `removeItem*`, `load`, `save` | metadata dirty 추적, 단일·복수 snapshot 수용 검사, 무게/스택/사용/태그 포함 이동/DB 동기화 |
| `EquipSlotType`, `Equipment` | `values/fromKey/fromInput`, `getEquipped`, `getAllEquipped`, `setItemMetadata/resetItemMetadata`, `hasTag`, `getTags`, `equip`, `equipSwap`, `unequip`, `applyModifiers`, `load`, `save` | 클래스형 슬롯 메타데이터, 장착 아이템 metadata dirty 추적, modifier·유효 태그·DB 동기화 |
| `Item`, Item registry | `image`, `getMetadata/getMetadataSnapshot/getMetadataDeltaSnapshot`, `setMetadata/resetMetadata`, `hasTag`, `snapshot/fromSnapshot/fromPersistence`, `defineItem`, `getItemData`, `getAllItemData` | 기본값+인스턴스 delta 합성, 변경 callback, 이미지 조회, 태그와 손실 없는 이동 snapshot |
| `Monster` | `damage`, `update`, `onDeath`, `rollDrops`, `rollGold` | 타게팅 AI, 보상, 리스폰 |
| Monster registry | `defineMonster`, `getMonsterData`, `getAllMonsterData` | 몬스터 마스터 데이터 |
| `Location` | `hasTag`, `add/removeMonster`, `addDroppedItem`, `getDroppedItems`, `pickupItem/pickupAllItems`, `getAvailableConnections`, `update` | 장소 태그와 raw 배열을 숨긴 바닥 아이템 조회·단일/전체 회수, 런타임 상태 |
| Location registry | `defineLocation`, `reloadAllLocations`, `getLocation`, `getAllLocations`, `getRespawnLocation`, `distanceBetween` | 월드 위치 정의/조회 |
| Location extension | `registerConnectionCondition`, `registerLocationPassive` | 이동 조건과 위치별 프레임 콜백 |
| `Shop` | `getStock`, `consumeStock`, `update` | 재고와 재입고 |
| Shop registry | `defineShop`, `getShop`, `updateAllShops` | 상점 정의/조회/프레임 갱신 |

## 공용 태그 API (`shared/tags.ts`)

| API | 용도 |
| --- | --- |
| `TagCollection` | 정의·영속·source별 런타임 태그 합성. 내부 Set은 노출하지 않음 |
| `hasTag/hasAny/hasAll/matches` | 다른 기능이 raw 배열 없이 태그를 조회 |
| `add/remove/replacePersistent` | dirty callback과 연결되는 영속 태그 변경 |
| `setRuntime/removeRuntime` | 버프·지역 효과 등 비영속 태그를 source 단위 교체 |
| `normalizeTag/normalizeTags` | `namespace:path` 검증, 소문자화, 중복 제거 |

## 출력/파싱 유틸

| API | 용도 |
| --- | --- |
| `chat()` | `text/color/bg/weight/deco/size/tooltip/hide/icon/button/closeButton/progress/tab` fluent builder로 `ChatNode[]` 생성 |
| `parseChatMessage()` | 커스텀 태그 문자열을 `ChatNode[]`로 파싱 |
| `registerChatTag()` | 새 wrap/self-closing 태그 등록 |
| `mergeTextNodes()` | 인접 텍스트 노드 병합 |
| `validateId/Password/Email/Nickname` | 서버 입력 검증; 클라이언트에도 대응 validator가 있음 |
| `isValidPayload()` | 얕은 런타임 payload 필드 타입 확인 |
| `randomDigits/randomHex/randomBase64` | 인증 코드·세션 등 난수 생성 |

## 명령어 등록 계약

`registerCommand()` 설정의 핵심 필드는 다음과 같다.

- `name`, `aliases`, `description`: 목록/파싱/자동완성 메타데이터.
- `permission`: 최소 권한, 기본 0. 실제 실행 시 서버가 검사한다.
- `showCommandUse`: `show`는 채널, `private`는 본인, `hide`는 입력 메시지를 표시하지 않는다.
- `args`: `required`, `isText`, 정적/동적 `completions`를 지원한다. 한 명령에서 `isText`는 최대 한 개를 전제로 한다.
- `handler(userId, args, raw, msg, permission)`: 검증된 명령 실행 진입점.

등록된 사용자 명령 전체 목록과 시스템별 사용 흐름은 [chat-command.md](../systems/chat-command.md)를 참고한다.
