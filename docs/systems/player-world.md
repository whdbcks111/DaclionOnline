# 플레이어·전투·월드 시스템

## 객체 관계

```text
Entity
  ├─ Player
  │    ├─ Inventory
  │    ├─ Equipment
  │    ├─ Stat ──> Attribute modifiers
  │    ├─ PlayerProgress
  │    ├─ CareerProfile
  │    ├─ SkillBook ──> Skill[]
  │    └─ QuestBook ──> Quest[]
  ├─ Monster ── Equipment
  ├─ Resource
  └─ Projectile ── owner: Entity
                   └─ target: Entity

모든 Entity ── StatusEffect[] / key별 Shield[] / source별 ActionType 제한

Location ── objects[] (Monster | Resource)
         ├─ npcIds[] ──> NPC registry
         ├─ droppedItems[]
         └─ connections[] ──> Location
```

모든 Entity와 Location은 `TagCollection`을 가진다. Entity의 일반 태그 조회에는 장착 아이템이 포함되지만 직접 공격 상성은 공격·피격 양쪽 모두 장비를 제외한 본체 태그만 사용한다. 투사체는 owner 장비 대신 투사체 본체 태그를 사용한다. 상세 API와 속성표는 [태그·효과 배율 시스템](tags-effects.md)을 참고한다.

## 게임 루프와 갱신 주기

- `modules/game.ts`: 20 FPS. 모든 온라인 Player의 `earlyUpdate → update(SkillBook 포함) → lateUpdate`, 활성 Projectile의 전체 Entity lifecycle, Location의 모든 월드 오브젝트, Shop, Coroutine 순으로 갱신한다.
- 일회성 미니게임과 낚시 대기는 전투 Entity 프레임과 별도의 런타임 세션이다. 마지막 연결 종료·명시적 unload에서는 `cancelFishing()`이 대기 timer와 미니게임을 함께 정리하며 장소/생존/장비 유효성은 입질과 결과 확정 시 다시 검사한다.
- `modules/player.ts`: 500ms마다 현재 `playerStats`와 `locationInfo`를 계산하되, `stateSync.ts`가 내용이 바뀐 완전한 snapshot만 socket별로 전송한다. 각 payload의 `syncId/revision`으로 오래된 순서를 거르고, 30초마다 dirty 상태를 DB에 저장한다.
- `Entity.earlyUpdate`: tick 행동 제한 초기화 → Shield 만료 갱신 → StatusEffect early/update → 공격 cooldown 감소 → `lifeRegen` 생명력 및 `mentalityRegen` 정신력 자연 회복 → 사망 timer와 respawn. 생명력 재생은 받는 치유량 modifier를 적용하고 정신력 재생은 최대 정신력까지만 직접 회복한다.
- `Player.earlyUpdate`: Entity 공통 갱신 뒤 생존 중에만 `hungerDrain`과 `thirstDrain`을 초 단위로 적용한다. 두 자원 모두 0 아래로 내려가지 않으며 0이면 공복·갈증 StatusEffect를 적용하고 회복되면 제거한다.
- StatusEffect나 장비·스탯 modifier 제거로 최대 생명력·정신력·목마름·배고픔이 감소하면 `clampVitals()`가 같은 earlyUpdate에서 현재값을 새 최대값 이하로 보정한다. Player override setter를 통과하므로 변경은 dirty 저장 대상이다.
- `Entity.lateUpdate`: life가 0 이하가 된 엔티티의 사망 처리.

## 플레이어 수명

로그인 또는 세션 복원 시 `loadPlayerByUserId()`가 DB의 Player, Inventory, Equipment, PlayerProgress, SkillBook, QuestBook을 한 객체 그래프로 로드한다. 레코드가 없으면 기본 Player를 생성한다. 온라인 동안 `modules/player.ts`의 Map이 동일 userId 객체를 공유한다.

Player setter, Stat, Inventory, Equipment, PlayerProgress, SkillBook, QuestBook은 변경 상태를 추적한다. `Player.save()`는 Player/Stat을 갱신하고 이어서 나머지 소유 상태를 저장한다. 같은 Player에서 자동 저장과 unload/보상 저장이 겹치면 save promise를 공유하고 추가 pass를 예약해 직렬화한다.

