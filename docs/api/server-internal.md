# 서버 내부 API 인덱스

외부 이벤트가 아닌 서버 코드끼리 호출하는 주요 공개 API를 계층별로 정리한다. 정확한 타입과 세부 동작은 링크된 소스를 기준으로 한다.

## 애플리케이션 모듈 (`server/src/modules`)

| 영역 | 주요 API | 용도 |
| --- | --- | --- |
| Socket | `initSocket`, `getIO` | Socket.io 초기화와 전역 서버 접근 |
| Login | `getSession`, `getSessionByUserId`, `createSession`, `removeSession`, `getUserPermission` | 인메모리 세션/권한 조회 |
| Online | `setUserOnline`, `setUserOffline`, `isUserOnline`, `broadcastUserCount` | 사용자별 연결 수와 접속 인원 |
| Player | `loadPlayerByUserId`, `unloadPlayerByUserId`, `getPlayerByUserId`, `getOnlinePlayers`, `fetchPlayerByUserId`, `saveAllPlayers` | Player 수명과 저장 |
| Player registry | `registerOnlinePlayer`, `getOnlinePlayer`, `unregisterOnlinePlayer`, `getOnlinePlayerSnapshot`, `isOnlinePlayerAtLocation` | 내부 Map을 숨긴 온라인 객체 조회와 위치 필터 |
| HUD | `sendPlayerStats`, `sendLocationInfo` | 특정 사용자의 모든 소켓에 HUD payload 전송 |
| Command | `registerCommand`, `handleCommand`, `isCommandAliasInput`, `getCommandList`, `getCommandListFiltered` | 명령 등록, 슬래시/슬래시 없는 별칭 판정·실행과 목록 |
| Channel | `getUserChannel`, `setUserChannel`, `getChannelRoomKey`, `getChannelHistory`, `getFilteredHistoryForUser` | room과 히스토리 상태 |
| Message | `sendMessageToChannel`, `broadcastMessageAll`, `sendMessageFiltered`, `sendMessageToUser`, `sendPlayerTextToCurrentChannel` | 일반 메시지와 시스템이 생성한 플레이어 표시 메시지 전송 |
| Bot message | `sendBotMessageToChannel`, `broadcastBotMessageAll`, `sendBotMessageFiltered`, `sendBotMessageToUser` | 파싱된 시스템 메시지 전송 |
| Notification | `broadcastNotification`, `sendNotificationFiltered`, `sendNotificationToUser` | 화면 알림 전송 |
| Message mutation | `editMessage`, `deleteMessage` | 히스토리 수정 후 이벤트 브로드캐스트 |
| Coroutine | `startCoroutine`, `Wait`, `tickCoroutines` | 게임 루프 기반 지연 작업 |
| Location service | `loadLocationsFromJson`, `updateLocations`, `initLocation` | JSON/소켓/프레임 조정 |
| Item use | `registerItemUse`, `executeItemUse`, `hasItemUseHandler` | 아이템 효과 ID와 실행 함수 연결 |
| Item attack | `registerItemAttackOverride`, `executeItemAttackOverride`, `hasItemAttackOverride`, `executeProjectileItemAttack` | `basicAttackOverride` key와 기본 공격 함수 연결, 탄약/무탄약 투사체 발사와 근접 폴백 신호 |
| Mail | `loadTemplate`, `sendMail` | 공유 HTML 템플릿과 Nodemailer |

## 게임 모델 (`server/src/models`)

