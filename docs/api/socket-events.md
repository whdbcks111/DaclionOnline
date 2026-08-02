# Socket.io 이벤트 API

이벤트 타입의 단일 기준은 `shared/types.ts`의 `ClientToServerEvents`와 `ServerToClientEvents`다. 아래 표는 계약뿐 아니라 실제 처리/소비 위치를 찾기 위한 인덱스다.

## Client → Server

| 이벤트 | payload | 인증 | 서버 처리 | 주 응답/효과 |
| --- | --- | --- | --- | --- |
| `clientPresence` | `"focused" \| "visible" \| "hidden"` | 선택 | `modules/socket.ts` | 연결·화면 상태·실제 입력 때 현재 활성도를 갱신해 다중 접속의 단일 미니게임 대상 선택 |
| `login` | `LoginRequest { id, pw }` | 불필요 | `modules/login.ts` | `loginResult`; Player 로드, room 참가 |
| `register` | `RegisterRequest { id, pw, email, nickname }` | 이메일 인증 필요 | `modules/register.ts` | `registerResult`; User+Player 생성, 세션 발급 |
| `logout` | `token: string` | 토큰 | `modules/login.ts` | `logoutResult`; 마지막 세션이면 Player 저장/언로드 |
| `sendVerifyCode` | `email: string` | 불필요 | `modules/register.ts` | `verifyCodeSendResult`; 6자리, 5분 만료, 60초 재전송·IP 발송 횟수 제한 |
| `verifyCode` | `code: string` | 불필요 | `modules/register.ts` | `verifyCodeResult`; 발급 건당 오답 5회·IP+socket 요청 빈도 제한 |
| `sendPasswordResetCode` | `email: string` | 불필요 | `modules/passwordReset.ts` | `passwordResetCodeSendResult`; 가입 여부 비공개 응답, 6자리·5분 만료·60초 재전송·IP 발송 제한 |
| `resetPassword` | `PasswordResetRequest { code, pw }` | 이메일 코드 필요 | `modules/passwordReset.ts` | `passwordResetResult`; 오답 5회·요청 제한, 새 PBKDF2 hash 저장과 기존 세션 전체 폐기 |
| `sendMessage` | `string \| { content, replyToId?, chatType? }` | 필요 | `modules/chat.ts` | 최대 500자; `channel/nearby/party/advertisement/notice` 범위와 공지 권한·광고 30초 제한을 서버에서 검증. 답장은 현재 공개 채널 히스토리에서 재검증하고 채널 타입만 허용 |
| `sendImageMessages` | `{ filenames: string[], replyToId?, chatType? }` (1~10장) | 필요 | `modules/chat.ts` | 모든 HTTP 업로드의 소유권·보관 기간·`ActionType.CHAT`, 선택 범위와 공개 원문을 확인한 뒤 하나의 다중 image ChatNode 메시지 전송 |
| `sendImageMessage` | `{ filename: string, replyToId?, chatType? }` | 필요 | `modules/chat.ts` | 구형 클라이언트 호환용 단일 이미지 이벤트. `sendImageMessages`와 같은 검증 경계를 사용 |
| `chatButtonClick` | `{ action, showCommand? }` | 필요 | `modules/chat.ts` | `ActionType.COMMAND` 제한 확인 후 `/` action만 `handleCommand()`로 전달 |
| `requestChatHistory` | 없음 | 선택 | `modules/chat.ts` | `chatHistory`; 인증 시 private history와 HUD 데이터도 전송 |
| `requestCommandList` | 없음 | 불필요 | `modules/bot.ts` | `commandList` |
| `requestCompletions` | `raw: string` | 필요 | `modules/bot.ts` | 슬래시 명령과 슬래시 없는 별칭 입력의 동적 인자 후보 `argCompletions` |
| `requestMentionCompletions` | `query: string` | 필요 | `modules/chat.ts` | 자기 자신을 제외한 온라인 플레이어 닉네임 prefix 후보 `mentionCompletions` |
| `requestInformationMode` | 없음 | 필요 | `modules/bot.ts` | 현재 플레이어의 정보 공개 여부를 `informationMode`로 응답 |
| `setInformationMode` | `isPublic: boolean` | 필요 | `modules/bot.ts` | 런타임 정보 공개 모드 변경, 같은 계정 소켓 동기화와 notification |
| `requestUserCount` | 없음 | 불필요 | `modules/login.ts` | `userCount` |
| `joinChannel` | `string \| null` | 필요 | `modules/chat.ts` | 마스터 공개 채널 또는 본인 `private_{userId}`만 room 변경 후 `channelChanged` |
| `requestChannelList` | 없음 | 불필요 | `modules/chat.ts` | `channelList` |
| `changeNickname` | `nickname: string` | 필요 | `modules/login.ts` | `nicknameResult`; DB와 모든 메모리 세션 갱신 |
| `requestLocationInfo` | 없음 | 필요 | `modules/chat.ts` | `locationInfo` |
| `adminRequestLocations` | 없음 | 권한 10 | `modules/location.ts` | `adminLocations` |
| `adminSaveLocations` | `LocationData[]` | 권한 10 | `modules/location.ts` | `safe/neutral/hostile zoneType`, `objects(type/dataId/maxCount/respawnTime)`, `npcIds`, `tags`, 선택 `mapIcon`·`#RRGGBB mapColor`를 검증·정규화한 뒤 JSON 저장 및 런타임 재로드, `adminSaveResult` |
| `adminPanelRequestBootstrap` | 없음 | 권한 10 | `modules/adminPanel.ts` | `adminPanelBootstrap`; 아이템·스킬·칭호 등 관리자 form option 목록 |
| `adminPanelRequestPlayers` | 없음 | 권한 10 | `modules/adminPanel.ts` | `adminPanelPlayers`; 온라인 우선 전체 캐릭터 목록 |
| `adminPanelRequestPlayer` | `userId: number` | 권한 10 | `modules/adminPanel.ts` | `adminPanelPlayer`; 보유·장착 칭호를 포함한 가공된 캐릭터 상세 snapshot |
| `adminPanelExecute` | `AdminPanelActionRequest` | 권한 10 | `modules/adminPanel.ts` | 플레이어·월드 action, 칭호 부여·삭제, 전체 채팅/알림·개별 온라인 알림, `analyze_balance_profile` 전투 로테이션 진단을 서버 검증 후 실행하고 result/목록/상세 갱신 |
| `miniGameReady` | `{ sessionId, token }` | 필요 | `modules/minigame.ts` | 서버가 현재 조작 화면으로 배정한 socket을 확인하고 서버 경과 시계 시작 |
| `miniGameInput` | `{ sessionId, token, x, y }` | 필요 | `modules/minigame.ts` | 이동 축을 clamp하고 서버 수신 시각 기준 20ms trace로 기록. 회피 성공 권위와 낚시 audit에 유지 |
| `miniGameAction` | `{ sessionId, token, action: "strike" }` | 필요 | `modules/minigame.ts` | 단조 타격을 서버 수신 시각으로 즉시 기록 |
| `miniGameResult` | `{ sessionId, token, fishingProof? }` | 필요 | `modules/minigame.ts` | 낚시는 version 1 client 입력·100ms 궤적 proof를 서버 발급 config로 즉시 재생 검증하고, 회피·단조는 기존 250ms 완료 여유와 서버 수집 trace로 판정한 뒤 `miniGameResolved`. matching 세션의 잘못된 proof도 소비하며 disconnect는 실패 확정 |
| `requestHumanVerification` | 없음 | 필요 | `modules/humanVerification.ts` | required FLAG가 있는 플레이어의 기존 문제를 재전송하거나 새 일회성 문제를 발급 |
| `submitHumanVerification` | `{ sessionId, answer }` | 필요 | `modules/humanVerification.ts` | 서버 메모리의 정답과 session을 검사하고 성공 시 영속 요구 상태와 행동 제한 해제 |
| `requestHudPresets` | 없음 | 필요 | `modules/hudPreset.ts` | 계정에 저장된 프리셋 이름·수정 시각 목록을 `hudPresetList`로 응답하며 자동 적용하지 않음 |
| `saveHudPreset` | `{ name, preset }` | 필요 | `modules/hudPreset.ts` | 이름·snapshot 범위·최대 10개를 검증해 즉시 Player 저장 후 결과와 목록 응답 |
| `loadHudPreset` | `name: string` | 필요 | `modules/hudPreset.ts` | 사용자가 요청한 이름의 snapshot만 `hudPresetLoaded`로 응답 |
| `deleteHudPreset` | `name: string` | 필요 | `modules/hudPreset.ts` | 이름으로 삭제하고 즉시 Player 저장 후 결과와 목록 응답 |