## 능력치와 스탯

- Attribute에는 생명력·정신력·생존 자원·중량·공격/방어·이동/공격속도·치명타 외에 `projectileAcceleration` 투사체 가속과 낚시 능력치가 있다. 투사체 가속 기본값은 1배이며 민첩 1당 +0.003, 정신력 1당 +0.002가 더해진다. 두 재생 능력치의 기본값은 초당 1, 배고픔/수분 감소량은 각각 초당 0.01/0.02다.
- 모든 `AttributeType`은 `attributes/{key}` 대표색 아이콘을 소유한다. 상태창은 자원 bar와 각 능력치를 `아이콘 + 이름 + 값` 한 행으로 표시해 긴 이름도 겹치지 않으며, 이름 hover에는 계산 설명을 유지한다.
- 계산 순서: base 복사 → 모든 add modifier 합산 → 모든 multiply modifier 적용.
- `AttributeType`은 key, label, 기본값, formatter와 설명을 가진 클래스형 enum이다.
- Stat: strength, agility, vitality, sensibility, mentality. `StatType` 클래스형 enum의 modify 함수가 Entity를 받아 Attribute modifier를 적용한다.
- 장비 modifier source는 슬롯 단위, 스탯 modifier source는 `stat:{type}` 단위로 교체 가능하게 관리한다.

## 전투·사망·보상

