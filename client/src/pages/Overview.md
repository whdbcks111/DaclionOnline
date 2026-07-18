# Pages Overview

라우트 단위 화면과 해당 화면의 이벤트 wiring을 담당한다.

- `Login.tsx`, `Register.tsx`: 인증/이메일 인증 UI.
- `Home.tsx`: 채팅, 채널, 슬래시 명령·슬래시 없는 별칭의 명령/인자 자동완성, `@온라인닉네임` 귓속말 자동완성, HUD 데이터의 중심 조정자. `playerStats/locationInfo`는 `syncId/revision`을 비교해 오래되거나 중복된 snapshot을 버리고 전체 상태만 교체한다. 서버가 시작한 `MiniGameOverlay`도 마운트한다. 입력창 왼쪽 미디어 버튼은 모바일/PC의 `image/*` 파일 선택기를 열고 인증 HTTP 업로드 성공 후 이미지 소켓 메시지를 전송한다. 전송 옆 공개/비공개 버튼은 서버의 정보 열람 모드와 동기화한다. 텍스트 메시지 전송 시 contenteditable 포커스를 유지해 모바일 키보드가 닫히거나 깜빡이지 않게 한다.
- `LocationEditor.tsx`: 권한 10 사용자를 위한 위치 그래프·지도 랜드마크 `mapIcon`·대표색 `mapColor`·`namespace:path` 태그·`monster | resource` 통합 오브젝트·NPC ID 배치 편집기. 상단 뒤로가기는 관리자 페이지로 돌아간다.
- `AdminPage.tsx`: 권한 10 운영자의 온라인 우선 플레이어 목록, viewport 내부 스크롤 상세 검사, 자원별 전용 상태 bar, 카테고리별 플레이어/월드 action과 보유 스킬 레벨 설정, 전체 채팅·알림 공지와 선택 플레이어 알림, 위치 편집기 진입. 별도 밸런스 탭은 검색 가능한 FormDialog로 스킬·직업·장비/버프 아이템 분석을 실행하고 긴 결과만 스크롤 Dialog로 표시한다. 일반 액션 결과는 기본 notification으로 표시하고 PC 다열 배치를 모바일에서 가로 플레이어 목록과 세로 패널로 재배치하며, 좁은 작업 패널의 카테고리 탭은 글자를 자르지 않고 가로 스크롤한다.
- 각 `*.module.scss`: 해당 화면 범위 스타일.

라우트 흐름, 소켓 emit/on, 화면 책임이 바뀌면 이 문서와 [`docs/api/socket-events.md`](../../../docs/api/socket-events.md) 또는 관련 시스템 문서를 갱신한다.
