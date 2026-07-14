# 플레이어·전투·월드 시스템

## 객체 관계

```text
Entity
  ├─ Player ── Inventory
  │          ├─ Equipment
  │          └─ Stat ──> Attribute modifiers
  └─ Monster ─ Equipment
  └─ Resource
  └─ Projectile ── owner: Entity
                └─ target: Entity

Location ── objects[] (Monster | Resource)
         ├─ droppedItems[]
         └─ connections[] ──> Location
```

모든 Entity와 Location은 `TagCollection`을 가진다. Entity의 일반 태그 조회에는 장착 아이템이 포함되지만 상성에서는 무기 태그를 공격 측에만 사용하고, 피격 측은 장비를 제외한 본체 태그만 사용한다. 상세 API와 속성표는 [태그·효과 배율 시스템](tags-effects.md)을 참고한다.

## 게임 루프와 갱신 주기

- `modules/game.ts`: 20 FPS. 모든 온라인 Player의 `earlyUpdate → update → lateUpdate`, 활성 Projectile, Location의 모든 월드 오브젝트, Shop, Coroutine 순으로 갱신한다.
- `modules/player.ts`: 500ms마다 `playerStats`와 `locationInfo`, 30초마다 dirty 상태를 DB에 저장한다.
- `Entity.earlyUpdate`: 공격 cooldown 감소, 생명력 자연 회복, 사망 timer와 respawn.
- `Entity.lateUpdate`: life가 0 이하가 된 엔티티의 사망 처리.

## 플레이어 수명

로그인 또는 세션 복원 시 `loadPlayerByUserId()`가 DB의 Player, Inventory, Equipment를 한 객체 그래프로 로드한다. 레코드가 없으면 기본 Player를 생성한다. 온라인 동안 `modules/player.ts`의 Map이 동일 userId 객체를 공유한다.

Player setter, Stat, Inventory, Equipment는 변경 상태를 추적한다. `Player.save()`는 Player/Stat을 갱신하고 이어서 Inventory와 Equipment의 생성·수정·삭제를 저장한다.

## 능력치와 스탯

- Attribute: maxLife, maxMentality, maxThirsty, maxHungry, maxWeight, atk, magicForce, def, magicDef, armorPen, magicPen, speed, attackSpeed, critRate, critDmg.
- 계산 순서: base 복사 → 모든 add modifier 합산 → 모든 multiply modifier 적용.
- `AttributeType`은 key, label, 기본값, formatter와 설명을 가진 클래스형 enum이다.
- Stat: strength, agility, vitality, sensibility, mentality. `StatType` 클래스형 enum의 modify 함수가 Entity를 받아 Attribute modifier를 적용한다.
- 장비 modifier source는 슬롯 단위, 스탯 modifier source는 `stat:{type}` 단위로 교체 가능하게 관리한다.

## 전투·사망·보상