클라이언트 emit 위치는 주로 `pages/Login.tsx`, `pages/Register.tsx`, `pages/PasswordReset.tsx`, `pages/Home.tsx`, `pages/LocationEditor.tsx`, `components/chat/nodes/ButtonNode.tsx`, `components/hud/huds/QuickSlotHud.tsx`다.

## Server → Client

| 이벤트 | payload | 서버 생산자 | 클라이언트 소비자 |
| --- | --- | --- | --- |
| `sessionRestore` | `SessionRestoreData` | `modules/login.ts` | `SocketContext.tsx`, `App.tsx` |
| `sessionInvalid` | 없음 | `modules/login.ts`, `modules/chat.ts` | `App.tsx` |
| `loginResult` | `LoginResult` | `modules/login.ts` | `SocketContext.tsx`, `pages/Login.tsx` |
| `registerResult` | `RegisterResult` | `modules/register.ts` | `pages/Register.tsx` |
| `logoutResult` | `LogoutResult` | `modules/login.ts` | `SocketContext.tsx`, `pages/Home.tsx` |
| `verifyCodeSendResult` | `SimpleResult` | `modules/register.ts` | `pages/Register.tsx` |
| `verifyCodeResult` | `SimpleResult` | `modules/register.ts` | `pages/Register.tsx` |
| `passwordResetCodeSendResult` | `SimpleResult` | `modules/passwordReset.ts` | `pages/PasswordReset.tsx` |
| `passwordResetResult` | `SimpleResult` | `modules/passwordReset.ts` | `pages/PasswordReset.tsx` |
| `chatHistory` | `ChatMessage[]` | `modules/chat.ts` | `pages/Home.tsx` |
| `chatMessage` | `ChatMessage` (`replyTo?`, `replyable?`, `equippedTitle?` 포함) | `modules/message.ts` | `pages/Home.tsx` |
| `notification` | `NotificationData` | `modules/message.ts` | `components/Notification.tsx` |
| `commandList` | `CommandInfo[]` | `modules/bot.ts` | `pages/Home.tsx` |
| `argCompletions` | `CompletionItem[]` | `modules/bot.ts` | `pages/Home.tsx` |
| `mentionCompletions` | `CompletionItem[]` | `modules/chat.ts` | `pages/Home.tsx` |
| `playerStats` | `PlayerStatsData` (`syncId/revision`, 장착 칭호, 현재 `level/exp/maxExp`·자원·타입색 `shields`·공격 cooldown·`autoAttackEnabled`·`statusEffects`, 표시 가능한 스킬과 전투 기술의 선택적 `cadenceRemaining/cadenceDuration`, nullable 파티 HUD, nullable 현재 대상의 선택적 아이콘·보스 왕관 여부·HP/MP/보호막/상태이상과 감각 단계별 몬스터 분석). 내용이 바뀐 완전한 snapshot만 socket별 1회 전송 | `modules/player.ts`/`stateSync.ts` | `pages/Home.tsx`가 오래된 revision을 거른 뒤 `HudContext` → HUD |
| `informationMode` | `isPublic: boolean` | `modules/bot.ts` | `pages/Home.tsx` 입력창 공개/비공개 전환 버튼 |
| `locationInfo` | `LocationInfoData` (`syncId/revision`, `zoneType/zoneLabel/pvpAllowed`, 현재 플레이어가 이용 가능한 낚시·상점 `capabilities`, objects의 선택적 아이콘·보스 왕관 여부·생명력·`shields`·가능한 `actions`, NPC 이름·설명·퀘스트 표식, 플레이어 생명력·보호막, 5분 초과 보스의 선택적 `respawn`, 플레이어 기준 인접 장소). 내용 변경 시 완전한 snapshot 전송 | `modules/player.ts`/`stateSync.ts` | `pages/Home.tsx`가 오래된 revision을 거른 뒤 Location/Minimap HUD |
| `userCount` | `UserCountData` (다중 탭을 합친 고유 사용자 기준 전체/채널 인원) | `modules/login.ts` | `pages/Home.tsx` |
| `channelChanged` | `(channel, history)` | `modules/chat.ts` | `pages/Home.tsx` |
| `channelList` | `ChannelInfo[]` | `modules/chat.ts` | `pages/Home.tsx` |
| `nicknameResult` | `SimpleResult & { nickname? }` | `modules/login.ts` | `SocketContext.tsx`, `pages/Home.tsx` |
| `editMessage` | `(id, content)` | `modules/message.ts` | `pages/Home.tsx` |
| `deleteMessage` | `id: string` | `modules/message.ts` | `pages/Home.tsx` |
| `clearChatView` | `count?: number` | `modules/message.ts` | `pages/Home.tsx`; 생략 시 현재 화면 전체, 숫자면 최근 메시지만 제거하며 서버 기록은 유지 |
| `adminLocations` | 태그·통합 `objects`·`npcIds`·선택 `mapIcon/mapColor` 포함 `LocationData[]` | `modules/location.ts` | `pages/LocationEditor.tsx` |
| `adminSaveResult` | `SimpleResult` | `modules/location.ts` | `pages/LocationEditor.tsx` |
| `adminPanelBootstrap` | `AdminPanelBootstrapData` | `modules/adminPanel.ts` | `pages/AdminPage.tsx` |
| `adminPanelPlayers` | `AdminPlayerListItem[]` | `modules/adminPanel.ts` | `pages/AdminPage.tsx` |
| `adminPanelPlayer` | `AdminPlayerDetailData \| null` | `modules/adminPanel.ts` | `pages/AdminPage.tsx` |
| `adminPanelResult` | `AdminPanelResult` (밸런스 분석 시 `details` 포함) | `modules/adminPanel.ts` | `pages/AdminPage.tsx` |
| `adminPanelResult` | `AdminPanelResult` | `modules/adminPanel.ts` | 요청 소켓 호환용 결과. 사용자 피드백은 같은 요청 소켓의 `notification`으로 표시 |
| `miniGameStart` | `MiniGameStartData` (session/token/type/만료/config, 위험 회피 config의 실제 패턴 `label`과 단색 `theme`) | `modules/minigame.ts`; 같은 계정의 focused 우선 연결 하나에만 전송 | `components/minigame/MiniGameOverlay.tsx` |
| `miniGameResolved` | `MiniGameResolvedData` | `modules/minigame.ts` | `components/minigame/MiniGameOverlay.tsx` |
| `miniGameCancelled` | `MiniGameCancelledData` | `modules/minigame.ts` | `components/minigame/MiniGameOverlay.tsx` |
| `humanVerificationStart` | `HumanVerificationStartData` (session ID, 안내, raster PNG data URL, 만료 시각) | `modules/humanVerification.ts` | `components/security/HumanVerificationOverlay.tsx` |
| `humanVerificationResult` | `HumanVerificationResultData` (성공 여부, 안내, 재시도 가능 여부) | `modules/humanVerification.ts` | `components/security/HumanVerificationOverlay.tsx` |
| `hudPresetList` | `HudPresetSummary[]` | `modules/hudPreset.ts` | `HudContext.tsx`; 이름 선택 목록만 갱신 |
| `hudPresetLoaded` | `{ name, preset: HudPresetData }` | `modules/hudPreset.ts` | `HudContext.tsx`; 명시적 불러오기 요청 결과를 현재 계정 HUD에 적용 |
| `hudPresetResult` | `HudPresetOperationResult` | `modules/hudPreset.ts` | `HudContext.tsx`; 저장·불러오기·삭제 상태 안내 |

