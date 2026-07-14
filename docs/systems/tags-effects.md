# 태그·효과 배율 시스템

게임 객체는 마인크래프트식 `namespace:path` 태그로 분류한다. 태그는 동적으로 확장되는 식별자이므로 고정 도메인용 클래스형 enum 대신 문자열 ID와 검증 API를 사용한다.

## 태그 계층과 공개 API

공용 구현은 `shared/tags.ts`다.

- `TagCollection`: 정의 태그, 영속 태그, source별 런타임 태그를 합쳐 조회한다. 내부 Set은 노출하지 않는다.
- `hasTag`, `hasAny`, `hasAll`, `matches`: 다른 기능에서 사용하는 조회 API다.
- `values`: 중복 제거·정렬된 전체 태그 스냅샷을 반환한다.
- `addPersistent`, `removePersistent`, `replacePersistent`: DB에 남을 태그를 변경한다.
- `setRuntime(source, tags)`, `removeRuntime(source)`: 버프·지역 효과처럼 저장하지 않을 태그를 source 단위로 교체한다.
- `normalizeTag(s)`: 소문자 `namespace:path` 문법을 검증하고 중복을 제거한다.

현재 태그 보유 객체는 다음과 같다.

| 객체 | 정의 태그 | 영속 태그 | 런타임 태그 |
| --- | --- | --- | --- |
| Entity / Player / Monster / Resource | Player 기본값, MonsterData, ResourceData | Player `tags` JSON | `Entity.tags.setRuntime` |
| Projectile | ProjectileData + 발사 metadata override | 없음 | 짧은 수명 동안 `Entity.tags.setRuntime` 가능 |
| ItemData / Item | ItemData | Item·Equipment `tags` JSON | `Item.tags.setRuntime` |
| LocationData / Location | locations.json | 정의 파일 자체 | `Location.tags.setRuntime` |
| ShopData / Shop | shops.ts | 없음 | `Shop.tags.setRuntime` |
| DroppedItem | Item snapshot에서 보존 | 월드 드롭은 현재 비영속 | 원본 Item snapshot |

일반 태그 조회에서는 장착 아이템 태그가 `Equipment.hasTag/getTags`를 통해 Entity의 유효 태그에 포함된다. 단, 상성 판정은 공격·피격 문맥을 분리한다. 공격자는 Entity 본체 태그와 `Equipment.hasEffectSourceTag`가 제공하는 무기 태그를 사용하고, 피격 대상은 장비를 전부 제외한 Entity 본체의 정의·영속·런타임 태그만 사용한다. 갑옷 패시브가 실제로 `Entity.tags.setRuntime(source, tags)`를 호출해 속성을 부여한 경우에는 본체 런타임 태그이므로 피격 상성에 포함된다.

Projectile은 예외적으로 `hasEffectSourceTag`가 투사체 본체 태그만 조회한다. owner 본체와 활·스태프 같은 발사 무기의 태그는 복사하거나 참조하지 않으므로, 투사체 상성은 `ProjectileData` 및 발사 metadata의 `tags` 오버라이드로만 결정된다. 피격 측 규칙은 다른 Entity와 같다.

아이템을 인벤토리↔장비↔바닥으로 이동할 때는 `Item.snapshot`, `Item.fromSnapshot`, `Inventory.addItemSnapshot`, `Location.addDroppedItem`을 사용한다. 이 경로는 metadata, 내구도, 영속 태그를 함께 보존하며, 스택은 이 값들이 모두 같은 인스턴스끼리만 합쳐진다.

## 단방향 효과 modifier

`server/src/models/TagEffect.ts`는 대미지 전용 상성표가 아니라 모든 수치 효과에 재사용할 수 있는 단방향 modifier 레지스트리다.

- 등록: `defineTagEffectModifier(sourceTag, targetTag, modifier)`
- 판정: `resolveTagEffect(source, target)`
- 수치 적용: `applyTagEffectValue(value, source, target)`
- 목록: `getAllTagEffectModifiers()`