| 모델/레지스트리 | 주요 API | 용도 |
| --- | --- | --- |
| `Entity` | `attackOwner`, `isDefeated/defeatLabel`, `isInteractable/interact`, `hasTag/getTags`, `damage/heal`, `clampVitals`, `canAttack/attack(AttackOptions)`, `get/apply/remove/clearStatusEffect(s)`, `getStatusEffectDisplaySnapshots`, `disableAction(s)/enableAction`, `disableAction(s)ForTick`, `canPerformAction`, `earlyUpdate/update/lateUpdate`, `onDeath/respawn` | 속도 회피·회피 불가·고정 피해를 포함한 전투·회복, 최대 자원 상한 보정, raw Map 없는 상태효과 표시 DTO, source별 지속/한 tick 행동 제한과 공통 생명주기 |
| Combat | `calculateEvasionChance`, `rollEvasion`, `applyCritical`, `calculateFinalDamage` | 부작용 없는 속도 회피율·치명타·방어/관통 최종 대미지 계산 |
| Tag effects | `defineTagEffectModifier`, `resolveTagEffect`, `applyTagEffectValue`, `getAllTagEffectModifiers` | `TagEffectReadable` 문맥 태그를 우선하는 단방향 source→target 배율 등록·판정·수치 적용 |
| `Player` | `loadByUserId`, `create`, `save`, `performBasicAttack`, `canSpendMentality/spendMentality/restoreMentality`, `gainExp`, `allocateStat` | 영속 플레이어, 무기 오버라이드 기본 공격과 스킬 자원·성장 |
| `AttributeType`, `Attribute` | `values/fromKey`, `get`, `setBase`, `addModifier(s)`, `removeBySource` | 클래스형 능력치 메타데이터와 기본값 + add/multiply 수정자 계산 |
| `StatType`, `Stat` | `values/fromKey/fromInput`, `get/set/add`, `applyModifiers(entity)` | 클래스형 5종 스탯과 Entity 기반 Attribute 변환 |
| `Inventory` | `createEmpty`, `getItem*`, `getFirstItemByData`, `getCount`, `selectItems`, `replaceSelectedItems`, `setItemMetadata/resetItemMetadata`, `setItemDurability`, `changeItemDurability`, `increaseItemDurability`, `decreaseItemDurability`, `canAdd`, `canAddSnapshot(s)`, `addItem`, `addItemSnapshot`, `useItem`, `removeItem*`, `removeItemInstance`, `load`, `save` | metadata·내구도 dirty 추적, 겹치는 재료 predicate의 중복 없는 선택과 선검증 교환, 무게/스택/사용/태그 포함 이동/DB 동기화 |
| `EquipSlotType`, `Equipment` | `values/fromKey/fromInput`, `getEquipped`, `getAllEquipped`, `hasEquippedItemTag`, `setItemMetadata/resetItemMetadata`, `setItemDurability`, `changeItemDurability`, `increaseItemDurability`, `decreaseItemDurability`, `hasTag`, `getTags`, `hasEffectSourceTag`, `equip`, `equipSwap`, `unequip`, `applyModifiers`, `load`, `save` | 슬롯 메타데이터, 특정 슬롯 도구 태그 검사, 장착 상태·dirty 추적, 일반 태그와 공격 상성용 무기 태그, modifier·DB 동기화 |
| `Item`, Item registry | `basicAttackOverrideKey`, `image`, `durability/durabilityRatio/isBroken`, `setDurability`, `changeDurability`, `increaseDurability`, `decreaseDurability`, `getMetadata/getMetadataSnapshot/getMetadataDeltaSnapshot`, `setMetadata/resetMetadata`, `hasTag`, `snapshot/fromSnapshot/fromPersistence`, `defineItem`, `getItemData`, `getAllItemData` | 공격 레지스트리 key, 내구도, 기본값+delta 합성, 이미지·태그와 이동 snapshot |
| `Projectile`, registry | `define/get/getAllProjectileData`, `parseProjectileReference`, `spawnProjectile`, `spawnProjectileFromData`, `getActiveProjectiles`, `removeProjectile`, `updateProjectiles` | 비영속 투사체 마스터/JSON 검증, 생성·조회·비행·적중·소멸 |
| `Monster` | `damage`, `activateSkill`, `update`, `onDeath`, `rollDrops`, `rollGold` | 타게팅 AI, 느린 기본 공격과 실제 SkillData 순환 패턴, 물리/마법 공격 프로필과 적중 상태이상, 보상, 리스폰 |
| Monster registry | `defineMonster`, `getMonsterData`, `getAllMonsterData` | Lv.1~50 몬스터 마스터 데이터 |
| `Resource` | `isInteractable`, `interactionCooldownRemaining`, `interact`, `rollInteractionCooldown`, `getAttackDeniedReason`, `onDeath`, `rollDrop`, `rollExp` | 비공격 Entity 자원, 공격/도구 제한, 상호작용 쿨타임, 가중치 드롭·범위 경험치·리스폰 |
| Resource registry | `defineResource`, `getResourceData`, `getAllResourceData`, `registerResourceInteraction` | 자원 마스터 데이터와 key→상호작용 함수 등록 |
| `Location` | `hasTag`, `getObjects/getObject/getObjectCount/hasObject`, `addObject/removeObject`, `getNpcs/getNpc/hasNpc`, `addDroppedItem`, `getDroppedItems`, `pickupItem/pickupAllItems`, `getAvailableConnections/findAvailableConnection`, `update` | Monster/Resource 통합 오브젝트, ID 기반 NPC, 유연한 장소 입력과 raw 배열을 숨긴 바닥 아이템 조회·단일/전체 회수 |
| Location registry | `normalizeLocationData`, `defineLocation`, `reloadAllLocations`, `getLocation`, `getAllLocations`, `getRespawnLocation`, `distanceBetween`, `normalizeLocationInput` | 통합 오브젝트 배치 검증·복사, 월드 위치 정의/조회와 사용자 입력 정규화 |
| Location extension | `registerConnectionCondition`, `registerLocationPassive` | 이동 조건과 위치별 프레임 콜백 |
| `Shop` | `getStock`, `consumeStock`, `update` | 재고와 재입고 |
| Shop registry | `defineShop`, `getShop`, `updateAllShops` | 상점 정의/조회/프레임 갱신 |
| Game events | `emitGameEvent`, `subscribeGameEvent`, `subscribeAllGameEvents`, `getRecentGameEvents` | 동기식 내부 이벤트와 원시 Entity 없는 최근 trace 스냅샷 |
| `NPC`, `DialogueScenario`, `Dialogue` | `NPC.define/getNpc/getAll`, `getEntryScenario/getScenario`, `say/event/setFlag/goto/choice/end` | NPC 정적 정의, 조건부 generator 장면과 타입별 대화 액션 생성 |
| NPC dialogue | `startNpcDialogue`, `chooseNpcDialogue`, `endNpcDialogue/endNpcDialogueByUserId`, `is/getActiveNpcDialogue`, `updateNpcDialogues` | player별 비영속 대화 세션 시작·선택·종료와 이탈 안전망 |
| `ProgressType`, `PlayerProgress` | `values/fromKey`, `getCounter/setCounter/increment`, `getFlag/setFlag`, `getState/setState`, `reset`, `getSnapshots`, `subscribeChanges`, `load/save` | 통계·NPC 플래그·분기 상태의 메모리 dirty 영속 API |
| Progress registry | `defineProgress`, `defineStatistic`, `getProgressDefinition`, `getAllProgressDefinitions` | `namespace:path` 상태 정의와 이벤트 기반 counter 등록 |
| `Skill`, `SkillBook` | `get/set/resetMetadata`, `get/setActiveState`, `getCalculatedField`, `formatDescription/Cost/ActivationCondition`, `createRuntime`, `grant`, `activateByInput/ById/FromMessage`, `hasActiveSkill`, `getActivationStatus`, `update`, `finishAll`, `load/save` | 아이콘과 Entity 공용 context, 스킬 인스턴스 delta·런타임 상태·템플릿 계산, 플레이어 영속/몬스터 비영속 발동 수명주기 |
| Skill registry | `defineSkill`, `getSkillData`, `getAllSkillData`, `acceptSkill/denySkill` | 정적 SkillData와 조건 결과 등록/조회 |
| Crafting | `CraftingRecipeIngredient`, `defineCraftingRecipe`, `get/findCraftingRecipe*`, `updateCraftingRecipeDiscovery`, `getDiscoveredCraftingRecipes`, `startCrafting`, `executeCrafting`, `cancelCrafting` | predicate 재료, 실제 선택 재료 factory, Progress 기반 제작법 발견, 지연 제작·취소 |
| Metadata | `cloneMetadataValue`, `createMetadataDelta`, `encodeMetadataDelta`, `decodeMetadataDelta` | Item/Skill이 공유하는 JSON-safe top-level delta 직렬화 |
| `StatusEffectType`, `StatusEffect` | `define/values/fromKey/fromInput`, `icon`, `formatDescription`, `get/set/resetMetadata`, `upgrade/refreshDuration`, lifecycle callback | 아이콘 key를 가진 클래스형 효과 정의, 대상별 duration/level/metadata delta와 병합·틱 처리 |
| `ActionType` | `values/fromKey/fromInput`; `SKILL/CHAT/COMMAND/ATTACK/MOVEMENT/LOCATION_TRAVEL` | 스킬·통신·전투·이동 실행 경계가 공유하는 행동 분류 |

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
| `parseCommandInput()` | 공유 채팅 입력에서 첫 명령 토큰, 나머지 인자, 슬래시·구분자 여부 추출 |
| `chat()` | `text/appendNodes/color/bg/weight/deco/size/tooltip/hide/icon/button/closeButton/progress/tab` fluent builder로 `ChatNode[]` 생성; 계산 설명처럼 이미 파싱된 node도 안전하게 합성 |
| `parseChatMessage()` | 커스텀 태그 문자열을 `ChatNode[]`로 파싱하고 `$magic` 같은 테마 색상 token을 보존 |
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
