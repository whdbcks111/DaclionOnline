# Chat Components Overview

`ChatMessage.tsx`가 `ChatNode` tree를 재귀 렌더링하고, 최상위 image가 있으면 원본 비율에 맞춰 메시지 본문도 함께 줄인다. `CommandAutocomplete.tsx`는 `utils/commandAutocomplete.ts`에서 판정한 슬래시 명령 및 첫 단어가 정확한 명령 별칭인 입력의 후보·키보드 선택 UI를 렌더링한다. `nodes/`에는 높이를 `34vh/320px` 이내로 제한하는 이미지, tooltip, 제목 선택형 구분선과 인터랙티브 월드 지도를 포함한 노드 타입별 renderer가 있다.

`WorldMapNode`는 방문 장소 각각을 독립된 색상 씨앗으로 만들고 지도 아래의 저해상도 Canvas에 연속된 바이옴 색상장을 렌더링한다. 각 픽셀은 모든 위치 씨앗까지의 거리에 역제곱 가중치를 적용해 색을 동시에 합산한다. 가장 가까운 두 거리의 차이 비율은 최근접 씨앗 색의 추가 강조량만 결정하므로 최근접·차최근접 후보가 바뀌어도 보간 대상 자체가 교체되지 않는다. 따라서 장소 중심에서는 같은 색 위치들이 자연스럽게 힘을 합치고 다른 바이옴으로 갈수록 지도 전체에서 경계 없이 연속적으로 혼합된다. Canvas는 현재 viewBox와 함께 다시 그려져 이동·확대 후에도 빈 영역이 없다. 장소 이름은 지도 확대 배율을 역보정해 화면에서 같은 크기를 유지하고 전용 글자 확대·축소 버튼으로만 크기를 바꾼다. 미방문 장소 자체의 색은 렌더링하지 않는다.

ChatNode union, 색상 token, 자동완성 메타데이터/선택 로직이 바뀌면 이 문서와 [`docs/systems/chat-command.md`](../../../../docs/systems/chat-command.md), 공유 타입을 갱신한다.
