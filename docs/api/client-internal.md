# 클라이언트 내부 API 인덱스

클라이언트 기능은 전역 상태를 Context API로, 표현은 컴포넌트로 나눈다. 소비자는 Context 내부 state나 localStorage를 우회하지 말고 아래 목적형 API를 사용한다.

## Context와 hook

| API | 반환/기능 | 주 소비자 |
| --- | --- | --- |
| `useSocket()` | `socket`, `isConnected`, `sessionInfo`, `updateProfileImage`, `updateNickname` | App, 인증 화면, Home, 알림, 채팅 button, quick slot |
| `useTheme()` | 현재 theme와 theme 변경 API | `ThemeToggle` 및 테마 소비 UI |
| `useHud()` | HUD 설정/편집 API, playerStats/locationInfo, 표시 옵션, quick slot·개별 버튼과 이름 있는 서버 프리셋 API | Home, HudContainer, HudSettings, 개별 HUD |
| `useGameAudio()` | 기기별 `musicVolume`, `musicMuted`, `setMusicVolume`, `toggleMusicMute` | Home, Drawer |

`GameAudioProvider`는 Home의 `HudProvider` 안에서만 마운트한다. `LocationInfoData.locationId/mapColor`와 `PlayerStatsData.musicCombatState`를 순수 resolver에 전달하며 같은 장소·전투 key가 다시 와도 Tone Part를 재구성하지 않는다. 첫 실제 pointer·keydown·touch gesture가 있고 저장 음량이 0보다 클 때만 AudioContext를 시작한다. 숨김·비활성·연결 끊김 화면은 저장 음량과 별개로 fade out하고 route unmount 때 엔진을 dispose한다. Drawer는 오디오 node를 직접 참조하지 않고 Context의 0~100 음량과 음소거 API만 호출한다. 전체 설계와 35개 악보 계약은 [적응형 지역 음악](../systems/adaptive-music.md)을 따른다.

`useHud()`의 설정 API는 `setVisible`, `setPosition`, `setAnchor`, `setPosUnit`, `setPosAnchor`, `setHudOpacity`, `setHudScale`, `resetPosition`이다. 위치 편집 공통 설정은 `setGridSnapEnabled`, `setGridExponent`를 사용하며 slider exponent `2~6`은 실제 `gridSize` `4/8/16/32/64px`로 환산된다. 위치 정보 HUD의 오브젝트·NPC 행동 버튼은 `setLocationObjectActionsVisible`, 미니맵의 인접 지역 이동 목록은 `setMinimapTravelActionsVisible`로 표시한다. 퀵슬롯은 `addQuickSlot`, `removeQuickSlot`, `moveQuickSlot`, `updateQuickSlot`으로만 변경한다. 전투 퀵 버튼은 `setSkillHudVisible`, `setSkillHudPosition`, `resetSkillHudPosition`으로, 사용 아이템 퀵 버튼은 `setItemHudVisible`, `setItemHudPosition`, `resetItemHudPosition`으로 표시와 개별 좌표를 바꾸며 각 config record를 직접 수정하지 않는다. 전용 크기는 `setQuickButtonScale`, 공통 X/Y `%`·`px` 단위는 `setQuickButtonPosUnit`, 네 모서리 좌표 기준점은 `setQuickButtonPosAnchor`로 변경한다. 좌표 체계 변경 시 Context가 기존 화면 위치를 보존해 환산하고 계정 ID가 포함된 localStorage key에 저장한다.

현재 HUD 설정은 같은 브라우저에서 계정별로 자동 복원하되, 서버 프리셋은 `saveHudPreset(name)`, `loadHudPreset(name)`, `deleteHudPreset(name)`을 사용자가 직접 실행할 때만 변경·적용한다. 로그인 시 `hudPresetSummaries` 목록만 요청하며 프리셋을 자동 적용하지 않는다. 프리셋은 이름으로 최대 10개까지 저장하고 HUD 배치, 퀵슬롯, 스킬·아이템 버튼과 공통 표시 옵션을 함께 담는다.

`SkillQuickHud`는 기본 공격, 기본 표시되는 자동공격 토글과 `playerStats.skills`의 표시 가능한 스킬을 렌더링하고 localStorage에 저장된 버튼별 On/Off·좌표를 적용한다. 자동공격 버튼은 `/자동공격`을 호출하고 `playerStats.autoAttackEnabled`를 활성 테두리로 표시한다. 나머지 버튼은 실제 아이콘과 이름을 표시하고 `chatButtonClick`의 숨김 공격/스킬 동작을 호출한다. 개인/공유 쿨다운과 선택적 전투 기술 연계 대기 중 더 긴 시간을 `playerStatsReceivedAt` 기준으로 보간해, 어두운 영역이 시계 방향으로 걷히는 conic-gradient와 남은 초를 표시하고 tooltip 원인을 구분한다. 위치 편집 모드에서는 각 버튼이 묶음 없이 독립적으로 drag된다. `%` 좌표는 Context가 보존하는 안정 viewport 기준 px로 계산하므로 모바일 키보드가 실제 layout viewport를 줄여도 저장 위치를 다시 해석하지 않는다. 인게임 배율이 100%가 아니면 `displayPreferences.getUiViewportSize()`가 브라우저 viewport를 배율의 역수로 환산하고 `UI_SCALE_CHANGE_EVENT`로 HUD를 갱신한다.

