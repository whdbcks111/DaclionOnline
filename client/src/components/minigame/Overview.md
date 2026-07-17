# Minigame Components Overview

서버가 발급한 일회성 미니게임 세션을 React 오버레이로 실행한다.

- `MiniGameOverlay.tsx`: `miniGameStart`의 타입·파라미터를 렌더링하고 키보드/모바일 조이스틱 입력 trace를 수집해 `miniGameResult`로 반환한다. 낚시 화면은 공유 결정론 시뮬레이터로 물고기·채집 영역·게이지를 표시하며 최종 성공 판정은 서버가 같은 trace를 재생해 확정한다.
- `MiniGameOverlay.module.scss`: 정사각형 수면 보드, 등급/게이지, PC 키보드 안내와 터치 환경 조이스틱을 viewport에 맞춰 재배치한다.

새 미니게임 타입은 공유 DTO, 서버 validator와 이 폴더의 타입별 renderer를 함께 추가한다.