`ChatMessage`와 `NotificationData` 안의 progress/health `ChatNode.length`는 숫자 px 또는 `em`, `%` 같은 CSS 길이 문자열이다. 플레이어 메시지는 전송 시점의 `newcomer/karmaMarked/equippedTitle`을 선택적으로 포함해 `🌱/🥀` 표식과 `[칭호]`를 히스토리와 실시간 메시지에서 일관되게 표시한다. `newcomer`는 누적 플레이 24시간 미만이면서 Lv.30 미만인 경우에만 서버가 넣는다. health 노드는 생명력·최대 생명력과 `ShieldBarSegment[]`를 한 snapshot으로 전달한다. image 노드는 서버가 정한 `src/alt/maxHeight`와 선택적 원본 `width/height` snapshot으로 채팅 업로드와 향후 스킬 연출 이미지를 공통 렌더링하고, divider는 선택적 제목을 가진 구분선을 렌더링한다. `/지도` private `ChatMessage`의 worldMap 노드는 별도 socket event 없이 방문지·인접 미방문지로 제한된 `WorldMapData` snapshot을 포함하며, 방문 장소의 검증된 `mapColor`와 방문 뒤 공개된 `isBossRoom`만 지도 표시에 사용한다.

## Room과 전송 범위

- 공개 채널 room은 `channel:main` 또는 `channel:{channelId}` 형식이다.
- `sendMessageToChannel()`은 해당 room에 전송하고 공개 히스토리에 저장한다.
- `sendMessageFiltered()`는 조건을 통과하고 현재 채널이 같은 소켓에만 보내며 필터 히스토리에 저장한다.
- `sendWhisperMessage()`는 발신자와 수신자의 서로 다른 현재 채널에 필터 메시지를 각각 저장·전송하며 공개 히스토리에는 넣지 않는다.
- `broadcastMessageAll()`은 모든 채널 히스토리와 모든 소켓에 전송하며 `[전체]` 플래그를 붙인다.
- 한 사용자의 여러 소켓은 채널 변경 시 함께 room을 이동하지만 `channelChanged` 응답은 요청한 소켓에 전송된다.
- 서버 채널 청소 뒤에는 해당 채널 소켓마다 공개·사용자별 필터 히스토리를 다시 합친 `chatHistory`를 보내고, 화면 전용 청소는 `clearChatView`만 보내 서버 히스토리를 변경하지 않는다.

## 계약 변경 체크리스트

1. `shared/types.ts` 변경.
2. 서버의 emit/on payload 및 런타임 검증 변경.
3. 클라이언트 listener/emit과 cleanup 변경.
4. 이 문서 및 영향받은 폴더의 `Overview.md` 변경.
5. 서버와 클라이언트 모두 빌드.
