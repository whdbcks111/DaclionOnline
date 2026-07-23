# 아이템·인벤토리·장비·상점 시스템

주무기는 `weapon:sword/axe/bow/dagger/staff` 태그로 직업 스킬 사용 조건을 제공한다. 전직 시험의 기본 장비 보상은 훈련용 도끼·가벼운 활·독 단검·견습 마법 지팡이이며 스킬은 `Equipment.hasEquippedItemTag` API로만 검사한다.

## 마스터 데이터와 인스턴스

- `models/Item.ts::ItemData`는 이름, 이미지 key, 분류, 무게, 스택, 기본 metadata, 사용 handler ID, 장비 슬롯, modifier, 내구도와 정의 태그를 정의한다.
- `data/items.ts`가 `defineItem()`으로 마스터 데이터를 프로세스 레지스트리에 등록한다.
- DB `Item`과 런타임 `Item` 객체는 플레이어가 실제 보유한 수량·내구도와 인스턴스 metadata delta를 표현한다.
- 장착된 항목은 DB `Equipment`와 런타임 `Equipment` 슬롯 맵에 별도로 존재한다.

- Item 인스턴스의 추가 태그는 DB JSON에 저장되며 정의 태그와 합쳐 조회한다.
- 인벤토리↔장비↔바닥 이동은 `ItemSnapshot`으로 metadata delta, 내구도, 영속 태그를 보존한다. 스택도 이 값이 모두 같을 때만 합쳐진다.

현재 소모품에는 체력·정신력 포션과 배고픔 35를 회복하는 `traveler_bread`, 수분 40을 회복하는 `fresh_water`가 있다. 황혼왕릉의 `graveward_tonic`은 45초간 보존을 부여해 독·출혈·부패 지속시간을 빠르게 줄인다. 장비·전투 아이템은 기본 무기·도구 외에도 권역별 성장 장비를 제공한다. 무기 속성 태그는 아이템 분류·제작 조건에 남지만 직접 물리 공격 상성에는 자동 합산하지 않는다. 독 단검은 물리 피해가 실제로 적중한 뒤 50% 확률로 8초간 1레벨 맹독을 부여하며 무생물은 상태효과 적용만 거부한다. 가벼운 활은 화살 한 발을 소비해 화살 자체의 자연 속성으로 공격한다. 두 곡괭이는 `item:tool + tool:mining` 태그를 가진 주무기이며 광석의 공격 조건을 만족한다. 철 곡괭이는 제작법으로 획득한다.

Lv.50 이후 지역에서는 직업별 고레벨 무기 `풍뢰강 검`, `뇌운 시위`, `밤유리 단검`, `성휘목 지팡이`를 낮은 확률로 획득한다. 각각 공격력+속도, 공격력+치명타율, 공격력+관통과 부패 적중 효과, 마법력+정신력 재생을 제공하며 `ItemData.balance`로 실제 전후 전투 지표를 비교할 수 있다.

낚시 장비는 모두 `tool:fishing` 태그를 가지며 손 슬롯에서 행운·입질 속도·채집 영역 크기/속도·시작 게이지 modifier와 `fishingNetShape` metadata를 제공한다. 루미나르 물빛 연못의 낚시상점은 기본 미끼 조합에서 입질까지 약 31~45초가 걸리는 초보자 낚싯대와 범위·속도가 고르게 강화된 650 Gold의 `정교한 낚싯대`를 판매한다. 보물상자 전용 `너울그물 낚싯대`는 매우 넓지만 느린 직사각형 영역, `급류바늘 낚싯대`는 작지만 매우 빠른 원형 영역을 제공한다.

`item:bait` 통통한 지렁이 미끼는 `/낚시` 시 보조 슬롯에 미끼가 없으면 인벤토리 묶음 전체가 자동 장착되고, 낚시 시작마다 장착 스택에서 하나만 소비된다. 직접 장착할 때도 스택형 장비는 묶음 전체가 이동한다. 물빛 연못 낚시상점은 미끼를 판매하고 일반~신화 물고기를 등급 태그와 `FishRarity.sellPrice`에 따라 5~8,000 Gold에 매입한다. 상세 흐름은 [미니게임·낚시](minigames-fishing.md)를 참고한다.