- 공격마다 공격자의 `critRate`를 0~1로 보정해 치명타를 판정하고, 성공하면 raw damage에 `max(0, critDmg)`을 곱한다.
- 치명타 뒤 공격자→대상 단방향 태그 modifier를 적용한다. 면역 0배, 저항 0.5배, 우세 1.5배이며 복수 일치 시 곱하지 않고 가장 낮은 한 값만 쓴다.
- 물리 피해는 `max(0, raw - max(0, 대상 def - 공격자 armorPen))`, 마법은 대상 magicDef/공격자 magicPen, absolute는 방어와 관통 0으로 계산한다.
- 공격 속도로 cooldown을 `1 / attackSpeed`초 설정한다.
- 현재 별도 원거리 분류가 없으므로 성공적으로 실행된 물리 기본 공격을 근접 공격으로 취급하며, 공격자의 `mainHand:0` 아이템에 내구도가 있으면 공격마다 1 차감한다. 0에서도 공격과 장비 modifier는 유지된다.
- `Player.performBasicAttack`은 주무기의 `basicAttackOverride`를 먼저 실행한다. 오버라이드가 없거나 `false`를 반환하면 기존 직접 근접 공격으로 폴백한다.
- Projectile은 좌표가 없는 현재 월드 모델에 맞춰 지정된 비행 시간 뒤 같은 위치의 target을 공격하고 즉시 소멸한다. 영속 저장하지 않으며 `spawnProjectile` 또는 마스터 데이터 기반 `spawnProjectileFromData`로 생성한다.
- 투사체가 실제 `DamageCause.causeEntity`이므로 상성·관통·치명타는 투사체 자체 태그와 능력치를 사용한다. `attackOwner`는 최종 발사자를 반환해 메시지, Monster 어그로와 처치 보상만 owner에게 귀속한다.
- 투사체 무기 발사 성공 시 owner의 공격 cooldown과 주무기 내구도 1을 확정한다. Projectile 자신의 적중 공격은 owner의 근접 무기 태그나 내구도에 접근하지 않는다.
- Monster는 처음 맞힌 실제 공격원의 `attackOwner`를 target으로 삼고 같은 위치에 살아 있는 동안 자동 공격한다.
- Monster 사망 시 마지막 공격원의 `attackOwner`가 Player이면 드롭, 골드, 경험치를 지급한다.
- Resource는 Entity 생명력·피해·사망·리스폰을 재사용하지만 공격 AI가 없다. `requiredToolTags`가 있으면 공격자의 주무기 태그를 `Equipment.hasEquippedItemTag`로 검사하고 조건에 맞지 않는 공격을 시작 전에 거부한다.
- Resource 파괴 시 `drops`의 가중치 합에서 한 항목을 선택하고 `expReward.min~max` 범위의 경험치를 지급한다. 실제 피해원이 Projectile이어도 `attackOwner`인 Player에게 보상이 귀속된다.
- `Entity.isDefeated`는 `isDead`가 설정되기 전 life가 0이 된 프레임도 포함한다. 일반 Entity의 `defeatLabel`은 `사망`, Resource는 `파괴됨`이며 공격 가능 여부와 위치 출력이 이 API를 사용한다.
- 레벨 요구 경험치는 `level * 100`; 레벨업마다 모든 Stat +1, 가용 statPoint +3이다.
- Player 사망 시간은 기본 10초, 레벨 10 이상 30초, 50 이상 5분이며 첫 respawn location으로 이동한다.

## 위치와 이동

- 정의 원본은 `server/src/data/locations.json`, 공유 스키마는 `LocationData`다.
- `modules/location.ts`가 시작할 때 JSON을 런타임 Location 레지스트리로 바꾼다.
- `LocationData.objects`의 각 항목은 `type: monster | resource`, `dataId`, `maxCount`, `respawnTime`을 가진다. 런타임에서는 둘 모두 `Location.getObjects/getObject/hasObject/addObject/removeObject` API로 다루며 별도 몬스터 배열을 두지 않는다.
- 연결 condition은 `data/locations.ts`의 handler registry가 `visible | locked | hidden`을 반환한다.
- `/이동` 시간은 `max(1, distance / speed / 5)`초이고 0.5초 단위 coroutine 알림을 갱신한다.
- `/위치`는 Monster와 Resource를 경계 없이 `[ 오브젝트 ]` 번호 목록으로 표시한다. 사망·파괴된 오브젝트는 체력 progress 대신 붉은 `(사망)`·`(파괴됨)` 상태를 표시한다. 등록된 상호작용 handler가 있는 살아 있는 오브젝트에는 `/상호작용 번호` 버튼을 붙이며, 나머지는 같은 명령을 실행해도 불가 알림을 보낸다.
- `/위치`는 바닥 아이템도 개별 번호와 줍기 버튼으로 표시한다. `/줍기 번호`는 해당 드롭 스택 전체, `/줍기 전체`는 중량이 허용할 때 모든 스택을 인벤토리로 옮긴다.
- 위치 편집기는 `/admin/locations`에서 그래프를 편집하고 `adminSaveLocations`로 JSON과 런타임을 한 번에 교체한다.

현재 월드는 마을 광장(리스폰), 초원, 상점 거리, 어두운 숲, 잡화점, 피버릭 광산, 피버릭 광산 상점으로 구성된다. 광산은 광장에서 이동할 수 있고 `ore_deposit` 자원 10개가 배치된다. 광석은 채굴 도구만 공격할 수 있고 45초 후 리스폰한다. 초원에는 물 속성 슬라임, 어두운 숲에는 자연 속성 고블린과 무생물 돌 골렘이 스폰되며 어두운 숲 연결은 `level_5` 조건을 사용한다.

## HUD 데이터

`sendPlayerStats()`는 본인의 자원과 공격 cooldown, `sendLocationInfo()`는 현재 위치 좌표·인접 위치·동일 위치 플레이어·통합 `objects`를 해당 사용자의 모든 소켓에 보낸다. `Home.tsx`가 이를 `HudContext`에 저장하고 PlayerStatus/Location/Minimap HUD가 소비한다.
