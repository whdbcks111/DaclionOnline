# Portal Account Modules

`register.ts`, `login.ts`, `passwordReset.ts`는 모든 게임이 재사용하는 User 계정·메일 인증·세션·비밀번호 재설정을 소유한다. 가입과 로그인은 Player를 생성·로드하거나 게임 room에 참가하지 않는다. 기존 User ID와 비밀번호 hash/salt를 그대로 사용한다.

`gameProfile.ts`의 `getDaclionProfile/createDaclionProfile/changeDaclionNickname`은 계정과 DaclionOnline 프로필 연결을 관리한다. `(userId, gameId)`와 `(gameId, nickname)` unique 제약으로 계정별 한 캐릭터 및 게임 내 이름 중복을 검증한다. 이름 생성·변경은 즉시 확정해야 하므로 DB에 즉시 저장한다. Player 진행 상태는 기존 메모리/dirty flush 경계를 유지한다.

`socketPolicy.ts`는 포털 전용 연결이 게임 이벤트를 실행하지 못하도록 인증 이벤트만 허용한다. 입장 성공은 `modules/player/gameAccess.ts`가 결정한다. 기존 `setUserOnline/isUserOnline` API는 실제 게임 접속을 뜻하며 포털 접속은 세지 않는다. `changeNickname`은 게임 프로필과 접속 중 Player만 갱신하고 포털 세션 닉네임은 유지한다.

`loadDaclionNames(userIds)`는 이름을 일괄 로드하고 `getNickname(userId)` 조회 함수만 제공해 순위·관리자 목록에서 프로필 row를 직접 순회하지 않게 한다.

포털의 표시 이름은 `GAME BOX`이며 화면·브라우저 제목·가입/비밀번호 재설정 메일에 동일하게 사용한다.

`siteRouter.ts`는 gamebox.mcv.kr/daclion.mcv.kr의 HTTP 인증·진입 분기를 소유한다. `loginHandoff.ts`는 30초 일회용 코드를 대상 브라우저의 state에 묶으며 코드 재사용·만료·동시 발급 상한을 검증한다. `/auth/start`의 HttpOnly state 쿠키가 callback에서 일치해야 하며 로그인 토큰은 URL에 노출하지 않는다. 테스트는 실제 HTTP Host 분기와 쿠키·코드 검증을 포함한다.
