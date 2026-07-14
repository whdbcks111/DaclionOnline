# Config Overview

외부 인프라 클라이언트 설정을 둔다. 현재 `prisma.ts`가 `.env`를 먼저 로드하고 `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`으로 MariaDB adapter와 PrismaClient를 만들어 export한다. Prisma CLI는 별도의 `prisma.config.ts`에서 `DATABASE_URL`을 사용한다.

DB provider, 연결 방식, 환경 변수 또는 공용 인프라 클라이언트가 바뀌면 이 문서와 [`docs/data/database.md`](../../../docs/data/database.md)를 갱신한다.
