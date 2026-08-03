# 시스템 우편

시스템 우편은 접속 여부와 무관하게 플레이어에게 안내와 아이템 보상을 전달하는 저빈도 영속 기능이다. 현재 범위는 시스템→플레이어 발송, 목록·읽기, 아이템 첨부 한 통/전체 수령, 완료 우편 정리다. 플레이어 간 발송, 플레이어가 임의로 만드는 첨부, 골드 첨부는 제공하지 않는다.

## 데이터와 발송

`mailbox_messages`는 수신 Player, 발신 표시, 제목·본문, 첨부 JSON, 읽음·수령·만료·archive 시각을 저장한다. 첨부 형식은 다음 version 1 payload 하나만 허용한다.

```ts
{
  version: 1,
  items: ItemSnapshot[],
}
```

한 통의 제한은 snapshot 20개, 총수량 1,000,000개, 실제 생성 Item 행 100개, JSON 32KiB다. 단일 수신자용 공개 API `sendSystemMail()`은 마스터 아이템·수량·내구도·metadata/tag JSON을 검증한다. 선택적인 `sourceKey`를 주면 `(recipientId, sourceKey)` unique 제약으로 동일 시스템 보상의 재시도를 멱등 처리한다. DB의 대소문자·Unicode collation 차이로 서로 다른 키가 충돌하지 않도록 key는 소문자 영문·숫자로 시작하고 소문자 영문, 숫자, `: _ . / -`만 쓰는 최대 150자 ASCII 문자열이어야 한다.

대량 발송 공개 API는 지정 Player ID 집합용 `sendSystemMailToRecipients(ids, input)`과 오프라인을 포함한 전체 캐릭터용 `sendSystemMailToAllPlayers(input)`이다. 대량 입력에는 `recipientId`와 `sourceKey`를 허용하지 않으며 관리자 명령을 반복 실행하면 매번 새 우편을 만든다. 제목·본문·발신자·첨부·만료 시각은 발송당 한 번만 정규화한 뒤 모든 수신 행에 같은 snapshot을 사용한다.

## 대량 발송 원자성

`sendSystemMailToRecipients()`는 양의 Player ID만 받고 정렬·중복 제거한 뒤 같은 transaction에서 모든 ID의 존재를 확인한다. 하나라도 없는 경우 쓰기를 시작하지 않는다. 관리자 `online` 대상은 명령 실행 시점의 온라인 Player snapshot에서 ID를 뽑고 이 API 경계에서 다시 중복 제거한다.

`sendSystemMailToAllPlayers()`는 같은 interactive transaction 안에서 `players.user_id` 전체를 조회한다. 기준은 계정 `users`가 아니라 캐릭터가 실제 생성된 `Player` 행이므로, 아직 캐릭터가 없는 가입 계정은 받지 않고 오프라인 캐릭터는 받는다. 두 API 모두 한 transaction 안에서 수신자 100명씩 `createMany`를 순차 실행하며 어느 청크든 실패하면 앞선 청크까지 전부 rollback한다. 수신자가 0명이면 `createMany`를 호출하지 않는 정상 no-op이며 결과 수신자 수는 실행한 관리자에게만 표시한다.

완료 정리에서 source key 없는 일반 우편은 삭제한다. source key가 있는 보상 우편은 목록에서 숨기는 `archivedAt`만 기록하고 unique tombstone은 남긴다. 따라서 `발송 → 첨부 수령 → 정리 → 같은 sourceKey 재발송` 순서에서도 새 우편이나 중복 보상이 생기지 않는다.

## 첨부 수령 원자성

첨부 수령은 같은 플레이어의 요청을 서버 프로세스에서 직렬화하고 다음 순서로 처리한다.