광물 아이템은 `stone`, `coal`, `iron_ore`, `gold_ore`, `ruby`, `emerald`, `diamond`이며 모두 99개까지 쌓인다. 피버릭 갱도 입구의 은맥 광부 보급소는 곡괭이를 50 Gold에 판매하고 광물을 희귀도에 따라 각각 2, 5, 10, 25, 55, 60, 180 Gold에 매입한다.

metadata의 유효값은 `ItemData.baseMetadata`와 인스턴스 delta를 top-level key 단위로 합쳐 계산한다. `getMetadata/getMetadataSnapshot`으로 읽고 `setMetadata/resetMetadata`로 변경한다. 기본값과 같은 값을 설정하면 delta가 제거되며, override가 없는 필드는 실행 중 `ItemData.baseMetadata`가 바뀌어도 즉시 최신 값을 상속한다. 객체·배열 같은 중첩 값은 해당 top-level 필드 전체가 하나의 override다.

아이템 이미지는 `Item.image` 공개 API로 조회한다. `/icons` 아래의 확장자 없는 key를 사용하며 `getMetadata('image')` → `ItemData.image` → `items/{itemDataId}` 순서로 결정된다. 따라서 일반 아이템은 `client/public/icons/items/{id}.png`를 자동으로 사용하고, 동일 정의의 개별 인스턴스만 다른 외형이 필요하면 `setMetadata('image', 'items/variant_key')`를 호출한다. 경로 이탈이나 URL 형태의 값은 무시되어 기본 이미지로 대체된다.
1차 콘텐츠 확장 기간에는 새 데이터마다 ImageGen 에셋을 만들지 않고 검·활·단검·지팡이·소모품처럼 카테고리가 맞는 기존 128×128 폴백 아이콘을 `image`에 명시한다. 존재하지 않는 경로는 허용하지 않으며 코드에 전용 아이콘 교체 TODO를 남긴다. 콘텐츠 규모와 밸런스가 확정된 뒤 전용 이미지를 일괄 제작한다.

`learn_skill` 사용 handler는 아이템 metadata의 `skillDataId`를 `Player.skills.grant()`에 전달한다. 신규 획득 성공 시에만 해당 아이템 인스턴스 한 개를 제거하며 이미 보유했거나 데이터가 잘못된 경우 소비하지 않는다. `seismic_crush_skillbook`과 은빛그물 보스의 `predator_pounce_skillbook`, `silverweb_snare_skillbook`, 역설기계고의 광자창·인과고정·톱니폭우·역설반전 전승서가 같은 계약을 사용한다. 콘텐츠 확장 중인 전승서는 전용 아트 전까지 기존 스킬북 카테고리 아이콘을 명시적 fallback으로 사용한다.

잿빛성흔 심연은 잿빛 힘줄·흑염 잔재·공허뿔·저주뼈·밤쇠·재왕 인장·심연가죽·애도의 눈을 사냥·채굴 소재로 제공한다. 재길 행군식과 두 영약이 생존·화염 저항·재생을 담당하고, 재가름 장검·공허뿔 장궁·황혼송곳·흑염각 지팡이·재성벽 방패가 Lv.238~275 역할 장비를 구성한다. 세 단계 보스의 전승서는 지옥견 돌진·흑염 낙인·재왕의 칙령을 낮은 확률로 제공하며 전용 아트 전에는 유효한 동종 카테고리 fallback을 명시적으로 사용한다.

공허왕관 성채는 무광은·왕관유리·공허비단·기아덩굴·별먹·섭정 인장을 사냥·채굴 소재로 제공한다. 무광 행군식과 공허맥 회복약이 장거리 탐색을 지원하고, 무광은 파성검·왕관현 장궁·공허비단 침·무성좌 지팡이·섭정의 무광방패가 Lv.275~310 역할 장비를 구성한다. 두 보스의 전승서는 공허걸음과 왕관무효를 낮은 확률로 제공하며 전용 아트 전에는 존재하는 동종 카테고리 fallback만 사용한다.