`ItemQuickHud`는 서버가 `playerStats.usableItems`로 보낸 아이템 정의 ID·이름·아이콘·합산 수량만 사용한다. HUD 설정 후보는 현재 보유한 사용 가능 아이템이며, 이미 켠 버튼은 수량이 0이 되어도 회색으로 남아 재획득 시 같은 정의를 즉시 사용한다. 버튼은 슬롯 번호를 저장하지 않고 숨김 `/사용 item:<itemDataId>` 동작을 보내므로 인벤토리 정렬·부분 소비 뒤에도 다른 아이템으로 바뀌지 않는다.

`WorldMapNode`의 방문 장소 blip은 공용 `Dialog`로 자동이동 여부를 확인한 뒤 `chatButtonClick`에 장소 ID 기반 `/자동이동`을 전달한다. 현재 장소와 미방문 장소는 실행할 수 없으며, pointer 이동 거리를 판정해 지도 drag·pinch가 장소 클릭으로 이어지지 않게 한다.

`PlayerStatusHud`는 이름 옆에 `playerStats.level`을 표시하고 `playerStats.exp/maxExp` 경험치 진행 막대 뒤에 생명력·정신력·생존 자원을 표시하며, `HealthBarNode`에 생명력과 `playerStats.shields`를 함께 전달한다. 상태효과는 작은 효과별 아이콘, 레벨, 반시계 방향 duration fill과 hover/focus/touch 설명으로 표시한다. `resolveStatusScreenVisualState()`는 같은 `playerStats.statusEffects` snapshot을 화염·독·빙결·감전 preset, 독성 HP 색과 마비성 메시지 교란으로 변환한다. `StatusEffectScreenEffects`는 preset별 이미지를 `border-image` 9-slice로 렌더링하고 `pointer-events: none`을 유지해 중앙 채팅과 HUD 입력을 막지 않는다. `TargetStatusHud`는 같은 상태효과 표시 primitive와 HealthBarNode를 재사용해 nullable `playerStats.target`의 HP/MP/보호막·상태이상을 보여주고, 서버가 감각 단계에 맞춰 보낸 몬스터 속성·능력치·보상만 추가 표시한다. `LocationHud`는 서버가 보낸 오브젝트별 행동 목록만 렌더링해 공격 불가 오브젝트에는 공격·대상 버튼을 만들지 않고 상호작용 버튼을 표시하며, NPC 이름·설명·퀘스트 표식과 대화 버튼도 함께 표시한다. HUD wrapper는 기본적으로 pointer event를 차단하지만 상태효과 영역과 행동 버튼은 이를 명시적으로 다시 허용한다. 아이콘 URL은 서버가 보낸 key를 `/icons/{key}.png`로 해석하며 효과가 사라지면 다음 0.5초 HUD payload에서 목록에서도 제거된다.

채팅 상태창의 능력치 표시는 `AttributeType.icon`이 만든 `/icons/attributes/{key}.png`를 사용한다. 각 능력치를 한 행의 `아이콘 + hover 이름 + 값`으로 렌더링하므로 긴 재생/감소량 이름을 두 열 고정 폭에 억지로 배치하지 않는다. 같은 아이콘은 스킬 포맷의 `[icon=attributes/{key}]` 노드에서도 렌더링된다.

`PartyHud`는 nullable `playerStats.party`를 사용해 파티원별 레벨·생명력·정신력과 같은 장소 여부를 표시한다. 파티가 없으면 렌더링하지 않으며 HUD 설정 API로 표시·위치·크기를 조절한다. `Home.tsx`의 정보 공개 버튼은 서버 `informationMode` 이벤트만 상태 원본으로 사용한다. 미디어 버튼 옆의 위쪽 메뉴는 권한으로 필터한 `ChatType.values()`를 사용하며 일반 사용자에게 관리자 전용 공지를 렌더링하지 않는다. 채팅 첫 토큰이 `@`로 시작하면 온라인 플레이어 mention completion을 요청하고 선택한 닉네임을 `@닉네임 ` 형식으로 입력하며, 전송 타입 버튼은 입력 중에만 회색 귓속말 표시로 바뀐다.

`Home.tsx`의 답장 상태는 원문 `messageId/userId/nickname/preview` snapshot 하나만 소유한다. 공개 메시지의 답장 버튼은 모바일 입력 포커스를 빼앗지 않고 입력창 위 미리보기를 열며, 텍스트 또는 이미지만 전송하는 첫 메시지에 `replyToId`를 붙인다. 전송된 `ChatMessage.replyTo` 카드를 누르면 `chat-message-{id}` 요소로 즉시 이동하고 1.6초 동안 강조한다. 원문이 현재 100개 히스토리에 없으면 입력창 안내를 표시한다.

