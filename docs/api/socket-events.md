# Socket.io 이벤트 API

이벤트 타입의 단일 기준은 `shared/types.ts`의 `ClientToServerEvents`와 `ServerToClientEvents`다. 아래 표는 계약뿐 아니라 실제 처리/소비 위치를 찾기 위한 인덱스다.

## Client → Server

| 이벤트 | payload | 인증 | 서버 처리 | 주 응답/효과 |
| --- | --- | --- | --- | --- |
| `login` | `LoginRequest { id, pw }` | 불필요 | `modules/login.ts` | `loginResult`; Player 로드, room 참가 |
| `register` | `RegisterRequest { id, pw, email, nickname }` | 이메일 인증 필요 | `modules/register.ts` | `registerResult`; User+Player 생성, 세션 발급 |
| `logout` | `token: string` | 토큰 | `modules/login.ts` | `logoutResult`; 마지막 세션이면 Player 저장/언로드 |
| `sendVerifyCode` | `email: string` | 불필요 | `modules/register.ts` | `verifyCodeSendResult`; 6자리, 5분 만료, 60초 재전송 제한 |
| `verifyCode` | `code: string` | 불필요 | `modules/register.ts` | `verifyCodeResult` |
| `sendMessage` | `content: string` | 필요 | `modules/chat.ts` | 최대 500자; `ActionType.CHAT/COMMAND` 제한 확인 후 일반 채팅·`@닉네임 메시지` 귓속말 또는 명령 실행 |
| `sendImageMessage` | `{ filename: string }` | 필요 | `modules/chat.ts` | HTTP 업로드 소유권·보관 기간·`ActionType.CHAT` 확인 후 현재 채널에 image ChatNode 전송 |
| `chatButtonClick` | `{ action, showCommand? }` | 필요 | `modules/chat.ts` | `ActionType.COMMAND` 제한 확인 후 `/` action만 `handleCommand()`로 전달 |
| `requestChatHistory` | 없음 | 선택 | `modules/chat.ts` | `chatHistory`; 인증 시 private history와 HUD 데이터도 전송 |
| `requestCommandList` | 없음 | 불필요 | `modules/bot.ts` | `commandList` |
| `requestCompletions` | `raw: string` | 필요 | `modules/bot.ts` | 슬래시 명령과 슬래시 없는 별칭 입력의 동적 인자 후보 `argCompletions` |
| `requestMentionCompletions` | `query: string` | 필요 | `modules/chat.ts` | 자기 자신을 제외한 온라인 플레이어 닉네임 prefix 후보 `mentionCompletions` |
| `requestInformationMode` | 없음 | 필요 | `modules/bot.ts` | 현재 플레이어의 정보 공개 여부를 `informationMode`로 응답 |
| `setInformationMode` | `isPublic: boolean` | 필요 | `modules/bot.ts` | 런타임 정보 공개 모드 변경, 같은 계정 소켓 동기화와 notification |
| `requestUserCount` | 없음 | 불필요 | `modules/login.ts` | `userCount` |
| `joinChannel` | `string \| null` | 필요 | `modules/chat.ts` | room 변경 후 `channelChanged`; `private_{userId}`는 본인만 |
| `requestChannelList` | 없음 | 불필요 | `modules/chat.ts` | `channelList` |
| `changeNickname` | `nickname: string` | 필요 | `modules/login.ts` | `nicknameResult`; DB와 모든 메모리 세션 갱신 |
| `requestLocationInfo` | 없음 | 필요 | `modules/chat.ts` | `locationInfo` |
| `adminRequestLocations` | 없음 | 권한 10 | `modules/location.ts` | `adminLocations` |
| `adminSaveLocations` | `LocationData[]` | 권한 10 | `modules/location.ts` | `objects(type/dataId/maxCount/respawnTime)`, `npcIds`, `tags`, 선택 `mapIcon`·`#RRGGBB mapColor`를 검증·정규화한 뒤 JSON 저장 및 런타임 재로드, `adminSaveResult` |
| `adminPanelRequestBootstrap` | 없음 | 권한 10 | `modules/adminPanel.ts` | `adminPanelBootstrap`; 관리자 form option 목록 |
| `adminPanelRequestPlayers` | 없음 | 권한 10 | `modules/adminPanel.ts` | `adminPanelPlayers`; 온라인 우선 전체 캐릭터 목록 |
| `adminPanelRequestPlayer` | `userId: number` | 권한 10 | `modules/adminPanel.ts` | `adminPanelPlayer`; 가공된 캐릭터 상세 snapshot |
| `adminPanelExecute` | `AdminPanelActionRequest` | 권한 10 | `modules/adminPanel.ts` | 플레이어·월드 action과 전체 채팅/알림·개별 온라인 알림을 서버 검증 후 실행하고 result/목록/상세 갱신 |
| `miniGameResult` | `MiniGameResultRequest` (session/token/경과 시간/20ms 단위 축 입력 trace) | 필요 | `modules/minigame.ts` | 일회성 세션·token·경과 시간 확인, 입력 정규화와 타입별 서버 재현 검증 후 `miniGameResolved` |

