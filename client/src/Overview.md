# Client Source Overview

`main.tsx`가 앱을 mount하고 `App.tsx`가 전역 provider와 라우트를 구성한다.

- `pages/`: 라우트 단위 화면과 화면 상태 조정.
- `components/`: 재사용 UI, 채팅 renderer, HUD.
- `context/`: Socket/session, theme, HUD 공유 상태.
- `styles/`: 전역 SCSS token/mixin/theme.
- `utils/`, `hooks/`, `types/`: 클라이언트 지원 코드.
- `shared`: 루트 `shared/`를 가리키는 심볼릭 링크.

최상위 provider, 라우트, 디렉터리 책임이 바뀌면 이 문서와 [`docs/architecture/overview.md`](../../docs/architecture/overview.md)를 갱신한다.
