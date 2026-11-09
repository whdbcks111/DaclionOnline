# Game Security Modules

`humanVerification.ts`와 관련 테스트는 반복 행동 감지와 사람 확인을 소유한다. 공통 계정 가입·로그인·비밀번호 재설정은 `../portal/`로 분리했으며 세션 조회는 `../portal/login.js`의 공개 API를 사용한다. Socket handshake와 게임 이벤트 입장 검사는 `modules/infrastructure/socket.ts`가 담당한다.