내구도는 `baseDurability`가 있는 아이템만 사용한다. `durability/durabilityRatio/isBroken`으로 조회하고 `setDurability/changeDurability/increaseDurability/decreaseDurability`로 0~기본 내구도 범위 안에서 변경한다. 소유 중인 아이템이 0이 되면 Inventory는 해당 인스턴스를 삭제하고 Equipment는 슬롯 modifier를 즉시 제거한 뒤 삭제 상태로 저장한다. 주무기가 공격으로 파괴되면 소유 플레이어에게 알림을 보낸다.

은빛그물 숲의 `forest_antidote`는 30초 해독 상태로 독·맹독·마비독을 제거하고 재적용을 막는다. `silverweb_hunter_bow`는 공격력 6·치명타율 2%·투사체 가속 8%를 제공하는 초반 성장 활이다. 전용 아트 제작 전에는 기존 활·포션·유기물 카테고리 아이콘을 명시적 fallback으로 사용한다.

유리모래 사막은 유리모래·태양갑각·전갈 독낭·신기루 수정·태양문양 파편을 사냥·채집 소재로 제공한다. 오아시스 대추야자와 그늘 물통은 배고픔/수분을 회복한다. 모래쐐기 장검, 태양실 활, 신기루 독아, 태양유리 지팡이, 태양거울 방패는 Lv.70~110 성장 장비이며 공격·관통·치명타·투사체 가속 또는 물리/마법 생존을 역할별로 보강한다. 무기는 화염·빛·저주 적중 효과처럼 별도 상태효과를 명시적으로 호출하며 물리 공격 상성에 장착 무기 태그를 합산하지 않는 원칙은 유지한다. 전용 아트 제작 전에는 존재하는 검·활·단검·지팡이·방패·소재 아이콘을 명시적 fallback으로 사용한다.

서리잔향 설원·빙경궁은 상고 수정·서리늑대 가죽·빙실 거미줄·경철·극광 파편·빙결 핵·눈솔이끼를 소재로 제공한다. 설원 행군식은 생존 자원을, 상고막이 영약은 빙결 저항을, 극광 회복약은 재생을 제공한다. 빙맥 절단검·빙실 연궁·경빙 송곳니·극광분광 지팡이·빙경 성벽방패는 Lv.120~152 구간의 공격·관통·치명타·투사체 가속·양면 생존을 보강하며, 무기 적중 효과는 물리 타격의 속성 상성을 바꾸지 않고 별도 상태효과 API로만 적용된다. 전승서 두 종은 상고 그물과 극광 창을 직업 제한 없이 획득시킨다.

안개파도 해안·침몰왕도는 해무 소금·흑산호·해무비늘·조류진주·침수 군단 휘장·심해철·청해초 수지·해수룡 골편을 소재로 제공한다. 염풍 행군식은 생존 자원을, 해포말 영약은 화염 저항을, 조류심장 회복약은 강한 재생을 제공한다. 파식 조류검·해무 조류궁·흑산호 침·심해진주 지팡이·침몰제독 방패는 Lv.156~186 구간에서 이전 설원 장비보다 약 4~8% 높은 역할별 공격 기여 또는 양면 생존을 제공한다. 해무 파가와 심해 닻 전승서는 각각 두 지역 보스에게서 낮은 확률로 획득한다. 전용 아트 제작 전에는 존재하는 소재·동일 무기 카테고리 아이콘을 명시적 fallback으로 사용한다.

역설기계고는 시간강 파편·기억 톱니·광자 렌즈·공허 용수철·논리핵·역설 실·자동인형 장갑판·균열 수정·기록원 열쇠 조각을 사냥·채굴 소재로 제공한다. 태엽 작업식·위상 촉진제·논리회로 영약·시간봉합 연고는 생존과 일시 능력 강화를 담당한다. 역설절단검·광자연사궁·공허태엽 단검·논리핵 지팡이·인과율 방패는 Lv.200~235 역할 장비이며 Lv.220 장비 프로파일에서 이전 해안 장비보다 공격 기여 약 4~7%, 양면 생존 약 6~9%를 높인다. 네 전승서는 퀘스트·보스·유물함을 통해 회수한다. 전용 아트 제작 전에는 존재하는 소재·무기·스킬북 카테고리 아이콘을 명시적 fallback으로 사용한다.

## 감정 명령

