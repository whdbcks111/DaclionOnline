# Context Overview

- `SocketContext.tsx`: Socket.io 연결, 연결 상태, 현재 SessionInfo와 프로필/닉네임 갱신 API.
- `ThemeContext.tsx`: light/dark theme 상태와 persistence.
- `HudContext.tsx`: HUD 설정, 서버 상태 payload, global/per-HUD 표시 옵션, quick slot의 localStorage persistence.

Context value는 소비자가 raw state를 우회 변경하지 않도록 목적별 함수 API로 제공한다. 상태 소유권이나 공개 API가 바뀌면 이 문서와 관련 시스템 문서를 갱신한다.
