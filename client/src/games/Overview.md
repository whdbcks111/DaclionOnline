# Game Clients

게임별 화면 진입점을 둔다. `daclion/`은 DaclionOnline의 입장, 채팅 게임 화면, 안내, 패치노트와 관리자 화면을 소유한다. 새 게임은 별도 하위 폴더와 Overview를 만들고 App에 `/games/{gameId}/` 경로로 등록한다. 계정 인증은 `portal/`과 `context/SocketContext`를 재사용한다.

`seed-walk/`은 Phaser 기반 SEED WALK의 로비·실시간 플레이·시드 선택과 조작을 소유한다. `/games/seed-walk/`에서 기존 GAME BOX 세션을 사용하고 별도 가입은 요구하지 않는다.

`test2/`는 사이드뷰 멀티플레이 점프맵 진입점이다. 두 Phaser 게임의 UI와 Scene은 `components/realtime-game/`에서 공유한다.
