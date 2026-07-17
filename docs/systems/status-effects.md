# 상태효과·행동 제한 시스템

## 구조와 수명

모든 `Entity`는 Player, Monster, Resource, Projectile 구분 없이 상태효과를 소유할 수 있다. 정의는 클래스형 enum `StatusEffectType`, 대상별 실행 상태는 `StatusEffect` 인스턴스다.

```text
StatusEffectType
  ├─ id / label / icon / maxLevel / aliases / tags
  ├─ baseMetadata / calculatedFields / descriptionTemplate
  └─ onStart / onEarlyUpdate / onUpdate / onRemove

Entity
  └─ statusEffects Map (외부 비공개)
       └─ StatusEffect
            ├─ type / level
            ├─ duration / maxDuration
            └─ metadataDelta
```

상태효과는 런타임 전용이며 DB에 저장하지 않는다. 사망·파괴 시 모두 제거되고 respawn 뒤에는 남지 않는다. Player와 Location 오브젝트는 기존 20 FPS lifecycle에서, Projectile은 `updateProjectiles()`의 `earlyUpdate → update → lateUpdate`에서 갱신된다.

외부 기능은 raw Map을 읽지 않고 다음 `Entity` 공개 API를 사용한다.

- 조회: `getStatusEffects`, `getStatusEffect`, `hasStatusEffect`, `getStatusEffectDisplaySnapshots`
- 적용: `applyStatusEffect(type, duration, level)`
- 제거: `removeStatusEffect`, `clearStatusEffects`
- lifecycle: `updateStatusEffects`는 일반적으로 게임 루프가 호출한다.

## 적용과 병합 규칙

신규 인스턴스는 `type`, 양수 duration, 1 이상 level 세 값으로 생성한다. level은 타입의 `maxLevel`까지 보정된다.

| 기존 효과와 비교 | 처리 |
| --- | --- |
| 신규 level이 높음 | 기존 인스턴스의 level, duration, maxDuration을 신규 값으로 교체 |
| level이 같고 신규 duration이 더 김 | 남은 duration만 신규 값으로 늘리고 maxDuration은 지금까지 가장 큰 값 유지 |
| level이 같고 신규 duration이 짧거나 같음 | 무시 |
| 신규 level이 낮음 | duration과 관계없이 무시 |

모든 갱신은 기존 `StatusEffect` 객체를 유지한다. `onStart`를 재실행하지 않고 `metadataDelta`, 누적 틱 시간과 기존 `onUpdate` 흐름이 이어진다. 결과는 클래스형 enum `StatusEffectApplyAction`의 `ADDED/UPGRADED/REFRESHED/IGNORED/REJECTED`로 확인할 수 있다.

Metadata는 Skill/Item과 같은 원본+top-level delta 방식이다. `getMetadata/getMetadataSnapshot/getMetadataDeltaSnapshot/setMetadata/resetMetadata`를 사용한다. 설명 문자열은 `{{level}}`, `{{duration}}`, `{{meta.key}}`, `{{calc.key}}`를 치환하며 기존 채팅 색상 문법을 보존한다.

## 표시와 관리자 지급

`StatusEffectType.icon`은 `/icons/{icon}.png`의 확장자 없는 key다. 생략하면 `status-effects/{id}`를 사용하므로 새 타입을 추가할 때 같은 작업에 `client/public/icons/status-effects/{id}.png`를 배치한다.

`MonsterData.attack.effect`는 상태이상 ID, 확률, 지속시간, 레벨을 데이터로 지정한다. 몬스터 기본 공격이 회피되지 않았을 때만 `StatusEffectType.fromKey()`와 `Entity.applyStatusEffect()`를 통해 적용되며, 퍼플/수렁 계열과 화산 몬스터가 맹독·마비독·화염의 실제 필드 테스트 데이터를 제공한다.

- `/상태창` 맨 아래는 `Lv.레벨 [아이콘]효과명 MM:SS`를 표시하며 효과명 hover에는 계산된 설명과 현재/최대 지속시간이 나온다.
- `playerStats.statusEffects`는 `getStatusEffectDisplaySnapshots()`을 ChatNode 설명으로 변환해 전송한다. PlayerStatusHud는 아이콘 위에 남은 지속시간 비율을 반시계 방향 fill로 표시하고 hover/focus 상세 정보를 제공한다.
- 관리자 `/상태이상부여 대상 상태이상코드 레벨 시간`은 온라인 Player만 대상으로 `Entity.applyStatusEffect()`를 호출한다. 상태효과가 런타임 전용이므로 오프라인 객체에 적용하거나 DB에 저장하지 않는다.

## Lifecycle callback

- `onStart(context)`: 최초 추가 직후 한 번 실행. `'remove'` 반환 시 적용을 거부하고 즉시 정리한다.
- `onEarlyUpdate(context, dt)`: 매 게임 tick 시작에 실행. 한 틱 행동 제한처럼 다른 update보다 먼저 확정할 상태를 처리한다.
- `onUpdate(context, dt)`: duration 감소와 함께 실행. 누적 시간·주기 피해 등 일반 효과를 처리한다.
- `onRemove(context, reason)`: 만료, 직접 제거, 대상 제압, 조건 불충족, 오류에서 한 번 실행하며 modifier를 정리한다.

