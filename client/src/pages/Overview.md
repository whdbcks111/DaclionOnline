# Pages Overview

라우트 단위 화면과 해당 화면의 이벤트 wiring을 담당한다.

- `Login.tsx`, `Register.tsx`: 인증/이메일 인증 UI.
- `Home.tsx`: 채팅, 채널, 명령 자동완성, HUD 데이터의 중심 조정자.
- `LocationEditor.tsx`: 권한 10 사용자를 위한 위치 그래프·`namespace:path` 태그 편집기.
- 각 `*.module.scss`: 해당 화면 범위 스타일.

라우트 흐름, 소켓 emit/on, 화면 책임이 바뀌면 이 문서와 [`docs/api/socket-events.md`](../../../docs/api/socket-events.md) 또는 관련 시스템 문서를 갱신한다.
