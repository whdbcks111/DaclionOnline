# Chat Node Renderers Overview

서버가 보낸 ChatNode를 시각 요소로 변환한다. Color, Bg, Deco, Weight, Size, Icon, Button, Hide, Progress, Health, Image, Divider, Tab, Tooltip, WorldMap renderer가 있으며 Button은 `chatButtonClick`을 emit할 수 있다. Icon은 name을 `/icons/{name}.png`로 해석하고 없는 에셋은 숨긴다. Progress와 Health는 숫자 px 또는 `em` 같은 상대 CSS 길이를 지원한다. `HealthBarNode`는 현재 생명력 뒤에 흰색 일반·주황색 물리·보라색 마법 보호막을 순서대로 쌓고 최대 생명력 초과분은 상단 띠로 표시해 채팅 상태창과 HUD가 같은 표현을 재사용한다. `ImageNode`는 서버 upload URL을 개발 서버 기준으로 해석하고 메시지 너비·최대 높이 안에서 중앙 정렬한다. `DividerNode`는 제목이 없으면 단일 선, 있으면 양쪽 선 사이의 가운데 제목으로 표시한다. Tooltip은 hover/touch 위치를 측정해 설명 overlay를 viewport 안에 배치한다. WorldMap은 상세보기 안에서 가장 가까운 두 방문 바이옴의 거리 비율을 선형 보간한 Canvas 색상장과 SVG 지도를 겹쳐 렌더링하고 마우스 휠·드래그, 한 손가락 드래그·두 손가락 pinch, hover/focus/tap 정보 카드를 지원한다. 장소 이름은 지도 확대 배율과 무관한 화면 크기를 유지하며 툴바의 `A−/A＋`로 별도 확대·축소한다.

노드 타입을 추가·변경하면 이 폴더의 renderer, `ChatMessage.tsx::renderNode`, `shared/types.ts`, 서버 parser/builder와 이 문서를 함께 갱신한다.
