# 클라이언트 내부 API 인덱스

클라이언트 기능은 전역 상태를 Context API로, 표현은 컴포넌트로 나눈다. 소비자는 Context 내부 state나 localStorage를 우회하지 말고 아래 목적형 API를 사용한다.

## Context와 hook

| API | 반환/기능 | 주 소비자 |
| --- | --- | --- |
| `useSocket()` | `socket`, `isConnected`, `sessionInfo`, `updateProfileImage`, `updateNickname` | App, 인증 화면, Home, 알림, 채팅 button, quick slot |
| `useTheme()` | 현재 theme와 theme 변경 API | `ThemeToggle` 및 테마 소비 UI |
| `useHud()` | HUD 설정/편집 API, playerStats/locationInfo, 표시 옵션, quick slot과 개별 skill button API | Home, HudContainer, HudSettings, 개별 HUD |

`useHud()`의 설정 API는 `setVisible`, `setPosition`, `setAnchor`, `setPosUnit`, `setPosAnchor`, `setHudOpacity`, `setHudScale`, `resetPosition`이다. 위치 정보 HUD의 오브젝트 버튼은 `setLocationObjectActionsVisible`, 미니맵의 인접 지역 이동 목록은 `setMinimapTravelActionsVisible`로 표시한다. 퀵슬롯은 `addQuickSlot`, `removeQuickSlot`, `moveQuickSlot`, `updateQuickSlot`으로만 변경한다. 전투 퀵 버튼은 `setSkillHudVisible`, `setSkillHudPosition`, `resetSkillHudPosition`으로 표시와 개별 viewport `%` 좌표를 바꾸며 `skillHudConfigs`를 직접 수정하지 않는다. 전용 크기는 `setQuickButtonScale`로 변경하고 `hud-quick-button-scale` localStorage에 저장한다.

`SkillQuickHud`는 `playerStats.skills`에 현재 표시 가능한 스킬만 렌더링하고 localStorage에 저장된 스킬별 On/Off·좌표를 적용한다. 버튼은 실제 아이콘과 이름만 표시하고 이미지 뒤에 이름 첫 글자 fallback을 겹치지 않으며 `chatButtonClick`의 숨김 `/스킬 이름` 동작을 호출한다. 쿨다운은 서버의 남은 시간과 `playerStatsReceivedAt`을 기준으로 클라이언트에서 보간해, 어두운 영역이 시계 방향으로 걷히는 conic-gradient와 남은 초를 표시한다. 위치 편집 모드에서는 각 버튼이 묶음 없이 독립적으로 drag된다.

`PlayerStatusHud`는 이름 옆에 `playerStats.level`을 표시하고 `playerStats.exp/maxExp` 경험치 진행 막대 뒤에 생명력·정신력·생존 자원을 표시하며, `HealthBarNode`에 생명력과 `playerStats.shields`를 함께 전달한다. 상태효과는 작은 효과별 아이콘, 레벨, 반시계 방향 duration fill과 hover/focus/touch 설명으로 표시한다. HUD wrapper는 기본적으로 pointer event를 차단하지만 상태효과 영역은 이를 명시적으로 다시 허용한다. 아이콘 URL은 서버가 보낸 key를 `/icons/{key}.png`로 해석하며 효과가 사라지면 다음 0.5초 HUD payload에서 목록에서도 제거된다.

채팅 상태창의 능력치 표시는 `AttributeType.icon`이 만든 `/icons/attributes/{key}.png`를 사용한다. 각 능력치를 한 행의 `아이콘 + hover 이름 + 값`으로 렌더링하므로 긴 재생/감소량 이름을 두 열 고정 폭에 억지로 배치하지 않는다. 같은 아이콘은 스킬 포맷의 `[icon=attributes/{key}]` 노드에서도 렌더링된다.

`PartyHud`는 nullable `playerStats.party`를 사용해 파티원별 레벨·생명력·정신력과 같은 장소 여부를 표시한다. 파티가 없으면 렌더링하지 않으며 HUD 설정 API로 표시·위치·크기를 조절한다. `Home.tsx`의 정보 공개 버튼은 서버 `informationMode` 이벤트만 상태 원본으로 사용한다. 미디어 버튼 옆의 위쪽 메뉴는 권한으로 필터한 `ChatType.values()`를 사용하며 일반 사용자에게 관리자 전용 공지를 렌더링하지 않는다. 채팅 첫 토큰이 `@`로 시작하면 온라인 플레이어 mention completion을 요청하고 선택한 닉네임을 `@닉네임 ` 형식으로 입력하며, 전송 타입 버튼은 입력 중에만 회색 귓속말 표시로 바뀐다.

`Home.tsx`의 답장 상태는 원문 `messageId/userId/nickname/preview` snapshot 하나만 소유한다. 공개 메시지의 답장 버튼은 모바일 입력 포커스를 빼앗지 않고 입력창 위 미리보기를 열며, 텍스트 또는 이미지만 전송하는 첫 메시지에 `replyToId`를 붙인다. 전송된 `ChatMessage.replyTo` 카드를 누르면 `chat-message-{id}` 요소로 즉시 이동하고 1.6초 동안 강조한다. 원문이 현재 100개 히스토리에 없으면 입력창 안내를 표시한다.

