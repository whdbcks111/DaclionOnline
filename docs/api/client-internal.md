# 클라이언트 내부 API 인덱스

클라이언트 기능은 전역 상태를 Context API로, 표현은 컴포넌트로 나눈다. 소비자는 Context 내부 state나 localStorage를 우회하지 말고 아래 목적형 API를 사용한다.

## Context와 hook

| API | 반환/기능 | 주 소비자 |
| --- | --- | --- |
| `useSocket()` | `socket`, `isConnected`, `sessionInfo`, `updateProfileImage`, `updateNickname` | App, 인증 화면, Home, 알림, 채팅 button, quick slot |
| `useTheme()` | 현재 theme와 theme 변경 API | `ThemeToggle` 및 테마 소비 UI |
| `useHud()` | HUD 설정/편집 API, playerStats/locationInfo, 표시 옵션, quick slot API | Home, HudContainer, HudSettings, 개별 HUD |

`useHud()`의 설정 API는 `setVisible`, `setPosition`, `setAnchor`, `setPosUnit`, `setPosAnchor`, `setHudOpacity`, `setHudScale`, `resetPosition`이다. 퀵슬롯은 `addQuickSlot`, `removeQuickSlot`, `moveQuickSlot`, `updateQuickSlot`으로만 변경한다.

## 채팅 UI API

| API | 위치 | 용도 |
| --- | --- | --- |
| `renderNode(node, key)` | `components/chat/ChatMessage.tsx` | ChatNode별 renderer dispatch |
| `resolveColor(color)` | `components/chat/ChatMessage.tsx` | `$token` 또는 CSS color 해석 |
| `getFilteredCommands(commands, filter)` | `components/chat/CommandAutocomplete.tsx` | 명령 이름/별칭 prefix 필터 |
| `HideCloseContext` | `components/chat/nodes/HideNode.tsx` | close button이 상위 hide UI를 닫는 callback |
| `TooltipNode` | `components/chat/nodes/TooltipNode.tsx` | hover/touch 위치를 측정해 ChatNode 설명 overlay 표시 |

## 클라이언트 검증 API

`utils/validators.ts`는 `validateId`, `validatePassword`, `validateEmail`, `validateNickname`을 제공한다. 이는 즉시 UI 피드백용이며 서버의 같은 이름 validator가 최종 검증을 수행한다.

## 확장 원칙

- Context가 소유한 raw state를 다른 기능이 localStorage나 내부 구조로 직접 수정하지 않는다. 필요한 동작은 Context value에 가장 작은 목적형 함수를 추가한다.
- 서버 상태를 새로 표시할 때는 공유 payload → Socket listener → 상태 소유 Context → 표시 컴포넌트 순서로 연결한다.
- 새 UI primitive를 만들기 전에 기존 component, chat node, HUD API와 SCSS token/mixin을 먼저 확인한다.