`/감정 <인벤토리 번호 또는 장착칸>`은 감각 50 이상에서 사용할 수 있다. 장착칸은 `손`, `다리`, `보조`, `장신구1` 같은 `EquipSlotType` 이름·별칭을 받는다. 감각 50에서는 설명·분류·수량·무게·가공된 속성을, 75에서는 내구도와 능력치 보정을, 100에서는 회복량·획득 스킬·탄약 방식·고유 적중 효과처럼 해석된 특수 효과를 추가로 공개한다. 내부 아이템 ID, raw 태그, metadata key/value는 권한과 관계없이 출력하지 않는다. 조회는 `Item.getInspectionSnapshot`, 자동완성은 `Inventory.getIndexedItems`와 `Equipment.getAllEquipped`를 사용한다.

## Inventory API와 규칙

- 조회: `getItem`, `getItemByIndex`, UI용 인덱스 snapshot `getIndexedItems`, `getFirstItemByData`, `getItemsByData`, `getCount`, predicate 수량용 `countMatching`.
- 변경 구독: `subscribeChanges`는 수량·metadata·내구도·태그 변화 뒤 호출되며 QuestBook 같은 소유 기능의 현재 보유 조건 갱신에 사용한다. `replaceSelectedItems` 안의 연속 변경은 한 번으로 묶는다.
- metadata 변경: `setItemMetadata`, `resetItemMetadata`가 대상 Item API를 호출하고 Inventory를 dirty로 표시한다. 조회는 반환된 Item의 `getMetadata`를 사용한다.
- 내구도 변경: `setItemDurability`, `changeItemDurability`, `increaseItemDurability`, `decreaseItemDurability`가 Item API를 호출하고 Inventory를 dirty로 표시한다.
- 추가: `canAdd`, `canAddSnapshot(s)`이 총 무게와 아이템 정의를 검사하고 `addItem`이 stackable/maxStack 규칙에 따라 병합 또는 새 인스턴스를 만든다. 기존 인스턴스를 이동할 때는 `addItemSnapshot`을 사용한다.
- 조건부 선택·교환: `selectItems`는 겹치는 여러 predicate에 아이템 수량을 중복 없이 배정하고, `replaceSelectedItems`는 선택 재료와 결과 snapshot의 수량·무게를 선검증한 뒤 교환한다.
- 사용: `useItem`이 `ItemData.onUse` handler를 실행하며 동시에 하나의 아이템만 사용할 수 있다.
- 제거: `removeItem`, `removeItemByData`, `removeItemInstance`가 수량 또는 인스턴스를 dirty/deleted 상태로 바꾼다. 발사는 신규 아이템의 임시 DB ID가 겹쳐도 안전한 `removeItemInstance`로 선택한 탄약만 소비한다.
- 저장: state map의 New/Modified/Deleted 항목을 Prisma create/update/delete로 반영한다.

바닥 아이템은 `Location.getDroppedItems()`의 복사본으로 표시하고 `pickupItem/pickupAllItems`로만 제거한다. `Location.addDroppedItem()`은 정의 ID·내구도·metadata delta·영속 태그가 같은 stackable 아이템을 `maxStack`까지 합치고 초과분만 새 스택으로 나눈다. `/버리기 <슬롯> [개수]`는 기본 1개를 버리며 선택한 인스턴스의 실제 수량을 검증한다. 전체 줍기는 모든 스택의 중량을 먼저 검사하므로 하나라도 받을 수 없는 경우 바닥 상태를 변경하지 않는다.

`/인벤토리` 목록과 `/상태창`의 장착 정보는 이름 앞에 `Item.image` 아이콘을 표시한다. 인벤토리 현재/최대 중량과 `/감정`의 아이템 단위·합계 중량은 최대 소수 둘째 자리의 `kg` 단위로 표시한다. 내구도가 있는 아이템은 이름 오른쪽에 `em` 길이의 짧은 progress와 현재/최대값 tooltip을 추가한다. progress 색은 50% 초과 초록, 20% 초과~50% 금색, 20% 이하 빨강이며 존재하지 않는 이미지 에셋은 숨겨진다.

사용 효과는 `registerItemUse(id, handler)`로 등록한다. handler는 성공·실패를 포함한 모든 비동기 종료 경로에서 `finish()`를 호출해야 Inventory의 사용 잠금이 풀린다. HP/MP 포션은 coroutine으로 지연 후 회복하며 HP 포션은 `Entity.heal()`을 사용해 화상·맹독 등 받는 치유량 modifier를 반영한다. 음식·음료는 `restore_survival` handler가 선택 인스턴스를 한 개 소비하고 `Entity.restoreHunger/restoreThirst`로 최대값 안에서 생존 자원을 회복한다.

