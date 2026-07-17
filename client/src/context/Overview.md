# Context Overview

- `SocketContext.tsx`: Socket.io 연결, 연결 상태, 현재 SessionInfo와 프로필/닉네임 갱신 API.
- `ThemeContext.tsx`: light/dark theme 상태와 persistence.
- `HudContext.tsx`: PlayerStatus/Party/Location/Minimap HUD 설정, nullable 파티와 스킬 snapshot을 포함한 서버 상태 payload, global/per-HUD 표시 옵션, quick slot과 개별 스킬 버튼 표시·좌표의 localStorage persistence. `skillHudConfig.ts`가 화면 폭별 기본 스킬 버튼 격자 좌표를 계산한다.

Context value는 소비자가 raw state를 우회 변경하지 않도록 목적별 함수 API로 제공한다. 상태 소유권이나 공개 API가 바뀌면 이 문서와 관련 시스템 문서를 갱신한다.
