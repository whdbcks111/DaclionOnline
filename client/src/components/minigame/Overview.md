# Minigame Components Overview

서버가 발급한 일회성 미니게임 세션을 React 오버레이로 실행한다.

- `MiniGameOverlay.tsx`: `miniGameStart`의 구분된 타입·파라미터를 렌더링하고 키보드/모바일 조이스틱 입력을 20ms 구간별로 합쳐 전송 순간 불변 trace를 `miniGameResult`로 반환한다. 낚시는 물고기·채집 영역·게이지를, `hazard_dodge`는 5초 동안 seed 기반 폭탄·레이저 예고와 플레이어 토큰을 표시한다. 최종 판정은 서버가 같은 공유 시뮬레이터로 trace를 재생해 확정한다.
- `MiniGameOverlay.module.scss`: 테마 단색 면과 얇은 경계를 사용한 정사각형 보드, glow 없는 채집/위험 영역, 좌측 기준 transform 게이지, PC 키보드 안내와 터치 환경 조이스틱을 viewport에 맞춰 재배치한다.

새 미니게임 타입은 공유 DTO, 서버 validator와 이 폴더의 타입별 renderer를 함께 추가한다.