1. Player의 기존 dirty 상태를 `save()`로 먼저 확정한다.
2. Inventory가 전체 첨부 중량과 마스터 데이터를 검사하고 최대 100개의 영속 Item 행 계획을 만든다.
3. 하나의 Prisma transaction에서 `claimedAt IS NULL`, 수신자 일치, 미만료, 미archive 조건으로 우편 한 행만 claim하고 Inventory 공개 API가 실제 `items` 행을 생성한다.
4. commit 뒤 생성된 DB id 행을 온라인 Inventory에 `Clean` 상태로 흡수한다. 기존 dirty/revision은 초기화하지 않는다.

조건부 claim count가 0이면 다른 접속의 선행 수령으로 보고 지급하지 않는다. transaction 실패는 claim과 Item 생성을 함께 rollback한다. commit 뒤 프로세스가 종료되거나 메모리 흡수가 실패해도 Item 행은 이미 DB에 있으므로 다음 로그인의 `Inventory.load()`가 복구한다. transaction 대기 중 다른 전리품으로 중량이 바뀐 경우에도 이미 확정된 지급 행은 메모리에서 누락시키지 않고 일시 과중량을 허용한다.

`/우편수령 전체`는 한 번에 오래 DB transaction을 점유하지 않도록 최대 20통·총 100개 생성 행만 처리한다. transaction이 실제 생성해 반환한 행 수로 예산을 차감하므로 사전 확인과 수령 사이에 인벤토리가 바뀌어도 처리 한도를 건너뛰지 않는다. 남은 첨부가 있으면 다시 실행하도록 안내한다.

## 플레이어 명령

- `/우편함`: 최근 미archive 우편 20통과 읽기·전체 수령·정리 버튼을 본인 전용 카드로 표시한다.
- `/우편읽기 <번호>`: stable DB 우편 번호의 본문·첨부·만료 시각을 읽고 `readAt`을 기록한다.
- `/우편수령 <번호|전체>`: 미수령·미만료 첨부를 원자적으로 인벤토리에 지급한다.
- `/우편정리`: 수령 완료 첨부, 읽은 일반 우편, 만료 우편을 숨기거나 삭제한다. 미수령 유효 첨부는 보존한다.

우편 명령과 결과는 정보 공개 모드와 무관한 본인 전용 메시지다. 시스템 보상 기능은 명령 handler나 Prisma row를 직접 만들지 않고 `sendSystemMail()`의 목적형 공개 API를 호출한다.

## 관리자 아이템 발송

권한 10 관리자는 `/우편발송 <유저ID|me|online|all> <아이템ID> <수량> [제목]`으로 한 캐릭터, 현재 접속자 또는 전체 캐릭터에 마스터 아이템을 보낼 수 있다. 예약 대상어 `me`, `online`, `all`은 정확한 영문 소문자만 허용한다. 대상 자동완성은 `me` → `online` → `all` → 중복 제거한 현재 온라인 Player ID 순서이며, 아이템 자동완성은 등록된 마스터 ID와 표시명을 제공한다. `online`은 실행 시점의 온라인 snapshot, `all`은 오프라인을 포함한 전체 `Player` 행을 뜻한다. 제목을 생략하면 운영 기본 제목을 사용하고 본문은 서버가 정한 안전한 지급 안내문으로 고정한다.

수량은 완전한 양의 정수만 허용하고 운영 1회 상한 10,000개와 우편 수령 시 생성 가능한 Item 행 100개를 모두 지킨다. stackable 아이템은 `maxStack × 100`, non-stackable 아이템은 100개가 추가 상한이다. 명령은 실제 `Item.snapshot()`으로 내구도·인스턴스 metadata·영속 태그 경계를 보존한 뒤 단일 대상은 `sendSystemMail()`, `online`은 `sendSystemMailToRecipients()`, `all`은 `sendSystemMailToAllPlayers()`만 호출한다. 운영자가 같은 명령을 반복한 것은 별도 지급 의도로 보므로 `sourceKey`를 만들지 않으며, 성공·실패와 수신자 0명 no-op 결과는 실행한 관리자에게만 표시한다.
