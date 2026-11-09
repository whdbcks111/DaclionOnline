# Client Overview

React 19, Vite, React Router, Socket.io-client, SCSS Modules 기반 웹 게임 클라이언트 패키지다.

- `src/`: 화면, 상태, UI와 스타일 소스.
- `public/`: 그대로 제공되는 아이콘/정적 파일.
- `vite.config.ts`, `tsconfig*.json`: 빌드, alias, 타입 설정.
- `SCSS_GUIDE.md`, `DARKMODE_GUIDE.md`: 기존 스타일 참고 문서.

클라이언트 구성이나 실행 방식이 바뀌면 이 문서와 [`docs/development.md`](../docs/development.md)를 갱신한다.

포털 화면은 `src/portal/`, DaclionOnline 화면은 `src/games/daclion/`에 둔다. 게임 화면은 lazy import로 분리해 포털 첫 로딩에서 전투 UI와 오디오를 로드하지 않는다.
