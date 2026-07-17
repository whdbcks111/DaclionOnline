# Pages Overview

라우트 단위 화면과 해당 화면의 이벤트 wiring을 담당한다.

- `Login.tsx`, `Register.tsx`: 인증/이메일 인증 UI.
- `Home.tsx`: 채팅, 채널, 슬래시 명령·슬래시 없는 별칭의 명령/인자 자동완성, `@온라인닉네임` 귓속말 자동완성, HUD 데이터의 중심 조정자. 전송 옆 공개/비공개 버튼은 서버의 정보 열람 모드와 동기화한다. 메시지 전송 시 contenteditable 포커스를 유지해 모바일 키보드가 닫히거나 깜빡이지 않게 한다.
- `LocationEditor.tsx`: 권한 10 사용자를 위한 위치 그래프·지도 랜드마크 `mapIcon`·대표색 `mapColor`·`namespace:path` 태그·`monster | resource` 통합 오브젝트·NPC ID 배치 편집기.
- `AdminPage.tsx`: 권한 10 운영자의 온라인 우선 플레이어 목록, 상세 검사, 카테고리별 플레이어/월드 action, 전체 채팅·알림 공지와 선택 플레이어 알림, 위치 편집기 진입. PC 다열 배치를 모바일에서 가로 플레이어 목록과 세로 패널로 재배치한다.
- 각 `*.module.scss`: 해당 화면 범위 스타일.

라우트 흐름, 소켓 emit/on, 화면 책임이 바뀌면 이 문서와 [`docs/api/socket-events.md`](../../../docs/api/socket-events.md) 또는 관련 시스템 문서를 갱신한다.