클라이언트 emit 위치는 주로 `pages/Login.tsx`, `pages/Register.tsx`, `pages/Home.tsx`, `pages/LocationEditor.tsx`, `components/chat/nodes/ButtonNode.tsx`, `components/hud/huds/QuickSlotHud.tsx`다.

## Server → Client

| 이벤트 | payload | 서버 생산자 | 클라이언트 소비자 |
| --- | --- | --- | --- |
| `sessionRestore` | `SessionRestoreData` | `modules/login.ts` | `SocketContext.tsx`, `App.tsx` |
| `sessionInvalid` | 없음 | `modules/login.ts`, `modules/chat.ts` | `App.tsx` |
| `loginResult` | `LoginResult` | `modules/login.ts` | `SocketContext.tsx`, `pages/Login.tsx` |
| `registerResult` | `RegisterResult` | `modules/register.ts` | `pages/Register.tsx` |
| `logoutResult` | `LogoutResult` | `modules/login.ts` | 현재 명시적 상시 listener 없음 |
| `verifyCodeSendResult` | `SimpleResult` | `modules/register.ts` | `pages/Register.tsx` |
| `verifyCodeResult` | `SimpleResult` | `modules/register.ts` | `pages/Register.tsx` |
| `chatHistory` | `ChatMessage[]` | `modules/chat.ts` | `pages/Home.tsx` |
| `chatMessage` | `ChatMessage` | `modules/message.ts` | `pages/Home.tsx` |
| `notification` | `NotificationData` | `modules/message.ts` | `components/Notification.tsx` |
| `commandList` | `CommandInfo[]` | `modules/bot.ts` | `pages/Home.tsx` |
| `argCompletions` | `CompletionItem[]` | `modules/bot.ts` | `pages/Home.tsx` |
| `mentionCompletions` | `CompletionItem[]` | `modules/chat.ts` | `pages/Home.tsx` |
| `playerStats` | `PlayerStatsData` (`syncId/revision`과 현재 레벨·자원·타입색 `shields`·공격 cooldown·`statusEffects`, 표시 가능한 스킬, nullable 파티 HUD). 내용이 바뀐 완전한 snapshot만 socket별 1회 전송 | `modules/player.ts`/`stateSync.ts` | `pages/Home.tsx`가 오래된 revision을 거른 뒤 `HudContext` → HUD |
| `informationMode` | `isPublic: boolean` | `modules/bot.ts` | `pages/Home.tsx` 입력창 공개/비공개 전환 버튼 |
| `locationInfo` | `LocationInfoData` (`syncId/revision`, objects/플레이어 생명력·`shields`, 플레이어 기준 인접 장소). 내용 변경 시 완전한 snapshot 전송 | `modules/player.ts`/`stateSync.ts` | `pages/Home.tsx`가 오래된 revision을 거른 뒤 Location/Minimap HUD |
| `userCount` | `UserCountData` (다중 탭을 합친 고유 사용자 기준 전체/채널 인원) | `modules/login.ts` | `pages/Home.tsx` |
| `channelChanged` | `(channel, history)` | `modules/chat.ts` | `pages/Home.tsx` |
| `channelList` | `ChannelInfo[]` | `modules/chat.ts` | `pages/Home.tsx` |
| `nicknameResult` | `SimpleResult & { nickname? }` | `modules/login.ts` | `SocketContext.tsx`, `pages/Home.tsx` |
| `editMessage` | `(id, content)` | `modules/message.ts` | `pages/Home.tsx` |
| `deleteMessage` | `id: string` | `modules/message.ts` | `pages/Home.tsx` |
| `adminLocations` | 태그·통합 `objects`·`npcIds`·선택 `mapIcon/mapColor` 포함 `LocationData[]` | `modules/location.ts` | `pages/LocationEditor.tsx` |
| `adminSaveResult` | `SimpleResult` | `modules/location.ts` | `pages/LocationEditor.tsx` |
| `adminPanelBootstrap` | `AdminPanelBootstrapData` | `modules/adminPanel.ts` | `pages/AdminPage.tsx` |
| `adminPanelPlayers` | `AdminPlayerListItem[]` | `modules/adminPanel.ts` | `pages/AdminPage.tsx` |
| `adminPanelPlayer` | `AdminPlayerDetailData \| null` | `modules/adminPanel.ts` | `pages/AdminPage.tsx` |
| `adminPanelResult` | `AdminPanelResult` | `modules/adminPanel.ts` | 요청 소켓 호환용 결과. 사용자 피드백은 같은 요청 소켓의 `notification`으로 표시 |
| `miniGameStart` | `MiniGameStartData` (session/token/type/만료/config) | `modules/minigame.ts` | `components/minigame/MiniGameOverlay.tsx` |
| `miniGameResolved` | `MiniGameResolvedData` | `modules/minigame.ts` | `components/minigame/MiniGameOverlay.tsx` |
| `miniGameCancelled` | `MiniGameCancelledData` | `modules/minigame.ts` | `components/minigame/MiniGameOverlay.tsx` |

