# 아이템·인벤토리·장비·상점 시스템

## 마스터 데이터와 인스턴스

- `models/Item.ts::ItemData`는 이름, 분류, 무게, 스택, 기본 metadata, 사용 handler ID, 장비 슬롯, modifier, 내구도와 정의 태그를 정의한다.
- `data/items.ts`가 `defineItem()`으로 마스터 데이터를 프로세스 레지스트리에 등록한다.
- DB `Item`과 런타임 `Item` 객체는 플레이어가 실제 보유한 수량·내구도·metadata를 표현한다.
- 장착된 항목은 DB `Equipment`와 런타임 `Equipment` 슬롯 맵에 별도로 존재한다.

- Item 인스턴스의 추가 태그는 DB JSON에 저장되며 정의 태그와 합쳐 조회한다.
- 인벤토리↔장비↔바닥 이동은 `ItemSnapshot`으로 metadata, 내구도, 영속 태그를 보존한다. 스택도 이 값이 모두 같을 때만 합쳐진다.

현재 정의는 `health_potion`, `mana_potion`, `old_sword`, `old_shield`, `venom_dagger`다. 낡은 검의 불 태그와 독 단검의 독 태그는 장착 시 Entity의 공격 효과 태그가 된다.

## Inventory API와 규칙

- 조회: `getItem`, `getItemByIndex`, `getItemsByData`, `getCount`.
- 추가: `canAdd`가 총 무게를 검사하고 `addItem`이 stackable/maxStack 규칙에 따라 병합 또는 새 인스턴스를 만든다. 기존 인스턴스를 이동할 때는 `addItemSnapshot`을 사용한다.
- 사용: `useItem`이 `ItemData.onUse` handler를 실행하며 동시에 하나의 아이템만 사용할 수 있다.
- 제거: `removeItem`, `removeItemByData`가 수량 또는 인스턴스를 dirty/deleted 상태로 바꾼다.
- 저장: state map의 New/Modified/Deleted 항목을 Prisma create/update/delete로 반영한다.

사용 효과는 `registerItemUse(id, handler)`로 등록한다. handler는 성공·실패를 포함한 모든 비동기 종료 경로에서 `finish()`를 호출해야 Inventory의 사용 잠금이 풀린다. 현재 HP/MP 포션은 coroutine으로 지연 후 회복한다.

## Equipment API와 규칙

슬롯은 `EquipSlotType` 클래스형 enum이 key, 한글 label, 입력 별칭, 최대 수량을 소유한다. 현재 head(1), body(1), legs(1), feet(1), accessory(3), mainHand(1), offHand(1)이다.

- `equip`: 빈 슬롯을 찾아 장착하고 modifier를 적용한다.
- `equipSwap`: 지정 슬롯 또는 빈/마지막 슬롯에 장착하며 밀려난 Item을 반환한다.
- `unequip`: modifier를 제거하고 Item을 반환한다.
- `applyModifiers`: 로드된 모든 장비 modifier를 Attribute에 다시 적용한다.
- `save`: 슬롯별 state를 Prisma에 반영한다.

장비 modifier의 `source`는 데이터 정의 값 대신 실제 슬롯 기반 source로 치환되어, 특정 장비 해제 시 정확히 제거된다.

## 상점

`data/shops.ts`가 `ShopData`를 등록하고 Location의 `shopId`가 상점을 노출한다. `BuyEntry`는 생성 함수·가격·1회 수량·최대 재고·재입고 시간을, `SellEntry`는 필터·가격을 가진다.

- 구매는 현재 위치 상점, 생존 상태, 번호/수량, 재고, 골드, 인벤토리 무게를 검사한 뒤 재고와 골드를 차감하고 아이템을 추가한다.
- 판매는 filter에 맞는 인벤토리 아이템을 제거하고 골드를 지급한다.
- `Shop.update(dt)`가 재입고 timer를 누적하며 게임 루프가 모든 상점을 갱신한다.
- 재고는 메모리 상태여서 서버 재시작 시 최대치로 초기화된다.

현재 `general_store`가 포션, 낡은 검, 낡은 방패를 판매·매입하며 `shop_general` 위치에 연결되어 있다.