- 유효한 공격이 시작되면 피격자는 현재 대상이 없을 때 `Entity.acquireCombatTarget()`으로 공격자의 최종 `attackOwner`를 자동 타게팅한다. 이 판정은 회피보다 먼저 실행되므로 피해를 피한 몬스터도 공격자를 인식하고, 대상이 없던 플레이어도 자신을 공격한 적을 자동 지정한다. 기존 대상은 임의로 교체하지 않으며 투사체 공격은 투사체가 아니라 owner를 지정한다.
- 공격 전 피격자가 더 빠르고 `ActionType.MOVEMENT`를 수행할 수 있으면 `min(90%, max(0, targetSpeed / attackerSpeed - 1) × 50%)` 확률로 회피한다. 따라서 속도 100→200은 50%, 100→300은 상한인 90%이며 회피하면 피해·치명타 없이 공격 cooldown과 선택된 내구도 소모만 확정된다.
- 회피되지 않은 공격마다 공격자의 `critRate`를 0~1로 보정해 치명타를 판정하고, 성공하면 raw damage에 `max(0, critDmg)`을 곱한다.
- `Entity.attack`의 optional `AttackOptions`는 해당 한 번의 `criticalRate/criticalDamage/consumeMainHandDurability/unavoidable/fixedDamage/triggerMainHandHitEffects`만 override한다. `unavoidable`은 회피 판정을 생략하고 `fixedDamage`는 치명타·상성·방어·관통을 모두 생략해 입력 피해량을 그대로 적용한다. 주무기 적중 효과는 기본적으로 피해가 들어간 물리 직접 공격에서 실행한다.
- 직접 공격과 회피의 결과 메시지·notification은 공격자와 피격 플레이어에게 전송하고, 이들이 파티 중이면 각 파티원에게도 `[파티]` 필터 피드로 공유한다. 같은 장소에 있다는 이유만으로 주변 일반 플레이어에게 전투 알림을 보내지는 않는다. 대응이 필요한 몬스터 스킬의 시전 예고는 별도의 패턴 알림으로 유지한다.
- 치명타 뒤 공격자→대상 단방향 태그 modifier를 적용한다. 면역 0배, 저항 0.5배, 우세 1.5배이며 복수 일치 시 곱하지 않고 가장 낮은 한 값만 쓴다.
- `physical` 피해는 `max(0, raw - max(0, 대상 def - 공격자 armorPen))`, `magic`은 대상 magicDef/공격자 magicPen을 사용한다. `absolute`는 방어·관통만 생략하고 회피·치명타·속성 상성은 유지하므로 모든 계산을 생략하는 `fixedDamage`와 구분한다.
- 최종 피해가 계산되면 해당 피해 타입을 흡수하는 보호막을 남은 지속시간이 짧은 순으로 소모한 뒤 나머지만 생명력에서 차감한다. 일반/물리/마법 보호막의 타입, key 중첩과 UI 계약은 [보호막 시스템](shields.md)을 참고한다.
- 공격 속도로 cooldown을 `1 / attackSpeed`초 설정한다.
- 현재 별도 원거리 분류가 없으므로 성공적으로 실행된 물리 기본 공격을 근접 공격으로 취급하며, 공격자의 `mainHand:0` 아이템에 내구도가 있으면 공격마다 1 차감한다. 0이 되면 장비에서 파괴되고 슬롯 modifier가 즉시 제거된다.
- `Player.performBasicAttack`은 주무기의 `basicAttackOverride`를 먼저 실행한다. 오버라이드가 없거나 `false`를 반환하면 기존 직접 근접 공격으로 폴백한다.
- Projectile은 좌표가 없는 현재 월드 모델에 맞춰 `기본 비행 시간 ÷ 최종 투사체 가속` 뒤 같은 위치의 target을 공격하고 즉시 소멸한다. 영속 저장하지 않으며 `spawnProjectile` 또는 마스터 데이터 기반 `spawnProjectileFromData`로 생성한다. `ProjectileData.accelerationCoefficient`는 owner의 투사체 가속 보너스 반영 비율, override `accelerationMultiplier`는 스킬 같은 발사원 고유 배율이다. 생성 시 owner의 치명타 확률·치명타 피해와 계산된 투사체 가속을 스냅샷으로 동기화한다.
- 투사체가 실제 `DamageCause.causeEntity`이므로 상성·관통·치명타는 투사체 자체 태그와 능력치를 사용한다. `attackOwner`는 최종 발사자를 반환해 메시지, Monster 어그로와 처치 보상만 owner에게 귀속한다.
- 투사체 무기 발사 성공 시 owner의 공격 cooldown과 주무기 내구도 1을 확정한다. Projectile 자신의 적중 공격은 owner의 근접 무기 태그나 내구도에 접근하지 않는다.
- Monster는 처음 맞힌 실제 공격원의 `attackOwner`를 target으로 삼고 같은 위치에 살아 있는 동안 자동 공격한다. `MonsterData.attack`은 선택적으로 `damageType`과 적중 시 확률형 `statusEffectId/chance/duration/level`을 지정해 속성 지역 몬스터가 화염·맹독·마비독을 실제로 시험하게 한다. `skills`와 `skillPattern`이 있으면 비영속 `SkillBook`으로 실제 SkillData를 순서대로 발동하고, 활성 스킬 시전 중에는 기본 공격을 멈춘다.
- 모든 `MonsterData`는 감정용 `description`을 가진다. `/몬스터정보 번호`는 감각 100 이상에서 현재 장소의 Monster만 조회하며 기본 설명·상태·가공된 속성을 공개한다. 감각 125에서는 전체 전투 능력치·기본 피해 타입·적중 상태효과를, 150에서는 드롭 확률·경험치·골드·스킬 패턴·장비를 추가로 공개한다. 내부 몬스터 ID와 raw 태그는 출력하지 않는다.
- Monster 사망 시 마지막 공격원의 `attackOwner`가 Player이면 드롭과 골드는 처치자에게 지급한다. 경험치는 처치자가 파티에 있으면 같은 장소의 생존 파티원에게도 지급하며 최고 레벨과의 차이에 100%/50%/20%/10% 감쇠를 적용한다. 상세 규칙은 [파티 시스템](party.md)을 참고한다.
- Resource는 Entity 생명력·피해·사망·리스폰을 재사용하지만 공격 AI가 없다. `attackable: false`면 공격 자체를 거부하고, `requiredToolTags`가 있으면 공격자의 주무기 태그를 `Equipment.hasEquippedItemTag`로 검사한다. `interactionCooldown`은 성공한 상호작용 뒤 고정값 또는 min~max 범위로 시작하며 월드 tick에서 감소한다.
- Resource 파괴 시 `drops`의 가중치 합에서 한 항목을 선택하고 `expReward.min~max` 범위의 경험치를 지급한다. 실제 피해원이 Projectile이어도 `attackOwner`인 Player에게 보상이 귀속된다.
- `Entity.isDefeated`는 `isDead`가 설정되기 전 life가 0이 된 프레임도 포함한다. 일반 Entity의 `defeatLabel`은 `사망`, Resource는 `파괴됨`이며 공격 가능 여부와 위치 출력이 이 API를 사용한다.
- 다음 레벨 요구 경험치는 `round(level * 100 * (1 + 3 * min(49, level - 1) / 49))`다. Lv.1은 100, Lv.50은 20,000, Lv.200은 80,000이며 일반 동급 몬스터 기준 보상 `level * 20`은 Lv.1에서 20%, Lv.50 이후 5%다. 보스는 긴 전투 시간을 반영해 별도 배율 경험치를 가질 수 있다. 레벨업마다 모든 Stat +1, 가용 statPoint +3이며 현재 Lv.210 월드에서도 별도 레벨 상한 없이 성장한다.
- Player 사망 시간은 기본 10초, 레벨 10 이상 30초, 50 이상 5분이며 지역 위험도에 따라 0.5/1/1.5배를 적용한 뒤 첫 respawn location으로 이동한다. 안전/중립/적대 사망 손실과 PVP 판정은 [PVP·지역 위험도](pvp-regions.md)를 따른다. 부활 시 생명력·배고픔·수분은 각각 현재 최대값까지 회복된다.