`ChatMessage`와 `NotificationData` 안의 progress/health `ChatNode.length`는 숫자 px 또는 `em`, `%` 같은 CSS 길이 문자열이다. health 노드는 생명력·최대 생명력과 `ShieldBarSegment[]`를 한 snapshot으로 전달한다. image 노드는 서버가 정한 `src/alt/maxHeight`와 선택적 원본 `width/height` snapshot으로 채팅 업로드와 향후 스킬 연출 이미지를 공통 렌더링하고, divider는 선택적 제목을 가진 구분선을 렌더링한다. `/지도` private `ChatMessage`의 worldMap 노드는 별도 socket event 없이 방문지·인접 미방문지로 제한된 `WorldMapData` snapshot을 포함하며, 방문 장소의 검증된 `mapColor`만 바이옴 배경에 사용한다.

## Room과 전송 범위

- 공개 채널 room은 `channel:main` 또는 `channel:{channelId}` 형식이다.
- `sendMessageToChannel()`은 해당 room에 전송하고 공개 히스토리에 저장한다.
- `sendMessageFiltered()`는 조건을 통과하고 현재 채널이 같은 소켓에만 보내며 필터 히스토리에 저장한다.
- `sendWhisperMessage()`는 발신자와 수신자의 서로 다른 현재 채널에 필터 메시지를 각각 저장·전송하며 공개 히스토리에는 넣지 않는다.
- `broadcastMessageAll()`은 모든 채널 히스토리와 모든 소켓에 전송하며 `[전체]` 플래그를 붙인다.
- 한 사용자의 여러 소켓은 채널 변경 시 함께 room을 이동하지만 `channelChanged` 응답은 요청한 소켓에 전송된다.

## 계약 변경 체크리스트

1. `shared/types.ts` 변경.
2. 서버의 emit/on payload 및 런타임 검증 변경.
3. 클라이언트 listener/emit과 cleanup 변경.
4. 이 문서 및 영향받은 폴더의 `Overview.md` 변경.
5. 서버와 클라이언트 모두 빌드.
