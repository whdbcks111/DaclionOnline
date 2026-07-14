# Shared Templates Overview

서버 `modules/mail.ts::loadTemplate()`가 읽는 HTML 메일 템플릿을 둔다. 현재 `verify-code.html`은 `{{code}}`, `{{expiry}}` 변수를 사용한다.

템플릿 이름, 변수, 메일 표현이 바뀌면 호출부와 이 문서를 함께 갱신하고 민감한 값을 템플릿에 하드코딩하지 않는다.