상태효과와 행동 제한의 병합·틱 순서, 화염·화상·맹독·마비독 공식은 [상태효과·행동 제한 시스템](status-effects.md)을 참고한다. 생명력 회복은 직접 `life +=` 대신 `Entity.heal()`을 사용해야 화상/맹독의 받는 치유량 modifier가 적용된다.

치명타 성공, 공격 적중, 공격 회피, 제압, 자원 파괴는 `GameEvent`로 발행된다. 회피 이벤트 `combat:attack_evaded`에는 계산된 회피율과 피해 타입이 들어가며, 적중 이벤트 `combat:attack_hit`에는 최종 피해와 장착 무기 분류가 들어간다. 치명타 이벤트는 `combat:critical_hits` 통계를 증가시켜 강타 자동 획득에 쓰이고, 무기별 적중 통계는 200회 숙련 패시브 획득에 쓰인다. 진행 상태와 스킬 수명주기의 상세 계약은 [이벤트·진행 상태·스킬 시스템](progress-skills.md)을 참고한다.

## 위치와 이동

- 정의 원본은 `server/src/data/locations.json`, 공유 스키마는 `LocationData`다.
- `modules/location.ts`가 시작할 때 JSON을 런타임 Location 레지스트리로 바꾼다.
- `LocationData.objects`의 각 항목은 `type: monster | resource`, `dataId`, `maxCount`, `respawnTime`을 가진다. 런타임에서는 둘 모두 `Location.getObjects/getObject/hasObject/addObject/removeObject` API로 다루며 별도 몬스터 배열을 두지 않는다.
- 피버릭 갱도 심층에서 Lv.28 조건으로 `수정 왕좌`에 진입할 수 있다. 이곳에는 일반 심층 몬스터 대비 6배 이상의 체력, 0.22 공격속도, 실제 스킬 패턴과 10분 리스폰을 가진 보스 `수정맥의 군주` 한 개체가 배치된다.
- `LocationData.npcIds`는 NPC 정의 ID만 저장한다. 런타임 NPC는 `Location.getNpcs/getNpc/hasNpc`로 조회하며 대화 규칙은 [NPC·대화 시스템](npc-dialogue.md)이 소유한다.
- `LocationData.mapIcon`은 `/icons/map/{key}.png` 랜드마크를 지정한다. 없으면 지도에서 점으로, 있으면 아이콘으로 표시하며 현재 광장·상점·광산 입구·초원 거점에 적용한다.
- `LocationData.mapColor`는 선택적인 `#RRGGBB` 바이옴 대표색이다. 같은 월드 권역은 정확히 같은 대표색을 공유한다. 방문 장소와 발견한 연결을 색상별 단일 도형으로 합성하므로 내부 겹침 얼룩이 생기지 않으며, 서로 다른 대표색의 연결에는 방향성 선형 그라데이션을 적용한다. 미방문 장소와 일반 지도에서 제외된 hidden 장소의 색은 노출하지 않는다.
- 연결 condition은 `data/locations.ts`의 handler registry가 `visible | locked | hidden` 또는 `{ status, publicReason }`을 반환한다. `publicReason`은 사용자에게 공개 가능한 잠금 사유일 때만 넣으며, `/이동 장소명`으로 실제 진입을 시도해 잠긴 경우에만 실패 메시지에 표시한다. 레벨 조건은 `필요 레벨: Lv.28` 형식을 사용한다.
- `/이동` 시간은 `max(1, distance / speed / 5)`초이고 0.5초 단위 coroutine 알림을 갱신한다. 명령 입력과 시작·진행·도착 메시지는 항상 이동 중인 플레이어 본인에게만 보인다. 대상은 정식 장소명 외에도 location ID, 공백·가운뎃점·하이픈을 생략한 이름, 현재 연결 중 유일한 부분 이름으로 찾을 수 있다. 양의 정수는 `getAvailableConnections()` 목록의 1부터 시작하는 순번으로 먼저 해석하므로 `go 1`, `mv 2`도 장소 이름의 숫자 포함 여부와 무관하게 일관되게 동작한다. 예: `/이동 초원3`, `/이동 meadow_3`.
- `/위치`는 정보 공개 모드를 따르며 기본적으로 본인에게만 보이고 공개 모드에서만 현재 채널에 공유된다. 구역 위험도와 PVP 허용 여부를 먼저 표시하고 Monster와 Resource를 경계 없이 `[ 오브젝트 ]` 번호 목록으로 표시한다. PVP 가능 지역의 다른 생존 플레이어에는 `PVP 대상` 버튼을 표시한다. 사망·파괴된 오브젝트는 체력 progress 대신 붉은 `(사망)`·`(파괴됨)` 상태를 표시한다. 등록된 상호작용 handler가 있는 살아 있는 오브젝트에는 `/상호작용 번호` 버튼을 붙이며, 나머지는 같은 명령을 실행해도 불가 알림을 보낸다.
- `/위치`는 바닥 아이템도 개별 번호와 줍기 버튼으로 표시한다. 같은 인스턴스 상태의 stackable 드롭은 최대 스택까지 합쳐지며 `/버리기 번호 [개수]`로 여러 개를 내려놓을 수 있다. `/줍기 번호`는 해당 드롭 스택 전체, `/줍기 전체`는 중량이 허용할 때 모든 스택을 인벤토리로 옮긴다.
- Player 생성/로드 및 `locationId` 변경 때 `WorldMap.markLocationVisited`가 `PlayerProgress` flag를 갱신한다. `/지도` snapshot은 방문한 모든 표시 가능 장소와 그 장소의 공개 연결을 통해 한 단계 인접한 미방문 장소만 포함한다. 미방문 노드·연결은 회색이며 그 너머 그래프는 공개하지 않는다. `location:hidden` 태그 장소는 방문 기록이 있어도 노드와 연결에서 완전히 제외한다.
- 지도 상세보기는 `worldMap` ChatNode 전용 SVG 컴포넌트다. PC는 휠 확대/축소와 drag, 모바일은 한 손가락 drag와 두 손가락 pinch/pan을 지원하며 blip hover/focus/tap 카드에 이름·구역 유형·좌표를 표시한다.
- 권한 10의 `/전체지도`는 같은 컴포넌트에 미방문·고립·`location:hidden` 장소와 모든 정적 연결을 포함한 관리자 snapshot을 전달한다.
- 위치 편집기는 `/admin/locations`에서 그래프, 랜드마크 `mapIcon`, 대표색 `mapColor`, 오브젝트와 NPC ID 배치를 편집하고 `adminSaveLocations`로 JSON과 런타임을 한 번에 교체한다.

