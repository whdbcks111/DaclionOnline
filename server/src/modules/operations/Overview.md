# Operations Modules

관리자 패널처럼 운영 권한이 필요한 애플리케이션 서비스를 둔다. 모든 조회·변경 이벤트는 서버에서 세션과 권한을 다시 확인하고 도메인 공개 API를 통해 처리한다.

운영 데이터 변환 CLI는 `server/src/scripts`에 둔다.