미궁 보물함의 특수 소모품도 같은 handler 경계를 사용한다. `메아리 모래시계`는 `SkillBook.reduceCooldowns(15)`로 진행 중인 모든 쿨다운을 줄이고, `뒤틀린 미궁 나침반`은 `Location.getAvailableConnections()`의 `visible` 연결만 추첨해 즉시 이동한다. `공명 회피 파편`은 source key로 다음 회피 가능한 공격 한 번을 보장하며 같은 source가 이미 준비되어 있으면 소비하지 않는다. 전용 아트 전까지 마법 소모품은 `items/mana_potion`, 수정 파편은 `items/diamond` 카테고리 fallback을 사용한다.

직접 공격 후처리는 선택형 `ItemData.onBasicAttackHit(context)`를 사용한다. 회피되지 않고 최종 피해가 0보다 큰 물리 공격이면 `Entity.attack`이 실행하므로 일반 공격과 강타 같은 물리 스킬이 같은 무기 효과를 쓴다. 필요하면 `AttackOptions.triggerMainHandHitEffects`로 해당 공격만 끌 수 있다. 투사체는 발사자 장비가 아닌 자체 Entity가 공격하므로 발사 무기의 적중 callback을 실행하지 않는다. 물리 피해와 상태효과·추가 속성 피해를 한 상성값으로 섞지 않는다.

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

`overrides`는 `name`, 절대 `damage`, `damageType`, `travelTime`, `accelerationCoefficient`, `accelerationMultiplier`, `damageMultiplier`, `damageBonus`, `tags`, `attributeOverrides`를 지원한다. 값은 `parseProjectileReference`가 검증하며 투사체 템플릿은 `data/projectiles.ts`에서 `defineProjectileData`로 등록한다. 피해량을 직접 지정하지 않으면 물리는 owner `atk`, 마법은 `magicForce`에 multiplier와 bonus를 적용한다. 실제 비행 시간은 owner의 `projectileAcceleration` 보너스를 템플릿 계수만큼 반영하며 활·지팡이 modifier도 같은 능력치 API를 사용한다.

## Equipment API와 규칙

슬롯은 `EquipSlotType` 클래스형 enum이 key, 한글 label, 입력 별칭, 최대 수량을 소유한다. 현재 head(1), body(1), legs(1), feet(1), accessory(3), mainHand(1), offHand(1)이다.

- `equip`: 빈 슬롯을 찾아 장착하고 modifier를 적용한다.
- `equipSwap`: 지정 슬롯 또는 빈/마지막 슬롯에 장착하며 밀려난 Item을 반환한다.
- `unequip`: modifier를 제거하고 Item을 반환한다.
- `consumeEquippedItem`: 장착 스택에서 지정 수량만 소비하고 남은 수량은 슬롯에 유지한다.
- `applyModifiers`: 로드된 모든 장비 modifier를 Attribute에 다시 적용한다.
- `setItemMetadata/resetItemMetadata`: 장착 아이템의 delta를 변경하고 해당 슬롯을 dirty로 표시한다.
- `setItemDurability`, `changeItemDurability`, `increaseItemDurability`, `decreaseItemDurability`: 장착 아이템 내구도를 변경하고 해당 슬롯을 dirty로 표시한다.
- `save`: 슬롯별 state와 스택 `count`를 Prisma에 반영한다. DB ID가 없는 신규 슬롯은 `(playerId, slot, slotIndex)` upsert로 저장해 겹친 저장이나 이전 성공 뒤 재시도에도 유니크 오류를 내지 않는다.

장비 modifier의 `source`는 데이터 정의 값 대신 실제 슬롯 기반 source로 치환되어, 특정 장비 해제 시 정확히 제거된다.

## 상점

은빛그물 숲 사냥꾼 거점의 `silverweb_hunter_store`는 사냥활·화살·해독제를 판매하고 `wolf_pelt`, `silverweb_silk`, `venom_gland`를 희귀도에 따라 매입한다.

