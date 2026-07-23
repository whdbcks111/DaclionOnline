# Components Overview

페이지에서 조합하는 공용 UI를 둔다.

- `Header`: 채널명과 접속 인원.
- `Drawer`: 프로필/닉네임/채널/HUD 설정, 계층형 게임 안내·일별 패치노트 화면 진입과 권한 10 관리자 새 탭 진입.
- `Notification`: 서버 알림과 연결 상태 표시.
- `ThemeToggle`: 전역 테마 전환.
- `chat/`: ChatNode와 명령 자동완성.
- `hud/`: 배치 가능한 게임 HUD.
- `dialog/`: portal 기반 공용 Dialog와 필드 정의형 FormDialog. 필수 select는 첫 option을 초기값으로 사용한다.
- `minigame/`: 서버 세션 기반 전체 화면 미니게임 renderer. 낚시는 PC 키보드와 모바일 아날로그 조이스틱의 20ms 병합 입력 trace, 등급·0~100% 단색 변화 포획 게이지·채집 영역을 표시한다.

컴포넌트 계약이나 하위 폴더 책임이 바뀌면 이 문서와 관련 시스템 문서를 갱신한다. 스타일 변경은 모바일/PC 양쪽 반응형 동작을 확인한다.
