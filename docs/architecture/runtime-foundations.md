# 런타임 기반 API

## Key 기반 게임 Scheduler

`server/src/modules/scheduler.ts`는 게임 루프의 `dt`로 갱신되는 비영속 예약 작업을 소유한다. 스킬 지연 효과, 무기 적중 후 효과, 아이템 사용 효과처럼 취소·교체가 필요한 타이머는 Node의 `setTimeout`을 직접 만들지 않고 다음 정적 API를 사용한다.

```ts
scheduleGameTask(`skill:${ownerId}:burst`, 1.5, () => applyBurst())
cancelGameTask(`skill:${ownerId}:burst`)
cancelGameTasksByPrefix(`skill:${ownerId}:`)
```

- 같은 key 등록은 기본적으로 기존 작업을 교체한다. `replace: false`로 중복 등록을 거부할 수 있다.
- `repeatSeconds`를 지정하면 반복되고 callback이 `false`를 반환하면 종료한다.
- Entity/Player unload 시 기능 소유 prefix를 해제해야 한다.
- 여러 단계가 순차적으로 `yield Wait`하는 연출·제작은 기존 coroutine을, 단일 지연/반복/취소는 scheduler를 사용한다.

미니게임 만료와 낚시 입질/경고 타이머가 기준 사용처다.

## 단순 GameAction 트랜잭션

`server/src/models/GameAction.ts`는 여러 메모리 도메인 변경을 검증한 뒤 적용하는 작은 동기식 빌더다.

```ts
const result = gameAction('아이템 구매')
  .require(() => player.gold >= price, '골드가 부족합니다.')
  .step(() => { player.gold -= price }, () => { player.gold += price })
  .step(() => inventory.addOrThrow(item), () => inventory.remove(item))
  .run()
```

모든 `require`가 먼저 통과한 뒤 `step`을 순서대로 실행한다. 적용 도중 예외가 나면 완료된 step의 rollback을 역순으로 실행한다. 이 API는 Prisma 트랜잭션을 대신하지 않으며, 메모리 aggregate 여러 개를 함께 바꿀 때만 쓴다. 단일 Inventory/Equipment/SkillBook 변경은 각 소유 모델의 목적형 원자 API를 우선한다.

## Revision 기반 완전한 HUD Snapshot

`modules/stateSync.ts`는 `playerStats`와 `locationInfo` 내용을 직렬화해 이전 내용과 다를 때만 revision을 증가시킨다. 각 socket별 마지막 전달 stamp를 따로 저장하므로 기존 탭에는 중복 전송하지 않지만 새 탭은 현재 전체 snapshot을 즉시 받는다.

- payload는 항상 전체 DTO다. 클라이언트에서 부분 delta를 병합하지 않는다.
- 클라이언트는 같은 `syncId`의 더 낮거나 같은 revision을 버리고, 새 `syncId`는 revision이 낮아도 전체 교체한다.
- Player unload 시 stream을 제거한다. 같은 socket에서 다시 로그인해도 새 syncId가 발급된다.
- 서버 재시작, 재접속, 다중 탭에서 누락된 delta를 복원하는 별도 요청이 필요하지 않다.

이 방식은 필드별 delta보다 전송량 절감 폭은 작지만, 병합 순서·삭제 필드·새 socket 초기화로 인한 동기화 오류를 피하는 현재 기준 안전 경계다.

## 마스터 데이터 검증

`npm run data:validate`는 아이템·스킬·직업·몬스터·자원·제작·퀘스트·NPC·장소 레지스트리의 참조와 필수 아이콘 파일을 검사한다. 루트 `npm run verify`는 서버 빌드/전체 테스트/마스터 검증/클라이언트 빌드를 순서대로 실행하므로 에이전트의 의미 있는 작업 마무리 검증에 사용한다.
