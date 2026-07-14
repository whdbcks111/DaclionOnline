# 플레이어·전투·월드 시스템

## 객체 관계

```text
Entity
  ├─ Player ── Inventory
  │          ├─ Equipment
  │          └─ Stat ──> Attribute modifiers
  └─ Monster ─ Equipment

Location ── monsters[]
         ├─ droppedItems[]
         └─ connections[] ──> Location
```

모든 Entity와 Location은 `TagCollection`을 가지며, Entity의 유효 태그에는 현재 장착 아이템 태그가 포함된다. 상세 API와 속성표는 [태그·효과 배율 시스템](tags-effects.md)을 참고한다.

## 게임 루프와 갱신 주기

- `modules/game.ts`: 20 FPS. 모든 온라인 Player의 `earlyUpdate → update → lateUpdate`, Location/Monster, Shop, Coroutine 순으로 갱신한다.
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
- Monster는 처음 맞은 공격자를 target으로 삼고 같은 위치에 살아 있는 동안 자동 공격한다.
- Monster 사망 시 마지막 원인이 Player 공격이면 드롭, 골드, 경험치를 지급한다.
- 레벨 요구 경험치는 `level * 100`; 레벨업마다 모든 Stat +1, 가용 statPoint +3이다.
- Player 사망 시간은 기본 10초, 레벨 10 이상 30초, 50 이상 5분이며 첫 respawn location으로 이동한다.

## 위치와 이동

- 정의 원본은 `server/src/data/locations.json`, 공유 스키마는 `LocationData`다.
- `modules/location.ts`가 시작할 때 JSON을 런타임 Location 레지스트리로 바꾼다.
- 연결 condition은 `data/locations.ts`의 handler registry가 `visible | locked | hidden`을 반환한다.
- `/이동` 시간은 `max(1, distance / speed / 5)`초이고 0.5초 단위 coroutine 알림을 갱신한다.
- 위치 편집기는 `/admin/locations`에서 그래프를 편집하고 `adminSaveLocations`로 JSON과 런타임을 한 번에 교체한다.

현재 월드는 마을 광장(리스폰), 초원, 상점 거리, 어두운 숲, 잡화점으로 구성된다. 초원에는 물 속성 슬라임, 어두운 숲에는 자연 속성 고블린과 무생물 돌 골렘이 스폰되며 어두운 숲 연결은 `level_5` 조건을 사용한다.

## HUD 데이터

`sendPlayerStats()`는 본인의 자원과 공격 cooldown, `sendLocationInfo()`는 현재 위치 좌표·인접 위치·동일 위치 플레이어·몬스터를 해당 사용자의 모든 소켓에 보낸다. `Home.tsx`가 이를 `HudContext`에 저장하고 PlayerStatus/Location/Minimap HUD가 소비한다.
