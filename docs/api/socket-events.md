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
| `sendMessage` | `content: string` | 필요 | `modules/chat.ts` | 최대 500자; 일반 채팅 또는 `/` 명령 실행 |
| `chatButtonClick` | `{ action, showCommand? }` | 필요 | `modules/chat.ts` | `/` action만 `handleCommand()`로 전달 |
| `requestChatHistory` | 없음 | 선택 | `modules/chat.ts` | `chatHistory`; 인증 시 private history와 HUD 데이터도 전송 |
| `requestCommandList` | 없음 | 불필요 | `modules/bot.ts` | `commandList` |
| `requestCompletions` | `raw: string` | 필요 | `modules/bot.ts` | 동적 인자 후보 `argCompletions` |
| `requestUserCount` | 없음 | 불필요 | `modules/login.ts` | `userCount` |
| `joinChannel` | `string \| null` | 필요 | `modules/chat.ts` | room 변경 후 `channelChanged`; `private_{userId}`는 본인만 |
| `requestChannelList` | 없음 | 불필요 | `modules/chat.ts` | `channelList` |
| `changeNickname` | `nickname: string` | 필요 | `modules/login.ts` | `nicknameResult`; DB와 모든 메모리 세션 갱신 |
| `requestLocationInfo` | 없음 | 필요 | `modules/chat.ts` | `locationInfo` |
| `adminRequestLocations` | 없음 | 권한 10 | `modules/location.ts` | `adminLocations` |
| `adminSaveLocations` | `LocationData[]` | 권한 10 | `modules/location.ts` | `tags`를 `namespace:path`로 정규화한 뒤 JSON 저장 및 런타임 재로드, `adminSaveResult` |

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
| `playerStats` | `PlayerStatsData` | `modules/player.ts` | `pages/Home.tsx` → `HudContext` |
| `locationInfo` | `LocationInfoData` | `modules/player.ts` | `pages/Home.tsx` → `HudContext` |
| `userCount` | `UserCountData` | `modules/login.ts` | `pages/Home.tsx` |
| `channelChanged` | `(channel, history)` | `modules/chat.ts` | `pages/Home.tsx` |
| `channelList` | `ChannelInfo[]` | `modules/chat.ts` | `pages/Home.tsx` |
| `nicknameResult` | `SimpleResult & { nickname? }` | `modules/login.ts` | `SocketContext.tsx`, `pages/Home.tsx` |
| `editMessage` | `(id, content)` | `modules/message.ts` | `pages/Home.tsx` |
| `deleteMessage` | `id: string` | `modules/message.ts` | `pages/Home.tsx` |
| `adminLocations` | 태그 포함 `LocationData[]` | `modules/location.ts` | `pages/LocationEditor.tsx` |
| `adminSaveResult` | `SimpleResult` | `modules/location.ts` | `pages/LocationEditor.tsx` |

`ChatMessage`와 `NotificationData` 안의 progress `ChatNode.length`는 숫자 px 또는 `em`, `%` 같은 CSS 길이 문자열이다.

## Room과 전송 범위

- 공개 채널 room은 `channel:main` 또는 `channel:{channelId}` 형식이다.
- `sendMessageToChannel()`은 해당 room에 전송하고 공개 히스토리에 저장한다.
- `sendMessageFiltered()`는 조건을 통과하고 현재 채널이 같은 소켓에만 보내며 필터 히스토리에 저장한다.
- `broadcastMessageAll()`은 모든 채널 히스토리와 모든 소켓에 전송하며 `[전체]` 플래그를 붙인다.
- 한 사용자의 여러 소켓은 채널 변경 시 함께 room을 이동하지만 `channelChanged` 응답은 요청한 소켓에 전송된다.

## 계약 변경 체크리스트

1. `shared/types.ts` 변경.
2. 서버의 emit/on payload 및 런타임 검증 변경.
3. 클라이언트 listener/emit과 cleanup 변경.
4. 이 문서 및 영향받은 폴더의 `Overview.md` 변경.
5. 서버와 클라이언트 모두 빌드.
