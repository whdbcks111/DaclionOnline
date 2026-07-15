# 아이템·인벤토리·장비·상점 시스템

## 마스터 데이터와 인스턴스

- `models/Item.ts::ItemData`는 이름, 이미지 key, 분류, 무게, 스택, 기본 metadata, 사용 handler ID, 장비 슬롯, modifier, 내구도와 정의 태그를 정의한다.
- `data/items.ts`가 `defineItem()`으로 마스터 데이터를 프로세스 레지스트리에 등록한다.
- DB `Item`과 런타임 `Item` 객체는 플레이어가 실제 보유한 수량·내구도와 인스턴스 metadata delta를 표현한다.
- 장착된 항목은 DB `Equipment`와 런타임 `Equipment` 슬롯 맵에 별도로 존재한다.

- Item 인스턴스의 추가 태그는 DB JSON에 저장되며 정의 태그와 합쳐 조회한다.
- 인벤토리↔장비↔바닥 이동은 `ItemSnapshot`으로 metadata delta, 내구도, 영속 태그를 보존한다. 스택도 이 값이 모두 같을 때만 합쳐진다.

현재 장비·소모품 정의는 `health_potion`, `mana_potion`, `old_sword`, `old_shield`, `venom_dagger`, `light_bow`, `wooden_arrow`, `basic_pickaxe`, `iron_pickaxe`, `seismic_crush_skillbook`이다. 낡은 검의 불 태그와 독 단검의 독 태그는 장착 시 Entity의 직접 공격 효과 태그가 된다. 가벼운 활은 화살 한 발을 소비해 화살 자체의 자연 속성으로 공격한다. 두 곡괭이는 `item:tool + tool:mining` 태그를 가진 주무기이며 광석의 공격 조건을 만족한다. 철 곡괭이는 제작법으로 획득한다.

광물 아이템은 `stone`, `coal`, `iron_ore`, `gold_ore`, `ruby`, `emerald`, `diamond`이며 모두 99개까지 쌓인다. 피버릭 갱도 입구의 은맥 광부 보급소는 곡괭이를 50 Gold에 판매하고 광물을 희귀도에 따라 각각 2, 5, 10, 25, 55, 60, 180 Gold에 매입한다.

metadata의 유효값은 `ItemData.baseMetadata`와 인스턴스 delta를 top-level key 단위로 합쳐 계산한다. `getMetadata/getMetadataSnapshot`으로 읽고 `setMetadata/resetMetadata`로 변경한다. 기본값과 같은 값을 설정하면 delta가 제거되며, override가 없는 필드는 실행 중 `ItemData.baseMetadata`가 바뀌어도 즉시 최신 값을 상속한다. 객체·배열 같은 중첩 값은 해당 top-level 필드 전체가 하나의 override다.

아이템 이미지는 `Item.image` 공개 API로 조회한다. `/icons` 아래의 확장자 없는 key를 사용하며 `getMetadata('image')` → `ItemData.image` → `items/{itemDataId}` 순서로 결정된다. 따라서 일반 아이템은 `client/public/icons/items/{id}.png`를 자동으로 사용하고, 동일 정의의 개별 인스턴스만 다른 외형이 필요하면 `setMetadata('image', 'items/variant_key')`를 호출한다. 경로 이탈이나 URL 형태의 값은 무시되어 기본 이미지로 대체된다.
새 `ItemData`를 등록할 때는 동일 변경에 128×128 투명 PNG 아이콘을 함께 추가하며, 기본 파일명은 `{itemDataId}.png`다. 임시 placeholder나 없는 경로를 마스터 데이터에 남기지 않는다.

`learn_skill` 사용 handler는 아이템 metadata의 `skillDataId`를 `Player.skills.grant()`에 전달한다. 신규 획득 성공 시에만 해당 아이템 인스턴스 한 개를 제거하며 이미 보유했거나 데이터가 잘못된 경우 소비하지 않는다. 현재 `seismic_crush_skillbook`이 이 계약을 사용하는 첫 스킬북이다.

내구도는 `baseDurability`가 있는 아이템만 사용한다. `durability/durabilityRatio/isBroken`으로 조회하고 `setDurability/changeDurability/increaseDurability/decreaseDurability`로 0~기본 내구도 범위 안에서 변경한다. 변경 callback이 소유 Inventory/Equipment를 dirty로 표시하며 0이 되어도 현재는 자동 파괴하거나 modifier를 제거하지 않는다.

## Inventory API와 규칙

- 조회: `getItem`, `getItemByIndex`, `getFirstItemByData`, `getItemsByData`, `getCount`.
- metadata 변경: `setItemMetadata`, `resetItemMetadata`가 대상 Item API를 호출하고 Inventory를 dirty로 표시한다. 조회는 반환된 Item의 `getMetadata`를 사용한다.
- 내구도 변경: `setItemDurability`, `changeItemDurability`, `increaseItemDurability`, `decreaseItemDurability`가 Item API를 호출하고 Inventory를 dirty로 표시한다.
- 추가: `canAdd`, `canAddSnapshot(s)`이 총 무게와 아이템 정의를 검사하고 `addItem`이 stackable/maxStack 규칙에 따라 병합 또는 새 인스턴스를 만든다. 기존 인스턴스를 이동할 때는 `addItemSnapshot`을 사용한다.
- 조건부 선택·교환: `selectItems`는 겹치는 여러 predicate에 아이템 수량을 중복 없이 배정하고, `replaceSelectedItems`는 선택 재료와 결과 snapshot의 수량·무게를 선검증한 뒤 교환한다.
- 사용: `useItem`이 `ItemData.onUse` handler를 실행하며 동시에 하나의 아이템만 사용할 수 있다.
- 제거: `removeItem`, `removeItemByData`, `removeItemInstance`가 수량 또는 인스턴스를 dirty/deleted 상태로 바꾼다. 발사는 신규 아이템의 임시 DB ID가 겹쳐도 안전한 `removeItemInstance`로 선택한 탄약만 소비한다.
- 저장: state map의 New/Modified/Deleted 항목을 Prisma create/update/delete로 반영한다.

