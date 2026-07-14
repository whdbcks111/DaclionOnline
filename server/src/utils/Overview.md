# Utils Overview

도메인에 종속되지 않는 서버 지원 기능을 둔다.

- `chatBuilder.ts`, `chatParser.ts`: tooltip과 숫자/상대 CSS 길이 progress를 포함한 ChatNode 생성 및 `$magic` 같은 테마 색상 token을 허용하는 커스텀 태그 파싱.
- `validators.ts`: payload 및 계정 필드 검증.
- `random.ts`: digits/hex/base64 난수.
- `logger.ts`: 범주별 컬러 콘솔 로깅.

공개 함수, 태그 문법, 검증 규칙이 바뀌면 이 문서와 관련 API/시스템 문서를 갱신한다.
