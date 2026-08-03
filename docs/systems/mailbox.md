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

한 통의 제한은 snapshot 20개, 총수량 1,000,000개, 실제 생성 Item 행 100개, JSON 32KiB다. `sendSystemMail()`은 마스터 아이템·수량·내구도·metadata/tag JSON을 검증한다. 선택적인 `sourceKey`를 주면 `(recipientId, sourceKey)` unique 제약으로 동일 시스템 보상의 재시도를 멱등 처리한다. DB의 대소문자·Unicode collation 차이로 서로 다른 키가 충돌하지 않도록 key는 소문자 영문·숫자로 시작하고 소문자 영문, 숫자, `: _ . / -`만 쓰는 최대 150자 ASCII 문자열이어야 한다.

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
