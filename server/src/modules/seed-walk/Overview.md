# SEED WALK Application Module

`seedWalk.ts`는 GAME BOX 세션을 검증해 `SeedWalkWorld`를 생성·조회하고 고정 `gamebox` Socket.io room에 참가시킨다. 이벤트는 `seedWalkJoin/seedWalkInput/seedWalkLeave`, 결과는 `seedWalkJoined/seedWalkState`다. nickname과 userId는 세션에서만 결정한다. 공용 맵 하나에 최대 32명이며 마지막 사용자가 나가면 맵을 제거한다. 클라이언트의 시드 payload는 무시하고 모든 계정이 같은 맵에 참가한다.

`initSeedWalk()`는 Socket.io 초기화 이후 호출한다. `updateSeedWalk(dt)`는 기존 서버 게임 루프에서 호출하며 50ms 고정 step과 완전한 volatile snapshot을 사용한다. 네트워크 입력은 [-1,1] 범위의 유한 방향축, 증가 seq, 연결 소유권과 요청 빈도를 검증한다. 연결 종료·로그아웃·세션 폐기는 참가를 제거한다. DaclionOnline Player를 생성하거나 게임 접속자에 포함하지 않는다.

모든 상태는 의도적으로 비영속이다. 위치를 DB에 저장하지 않으며 재시작·재접속 시 중앙에서 다시 시작한다. 월드는 비어 있으면 폐기해도 같은 seed/version의 지형을 정확히 재생성할 수 있다. 테스트는 결정론/충돌/다중 탭과 실제 두 Socket.io 클라이언트의 이동·퇴장을 검증한다.

map v2는 연못·길·바위·경계벽 없는 초원이다. `seedWalkChat(text)`와 `SeedWalkWorld.say(userId, connectionId, text, now)`는 120자/계정당 3초 3회 제한의 최신 말풍선 하나를 처리하며 5초 후 기존 루프에서 만료한다. snapshot의 선택적 `player.bubble.text`만 전달하고 영속 저장·채팅 로그는 없다. 클라이언트는 Enter/모바일 채팅 버튼으로 62% 위치의 폼을 열고 입력 중 정지, IME 안전 전송·Esc 취소와 카메라 투영 DOM 말풍선을 제공한다.
