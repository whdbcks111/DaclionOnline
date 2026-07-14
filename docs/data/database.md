# 데이터베이스와 영속성

Prisma 스키마는 `server/prisma/schema.prisma`, 런타임 클라이언트 설정은 `server/src/config/prisma.ts`에 있다. datasource provider는 `mysql`이며 MariaDB adapter를 사용한다.

## 모델

| 모델/테이블 | 키와 관계 | 주요 필드 |
| --- | --- | --- |
| `User` / `users` | `id`, Player 1:0..1 | username, email, passwordHash/salt, nickname, profileImage, permission, timestamps |
| `Player` / `players` | `userId` PK/FK | level, exp, maxWeight, stats JSON, locationId, life/mentality/thirsty/hungry, statPoint, gold |
| `Item` / `items` | id, Player N:1 cascade | itemDataId, count, durability, metadata JSON, timestamps |
| `Equipment` / `equipments` | id, Player N:1 cascade | itemDataId, slot, slotIndex, durability, metadata; `(playerId, slot, slotIndex)` unique |

`itemDataId`는 DB 외래키가 아니라 코드의 `data/items.ts` 마스터 데이터 ID다. `locationId`도 JSON 마스터 데이터 ID다. 마스터 ID 변경 시 기존 DB 레코드 호환을 직접 처리해야 한다.

## 로드와 저장

```text
login/session restore
  -> Player.loadByUserId
     -> Inventory.load
     -> Equipment.load
  -> online Player Map

30초 / logout / process signal
  -> Player.save
     -> player row + stats JSON
     -> Inventory.save
     -> Equipment.save
```

- Player scalar setter와 Stat/Inventory/Equipment가 dirty 상태를 추적한다.
- `fetchPlayerByUserId()`는 오프라인 Player를 DB에서 읽지만 온라인 Map에는 올리지 않는다.
- 위치 JSON, 채팅/세션/온라인 상태, 몬스터/드롭, 상점 재고는 DB에 저장되지 않는다.
- 회원가입은 User와 Player를 nested create하므로 기본 Player 레코드가 즉시 생긴다.

## 스키마 변경 체크리스트

1. `schema.prisma`와 필요한 migration/schema sync를 준비한다.
2. Player/Inventory/Equipment의 load, create, save를 모두 확인한다.
3. 기본값이 기존 레코드와 신규 레코드 모두에 안전한지 확인한다.
4. JSON 필드는 런타임 타입(`StatRecord`, item metadata)과 호환되는지 확인한다.
5. `server/database/schema.sql`을 계속 참조용으로 유지한다면 함께 동기화한다.
6. 이 문서와 관련 `Overview.md`를 갱신하고 서버 build를 실행한다.
