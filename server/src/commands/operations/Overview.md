# Operations Commands

관리자 도구, 밸런스 진단, 패치노트처럼 운영자 또는 운영 정보 중심 명령을 둔다. `admin.ts`, `balance.ts`, `patchNotes.ts`와 명령 회귀 테스트가 이 경계를 구성한다.

관리 기능은 클라이언트 노출 여부와 무관하게 서버에서 권한을 다시 검사한다.