현재 월드는 총 45개 장소이며 다음 성장 동선을 제공한다.

| 지역 | 권장 레벨/용도 | 주요 오브젝트 |
| --- | --- | --- |
| 루미나르 개척촌 | 안전 지역·리스폰 | 광장, 장터, 별등불 잡화점, 물빛 연못 낚시상점, 안내인 리아 |
| 바람결 초원 1~3 | Lv.1~11 | 슬라임, 풀잎/퍼플/샘물 슬라임; 퍼플 슬라임은 맹독 공격 |
| 안개수렁 1~3 | Lv.14~27 | 수렁 슬라임, 포자체, 수렁 포식자, 늪의 응집핵; 맹독·마비독 공격 |
| 홍염산지 1~4 | Lv.30~50 | 불씨 슬라임부터 칼데라 화염수까지; 마법 피해와 화염 효과 |
| 피버릭 갱도 | Lv.3~32 채굴/미로·보스 | 입구부터 수정 왕좌까지의 순환 연결, 3단계 광맥·파수체·지각 붕괴를 쓰는 수정맥의 군주 |
| 천둥마루 1~3 | Lv.52~68 | 전기·금속·벌레 속성 몬스터와 풍뢰강 검·뇌운 시위 드롭 |
| 월영밤숲 1~3 | Lv.75~95 | 어둠·벌레·자연 속성, 공포·출혈·부패와 밤유리 단검 드롭 |
| 백광성역 1~3 | Lv.105~125 | 빛·신성·금속 속성 몬스터와 성휘목 지팡이 드롭 |
| 망각사령묘 1~5 | Lv.135~155 분기형 던전 | 동·서 묘실의 순환 연결과 합류로, 언데드·어둠·돌 속성 몬스터 |
| 철근황무지 1~3 | Lv.165~185 | 땅·금속·돌 속성의 고방어 몬스터와 매몰 미로 |
| 성계균열 1~3 | Lv.190~210 | 빛·어둠·전기 혼합 속성과 Lv.200 관문, 성계 문지기 보스 |