`components/minigame/MiniGameOverlay`는 서버 `miniGameStart`를 전체 화면 overlay로 렌더링한다. 낚시·위험 회피는 키보드와 pointer 조이스틱의 축 변경을 20ms 단위로 합치고, 단조 리듬은 Space·Enter·터치 버튼의 `strike` 시각을 별도 action trace로 기록한다. 단조는 난이도·원 정확도·보정 품질을 표시하고 첫 사용자 타격 이후 Web Audio 접근 cue와 충격음을 재생한다. 화면은 공용 결정론 시뮬레이터로 미리 계산하지만 성공 권한은 서버에 있으며 전송 시점의 불변 trace snapshot만 `miniGameResult`로 반환한다.

## 채팅 UI API

| API | 위치 | 용도 |
| --- | --- | --- |
| `renderNode(node, key)` | `components/chat/ChatMessage.tsx` | ChatNode별 renderer dispatch |
| `resolveColor(color)` | `components/chat/ChatMessage.tsx` | `$token` 또는 CSS color 해석 |
| `summarizeChatContent(content)` | `shared/chat.ts` | 구조화 메시지를 답장 카드용 최대 120자 한 줄 요약으로 변환 |
| `resolveCommandInput(commands, raw)` | `utils/commandAutocomplete.ts` | 슬래시 명령 또는 첫 단어가 정확한 별칭인 입력을 CommandInfo에 연결 |
| `isCommandAutocompleteInput(commands, raw)` | `utils/commandAutocomplete.ts` | 현재 입력이 명령 자동완성 대상인지 판정 |
| `getFilteredCommands(commands, filter)` | `utils/commandAutocomplete.ts` | 슬래시 명령 prefix 또는 정확한 슬래시 없는 별칭 필터 |
| `HideCloseContext` | `components/chat/nodes/HideNode.tsx` | close button이 상위 hide UI를 닫는 callback |
| `TooltipNode` | `components/chat/nodes/TooltipNode.tsx` | hover/touch 위치를 측정해 ChatNode 설명 overlay 표시 |
| `HealthBarNode` | `components/chat/nodes/HealthBarNode.tsx` | 생명력 뒤부터 타입색 보호막을 쌓고 최대 생명력 초과분은 상단 띠로 표시하는 공용 체력바 |
| `ImageNode` | `components/chat/nodes/ImageNode.tsx` | 원본 비율 snapshot으로 이미지와 말풍선 너비를 맞추고 높이를 `34vh`, `320px`, 노드 제한 중 최솟값으로 제한 |
| `DividerNode` | `components/chat/nodes/DividerNode.tsx` | 선택적 가운데 제목을 가진 반응형 구분선 |
| `WorldMapNode` | `components/chat/nodes/WorldMapNode.tsx` | worldMap snapshot의 방문 장소 대표색 바이옴 레이어, SVG 경로·점·랜드마크와 wheel/drag/pinch 카메라, 장소 정보 card 표시 |

## 공용 오버레이 API

| API | 위치 | 용도 |
| --- | --- | --- |
| `Dialog` | `components/dialog/Dialog.tsx` | portal 기반 접근 가능한 공용 화면 오버레이, Escape/배경 닫기와 포커스 복원 |
| `FormDialog` | `components/dialog/FormDialog.tsx` | 필드 정의 배열로 text/number/select/textarea/checkbox 입력 및 비동기 실행 UI 생성. 필수 select는 첫 option을 기본 선택 |

`AdminPage`는 이 API로 플레이어·월드 action 입력을 구성한다. 상세·검사 목록은 viewport 내부 스크롤을 사용하고 PC의 중앙 모달은 모바일에서 viewport 폭의 하단 시트로 바뀐다.

## 클라이언트 검증 API

`utils/validators.ts`는 `validateId`, `validatePassword`, `validateEmail`, `validateNickname`을 제공한다. 이는 즉시 UI 피드백용이며 서버의 같은 이름 validator가 최종 검증을 수행한다.

## 게임 안내 라우트

`/guide`의 `GameGuide`는 별도 서버 데이터를 복제하지 않는 정적 사용 안내 화면이다. `Drawer`의 `게임 안내` 버튼으로 진입하고 `게임으로 돌아가기`로 `/home`에 복귀한다. PC에서는 장/문서 계층을 왼쪽 고정 목차로, 모바일에서는 가로 장 탭과 문서 이전/다음 버튼으로 탐색한다. 실제 수치나 마스터 데이터 목록이 아니라 안정적인 입력 흐름과 시스템 개념만 설명하며, 명령 별칭이나 기능 계약이 바뀌면 같은 변경에서 문구를 갱신한다.

## 확장 원칙

- Context가 소유한 raw state를 다른 기능이 localStorage나 내부 구조로 직접 수정하지 않는다. 필요한 동작은 Context value에 가장 작은 목적형 함수를 추가한다.
- 서버 상태를 새로 표시할 때는 공유 payload → Socket listener → 상태 소유 Context → 표시 컴포넌트 순서로 연결한다.
- 새 UI primitive를 만들기 전에 기존 component, chat node, HUD API와 SCSS token/mixin을 먼저 확인한다.
