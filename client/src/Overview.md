# Client Source Overview

`main.tsx`가 앱을 mount하고 `App.tsx`가 전역 provider와 게임·안내·패치노트·관리자 라우트를 구성한다.

- `portal/`: 공통 계정 인증과 게임 포털.
- `games/daclion/`: DaclionOnline 라우트와 게임 입장.
- `components/`: 재사용 UI, 채팅 renderer, HUD.
- `context/`: Socket/session, theme, HUD 공유 상태.
- `styles/`: 전역 SCSS token/mixin/theme.
- `utils/`, `hooks/`, `types/`: 클라이언트 지원 코드.
- `shared`: 루트 `shared/`를 가리키는 심볼릭 링크.

최상위 provider, 라우트, 디렉터리 책임이 바뀌면 이 문서와 [`docs/architecture/overview.md`](../../docs/architecture/overview.md)를 갱신한다.

라우트 화면은 `portal/`의 게임 목록·공통 인증과 `games/daclion/`의 게임 입장·화면으로 분리했다. `/`는 포털이며 이전 게임 경로는 호환 redirect로 유지한다.

운영 루트 화면은 hostname으로 나누며 `daclion.mcv.kr/`는 게임, `gamebox.mcv.kr/`는 포털이다. 로컬과 다른 호스트는 기존 포털 루트를 유지한다.
