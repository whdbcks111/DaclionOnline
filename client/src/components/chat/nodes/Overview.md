# Chat Node Renderers Overview

서버가 보낸 ChatNode를 시각 요소로 변환한다. Color, Bg, Deco, Weight, Size, Icon, Button, Hide, Progress, Tab, Tooltip renderer가 있으며 Button은 `chatButtonClick`을 emit할 수 있다. Icon은 name을 `/icons/{name}.png`로 해석하고 없는 에셋은 숨긴다. Progress는 숫자 px 또는 `em` 같은 상대 CSS 길이를 지원한다. Tooltip은 hover/touch 위치를 측정해 설명 overlay를 viewport 안에 배치한다.

노드 타입을 추가·변경하면 이 폴더의 renderer, `ChatMessage.tsx::renderNode`, `shared/types.ts`, 서버 parser/builder와 이 문서를 함께 갱신한다.
