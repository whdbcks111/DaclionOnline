# Config Overview

외부 인프라 클라이언트 설정을 둔다. 현재 `prisma.ts`가 환경 변수의 `DATABASE_URL`로 MariaDB adapter와 PrismaClient를 만들어 export한다.

DB provider, 연결 방식, 환경 변수 또는 공용 인프라 클라이언트가 바뀌면 이 문서와 [`docs/data/database.md`](../../../docs/data/database.md)를 갱신한다.
