# Infrastructure Modules

Socket 조립, 게임 루프, scheduler/coroutine, 상태 동기화, 업로드, 서버 부팅 기록과 마스터 데이터 검증을 소유한다. 특정 도메인 규칙은 이 폴더에 넣지 않고 여기서는 초기화·주기 실행·외부 경계만 조립한다.

초기화 순서 변경은 [`../../index.ts`](../../index.ts)와 아키텍처 문서를 함께 갱신한다.

공통 계정 세션은 `modules/portal/login.ts`의 공개 API를 사용한다. 포털 로그인과 실제 게임 입장은 분리되며 게임 이름은 Player의 표시명을 사용한다.

기존 game tick이 `updateSeedWalk(dt)`를 호출해 SEED WALK를 같은 20Hz 루프에서 갱신한다. 별도 setInterval을 추가하지 않는다.

게임 루프는 `updateTest2(dt)`를 호출해 테스트2의 60Hz 고정 물리와 20Hz snapshot을 갱신한다.