황혼왕릉 마지막 등불 야영지의 `twilight_memorial_store`는 묘지기 향약과 Lv.30~50 성장 구간용 `맹세철 장검`, `진혼 시위`, `애도목 지팡이`, `묘문 수호방패`를 판매한다. 풍화된 뼛조각·묘지기 천·깨진 맹세 휘장·애도의 백합·혼불 조각을 매입하며 같은 재료는 자동 발견 조합법에도 사용된다. 전용 아트 제작 전에는 실제로 존재하는 검·활·지팡이·방패·소재 카테고리 아이콘을 명시적으로 재사용한다.

유리모래 대상단 야영지의 `glassdune_caravan_store`는 대추야자·물통·해독제·화살과 사막 직업 장비 다섯 종을 제한 재고로 판매하고, 유리모래 권역 소재 다섯 종을 희귀도에 따라 매입한다. 같은 소재는 여섯 자동 발견 조합법과 성물함 보상에도 재사용되어 사냥·채집·제작·상점 회수 경로를 이룬다.

서리잔향 파수초소의 `frostveil_outpost_store`는 행군식·빙결 저항·재생 소모품·화살과 설원 직업 장비 다섯 종을 제한 재고로 판매한다. 지역 소재 일곱 종은 희귀도에 따라 매입되며, 같은 소재는 일곱 자동 발견 조합법과 4~6시간 왕실 유물함 보상에 재사용된다.

안개파도 염등 항구의 `misttide_harbor_store`는 행군식·화염 저항·재생 소모품·화살과 해안 직업 장비 다섯 종을 제한 재고로 판매한다. 지역 소재 여덟 종은 희귀도에 따라 매입되며, 같은 소재는 여덟 자동 발견 조합법과 5~7시간 침몰왕도 유물함 보상에 재사용된다.

역설기계고 중계소의 `paradox_relay_store`는 지역 소모품·화살과 다섯 역할 장비를 제한 재고로 판매한다. 지역 소재 아홉 종은 희귀도에 따라 매입되며, 같은 소재는 아홉 자동 발견 제작법·두 퀘스트·6~8시간 원형 보관고 보상에 재사용된다.

잿빛성흔 심연의 `ashen_waystation_store`는 지역 소모품·화살과 다섯 역할 장비를 제한 재고로 판매하고 소재 여덟 종을 매입한다. 같은 소재는 여덟 자동 발견 제작법, 세 보스 드롭과 7~10시간 봉인 유산고 보상에 재사용된다.

공허왕관의 `voidcrown_waystation_store`는 지역 소모품·화살과 다섯 역할 장비를 제한 재고로 판매하고 소재 여섯 종을 매입한다. 같은 소재는 일곱 자동 발견 제작법, 두 보스 드롭과 8~11시간 비밀 유물함 보상에 재사용된다.

`data/shops.ts`가 `ShopData`를 등록하고 Location의 `shopId`가 상점을 노출한다. `BuyEntry`는 생성 함수·가격·1회 수량·최대 재고·재입고 시간을, `SellEntry`는 필터·가격을 가진다.

- 구매는 현재 위치 상점, 생존 상태, 번호/수량, 재고, 골드, 인벤토리 무게를 검사한 뒤 재고와 골드를 차감하고 아이템을 추가한다.
- 판매는 filter에 맞는 인벤토리 아이템을 제거하고 골드를 지급한다.
- `Shop.update(dt)`가 재입고 timer를 누적하며 게임 루프가 모든 상점을 갱신한다.
- 재고는 메모리 상태여서 서버 재시작 시 최대치로 초기화된다.

현재 `general_store`가 포션, 여행자 빵, 맑은 샘물, 낡은 검, 낡은 방패, 독 단검, 가벼운 활·화살, 견습 마법 지팡이를 판매·매입하며 루미나르 장터의 `shop_general`(별등불 잡화점)에 연결되어 있다. `fishing_store`는 초보자·정교한 낚싯대와 지렁이 미끼를 판매하고 낚시 도구·미끼·등급별 물고기를 매입하며 루미나르 물빛 연못에 연결된다. `silverweb_hunter_store`와 `twilight_memorial_store`는 각각 숲 사냥 재료와 왕릉 소재의 지역 경제를 담당한다.