`modifier=0`은 대미지와 효과 강도를 0으로 만들고 `effective=false`를 반환한다. `0.5`는 절반, `1.5`는 1.5배다. 반대 방향은 자동 생성되지 않으며 필요할 때 별도 행으로 등록한다.

공격자와 대상이 복수 태그를 가져 여러 행이 일치해도 배율을 곱하지 않는다. 일치한 값 중 가장 낮은 단일 modifier만 사용해 면역·저항을 우선하고 상성 중첩 폭주를 방지한다. 일치 행이 없으면 중립 1배다.

현재 마스터 테이블은 `server/src/data/tagEffects.ts`에 있다.

| 효과 태그 → 대상 태그 | 배율 | 의미 |
| --- | ---: | --- |
| `property:poison` → `trait:inanimate` | 0 | 독은 무생물에게 무효 |
| `property:fire` → `property:water` | 0.5 | 물 대상은 불에 저항 |
| `property:fire` → `property:ice` | 1.5 | 불은 얼음에 우세 |
| `property:fire` → `property:natural` | 1.5 | 불은 자연에 우세 |
| `property:water` → `property:fire` | 1.5 | 물은 불에 우세 |
| `property:water` → `property:ice` | 0.5 | 얼음 대상은 물에 저항 |
| `property:ice` → `property:fire` | 0.5 | 불 대상은 얼음에 저항 |
| `property:ice` → `property:water` | 1.5 | 얼음은 물에 우세 |
| `property:natural` → `property:water` | 1.5 | 자연은 물에 우세 |
| `property:natural` → `property:fire` | 0.5 | 불 대상은 자연에 저항 |

## 전투 적용 순서

```text
기본 공격력
  -> 치명타 판정
  -> 단방향 태그 효과 modifier (0 / 0.5 / 1 / 1.5)
  -> 방어력 - 공격자 관통
  -> 최종 대미지
```

`Entity.damage`가 공격 원인의 Entity와 피격 Entity를 `applyTagEffectValue`에 전달하며, `TagEffectReadable.hasEffectSourceTag/hasEffectTargetTag`가 있으면 일반 `hasTag`보다 우선한다. 따라서 플레이어 공격과 몬스터 자동 공격이 같은 문맥 규칙을 사용한다. 결과에는 `modifiedAmount`, `effectModifier`, 일치한 source/target tag가 들어가며 공격 메시지는 면역·저항·우세를 구분한다.

투사체 공격에서는 `DamageCause.causeEntity`가 owner가 아닌 Projectile이다. 보상과 어그로는 `causeEntity.attackOwner`로 owner에게 돌아가지만, 위 상성 계산에는 실제 causeEntity만 전달된다.

대표 데이터로 낡은 검은 `property:fire`, 독 단검은 `property:poison`, 슬라임은 `trait:inanimate + property:water + property:poison`, 고블린은 `property:natural`, 돌 골렘은 `trait:inanimate + property:natural`을 가진다. 낡은 검은 슬라임에게 0.5배, 고블린에게 1.5배이며 독 단검의 공격은 슬라임과 돌 골렘에게 0배다. 반대로 낡은 검을 장착한 플레이어가 피격될 때는 검의 불 태그가 대상 태그에 포함되지 않는다.

광석 자원은 `entity:resource + resource:ore + trait:inanimate + material:stone`을 가진다. 공격 가능 도구 판정은 상성표와 별개로 곡괭이의 `tool:mining` 태그를 `Resource.getAttackDeniedReason`에서 검사한다.

상태 이상이나 회복 같은 새 효과는 대상의 태그 배열을 직접 읽지 말고 `applyTagEffectValue` 또는 `resolveTagEffect`를 호출한다. 0배일 때 부수 효과도 막아야 한다면 반환값의 `effective`를 검사한다.