callback은 대상의 raw 필드를 우회하지 않고 `damage`, `heal`, 상태효과, 태그, 행동 제한 같은 Entity 공개 API를 사용한다.

## 기본 상태효과

### 화염 (`StatusEffectType.FIRE`)

- 최대 10레벨, `property:fire` 효과원 태그를 가진다.
- 1초마다 `2 + 1.5 × level` absolute 피해를 주며, 대상 태그와 기존 단방향 속성 배율을 적용한다.
- Player는 매 피해마다 `당신은 불타고 있습니다. (-피해)` notification을 받는다.
- metadata의 `accumulatedDuration`으로 재적용 전후 누적 시간을 유지한다.
- 누적 시간이 `20초 - 화염 level`을 초과하면 한 번 화상을 부여한다.
- 화염 1레벨은 화상 1레벨 10초, 화염 10레벨은 화상 5레벨 20초이며 중간값은 선형 단계로 계산한다.

### 화상 (`StatusEffectType.BURN`)

- `trait:living` 대상에게만 적용되고 다른 대상에서는 `onStart`가 즉시 제거한다.
- 받는 생명력 회복량을 1레벨 5%부터 20레벨 50%까지 선형 감소시킨다.
- 매 update에서 source key `status-effect:burn`의 회복 modifier를 교체하고 제거 시 자기 source만 정리한다.

### 맹독 (`StatusEffectType.DEADLY_POISON`)

- `trait:living` 대상에게만 적용되며 `property:poison` 효과원 태그를 가진다.
- 0.5초마다 최대 생명력 비례 absolute 피해를 주고 Player에게 독 피해 notification을 보낸다.
- 피해 비율은 `0.5% + (level - 1) × 0.1%p + 잃은 생명력 비율 × 2%p`다. 따라서 항상 최대 생명력의 0.5% 이상이다.
- 받는 생명력 회복량을 레벨과 무관하게 50% 감소시킨다.

### 마비독 (`StatusEffectType.PARALYTIC_POISON`)

- `trait:living` 대상에게만 적용된다.
- 매 `onEarlyUpdate`에서 1레벨 5%부터 20레벨 50%까지 선형 증가하는 확률을 판정한다.
- 성공한 tick에는 스킬, 공격, 이동/회피, 장소 이동을 `disableActionsForTick`으로 제한한다.
- 채팅과 명령 제한 타입도 행동 시스템에 존재하지만 현재 마비독은 적용하지 않는다.

### 공복·갈증 (`StatusEffectType.HUNGER/THIRST`)

- Player의 배고픔 또는 수분이 0이면 각각 `공복`, `갈증`이 자동 적용되고 해당 자원이 회복되면 제거된다. 사망 중에는 새로 적용하지 않으며 사망 처리에서 다른 상태효과와 함께 정리된다.
- 둘 중 하나라도 활성화되면 각 효과가 자기 source의 `lifeRegen × 0` modifier를 등록하므로 자연 생명력 재생으로 고갈 피해를 무한히 상쇄할 수 없다. 효과 하나를 제거해도 다른 source가 남아 있으면 억제가 유지된다.
- 기본 1레벨은 합산해서 초당 최대 생명력의 `1/60`을 고정 피해로 준다. 두 효과가 동시에 있으면 피해를 둘이 나눠 총 기본 피해가 두 배가 되지 않는다.
- 같은 조건이 60초 지속될 때마다 최대 10레벨까지 상승하며, 레벨당 피해가 25% 증가한다. 현재 레벨과 계산된 초당 피해율은 상태창 hover 설명에 표시된다.
- 매초 Player에게 `배고픔`, `갈증`, 또는 `배고픔과 갈증으로 인해 생명력이 고갈되고 있습니다.` 알림을 하나만 보낸다.
- respawn은 생명력과 함께 배고픔·수분을 각각 최대값으로 회복하므로 해당 효과가 다시 생기지 않는다.

## 행동 제한 API

`ActionType`은 `SKILL`, `CHAT`, `COMMAND`, `ATTACK`, `MOVEMENT`, `LOCATION_TRAVEL`을 가진 클래스형 enum이다. SkillBook, 채팅 입력, 명령 버튼/입력, Entity 공격, 속도 기반 자동 회피, `/이동`이 각각 소유 action을 검사한다. `MOVEMENT`가 제한된 피격자는 속도 차이가 나더라도 회피율이 0%가 된다.

- 지속 제한: `disableAction/disableActions(action, source)`, `enableAction`, `clearActionDisableSource`
- 한 tick 제한: `disableActionForTick/disableActionsForTick`, `clearTickActionDisableSource`
- 통합 해제: `releaseActionDisableSource(source)`
- 조회: `canPerformAction`, `getActionDisableSources`

제한은 action마다 source key Set으로 합성된다. 하나의 기절이 만료되어 자기 source를 제거해도 다른 속박 source가 남아 있으면 행동은 계속 금지된다. tick 제한 Map은 다음 `Entity.earlyUpdate` 시작에 전체 초기화되고 각 상태효과 `onEarlyUpdate`가 해당 tick 제한을 다시 등록한다.

## 이벤트

최초 적용, 상위 레벨/시간 갱신, 제거는 `status_effect:applied`, `status_effect:updated`, `status_effect:removed` GameEvent를 발행한다. 이벤트 data에는 effect ID, level, duration 또는 적용 action/제거 reason이 들어간다.
