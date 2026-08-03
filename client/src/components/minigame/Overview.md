# Minigame Components Overview

서버가 발급한 일회성 미니게임 세션을 React 오버레이로 실행한다.

- `MiniGameOverlay.tsx`: 현재 조작 중인 연결 하나에만 오는 `miniGameStart`의 구분된 타입·파라미터를 렌더링한다. 이동 축 변화와 단조 타격은 준비 뒤 즉시 서버에 전송한다. 낚시는 종료 frame의 불변 입력 snapshot으로 100ms 간격+최종 그물·물고기·게이지 proof를 만든다. 가마솥 추적은 시작 화면에서 시계를 멈추고 최초 목표 원 안을 pointerdown했을 때만 `miniGameReady`를 보내며, primary pointer capture의 절대 좌표·drag 상태와 100ms 목표·pointer·게이지 궤적 proof를 제출한다. 가마솥에는 재료 config가 고른 궤도·팔자·네잎·나선·번개 전체 경로와 seed 기반 이동 목표, 현재 pointer·게이지·추적 정확도를 표시한다. 미니게임 진입과 터치 조작은 채팅 입력 포커스를 해제한다. 모바일 조이스틱은 중앙의 큰 정지 구역과 같은 속도의 8방향 입력을 사용하며 실제 렌더링 너비·높이를 각각 정규화해 Safari의 비정사각형 좌표에서도 방향이 어긋나지 않는다. 위험 회피는 서버가 전달한 실제 패턴명·시간과 폭탄·레이저, 단조는 번호가 붙은 이동 note·시간 guide·난이도·현재 판정 정확도·난도 보정 예상 품질·콤보를 표시한다. 최종 성공은 궤적 proof 또는 서버 수신 trace를 서버가 공용 simulator로 재생해 확정한다.
- `MiniGameOverlay.module.scss`: 테마 단색 면과 얇은 경계를 사용한 정사각형 보드와 단조 lane, glow 없는 채집/위험 영역, 모바일 첫 진입 비용을 줄인 768×768 WebP 가마솥 배경과 액체 경계·SVG 추적선·목표/pointer 원, 수정 청록·지핵 주황·성계 보라 위험 패턴, 명시적 정사각형 플레이어 토큰·조이스틱, 좌측 기준 transform 게이지, PC 키보드 안내와 터치 조작을 viewport에 맞춰 재배치한다. 전체 화면 backdrop과 panel 상한은 인게임 배율을 역보정한 viewport를 채운다. 모바일 단조 lane은 더 짧은 선행 시간과 작은 번호 note로 연타 간격을 분리한다.

새 미니게임 타입은 공유 DTO, 서버 validator와 이 폴더의 타입별 renderer를 함께 추가한다.
