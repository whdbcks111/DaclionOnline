# 서버 내부 API 인덱스

외부 이벤트가 아닌 서버 코드끼리 호출하는 주요 공개 API를 계층별로 정리한다. 정확한 타입과 세부 동작은 링크된 소스를 기준으로 한다.

## 애플리케이션 모듈 (`server/src/modules`)

| 영역 | 주요 API | 용도 |
| --- | --- | --- |
| Socket | `initSocket`, `getIO` | Socket.io 초기화와 전역 서버 접근 |
| Login | `getSession`, `getSessionByUserId`, `createSession`, `removeSession`, `getUserPermission` | 인메모리 세션/권한 조회 |
| Online | `setUserOnline`, `setUserOffline`, `isUserOnline`, `getUserCountData`, `broadcastUserCount` | userId별 socket ID Set과 중복 없는 전체/채널 접속 인원 snapshot |
| Player | `loadPlayerByUserId`, `unloadPlayerByUserId`, `getPlayerByUserId`, `getOnlinePlayers`, `fetchPlayerByUserId`, `saveAllPlayers` | Player 수명과 저장 |
| Admin panel | `initAdminPanel`, `getAdminPanelBootstrap`, `getAdminPlayerList`, `getAdminPlayerDetail`, `executeAdminPanelAction` | 권한 10 운영 도구의 가공된 조회, 플레이어·월드·전체/개별 공지 action 검증과 실행 |
| Player registry | `registerOnlinePlayer`, `getOnlinePlayer`, `unregisterOnlinePlayer`, `getOnlinePlayerSnapshot`, `isOnlinePlayerAtLocation` | 내부 Map을 숨긴 온라인 객체 조회와 위치 필터 |
| Player identity | `findOnlinePlayerByIdentity`, `getOnlinePlayerIdentitySnapshots`, `searchOnlinePlayerIdentitySnapshots` | 고유번호/정확한 닉네임 대상 조회와 prefix 온라인 자동완성 DTO |
| HUD | `sendPlayerStats`, `sendLocationInfo` | 특정 사용자의 모든 소켓에 HUD payload 전송 |
| Command | `registerCommand`, `handleCommand`, `isCommandAliasInput`, `getCommandList`, `getCommandListFiltered`, `setInformationModeForUser` | 명령 등록, 별칭 판정·실행, 정보성 명령 공개 모드와 권한별 aliases 포함 목록 snapshot |
| Information visibility | `set/is/clearInformationPublicMode`, `runInformationCommand`, `shouldPublishInformationOutput` | 사용자별 런타임 정보 공개 설정과 async 출력 문맥 |
| Party | `partyManager.invite/accept/decline/leave/disband/kick/removeDisconnectedPlayer/getParty/getHudData/distributeMonsterExp`, `calculatePartyExpGrant` | 내부 Map을 숨긴 초대·구성·HUD·같은 장소 몬스터 경험치 공유 |
| Channel | `getUserChannel`, `setUserChannel`, `getChannelRoomKey`, `getChannelHistory`, `getFilteredHistoryForUser` | room과 히스토리 상태 |
| Message | `sendMessageToChannel`, `broadcastMessageAll`, `sendMessageFiltered`, `sendMessageToUser`, `sendPlayerTextToCurrentChannel`, `sendPrivatePlayerTextToCurrentChannel`, `sendWhisperMessage` | 일반 메시지, 시스템 생성 플레이어 메시지와 채널을 넘는 양방향 비공개 귓속말 전송 |
| Bot message | `sendBotMessageToChannel`, `broadcastBotMessageAll`, `sendBotMessageFiltered`, `sendBotMessageToUser`, `sendPrivateBotMessageToUser` | 정보 명령 문맥을 반영하거나 강제로 비공개인 시스템 메시지 전송 |
| Notification | `broadcastNotification`, `sendNotificationFiltered`, `sendNotificationToUser` | 화면 알림 전송 |
| Message mutation | `editMessage`, `deleteMessage` | 히스토리 수정 후 이벤트 브로드캐스트 |
| Coroutine | `startCoroutine`, `Wait`, `tickCoroutines` | 게임 루프 기반 지연 작업 |
| Minigame | `startMiniGame`, `cancelMiniGame`, `hasActiveMiniGame`, `initMiniGame` | session/token/만료와 타입별 결과 validator를 가진 서버 권위 미니게임 |
| Fishing | `startFishing`, `cancelFishing`, `isFishing` | 장소·낚싯대 검증, 미끼 묶음 자동 장착·한 개 소비, 입질 대기, 등급/미니게임/보상 연결 |
| Location service | `loadLocationsFromJson`, `updateLocations`, `initLocation` | JSON/소켓/프레임 조정 |
| Item use | `registerItemUse`, `executeItemUse`, `hasItemUseHandler` | 아이템 효과 ID와 실행 함수 연결 |
| Item attack | `registerItemAttackOverride`, `executeItemAttackOverride`, `hasItemAttackOverride`, `executeProjectileItemAttack` | `basicAttackOverride` key와 기본 공격 함수 연결, 탄약/무탄약 투사체 발사와 근접 폴백 신호 |
| Mail | `loadTemplate`, `sendMail` | 공유 HTML 템플릿과 Nodemailer |

