# Shared Templates Overview

서버 `modules/communication/mail.ts::loadTemplate()`가 읽는 HTML 메일 템플릿을 둔다. 현재 `verify-code.html`은 `{{code}}`, `{{expiry}}` 변수를 사용한다.

템플릿 이름, 변수, 메일 표현이 바뀌면 호출부와 이 문서를 함께 갱신하고 민감한 값을 템플릿에 하드코딩하지 않는다.

가입과 비밀번호 재설정 메일은 공통 웹게임 포털 명의로 전송한다. `{{purpose}}`가 인증 용도를 구분한다.

포털의 표시 이름은 `GAME BOX`이며 화면·브라우저 제목·가입/비밀번호 재설정 메일에 동일하게 사용한다.
