# Components Overview

페이지에서 조합하는 공용 UI를 둔다.

- `Header`: 채널명과 접속 인원.
- `Drawer`: 프로필/닉네임/채널/HUD 설정과 권한 10 관리자 새 탭 진입.
- `Notification`: 서버 알림과 연결 상태 표시.
- `ThemeToggle`: 전역 테마 전환.
- `chat/`: ChatNode와 명령 자동완성.
- `hud/`: 배치 가능한 게임 HUD.
- `dialog/`: portal 기반 공용 Dialog와 필드 정의형 FormDialog. 필수 select는 첫 option을 초기값으로 사용한다.

컴포넌트 계약이나 하위 폴더 책임이 바뀌면 이 문서와 관련 시스템 문서를 갱신한다. 스타일 변경은 모바일/PC 양쪽 반응형 동작을 확인한다.