고블린 정의와 배치는 제거됐다. 지역 관문은 `level_10/20/28/36/45/50/70/90/120/150/180/200` condition으로 잠기며, 관리자가 높은 지역으로 순간이동한 경우 되돌아올 수 있도록 역방향 연결은 열어 둔다. 일반·응축·수정 광맥은 `tool:mining` 주무기만 공격할 수 있다. 몬스터 정의에는 불·물·얼음·자연·독·전기·돌·어둠·빛·언데드·신성·벌레·금속·땅 속성이 모두 실제 배치되어 `/몬스터정보`와 `/속성표`를 함께 시험할 수 있다.

`treasure_chest`는 공격할 수 없는 상호작용 자원이다. 여러 야외·갱도 장소에 흩어져 있으며 골드, 포션, 화살, 광물, 희귀 보석 또는 각각 0.75% 가중치의 낚시 특화 장비 중 하나를 지급한다. `너울그물 낚싯대`는 채집 범위만 극단적으로 넓고 느리며, `급류바늘 낚싯대`는 범위가 작은 대신 채집 영역 이동 속도가 매우 빠르다. 인벤토리 공간이 부족하면 보상을 확정하지 않고, 성공한 뒤 해당 상자 인스턴스에 1~2시간의 랜덤 쿨타임이 적용된다. 쿨타임은 프로세스 메모리 상태라 서버 재시작 시 초기화된다.

## HUD 데이터

`sendPlayerStats()`는 본인의 현재 레벨, 자원, 보호막 구간, 공격 cooldown, 상태효과의 ID·아이콘·레벨·현재/최대 시간·계산 설명과 nullable 파티원 HP/MP/보호막 snapshot을 보낸다. `sendLocationInfo()`는 현재 위치 좌표·위험도 라벨·PVP 허용 여부·인접 위치·동일 위치 플레이어·통합 `objects`의 생명력과 보호막을 해당 사용자의 모든 소켓에 보낸다. 인접 위치는 `Location.getAvailableConnections(player)` 결과라 hidden은 제외되고 visible/locked 상태가 포함된다. `Home.tsx`가 이를 `HudContext`에 저장하고 PlayerStatus/Party/Location/Minimap HUD가 소비한다. Location HUD는 각 살아 있는 오브젝트 행에 설정 가능한 `공격`/`대상` 버튼을 더하고, PVP 가능 지역의 플레이어 행에는 `/대상지정p #고유번호` 버튼을 더한다. Minimap HUD는 세부 옵션을 켠 경우 visible 인접 지역만 이동 목록에 표시하고 `/이동 ID`를 숨김 실행한다.
