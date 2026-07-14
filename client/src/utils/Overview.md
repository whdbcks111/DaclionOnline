# Client Utils Overview

브라우저 측 순수 지원 함수를 둔다. 현재 `validators.ts`가 회원가입 입력에 즉시 피드백을 주는 ID/PW/email/nickname validator를 제공한다. 보안 검증의 최종 권위는 서버 validator다.

검증 규칙이 바뀌면 서버와 클라이언트 구현의 의도된 차이를 확인하고 이 문서를 갱신한다.
