# Prisma Overview

`schema.prisma`가 User, Player, Item, Equipment의 영속 스키마와 관계·인덱스를 정의한다. 생성 클라이언트는 `server/src/generated/prisma`를 대상으로 한다.

모델, 필드, 관계, 기본값 또는 인덱스가 바뀌면 이 문서와 [`docs/data/database.md`](../../docs/data/database.md), 관련 모델의 load/save 코드를 갱신한다.
