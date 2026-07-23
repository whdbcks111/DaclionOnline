# 전투 Pipeline·위협도·기여도

## 전투 Pipeline

`Entity.attack()`은 기존 회피·치명타·상성·방어/관통·보호막 계산의 단일 진입점이며, `CombatPipeline`이 계산 사이의 확장 지점을 제공한다.

회피율의 공격 측 속도는 `Entity.getEvasionAttackSpeed()`로 조회한다. 일반 Entity의 근접 공격은 이동속도를 사용하지만 Projectile은 발사자의 이동속도를 배제하고 최종 `projectileAcceleration`만 사용한다. 투사체 가속은 이동속도보다 작은 단위로 성장하므로 `1 + (가속 - 1) × 5`로 회피 판정 속도에 환산한다. 이에 따라 가속 +0.1배는 유효 적중 속도 +0.5가 되며 비행시간과 실제 적중률을 함께 개선한다. `unavoidable` 공격은 기존처럼 이 계산을 건너뛴다.

| 단계 | 용도 |
| --- | --- |
| `PREPARE` | 공격 가능 조건을 추가 검사하거나 `cancelled/cancelReason`으로 취소 |
| `EVADED` | 회피 결과 후 효과 |
| `BEFORE_DAMAGE` | 치명타 적용 후 실제 `damage()` 전 피해량·타입 보정 |
| `AFTER_DAMAGE` | 실제 생명력/보호막 피해가 확정된 뒤 흡혈·위협도·적중 효과 처리 |
| `COMPLETE` | 회피를 포함한 공격 수명 종료 |

```ts
const unregister = registerCombatHook({
  key: 'skill:berserk',
  stage: CombatStage.BEFORE_DAMAGE,
  filter: context => context.attackOwner === owner,
  run: context => { context.amount *= 1.2 },
})
```

hook은 key 재등록으로 교체되고 반환 함수 또는 `unregisterCombatHook`으로 해제한다. 낮은 `priority`부터 실행한다. 영속 상태나 무기 raw data를 hook에서 직접 읽지 않고 Entity/Equipment/SkillBook 공개 API를 사용한다. `GameEvent`는 확정된 사실의 통계·퀘스트 전달용이고 전투 수치를 바꾸는 용도로 사용하지 않는다.

## 몬스터 위협도

각 Monster는 자기 `ThreatTable`을 소유한다. 다른 기능은 테이블 Map을 읽지 않고 다음 API만 사용한다.

- `monster.recordThreat(actor, ThreatAction.*, amount)`
- `monster.taunt(actor, power)`
- `monster.getThreatContributions()`
- `Entity.heal(amount, source)` / `setShield(..., source)`: 교전 중인 아군을 지원하면 관련 몬스터에 자동 전파

`MonsterData.ai`는 다음 마스터 값을 가진다.

- `intelligence`: 0~100. 생략한 행동 가중치, 기본 도발 저항과 대상 고정 임계값의 기준.
- `disposition`: `LAST_ATTACKER`는 마지막 공격자만 추적하고, `THREAT`는 누적 점수를 비교한다.
- `weights`: 공격 시도, 실제 피해, 치유, 보호막, 제어, 도발의 단방향 위협 배율.
- `tauntResistance`: 도발 위협만 0~95% 감쇠한다.
- `switchThreshold`: 현재 대상보다 이 비율 이상 높은 후보가 생겨야 대상을 바꾼다.
- `decayPerSecond`: 전투 중 점수의 초당 감쇠율.

슬라임 계열은 지능 5의 `LAST_ATTACKER`로 마지막 공격자를 단순 추적한다. 수정맥의 군주는 지능 92의 `THREAT`로 치유 위협을 피해보다 높게 평가하고 도발 위협을 78% 감쇠하므로 힐러를 판단하면서 단순 도발에는 잘 넘어가지 않는다.

초반 보스도 성향을 분리한다. 적갈기 늑대왕은 지능 28로 피해와 마지막 공격에 비교적 잘 반응하며, 은빛그물 거미여왕은 지능 72로 치유·제어 행동을 더 큰 위협으로 평가하고 도발 위협을 52% 감쇠한다.

공허왕관의 무관성주 테오른은 지능 92의 위협형이지만 공허창과 성벽 파단을 고정 순서로 사용한다. 공허섭정 라시엘은 지능 100, 도발 저항 98%로 치유·보호막·제어를 피해보다 크게 평가하고 세 판결 기술을 무작위로 사용한다. 왕관 기둥이 남아 있는 동안 받는 피해가 40%만 적용되므로 파티는 위협 대상 교대와 별개로 기둥 파괴를 먼저 수행해야 한다.

월식해구의 월조 리바이어던은 지능 72의 위협형으로 해일과 수압 분쇄를 고정 순서로 사용한다. 백야대사제 세르미아는 지능 100, 도발 저항 99%로 치유·보호막·제어 위협을 피해보다 크게 평가하고 백야·월식 기술을 무작위로 사용한다. 조류거울이 남아 있는 동안 받는 피해가 35%만 적용되므로 파티는 거울을 먼저 파괴해야 한다.

역근수해의 역근 포식수는 고정 순서로 낙하와 포자 숨결을 사용한다. 태초심장 아르보르는 지능 100, 도발 저항 99.5%로 치유·보호막·제어 기여를 피해보다 크게 평가하고 세 기술을 무작위로 사용한다. 심장씨앗이 하나라도 남으면 받는 피해가 30%만 적용되므로 파티는 씨앗부터 파괴해야 한다.

철근 심장수호자는 누적 위협으로 고른 현재 대상 한 명에게 `철근 압살`을 사용한다. 이 공격은 후반 엘리트의 높은 이동속도와 방어 능력치에 0 피해가 되지 않도록 `Entity.attack()`의 `unavoidable + fixedDamage` 옵션을 명시해 보호막은 정상 소모하되 회피·속성·방어 계산을 건너뛰고, 적중 후 3초 제압을 확정 적용한다. 공명 폭주 실패 피해도 같은 고정 피해 경계를 사용한다.

## 기여도와 보상

실제 생명력 피해와 보호막 흡수량은 `AFTER_DAMAGE`에서 공격 최종 owner에게 누적된다. 치유·보호막·제어도 별도 항목으로 저장된다. 몬스터 사망 시 플레이어 기여도가 있으면 가장 높은 총 기여자의 파티를 보상 기준으로 삼고, 기록이 없을 때만 마지막 피해 owner로 fallback한다. 드롭·골드는 기준 플레이어에게, 경험치는 기존 PartyManager의 같은 장소·레벨 차이 감쇠 규칙으로 파티에 지급한다. 사망/리스폰 시 위협·기여 기록은 초기화한다.
