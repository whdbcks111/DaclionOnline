# Player Modules

온라인 Player load/save registry, HUD 프리셋, 아이템 사용·공격, 정보 공개, 소모품 묶음과 스킬 돌파 서비스를 소유한다. `player.ts`가 메모리 Player의 load·dirty flush·unload 경계다.

다른 기능은 registry Map 대신 `playerRegistry.ts`와 `player.ts`의 공개 조회 API를 사용한다.

`gameAccess.ts`는 공통 포털 인증 뒤 DaclionOnline 입장/최초 정보와 이탈을 처리한다. 입장 성공 전 게임 이벤트는 실행할 수 없으며 포털 로그인만으로 Player를 생성하지 않는다.

DaclionOnline 입장은 같은 socket이 SEED WALK에 참가 중이면 거절하며 DB 조회 뒤에도 참가 상태를 재확인해 비동기 입장 경합을 막는다.

DaclionOnline 입장은 같은 소켓이 SEED WALK 또는 테스트2에 참가해 있으면 거절한다.
