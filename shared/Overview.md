# Shared Overview

서버와 클라이언트가 함께 사용하는 네트워크 계약과 리소스를 둔다.

- `types.ts`: 태그가 포함된 LocationData, 상대 CSS 길이도 허용하는 progress ChatNode, 메시지/채널/HUD payload, Socket.io 양방향 이벤트 map의 단일 기준.
- `tags.ts`: `namespace:path` 검증, 공용 태그 ID, raw Set을 숨기는 `TagCollection/TagReadable/TagQuery` API.
- `package.json`: 서버 빌드와 브라우저 번들에서 공용 런타임 모듈을 ESM으로 일관되게 해석한다.
- `templates/`: 서버 메일에서 읽는 HTML 템플릿.

공유 타입 변경은 서버 생산자/소비자와 클라이언트 생산자/소비자를 같은 변경에서 수정하고 [`docs/api/socket-events.md`](../docs/api/socket-events.md)와 이 문서를 갱신한다.