`components/minigame/MiniGameOverlay`는 서버 `miniGameStart`를 전체 화면 overlay로 렌더링한다. 준비 뒤 키보드와 pointer 조이스틱의 축 변경은 `miniGameInput`, Space·Enter·터치 타격은 `miniGameAction`으로 즉시 전송한다. 단조는 난이도·원 정확도·보정 품질을 표시하고 첫 사용자 타격 이후 Web Audio 접근 cue와 충격음을 재생한다. 낚시는 공용 `createFishingCaptureProof()`로 성공/실패 frame의 client elapsed, 불변 입력, 100ms 간격+최종 그물·물고기·게이지 궤적을 만들어 `miniGameResult.fishingProof`에 넣는다. 가마솥 추적은 768×768 WebP 배경 위 4.5~6 반경 목표를 최초 primary pointerdown한 순간에만 `miniGameReady`를 보내고, 최초 down을 보존한 20ms 절대 pointer trace와 100ms 목표·pointer·게이지 궤적을 `createAlchemyTrackingProof()`로 만들어 `miniGameResult.alchemyTrackingProof`에 넣는다. 위험 회피·단조 결과는 기존 session/token만 보내며, proof의 궤적·경과 시간·최종 성공 권한은 서버 재생 검증에 있다.

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
| `ImageNode` / `ImageViewer` | `components/chat/nodes/ImageNode.tsx`, `ImageViewer.tsx` | 원본 비율로 말풍선 크기를 맞추고, 클릭 시 전체 화면 portal에서 커서 기준 wheel 확대·drag와 모바일 pinch·한 손가락 이동 제공 |
| `DividerNode` | `components/chat/nodes/DividerNode.tsx` | 선택적 가운데 제목을 가진 반응형 구분선 |
| `WorldMapNode` | `components/chat/nodes/WorldMapNode.tsx` | worldMap snapshot의 방문 장소 대표색 바이옴 레이어, SVG 경로·점·랜드마크와 wheel/drag/pinch 카메라, 장소 정보 card 표시 |

## 공용 오버레이 API

| API | 위치 | 용도 |
| --- | --- | --- |
| `Dialog` | `components/dialog/Dialog.tsx` | portal 기반 접근 가능한 공용 화면 오버레이, Escape/배경 닫기와 포커스 복원 |
| `FormDialog` | `components/dialog/FormDialog.tsx` | 필드 정의 배열로 text/number/select/textarea/checkbox 입력 및 비동기 실행 UI 생성. 필수 select는 첫 option을 기본 선택 |
| `SearchableSelect` | `components/dialog/SearchableSelect.tsx` | label·코드·설명 검색과 viewport 기준 위/아래 배치, Dialog overflow 밖 portal 목록을 제공하는 공용 combobox |
| `DisplaySettingsDialog` | `components/DisplaySettingsDialog.tsx` | 햄버거 메뉴에서 60~200% 페이지 확대율을 5% 단위로 선택하고 적용 |

`AdminPage`는 이 API로 플레이어·월드 action 입력을 구성한다. 상세·검사 목록은 viewport 내부 스크롤을 사용하고 PC의 중앙 모달은 모바일에서 viewport 폭의 하단 시트로 바뀐다.

`utils/displayPreferences.ts`는 `getUiScale/setUiScale/initializeUiScale` 공개 API와 허용 범위를 소유한다. `main.tsx`가 React 렌더 전에 저장 배율을 CSS `zoom` 변수로 복원하므로 body portal인 Dialog·미니게임까지 같은 배율을 사용한다. Drawer의 전체화면 버튼은 표준 Fullscreen API와 WebKit 호환 API를 사용자 클릭 안에서 호출하고 미지원·권한 거절을 화면에 안내한다.

## 클라이언트 검증 API

`utils/validators.ts`는 `validateId`, `validatePassword`, `validateEmail`, `validateNickname`을 제공한다. 이는 즉시 UI 피드백용이며 서버의 같은 이름 validator가 최종 검증을 수행한다.

## 게임 안내 라우트

`/guide`의 `GameGuide`는 별도 서버 데이터를 복제하지 않는 정적 사용 안내 화면이다. `Drawer`의 `게임 안내` 버튼으로 진입하고 `게임으로 돌아가기`로 `/home`에 복귀한다. PC에서는 장/문서 계층을 왼쪽 고정 목차로, 모바일에서는 가로 장 탭과 문서 이전/다음 버튼으로 탐색한다. 실제 수치나 마스터 데이터 목록이 아니라 안정적인 입력 흐름과 시스템 개념만 설명하며, 명령 별칭이나 기능 계약이 바뀌면 같은 변경에서 문구를 갱신한다.

## 확장 원칙

- Context가 소유한 raw state를 다른 기능이 localStorage나 내부 구조로 직접 수정하지 않는다. 필요한 동작은 Context value에 가장 작은 목적형 함수를 추가한다.
- 서버 상태를 새로 표시할 때는 공유 payload → Socket listener → 상태 소유 Context → 표시 컴포넌트 순서로 연결한다.
- 새 UI primitive를 만들기 전에 기존 component, chat node, HUD API와 SCSS token/mixin을 먼저 확인한다.
