# Infrastructure Modules

Socket 조립, 게임 루프, scheduler/coroutine, 상태 동기화, 업로드, 서버 부팅 기록과 마스터 데이터 검증을 소유한다. 특정 도메인 규칙은 이 폴더에 넣지 않고 여기서는 초기화·주기 실행·외부 경계만 조립한다.

초기화 순서 변경은 [`../../index.ts`](../../index.ts)와 아키텍처 문서를 함께 갱신한다.
