# Server Types Overview

서버 내부에서만 쓰는 구조를 둔다. 현재 `index.ts`는 `Session`, 메일 옵션, 이메일 인증 상태(`VerifyEntry`)를 정의한다. 서버-클라이언트 계약은 이 폴더가 아니라 루트 `shared/types.ts`에 둔다.

내부 상태 구조가 바뀌면 이 문서를, 네트워크 payload가 바뀌면 [`docs/api/socket-events.md`](../../../docs/api/socket-events.md)도 갱신한다.
