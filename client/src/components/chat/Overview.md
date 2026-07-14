# Chat Components Overview

`ChatMessage.tsx`가 `ChatNode` tree를 재귀 렌더링하고, `CommandAutocomplete.tsx`가 명령/인자 후보와 키보드 선택 UI를 제공한다. `nodes/`에는 tooltip을 포함한 노드 타입별 renderer가 있다.

ChatNode union, 색상 token, 자동완성 메타데이터/선택 로직이 바뀌면 이 문서와 [`docs/systems/chat-command.md`](../../../../docs/systems/chat-command.md), 공유 타입을 갱신한다.
