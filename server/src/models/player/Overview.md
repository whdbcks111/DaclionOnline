# Player Policy Models

HUD 프리셋, 카르마, PVP 처치 유효성처럼 Player에 귀속되지만 actor 본체와 분리 가능한 정책·부가 상태를 소유한다.

영속 snapshot은 크기와 입력을 정규화하고 Player의 dirty 저장 경계를 통해 기록한다.
