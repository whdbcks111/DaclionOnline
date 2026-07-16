# Pages Overview

라우트 단위 화면과 해당 화면의 이벤트 wiring을 담당한다.

- `Login.tsx`, `Register.tsx`: 인증/이메일 인증 UI.
- `Home.tsx`: 채팅, 채널, 슬래시 명령·슬래시 없는 별칭의 명령/인자 자동완성, HUD 데이터의 중심 조정자. 메시지 전송 시 contenteditable 포커스를 유지해 모바일 키보드가 닫히거나 깜빡이지 않게 한다.
- `LocationEditor.tsx`: 권한 10 사용자를 위한 위치 그래프·지도 랜드마크 `mapIcon`·`namespace:path` 태그·`monster | resource` 통합 오브젝트·NPC ID 배치 편집기.
- 각 `*.module.scss`: 해당 화면 범위 스타일.

라우트 흐름, 소켓 emit/on, 화면 책임이 바뀌면 이 문서와 [`docs/api/socket-events.md`](../../../docs/api/socket-events.md) 또는 관련 시스템 문서를 갱신한다.
