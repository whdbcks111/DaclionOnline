# Prisma Overview

`schema.prisma`가 User, Player, Item, Equipment, PlayerProgress, PlayerSkill의 영속 스키마와 관계·인덱스를 정의한다. `migrations/0_init`은 기존 DB baseline이며 이후 디렉터리는 순차 변경을 담는다. `20260715000000_add_progress_and_skills`가 범용 진행 상태와 스킬 인스턴스 테이블을, `20260717000000_add_skill_experience`가 플레이어 스킬 경험치 필드를 추가한다. 생성 클라이언트는 `server/src/generated/prisma`를 대상으로 한다.

운영 배포는 `npm run db:migrate:deploy`로 pending migration 적용, Client 생성, item metadata delta 데이터 변환을 한 번에 수행한다. 기존 DB의 최초 baseline 등록과 빈 DB 적용 절차는 [`README.md`](README.md)를 따른다.

모델, 필드, 관계, 기본값 또는 인덱스가 바뀌면 이 문서와 [`docs/data/database.md`](../../docs/data/database.md), 관련 모델의 load/save 코드를 갱신한다.
