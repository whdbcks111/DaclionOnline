# Chat Components Overview

`ChatMessage.tsx`가 `ChatNode` tree를 재귀 렌더링하고, `CommandAutocomplete.tsx`가 `utils/commandAutocomplete.ts`에서 판정한 슬래시 명령 및 첫 단어가 정확한 명령 별칭인 입력의 후보·키보드 선택 UI를 렌더링한다. `nodes/`에는 tooltip과 인터랙티브 월드 지도를 포함한 노드 타입별 renderer가 있다.

`WorldMapNode`는 방문 장소의 선택적 대표색을 거리 기반 반경의 유기적인 SVG 그라데이션으로 퍼뜨려 경로·노드 아래 바이옴 레이어를 만든다. 미방문 장소는 색을 렌더링하지 않는다.

ChatNode union, 색상 token, 자동완성 메타데이터/선택 로직이 바뀌면 이 문서와 [`docs/systems/chat-command.md`](../../../../docs/systems/chat-command.md), 공유 타입을 갱신한다.
