# Context Overview

- `SocketContext.tsx`: Socket.io 연결, 연결 상태, 현재 SessionInfo와 프로필/닉네임 갱신 API. 연결·화면 표시·focus·실제 포인터/키 입력 때 `focused | visible | hidden` 상태를 서버에 보내 다중 접속 중 현재 조작 화면을 식별한다.
- `GameAudioContext.tsx`, `gameAudioContextValue.ts`, `useGameAudio.ts`: Home/HUD의 가공된 장소 대표색과 서버 실제 교전 상태를 Tone 기반 적응형 음악 엔진에 전달하고 UI에는 음량 목적형 hook만 공개한다. 동일 장소·전투 단계 snapshot은 재전환하지 않으며, 첫 실제 pointer·keyboard·touch 입력에서만 오디오를 시작한다. 0~100 배경음악 음량은 기기 localStorage에 저장하고 숨김·비활성·연결 끊김 탭은 저장값을 바꾸지 않은 채 fade out한다.
- `ThemeContext.tsx`: light/dark theme 상태와 persistence.
- `HudContext.tsx`: PlayerStatus/TargetStatus/Party/Location/Minimap HUD 설정, nullable 파티·현재 대상과 스킬 snapshot을 포함한 서버 상태 payload, global/per-HUD 표시 옵션, 위치 HUD 오브젝트·NPC 행동 버튼과 미니맵 이동 목록 표시 API, quick slot과 공격·스킬·아이템 버튼 표시·좌표·전용 크기의 계정별 localStorage persistence. 이름 있는 서버 프리셋은 목록만 자동 조회하고 `saveHudPreset/loadHudPreset/deleteHudPreset` 호출 때만 저장·적용·삭제한다. 위치 편집은 4/8/16/32/64px의 2의 거듭제곱 그리드 스냅을 공통 제공하며, 전투 퀵 버튼도 X/Y `%`·`px` 단위와 네 모서리 좌표 기준점을 Context API로 변경한다. 안정 viewport는 모바일 키보드 높이와 인게임 UI 배율을 함께 보정한다. `skillHudConfig.ts`가 기본 공격 ID와 화면 폭별 기본 전투 버튼 격자 좌표를 제공한다.

Context value는 소비자가 raw state를 우회 변경하지 않도록 목적별 함수 API로 제공한다. 상태 소유권이나 공개 API가 바뀌면 이 문서와 관련 시스템 문서를 갱신한다.
