# Auth Modules

가입, 로그인·세션, 비밀번호 재설정과 사람 확인을 소유한다. 인증 정보처럼 즉시 확정되어야 하는 데이터는 명시적 DB 작업과 트랜잭션을 사용하며 세션 검증을 다른 module이 재사용할 수 있게 공개한다.

Socket handshake 자체는 `modules/infrastructure/socket.ts`가 담당한다.
