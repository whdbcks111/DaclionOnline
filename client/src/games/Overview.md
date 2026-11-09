# Game Clients

게임별 화면 진입점을 둔다. `daclion/`은 DaclionOnline의 입장, 채팅 게임 화면, 안내, 패치노트와 관리자 화면을 소유한다. 새 게임은 별도 하위 폴더와 Overview를 만들고 App에 `/games/{gameId}/` 경로로 등록한다. 계정 인증은 `portal/`과 `context/SocketContext`를 재사용한다.
