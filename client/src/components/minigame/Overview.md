# Minigame Components Overview

서버가 발급한 일회성 미니게임 세션을 React 오버레이로 실행한다.

- `MiniGameOverlay.tsx`: `miniGameStart`의 구분된 타입·파라미터를 렌더링한다. 이동형 게임은 키보드/모바일 조이스틱 축을 20ms 구간별로 합치고 `forge_rhythm`은 Space·Enter·터치 타격 시각을 action trace로 기록한다. 낚시는 물고기·채집 영역·게이지, 위험 회피는 서버가 전달한 실제 패턴명·시간과 폭탄·레이저, 단조는 이동 note·난이도·정확도·난도 보정 예상 품질·콤보를 표시한다. 첫 사용자 타격 후 Web Audio의 접근 cue와 망치 충격음을 재생하되 성공 판정은 서버의 같은 공유 시뮬레이터가 확정한다.
- `MiniGameOverlay.module.scss`: 테마 단색 면과 얇은 경계를 사용한 정사각형 보드와 단조 lane, glow 없는 채집/위험 영역, 수정 청록·지핵 주황·성계 보라 위험 패턴, 좌측 기준 transform 게이지, PC 키보드 안내와 터치 조작을 viewport에 맞춰 재배치한다.

새 미니게임 타입은 공유 DTO, 서버 validator와 이 폴더의 타입별 renderer를 함께 추가한다.
