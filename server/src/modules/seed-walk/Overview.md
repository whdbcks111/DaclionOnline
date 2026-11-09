# SEED WALK Application Module

`seedWalk.ts`는 GAME BOX 세션을 검증해 `SeedWalkWorld`를 생성·조회하고 시드별 Socket.io room에 참가시킨다. 이벤트는 `seedWalkJoin/seedWalkInput/seedWalkLeave`, 결과는 `seedWalkJoined/seedWalkState`다. nickname과 userId는 세션에서만 결정한다. 최대 16개 활성 맵, 맵별 32명이며 마지막 사용자가 나가면 맵을 제거한다. 한 계정이 서로 다른 시드에 여러 탭으로 접속하는 것은 거절한다.

`initSeedWalk()`는 Socket.io 초기화 이후 호출한다. `updateSeedWalk(dt)`는 기존 서버 게임 루프에서 호출하며 50ms 고정 step과 완전한 volatile snapshot을 사용한다. 네트워크 입력은 [-1,1] 범위의 유한 방향축, 증가 seq, 연결 소유권과 요청 빈도를 검증한다. 연결 종료·로그아웃·세션 폐기는 참가를 제거한다. DaclionOnline Player를 생성하거나 게임 접속자에 포함하지 않는다.

모든 상태는 의도적으로 비영속이다. 위치를 DB에 저장하지 않으며 재시작·재접속 시 중앙에서 다시 시작한다. 월드는 비어 있으면 폐기해도 같은 seed/version의 지형을 정확히 재생성할 수 있다. 테스트는 결정론/충돌/다중 탭과 실제 두 Socket.io 클라이언트의 이동·퇴장을 검증한다.
