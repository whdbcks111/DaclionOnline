# Server Overview

Express, Socket.io, Prisma/MariaDB 기반의 권위 있는 게임 서버 패키지다.

- `src/`: 서버 애플리케이션과 게임 코드.
- `prisma/`: Prisma 스키마.
- `database/`: SQL 스키마 참고 자료.
- `uploads/`: 런타임 업로드 저장소.
- `tsconfig.json`, `package.json`: ESM TypeScript 빌드와 실행 설정.

서버 구성이나 실행 방식이 바뀌면 이 문서와 [`docs/development.md`](../docs/development.md)를 갱신한다.

공통 계정 모듈은 `src/modules/portal/`이며 기존 User ID를 재사용한다. 운영 배포 명령은 게임 프로필 자동 이전을 포함한다. PM2는 server 작업 디렉터리와 `dist/server/src/index.js` 빌드 경로를 사용한다.