## 게임 모델 (`server/src/models`)

| 모델/레지스트리 | 주요 API | 용도 |
| --- | --- | --- |
| `Entity` | `attackOwner`, `isDefeated/defeatLabel`, `getAttackDeniedReason`, `grant/remove/consumeGuaranteedEvasion`, `isInteractable/interact`, `hasTag/getTags`, `damage/heal`, `restoreHunger/restoreThirst`, `canAttack/attack(AttackOptions)`, 상태효과·행동 제한·lifecycle API | 속도/일시 확정 회피, 은신 타게팅 거부, 회피 불가·고정 피해 전투, 최대값 내 생명·정신·생존 자원 회복, respawn 자원 복구, source별 상태효과·행동 제한과 공통 생명주기 |
| Combat | `calculateEvasionChance`, `rollEvasion`, `applyCritical`, `calculateFinalDamage` | 부작용 없는 속도 회피율·치명타·방어/관통 최종 대미지 계산 |
| Tag effects | `defineTagEffectModifier`, `defineTagEffectTagDisplay`, `resolveTagEffect`, `applyTagEffectValue`, `getAllTagEffectModifiers`, `getTagEffectAffinitySnapshots` | `TagEffectReadable` 문맥 태그를 우선하는 단방향 source→target 배율 등록·판정·수치 적용과 라벨·아이콘이 포함된 공격/방어 관계 표시 DTO |
| `Player` | `career`, `loadByUserId`, `create`, `save`, `performBasicAttack`, `equipInventoryItem`, `canSpendMentality/spendMentality/restoreMentality`, `gainExp`, `allocateStat` | CareerProfile을 포함한 영속 aggregate, 안전한 인벤토리→장비 교환, 무기 오버라이드·적중 callback 기본 공격과 스킬 자원·성장 |
| `AttributeType`, `Attribute` | `values/fromKey`, `icon/iconMarkup`, `get`, `setBase`, `addModifier(s)`, `removeBySource` | 19종 대표색 아이콘·스킬 포맷 문법·표시 메타데이터와 기본값 + add/multiply 수정자 계산 |
| `StatType`, `Stat` | `values/fromKey/fromInput`, `get/set/add`, `applyModifiers(entity)` | 클래스형 5종 스탯과 Entity 기반 Attribute 변환 |
| `Inventory` | `createEmpty`, `getItem*`, `getIndexedItems`, `getFirstItemByData`, `getCount/countMatching`, `selectItems`, `replaceSelectedItems`, `subscribeChanges`, `set/resetItemMetadata(ByIndex)`, `setItemDurability`, `changeItemDurability`, `increaseItemDurability`, `decreaseItemDurability`, `canAdd`, `canAddSnapshot(s)`, `addItem`, `addItemSnapshot`, `useItem`, `removeItem*`, `removeItemInstance`, `clear`, `load`, `save` | metadata·내구도 dirty 추적과 내구도 0 인스턴스 파괴, 신규 item ID에도 안전한 인덱스 UI 변경, 전체 영속 삭제, raw 배열 없는 predicate 수량/변경 구독, 겹치는 재료 predicate의 중복 없는 선택과 선검증 교환, 무게/스택/사용/태그 포함 이동/DB 동기화 |
| `EquipSlotType`, `Equipment` | `values/fromKey/fromInput`, `getEquipped`, `getAllEquipped`, `hasEquippedItemTag`, `setItemMetadata/resetItemMetadata`, `setItemDurability`, `changeItemDurability`, `increaseItemDurability`, `decreaseItemDurability`, `hasTag`, `getTags`, `hasEffectSourceTag`, `equip`, `equipSwap`, `unequip`, `consumeEquippedItem`, `applyModifiers`, `load`, `save` | 슬롯 메타데이터, 특정 슬롯/무기 태그의 명시적 검사, 장착 스택 수량 부분 소비·영속화, 내구도 0 장비 파괴와 modifier 제거, 장착 상태·dirty 추적, modifier와 복합키 upsert DB 동기화. 무기 태그는 기본 공격 상성에 자동 합산되지 않음 |
| `Item`, Item registry | `basicAttackOverrideKey`, `ItemData.onBasicAttackHit`, `image`, `durability/durabilityRatio/isBroken`, `setDurability`, `changeDurability`, `increaseDurability`, `decreaseDurability`, `canStackItemSnapshots`, `getMetadata/getMetadataSnapshot/getMetadataDeltaSnapshot`, `getInspectionSnapshot`, `setMetadata/resetMetadata`, `hasTag`, `snapshot/fromSnapshot/fromPersistence`, `defineItem`, `getItemData`, `getAllItemData` | 공격 레지스트리 key와 피해 성공 후 무기 callback, 내구도, 인스턴스 상태 기반 스택 호환성, 기본값+delta 합성, 감정용 불변 DTO, 이미지·태그와 이동 snapshot |
| `Projectile`, registry | `define/get/getAllProjectileData`, `parseProjectileReference`, `spawnProjectile`, `spawnProjectileFromData`, `getActiveProjectiles`, `removeProjectile`, `updateProjectiles` | 비영속 투사체 마스터/JSON 검증, owner 치명타 능력치 스냅샷, 생성·조회·비행·적중·소멸 |
| `Monster` | `damage`, `activateSkill`, `getInspectionSnapshot`, `update`, `onDeath`, `rollDrops`, `rollGold` | 타게팅 AI, 감정용 설명·전투·보상 DTO, 느린 기본 공격과 실제 SkillData 순환 패턴, 물리/마법 공격 프로필과 적중 상태이상, 보상, 리스폰 |
| Monster registry | `defineMonster`, `getMonsterData`, `getAllMonsterData` | Lv.1~50 몬스터 마스터 데이터 |
| `Resource` | `isInteractable`, `interactionCooldownRemaining`, `interact`, `rollInteractionCooldown`, `resetInteractionCooldown`, `getAttackDeniedReason`, `onDeath`, `rollDrop`, `rollExp` | 비공격 Entity 자원, 공격/도구 제한, 상호작용 쿨타임과 운영 초기화, 가중치 드롭·범위 경험치·리스폰 |
| Resource registry | `defineResource`, `getResourceData`, `getAllResourceData`, `registerResourceInteraction` | 자원 마스터 데이터와 key→상호작용 함수 등록 |
| `Location` | `hasTag`, `getObjects/getObject/getObjectCount/getAttackableObjects/hasObject`, `addObject/removeObject`, `getNpcs/getNpc/hasNpc`, `addDroppedItem`, `getDroppedItems`, `pickupItem/pickupAllItems`, `getAvailableConnections/findAvailableConnection`, `update` | Monster/Resource 통합 오브젝트, 다중 공격 대상 snapshot, ID 기반 NPC, 유연한 장소 입력, 공개 가능한 `lockReason`, 동일 상태 바닥 아이템의 maxStack 병합·조회·회수 |
| Location registry | `normalizeLocationData`, `defineLocation`, `reloadAllLocations`, `getLocation`, `getAllLocations`, `getRespawnLocation`, `distanceBetween`, `normalizeLocationInput` | 통합 오브젝트 배치 검증·복사, 월드 위치 정의/조회와 사용자 입력 정규화 |
| Location extension | `registerConnectionCondition`, `registerLocationPassive` | 문자열 상태 또는 공개 잠금 사유가 포함된 `{ status, publicReason }` 이동 조건과 위치별 프레임 콜백 |
| World map | `markLocationVisited`, `markAllLocationsVisited`, `hasVisitedLocation`, `getVisitedLocationIds`, `getWorldMapSnapshot`, `getFullWorldMapSnapshot` | Progress raw key를 숨긴 방문 영속·운영 일괄 발견 API, `location:hidden` 및 한 단계 공개 범위와 선택 `mapColor`를 적용한 일반 지도 DTO, 관리자 전체 지도 DTO |
| Job registry | `defineJob/getJob/getAllJobs`, `defineEliteJobRecipe/resolveEliteJob`, `isJobDescendant`, `JobTier/JobSlotType` | 1차·엘리트 정의, 동일 직업 금지 순서 조합과 하위 계보 판정 |
| `CareerProfile` | `main/sub/elite/effectiveMainJob`, `hasJob`, `canAssign/assign`, `setByAdmin`, `evaluateElitePromotion`, `refreshModifiers` | Progress 영속 직업 상태, Lv.20/50 선택, 운영 조합 교체, 스킬·modifier 지급과 Lv.200 자동 전직 |
| `Shop` | `getStock`, `consumeStock`, `update` | 재고와 재입고 |
| Shop registry | `defineShop`, `getShop`, `updateAllShops` | 상점 정의/조회/프레임 갱신 |
| Game events | `emitGameEvent`, `subscribeGameEvent`, `subscribeAllGameEvents`, `getRecentGameEvents` | 동기식 내부 이벤트와 원시 Entity 없는 최근 trace 스냅샷 |
| `NPC`, `DialogueScenario`, `Dialogue` | `NPC.define/getNpc/getAll`, `getEntryScenario/getScenario`, `say/event/setFlag/acceptQuest/turnInQuest/goto/choice/end` | NPC 정적 정의, 조건부 generator 장면과 타입별 대화·퀘스트 액션 생성 |
| NPC dialogue | `startNpcDialogue`, `chooseNpcDialogue`, `endNpcDialogue/endNpcDialogueByUserId`, `is/getActiveNpcDialogue`, `updateNpcDialogues` | player별 비영속 대화 세션 시작·선택·종료와 이탈 안전망 |
| `ProgressType`, `PlayerProgress` | `values/fromKey`, `getCounter/setCounter/increment`, `getFlag/setFlag`, `getState/setState`, `reset`, `getSnapshots`, `subscribeChanges`, `load/save` | 통계·NPC 플래그·분기 상태의 메모리 dirty 영속 API |
| Progress registry | `defineProgress`, `defineStatistic`, `getProgressDefinition`, `getAllProgressDefinitions` | `namespace:path` 상태 정의와 이벤트 기반 counter 등록 |
| `QuestStatus`, `QuestMarker`, `QuestObjective`, `QuestStage`, `QuestReward`, `QuestData` | `values/fromKey`, 목표 `event/kill/destroy/talk/craft/possess/item/visit/custom`, 보상 `exp/gold/item/skill/flag/custom`, `define/get/findQuestData` | 퀘스트 정의, 단계형 목표·제출 조건·보상과 NPC marker |
| `Quest`, `QuestBook` | `get/set/resetMetadata`, `get/getByInput/getStatus/isActive/isCompleted`, `canAccept/accept`, `canTurnIn/turnIn`, `abandon`, `getSnapshot(s)/getNpcMarker`, `handleGameEvent/refreshSnapshotObjectives`, `load/save` | 플레이어별 진행·반복·보상, GameEvent/현재 상태 목표 갱신과 versioned dirty 영속화 |
| `Skill`, `SkillBook` | `get/set/resetMetadata`, `get/setActiveState`, `getCalculatedField`, `getExperienceGain/getRequiredExperience/addExperience`, `formatDescription/Cost/ActivationCondition`, `createRuntime`, `grant/revoke`, `setLevel`, `activateByInput/ById/FromMessage`, `getHudSnapshots`, `hasActiveSkill`, `getActivationStatus`, `update`, `finishAll`, `load/save` | `{{icon.attributeKey}}` 능력치 계수 아이콘, 직업·무기 조건, 메시지 시전어와 성공 후 경험치·레벨업 및 `activationFeedback`, 영속 스킬 회수·관리자 레벨 설정, 표시 가능한 스킬 HUD DTO, delta·계산 템플릿과 영속/비영속 lifecycle |
| Skill registry | `defineSkill`, `getSkillData`, `getAllSkillData`, `acceptSkill/denySkill` | 정적 SkillData와 조건 결과 등록/조회 |
| Crafting | `CraftingRecipeIngredient`, `defineCraftingRecipe`, `get/findCraftingRecipe*`, `updateCraftingRecipeDiscovery`, `getDiscoveredCraftingRecipes`, `discoverAllCraftingRecipes`, `startCrafting`, `executeCrafting`, `cancelCrafting` | predicate 재료, 실제 선택 재료 factory, Progress 기반 제작법 발견/운영 일괄 해제, 지연 제작·취소 |
| Metadata | `cloneMetadataValue`, `createMetadataDelta`, `encodeMetadataDelta`, `decodeMetadataDelta` | Item/Skill이 공유하는 JSON-safe top-level delta 직렬화 |
| `StatusEffectType`, `StatusEffect` | `define/values/fromKey/fromInput`, `icon`, `formatDescription`, `get/set/resetMetadata`, `upgrade/refreshDuration`, lifecycle callback | 아이콘 key를 가진 클래스형 효과 정의, 대상별 duration/level/metadata delta와 병합·틱 처리 |
| Fishing | `FishRarity.values/fromKey`, `FishRarity.tag/sellPrice`, `define/get/getAllFish`, `getFishByRarity`, `rollFishRarity`, `rollFish`, `rollFishingExp`, `rollFishingWaitSeconds` | 6등급 태그·매입가·가중치·행운 보정, 물고기 보상과 45~65초 기본 범위를 입질 속도로 나누는 대기 계산 |
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
| `chat()` | `text/appendNodes/color/bg/weight/deco/size/tooltip/hide/icon/button/closeButton/progress/tab/worldMap` fluent builder로 `ChatNode[]` 생성; 계산 설명처럼 이미 파싱된 node도 안전하게 합성 |
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
- `information`: 정보 열람 명령 표시. 공개 모드에서는 `showCommandUse`보다 우선해 입력과 결과를 현재 채널에 공개한다.
- `args`: `required`, `isText`, 정적/동적 `completions`를 지원한다. 한 명령에서 `isText`는 최대 한 개를 전제로 한다.
- `handler(userId, args, raw, msg, permission)`: 검증된 명령 실행 진입점.

등록된 사용자 명령 전체 목록과 시스템별 사용 흐름은 [chat-command.md](../systems/chat-command.md)를 참고한다.