바닥 아이템은 `Location.getDroppedItems()`의 복사본으로 표시하고 `pickupItem/pickupAllItems`로만 제거한다. 전체 줍기는 모든 스택의 중량을 먼저 검사하므로 하나라도 받을 수 없는 경우 바닥 상태를 변경하지 않는다.

`/인벤토리` 목록과 `/상태창`의 장착 정보는 이름 앞에 `Item.image` 아이콘을 표시한다. 내구도가 있는 아이템은 이름 오른쪽에 `em` 길이의 짧은 progress와 현재/최대값 tooltip을 추가한다. progress 색은 50% 초과 초록, 20% 초과~50% 금색, 20% 이하 빨강이며 존재하지 않는 이미지 에셋은 숨겨진다.

사용 효과는 `registerItemUse(id, handler)`로 등록한다. handler는 성공·실패를 포함한 모든 비동기 종료 경로에서 `finish()`를 호출해야 Inventory의 사용 잠금이 풀린다. 현재 HP/MP 포션은 coroutine으로 지연 후 회복하며, HP 포션은 `Entity.heal()`을 사용해 화상·맹독 등 받는 치유량 modifier를 반영한다.

## 기본 공격 오버라이드와 투사체 아이템

장착 무기는 metadata의 `basicAttackOverride` 문자열로 `modules/itemAttack.ts`의 key→함수 레지스트리를 선택한다. 현재 `projectile` handler가 있으며 처리할 수 없으면 `false`를 반환해 `Player.performBasicAttack`이 직접 근접 공격으로 폴백한다. 가벼운 활은 탄약이 없거나 탄약 설정이 유효하지 않을 때 이 폴백을 사용한다.

탄약 소비형 metadata 예시는 다음과 같다.

```jsonc
// weapon.baseMetadata
{
  "basicAttackOverride": "projectile",
  "projectileAttack": { "ammunitionItemId": "wooden_arrow" }
}

// ammunition.baseMetadata
{
  "projectile": {
    "dataId": "basic_arrow",
    "overrides": {
      "damageBonus": 2,
      "attributeOverrides": { "armorPen": 1 }
    }
  }
}
```

탄약을 소비하지 않는 스태프·마법 무기형은 `projectileAttack` 안에 참조를 직접 둔다.

```json
{
  "basicAttackOverride": "projectile",
  "projectileAttack": {
    "projectile": {
      "dataId": "basic_magic_orb",
      "overrides": { "damageMultiplier": 1.2 }
    }
  }
}
```

`overrides`는 `name`, 절대 `damage`, `damageType`, `travelTime`, `damageMultiplier`, `damageBonus`, `tags`, `attributeOverrides`를 지원한다. 값은 `parseProjectileReference`가 검증하며 투사체 템플릿은 `data/projectiles.ts`에서 `defineProjectileData`로 등록한다. 피해량을 직접 지정하지 않으면 물리는 owner `atk`, 마법은 `magicForce`에 multiplier와 bonus를 적용한다.

## Equipment API와 규칙

슬롯은 `EquipSlotType` 클래스형 enum이 key, 한글 label, 입력 별칭, 최대 수량을 소유한다. 현재 head(1), body(1), legs(1), feet(1), accessory(3), mainHand(1), offHand(1)이다.

- `equip`: 빈 슬롯을 찾아 장착하고 modifier를 적용한다.
- `equipSwap`: 지정 슬롯 또는 빈/마지막 슬롯에 장착하며 밀려난 Item을 반환한다.
- `unequip`: modifier를 제거하고 Item을 반환한다.
- `applyModifiers`: 로드된 모든 장비 modifier를 Attribute에 다시 적용한다.
- `setItemMetadata/resetItemMetadata`: 장착 아이템의 delta를 변경하고 해당 슬롯을 dirty로 표시한다.
- `setItemDurability`, `changeItemDurability`, `increaseItemDurability`, `decreaseItemDurability`: 장착 아이템 내구도를 변경하고 해당 슬롯을 dirty로 표시한다.
- `save`: 슬롯별 state를 Prisma에 반영한다.

장비 modifier의 `source`는 데이터 정의 값 대신 실제 슬롯 기반 source로 치환되어, 특정 장비 해제 시 정확히 제거된다.

## 상점

`data/shops.ts`가 `ShopData`를 등록하고 Location의 `shopId`가 상점을 노출한다. `BuyEntry`는 생성 함수·가격·1회 수량·최대 재고·재입고 시간을, `SellEntry`는 필터·가격을 가진다.

- 구매는 현재 위치 상점, 생존 상태, 번호/수량, 재고, 골드, 인벤토리 무게를 검사한 뒤 재고와 골드를 차감하고 아이템을 추가한다.
- 판매는 filter에 맞는 인벤토리 아이템을 제거하고 골드를 지급한다.
- `Shop.update(dt)`가 재입고 timer를 누적하며 게임 루프가 모든 상점을 갱신한다.
- 재고는 메모리 상태여서 서버 재시작 시 최대치로 초기화된다.

현재 `general_store`가 포션, 낡은 검, 낡은 방패, 독 단검, 가벼운 활과 화살을 판매·매입하며 루미나르 장터의 `shop_general`(별등불 잡화점)에 연결되어 있다.
