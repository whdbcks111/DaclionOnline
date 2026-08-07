# Player Modules

온라인 Player load/save registry, HUD 프리셋, 아이템 사용·공격, 정보 공개, 소모품 묶음과 스킬 돌파 서비스를 소유한다. `player.ts`가 메모리 Player의 load·dirty flush·unload 경계다.

다른 기능은 registry Map 대신 `playerRegistry.ts`와 `player.ts`의 공개 조회 API를 사용한다.
