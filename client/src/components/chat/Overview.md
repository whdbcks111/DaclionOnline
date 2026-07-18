# Chat Components Overview

`ChatMessage.tsx`가 `ChatNode` tree를 재귀 렌더링하고, 최상위 image가 있으면 원본 비율에 맞춰 메시지 본문도 함께 줄인다. `CommandAutocomplete.tsx`는 `utils/commandAutocomplete.ts`에서 판정한 슬래시 명령 및 첫 단어가 정확한 명령 별칭인 입력의 후보·키보드 선택 UI를 렌더링한다. `nodes/`에는 높이를 `34vh/320px` 이내로 제한하는 이미지, tooltip, 제목 선택형 구분선과 인터랙티브 월드 지도를 포함한 노드 타입별 renderer가 있다.

`WorldMapNode`는 방문 장소를 대표색별 영역으로 묶고 발견된 연결을 넓은 캡슐형 면으로 이어 경로·노드 아래 연속된 바이옴 레이어를 만든다. 전체 바이옴 도형을 한 번에 합성해 같은 색 도형이 겹쳐도 얼룩이 생기지 않으며, 색이 다른 인접 영역은 방향성 선형 그라데이션 띠로 연결한다. 합쳐진 외곽에만 SVG 변형·페더링을 적용하고 미방문 장소는 색을 렌더링하지 않는다.

ChatNode union, 색상 token, 자동완성 메타데이터/선택 로직이 바뀌면 이 문서와 [`docs/systems/chat-command.md`](../../../../docs/systems/chat-command.md), 공유 타입을 갱신한다.
