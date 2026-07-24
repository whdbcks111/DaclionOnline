# Security Components Overview

서버가 요구하는 사용자 확인 절차를 일반 게임 UI보다 높은 오버레이로 표시한다.

- `HumanVerificationOverlay.tsx`: 영속된 사람 확인 요구를 소켓으로 복원하고, 서버가 생성한 일회성 문자 이미지와 만료 시간·답안 입력을 닫을 수 없는 공용 Dialog로 제공한다.
- `HumanVerificationOverlay.module.scss`: 미니게임보다 높은 전체 화면 차단층과 모바일·PC 반응형 확인 폼을 정의한다.

정답과 판정 규칙은 클라이언트 코드에 두지 않으며, 화면을 닫거나 재접속하는 것으로 확인 상태를 해제할 수 없어야 한다.
