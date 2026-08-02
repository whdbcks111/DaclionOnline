# 아이템·인벤토리·장비·상점 시스템

주무기는 `weapon:sword/axe/bow/dagger/staff` 태그로 직업 스킬 사용 조건을 제공한다. 전직 시험의 기본 장비 보상은 훈련용 도끼·가벼운 활·독 단검·견습 마법 지팡이이며 스킬은 `Equipment.hasEquippedItemTag` API로만 검사한다.

## 마스터 데이터와 인스턴스

- `models/Item.ts::ItemData`는 이름, 이미지 key, 분류, 무게, 스택, 기본 metadata, 사용 handler ID, 장비 슬롯, modifier, 내구도와 정의 태그를 정의한다. 일반 stackable 아이템은 Prisma `Int` 안전 범위 안의 공용 `MAX_STACKABLE_ITEM_COUNT`를 사용해 사실상 스택 제한이 없고, 실제 휴대 한계는 인벤토리 중량으로 결정한다. 장비처럼 인스턴스 상태가 중요한 non-stackable 아이템은 한 칸에 한 개만 둔다.
- `data/items.ts`가 `defineItem()`으로 마스터 데이터를 프로세스 레지스트리에 등록한다.
- DB `Item`과 런타임 `Item` 객체는 플레이어가 실제 보유한 수량·내구도와 인스턴스 metadata delta를 표현한다.
- 장착된 항목은 DB `Equipment`와 런타임 `Equipment` 슬롯 맵에 별도로 존재한다.
- 주무기를 소모하는 공격은 무기 내구도를 감소시킨다. 직접 피격은 보호막을 뚫고 실제 생명력 피해가 생겼을 때만 방어구 손상을 판정한다. 일반 공격은 `clamp(0.10 + 1.20 × 실제 피해/최대 생명력, 0.10, 0.70)` 확률로 장착 중인 몸통 40·다리 25·머리 20·발 15 가중치 중 한 부위만 감소시키며, 없는 부위는 남은 후보끼리 재정규화한다. 명시적인 전 부위 손상 특수 공격만 모든 방어구를 한 번씩 감소시킨다. 내구도가 0이 되면 장비와 modifier를 즉시 제거하고, 파괴된 인스턴스 이름을 본인 채팅 메시지와 notification에 함께 표시한다.
- 내구도가 있는 마스터 아이템의 최대 내구도는 이전 수치 대비 1.5배로 조정한다. 기존 인스턴스의 현재 내구도는 임의로 회복하지 않으며 새 최대값까지만 수리할 수 있다.

- Item 인스턴스의 추가 태그는 DB JSON에 저장되며 정의 태그와 합쳐 조회한다.
- 인벤토리↔장비↔바닥 이동은 `ItemSnapshot`으로 metadata delta, 내구도, 영속 태그를 보존한다. 스택도 이 값이 모두 같을 때만 합쳐진다.

현재 소모품에는 체력·정신력 포션과 배고픔 35를 회복하는 `traveler_bread`, 수분 40을 회복하는 `fresh_water`가 있다. `large_health_potion`과 `large_mana_potion`은 2.5초 음용 후 해당 자원을 10,000, 수분을 10 회복하는 고농축 대용량 포션이다. 카이로스 공방도시 이후 성장 거점에서 개당 100,000 Gold·종류별 20개 제한 재고로 판매해 고레벨 긴급 회복과 반복 골드 소모처를 함께 제공한다. `graveward_tonic`은 독·맹독·마비독·출혈·부패를 즉시 제거하고 45초 동안 재적용을 막는다. 장비·전투 아이템은 기본 무기·도구 외에도 권역별 성장 장비를 제공한다. 무기 속성 태그는 아이템 분류·제작 조건에 남지만 직접 물리 공격 상성에는 자동 합산하지 않는다. 독 단검은 물리 피해가 실제로 적중한 뒤 50% 확률로 8초간 1레벨 맹독을 부여하며 무생물은 상태효과 적용만 거부한다. 가벼운 활은 화살 한 발을 소비해 원거리 물리 공격을 하며, 일반 화살의 나무·금속 같은 재료 태그는 공격 상성으로 사용하지 않는다. 기본·철 곡괭이는 `item:tool + tool:mining` 태그와 각각 채굴력 30·70을 제공한다. 단조 곡괭이는 일반 공격력 대신 제작자 성장·재료·품질에 비례한 채굴력을 얻는다. 광맥 공격에 곡괭이가 필수는 아니지만 경도를 빠르게 뚫는 가장 효율적인 일반 수단이며, 철 곡괭이는 제작법으로 획득한다.

아이템 퀵 HUD 후보는 `Inventory.getUsableItemHudSnapshots()`가 반환한 현재 보유 `onUse` 아이템 정의뿐이다. 버튼 설정은 슬롯 번호가 아니라 `itemDataId`를 저장하고 `/사용 item:<itemDataId>` 내부 동작이 `getFirstUsableItemByData()`로 현재 인스턴스를 다시 찾는다. 따라서 인벤토리 정리나 스택 소비 뒤에도 같은 정의를 사용하며, 수량이 0이면 설정된 버튼을 회색으로 유지한다.

Lv.50 이후 지역에서는 직업별 고레벨 무기 `풍뢰강 검`, `뇌운 시위`, `밤유리 단검`, `성휘목 지팡이`를 낮은 확률로 획득한다. 각각 공격력+속도, 공격력+치명타율, 공격력+관통과 부패 적중 효과, 마법력+정신력 재생을 제공하며 `ItemData.balance`로 실제 전후 전투 지표를 비교할 수 있다. 초·중반 궁수 장비는 가벼운 활 공격력 4, 은빛그물 사냥활 8, 진혼 시위 23, 뇌운 시위 32로 이어져 동급 검을 든 궁수보다 실제 활 스킬 로테이션이 최소 5% 앞서도록 회귀 검증한다.

낚시 장비는 모두 `tool:fishing` 태그를 가지며 손 슬롯에서 행운·입질 속도·채집 영역 크기/속도·시작 게이지 modifier와 `fishingNetShape` metadata를 제공한다. 루미나르 물빛 연못의 낚시상점은 기본 미끼 조합에서 입질까지 약 31~45초가 걸리는 초보자 낚싯대와 범위·속도가 고르게 강화된 650 Gold의 `정교한 낚싯대`를 판매한다. Lv.70~975의 10개 성장 낚시터는 현지 낚싯대·미끼를 직접 판매하고, 같은 장소 보급상자에서도 현지 낚싯대가 8% 확률로 나온다. 보물상자 전용 `너울그물 낚싯대`는 매우 넓지만 느린 직사각형 영역, `급류바늘 낚싯대`는 작지만 매우 빠른 원형 영역을 제공한다.

`item:bait` 통통한 지렁이 미끼는 `/낚시` 시 보조 슬롯에 미끼가 없으면 인벤토리 묶음 전체가 자동 장착되고, 낚시 시작마다 장착 스택에서 하나만 소비된다. 직접 장착할 때도 스택형 장비는 묶음 전체가 이동한다. 물빛 연못 낚시상점은 미끼를 판매하고 일반~신화 물고기를 등급 태그와 `FishRarity.sellPrice`에 따라 5~8,000 Gold에 매입한다. 상세 흐름은 [미니게임·낚시](minigames-fishing.md)를 참고한다.

광물 아이템은 `stone`, `coal`, `iron_ore`, `gold_ore`, `ruby`, `emerald`, `diamond`이며 같은 인스턴스 상태라면 중량 한도까지 한 스택으로 쌓인다. 피버릭 갱도 입구의 은맥 광부 보급소는 곡괭이를 50 Gold에 판매하고 광물을 희귀도에 따라 각각 2, 5, 10, 25, 55, 60, 180 Gold에 매입한다.

metadata의 유효값은 `ItemData.baseMetadata`와 인스턴스 delta를 top-level key 단위로 합쳐 계산한다. `getMetadata/getMetadataSnapshot`으로 읽고 `setMetadata/resetMetadata`로 변경한다. 기본값과 같은 값을 설정하면 delta가 제거되며, override가 없는 필드는 실행 중 `ItemData.baseMetadata`가 바뀌어도 즉시 최신 값을 상속한다. 객체·배열 같은 중첩 값은 해당 top-level 필드 전체가 하나의 override다.

아이템 이미지는 `Item.image` 공개 API로 조회한다. `/icons` 아래의 확장자 없는 key를 사용하며 `getMetadata('image')` → `ItemData.image` → `items/{itemDataId}` 순서로 결정된다. 따라서 일반 아이템은 `client/public/icons/items/{id}.png`를 자동으로 사용하고, 동일 정의의 개별 인스턴스만 다른 외형이 필요하면 `setMetadata('image', 'items/variant_key')`를 호출한다. 경로 이탈이나 URL 형태의 값은 무시되어 기본 이미지로 대체된다.
현재 등록된 485개 ItemData는 모두 데이터 ID와 같은 `items/{itemDataId}` 128×128 아이콘을 사용한다. 신규 성장 낚시 장비는 전용 아트 제작 전까지 유효한 낚싯대·미끼 fallback을 명시적으로 재사용한다. 아이콘 파일이 없으면 데이터 검증과 회귀 테스트가 실패한다.

Lv.380~500의 역할 장비 15종은 `ItemData.gameplayEffects`와 `onBasicAttackHit/onDamageTaken`으로 실제 고유 효과를 가진다. 검·활·단검은 둔화·방어력 감소·출혈·기절·빙결·실명을, 지팡이는 기본 마력탄 적중 시 정신력 회복·빙결·보호막을, 방패는 실제 피해를 받은 뒤 짧은 재사용 대기시간을 가진 반응형 일반 보호막을 발동한다. `/감정`은 callback 이름이나 내부 key 대신 `gameplayEffects`의 완성된 문장을 보여준다.

`learn_skill` 사용 handler는 아이템 metadata의 `skillDataId`를 `Player.skills.grant()`에 전달한다. 신규 획득 성공 시에만 해당 아이템 인스턴스 한 개를 제거하며 이미 보유했거나 데이터가 잘못된 경우 소비하지 않는다. `seismic_crush_skillbook`과 은빛그물 보스의 `predator_pounce_skillbook`, `silverweb_snare_skillbook`, 카이로스 공방도시의 광자창·인과고정·톱니폭우·역설반전 전승서가 같은 계약을 사용한다. 각 전승서는 자신의 ID와 같은 전용 아이콘을 사용한다.

아셴바흐 심연은 잿빛 힘줄·흑염 잔재·공허뿔·저주뼈·밤쇠·재왕 인장·심연가죽·애도의 눈을 사냥·채굴 소재로 제공한다. 재길 행군식과 두 영약이 생존·화염 저항·재생을 담당하고, 재가름 장검·공허뿔 장궁·황혼송곳·흑염각 지팡이·재성벽 방패가 Lv.238~275 역할 장비를 구성한다. 세 단계 보스의 전승서는 지옥견 돌진·흑염 낙인·재왕의 칙령을 낮은 확률로 제공한다.

벨카인 요새는 무광은·왕관유리·공허비단·기아덩굴·별먹·섭정 인장을 사냥·채굴 소재로 제공한다. 무광 행군식과 공허맥 회복약이 장거리 탐색을 지원하고, 무광은 파성검·왕관현 장궁·공허비단 침·무성좌 지팡이·섭정의 무광방패가 Lv.275~310 역할 장비를 구성한다. 두 보스의 전승서는 공허걸음과 왕관무효를 낮은 확률로 제공한다.

루나리스 해구와 에일린 대성당는 월염수·월식비늘·침은·밤진주·해구섬유·조류인장을 사냥·채굴 소재로 제공한다. 월식 해초말이와 조류심장 영약이 장거리 탐색을 지원하고, 침은 파도검·월조류 장궁·밤진주 잠행도·월식 예언봉·백야 조류방패가 Lv.310~345 역할 장비를 구성한다. 두 보스의 전승서는 역조보법과 월식선고를 낮은 확률로 제공한다.

내구도는 `baseDurability`가 있는 아이템만 사용한다. `durability/durabilityRatio/isBroken`으로 조회하고 `setDurability/changeDurability/increaseDurability/decreaseDurability`로 0~기본 내구도 범위 안에서 변경한다. 소유 중인 아이템이 0이 되면 Inventory는 해당 인스턴스를 삭제하고 Equipment는 슬롯 modifier를 즉시 제거한 뒤 삭제 상태로 저장한다. 주무기가 공격으로 파괴되면 소유 플레이어에게 알림을 보낸다.

은빛그물 숲의 `forest_antidote`는 30초 해독 상태로 독·맹독·마비독을 제거하고 재적용을 막는다. `silverweb_hunter_bow`는 공격력 8·치명타율 2%·투사체 가속 8%를 제공하는 초반 성장 활이다.

유리모래 사막은 유리모래·태양갑각·전갈 독낭·신기루 수정·태양문양 파편을 사냥·채집 소재로 제공한다. 오아시스 대추야자와 그늘 물통은 배고픔/수분을 회복한다. 모래쐐기 장검, 태양실 활, 신기루 독아, 태양유리 지팡이, 태양거울 방패는 Lv.70~110 성장 장비이며 공격·관통·치명타·투사체 가속 또는 물리/마법 생존을 역할별로 보강한다. 무기는 화염·빛·저주 적중 효과처럼 별도 상태효과를 명시적으로 호출하며 물리 공격 상성에 장착 무기 태그를 합산하지 않는 원칙은 유지한다.

HP·MP 포션과 `apply_status_effect` 영약·회복약은 음용 성공 시 수분을 기본 5 회복한다. 개별 물약이 다른 값을 필요로 하면 `baseMetadata.thirst`만 덮어쓰며 모든 회복은 `Entity.restoreThirst()`의 최대 수분 clamp를 통과한다.

서리잔향 설원·빙경궁은 상고 수정·서리늑대 가죽·빙실 거미줄·경철·극광 파편·빙결 핵·눈솔이끼를 소재로 제공한다. 설원 행군식은 생존 자원을, 상고막이 영약은 빙결 저항을, 극광 회복약은 재생을 제공한다. 빙맥 절단검·빙실 연궁·경빙 송곳니·극광분광 지팡이·빙경 성벽방패는 Lv.120~152 구간의 공격·관통·치명타·투사체 가속·양면 생존을 보강하며, 무기 적중 효과는 물리 타격의 속성 상성을 바꾸지 않고 별도 상태효과 API로만 적용된다. 전승서 두 종은 상고 그물과 극광 창을 직업 제한 없이 획득시킨다.

안개파도 해안·침몰왕도는 해무 소금·흑산호·해무비늘·조류진주·침수 군단 휘장·심해철·청해초 수지·해수룡 골편을 소재로 제공한다. 염풍 행군식은 생존 자원을, 해포말 영약은 화염 저항을, 조류심장 회복약은 강한 재생을 제공한다. 파식 조류검·해무 조류궁·흑산호 침·심해진주 지팡이·침몰제독 방패는 Lv.156~186 구간에서 이전 설원 장비보다 약 4~8% 높은 역할별 공격 기여 또는 양면 생존을 제공한다. 해무 파가와 심해 닻 전승서는 각각 두 지역 보스에게서 낮은 확률로 획득한다.

카이로스 공방도시는 시간강 파편·기억 톱니·광자 렌즈·공허 용수철·논리핵·역설 실·자동인형 장갑판·균열 수정·기록원 열쇠 조각을 사냥·채굴 소재로 제공한다. 태엽 작업식·위상 촉진제·논리회로 영약·시간봉합 연고는 생존과 일시 능력 강화를 담당한다. 역설절단검·광자연사궁·공허태엽 단검·논리핵 지팡이·인과율 방패는 Lv.200~235 역할 장비이며 Lv.220 장비 프로파일에서 이전 해안 장비보다 공격 기여 약 4~7%, 양면 생존 약 6~9%를 높인다. 네 전승서는 퀘스트·보스·유물함을 통해 회수한다.

## 감정 명령

`/감정 <인벤토리 번호 또는 장착칸>`은 감각 50 이상에서 사용할 수 있다. 장착칸은 `손`, `다리`, `보조`, `장신구1` 같은 `EquipSlotType` 이름·별칭을 받는다. 감각 50에서는 설명·분류·수량·무게·가공된 속성을, 75에서는 내구도와 능력치 보정을, 100에서는 회복량·획득 스킬·탄약 방식·고유 적중 효과처럼 해석된 특수 효과를 추가로 공개한다. 같은 능력치 modifier는 `summarizeAttributeModifiers()`가 고정값을 합산하고 배율을 곱해 고정·비율 보정을 한 행에 표시한다. 내부 아이템 ID, raw 태그, metadata key/value는 권한과 관계없이 출력하지 않는다. 조회는 `Item.getInspectionSnapshot`, 자동완성은 `Inventory.getIndexedItems`와 `Equipment.getAllEquipped`를 사용한다.

## Inventory API와 규칙

- 조회: `getItem`, `getItemByIndex`, UI용 인덱스 snapshot `getIndexedItems`, `getFirstItemByData`, `getItemsByData`, `getCount`, predicate 수량용 `countMatching`.
- 정렬: `InventorySortMode.values/fromKey/fromInput`이 `종류별`, `이름순`, `자동` 기준을 소유하고 `sortItems(mode)`가 raw 배열을 노출하지 않은 채 표시 순서를 바꾼다. 자동은 사용 가능한 아이템을 먼저, 내구도 아이템을 마지막에 두며 각 묶음은 종류·이름순으로 정렬한다.
- 변경 구독: `subscribeChanges`는 수량·metadata·내구도·태그 변화 뒤 호출되며 QuestBook 같은 소유 기능의 현재 보유 조건 갱신에 사용한다. `replaceSelectedItems` 안의 연속 변경은 한 번으로 묶는다.
- metadata 변경: `setItemMetadata`, `resetItemMetadata`가 대상 Item API를 호출하고 Inventory를 dirty로 표시한다. 조회는 반환된 Item의 `getMetadata`를 사용한다.
- 내구도 변경: `setItemDurability`, `changeItemDurability`, `increaseItemDurability`, `increaseItemDurabilityByIndex`, `decreaseItemDurability`가 Item API를 호출하고 Inventory를 dirty로 표시한다. `Item.repairDurability`는 복구량과 최대 내구도 손실률을 함께 받아 현재 내구도를 새 상한에 맞추고 metadata delta로 영구 열화를 저장한다. 인벤토리 번호와 장착칸을 함께 받는 `/수리`는 대상 해석기가 제공하는 owner callback과 `Inventory.consumeSelectedItems`로 장비 상태와 호환 소재 소비를 함께 처리한다.
- 추가: `canAdd`, `canAddSnapshot(s)`이 총 무게와 아이템 정의를 검사하고 `addItem`이 stackable/maxStack 규칙에 따라 병합 또는 새 인스턴스를 만든다. 일반 stackable 마스터 데이터의 maxStack은 공용 안전 상한이라 중량이 실질 한계다. 기존 인스턴스를 이동할 때는 `addItemSnapshot`을 사용한다.
- 조건부 선택·교환: `selectItems`는 겹치는 여러 predicate에 아이템 수량을 중복 없이 배정하고, `canReplaceSelectedItems`와 `replaceSelectedItems`는 선택 재료와 결과 snapshot의 수량·무게를 같은 규칙으로 사전 검사·교환한다.
- 사용: `useItem`이 `ItemData.onUse` handler를 실행하며 동시에 하나의 아이템만 사용할 수 있다.
- 제거: `removeItem`, `removeItemByData`, `removeItemInstance`가 수량 또는 인스턴스를 dirty/deleted 상태로 바꾼다. `/버리기`와 `/소각`은 `takeItemSnapshotByIndex`가 슬롯·수량 검증, snapshot 생성, 제거를 한 동기 경계에서 수행해 조회/제거 TOCTOU를 만들지 않는다. 버리기만 snapshot을 현재 Location으로 이전하고 소각은 반환된 snapshot을 폐기한다. 발사는 신규 아이템의 임시 DB ID가 겹쳐도 안전한 `removeItemInstance`로 선택한 탄약만 소비한다.
- 저장: state map의 New/Modified/Deleted snapshot을 한 Prisma transaction으로 반영한다. 삭제는 `playerId` 범위의 멱등 `deleteMany`, 수정은 범위가 제한된 `updateMany` 뒤 누락 행 복구를 사용하므로 이전 저장·외부 정리와 겹쳐 이미 사라진 row가 있어도 전체 자동 저장이 중단되지 않는다. 저장 중 새 변경이 생기면 revision을 비교해 dirty 상태를 다음 pass에 남기며 Player 저장 중 Inventory 변경 알림도 다음 pass를 예약한다. 표시 순서는 `items.sort_order`로 저장해 재접속 뒤에도 유지하며, 로드 시 과거의 작은 스택 제한 때문에 여러 DB row로 나뉜 동일 상태 아이템은 현재 maxStack까지 자동 병합하고 dirty flush로 중복 row를 정리한다.

바닥 아이템은 `Location.getDroppedItems()`의 복사본으로 표시하고 `pickupItem(index, count?)/pickupAllItems`로만 제거한다. `Location.addDroppedItem()`은 정의 ID·내구도·metadata delta·영속 태그가 같은 stackable 아이템을 공용 안전 상한까지 합치므로 일반 수량에서는 하나의 바닥 스택으로 표시한다. `/버리기 <슬롯> [개수|전체]`는 기본 1개를 버리고, 지정 수량이 보유량을 넘거나 `전체`이면 해당 인스턴스를 전부 버린다. `/소각 <슬롯> [개수|전체]`는 같은 수량 규칙을 사용하지만 바닥 아이템을 만들지 않고 영구 삭제한다. `/줍기 <번호> [개수]`는 개수를 생략하면 해당 스택 전체를, 지정하면 그 수량만 분리해 옮긴다. 전체 줍기는 모든 스택의 중량을 먼저 검사하므로 하나라도 받을 수 없는 경우 바닥 상태를 변경하지 않는다. 몬스터·파괴 가능한 자원 전리품은 `Player.receiveLoot()`로 먼저 인벤토리에 지급하고 중량이 부족하면 `Location.addDroppedItemData()`로 현재 장소에 보존한다.

`/인벤토리` 목록과 `/상태창`의 장착 정보는 이름 앞에 `Item.image` 아이콘을 표시한다. 인벤토리 현재/최대 중량과 `/감정`의 아이템 단위·합계 중량은 최대 소수 둘째 자리의 `kg` 단위로 표시한다. 내구도가 있는 아이템은 이름 오른쪽에 `em` 길이의 짧은 progress와 현재/최대값 tooltip을 추가한다. progress 색은 50% 초과 초록, 20% 초과~50% 금색, 20% 이하 빨강이며 존재하지 않는 이미지 에셋은 숨겨진다.

`/인벤토리정리 [자동|종류별|이름순]`은 현재 인벤토리 번호의 순서를 영속적으로 다시 배치한다. 기준 생략 시 `자동`이다. `종류별`은 카테고리→이름 가나다순, `이름순`은 이름 가나다순이며 `자동`은 사용 아이템→일반 아이템→내구도 아이템 우선순위 안에서 카테고리→이름 가나다순을 적용한다.

사용 효과는 `registerItemUse(id, handler)`로 등록한다. handler는 성공·실패를 포함한 모든 비동기 종료 경로에서 `finish()`를 호출해야 Inventory의 사용 잠금이 풀린다. HP/MP 포션은 coroutine으로 지연 후 회복하며 HP 포션은 `Entity.heal()`을 사용해 화상·맹독 등 받는 치유량 modifier를 반영한다. 음식·음료는 `restore_survival` handler가 선택 인스턴스를 한 개 소비하고 `Entity.restoreHunger/restoreThirst`로 최대값 안에서 생존 자원을 회복한다.

미궁 보물함의 특수 소모품도 같은 handler 경계를 사용한다. `메아리 모래시계`는 `SkillBook.reduceCooldowns(15)`로 진행 중인 모든 쿨다운을 줄이고, `뒤틀린 미궁 나침반`은 `Location.getAvailableConnections()`의 `visible` 연결만 추첨해 즉시 이동한다. `공명 회피 파편`은 source key로 다음 회피 가능한 공격 한 번을 보장하며 같은 source가 이미 준비되어 있으면 소비하지 않는다.

직접 공격 후처리는 선택형 `ItemData.onBasicAttackHit(context)`를 사용한다. 회피되지 않고 최종 피해가 0보다 큰 물리 공격이면 `Entity.attack`이 실행하므로 일반 공격과 강타 같은 물리 스킬이 같은 무기 효과를 쓴다. 필요하면 `AttackOptions.triggerMainHandHitEffects`로 해당 공격만 끌 수 있다. 아이템 투사체는 적중 시 발사 무기의 마스터 callback과 검증된 인스턴스 `attackEffects`를 명시적으로 전달받아 같은 효과를 실행한다. 물리 피해와 상태효과·추가 속성 피해를 한 상성값으로 섞지 않는다.

## 특수 효과 장비와 획득처

보스·유물함 희귀 장비는 고정 능력치만 높은 상위호환 대신 공격 방식, 자원, 생존 조건을 바꾸는 `gameplayEffects`와 ItemData callback을 가진다.

- `중력호 장궁`, `성좌연결궁`: 적중 시 원래 피해 일부의 메아리 탄환을 추가 발사한다.
- `궤도이탈 송곳니`: 대상 현재 생명력 비례 추가 피해를 주되 원래 적중 피해의 150%를 상한으로 둔다.
- `영시각 지팡이`: 매 기본 공격 피해가 68~132% 사이에서 무작위로 변한다.
- `종성단절검`: 확률적으로 실제 생명력 피해 일부를 회복한다.
- `삼연철포`: 긴 기본 공격 주기의 대가로 공격력 72%짜리 회피 불가 탄환 세 발을 시간차 발사한다.
- `성벽시위`: 적중할 때마다 5초 방어력 +70을 얻고 지속시간을 갱신하며 최대 5중첩한다.
- `악마의 검`: 공격력 20%를 얻고 생명력 재생이 억제되며 초당 최대 생명력 1%를 소모한다.
- `포식뿌리 흉갑`: 경험치 획득량이 10% 감소하지만 몬스터 처치 시 잃은 생명력 12%를 회복한다.
- `황금반향 갑주`: 피해를 받을 때 피해 비율에 따라 1~10 Gold를 만든다.
- `회귀성운 갑주`: 6시간에 한 번 치명적 피해를 막고 최대 생명력 30%로 되돌린다. 재사용 가능 시각은 아이템 metadata에 저장되어 장비 교체·재접속으로 초기화되지 않는다.
- `업식검 카르마보어`: 장착 중 초당 카르마 0.2를 검에 저장한다. 내구도 또는 강화 실패로 파괴되면 흡수량 50%를 당시 소유자에게 되돌리고 Lv.10 쇠약의 저주를 7일 부여한다.

포식뿌리 흉갑은 에오나의 심장수 보스와 세계수 기억호박 유물고에서 나오며, 나머지 신규 특수 장비는 벨카인 섭정·회색성흔 군주·성운군주·영시여왕·최후성좌 등 테마에 맞는 보스의 1~1.6% 희귀 드롭이다. 장착 중 경험치 배율, 처치, 피격, 지속 tick, 치명적 피해 방지, 내구도 파괴 callback은 `Equipment` 공개 실행 API를 통해 호출한다.

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

`basic_arrow`는 중립 물리 투사체다. 나무·철·금속 같은 탄약의 태그는 제작 재료와 아이템 분류에는 보존하지만 일반 화살 피해 전체의 속성 상성으로 사용하지 않는다. 새 단조 화살은 투사체 override에서 `property:*`를 제외하며, `executeProjectileItemAttack()`도 과거 저장 화살의 같은 override를 발사 시 정규화한다. 화염 화살·금속 관통 화살처럼 실제 공격에 속성이 필요한 기술은 SkillData 또는 별도 투사체 정의가 `tags`를 명시해야 한다.

## Equipment API와 규칙

슬롯은 `EquipSlotType` 클래스형 enum이 key, 한글 label, 입력 별칭, 최대 수량을 소유한다. 현재 head(1), body(1), legs(1), feet(1), accessory(3), mainHand(1), offHand(1), bag(1)이다. 가방은 다른 장비와 독립된 한 칸을 사용하며 `maxWeight` modifier로 인벤토리 최대 중량을 늘린다.

- `equip`: 빈 슬롯을 찾아 장착하고 modifier를 적용한다.
- `equipSwap`: 지정 슬롯 또는 빈/마지막 슬롯에 장착하며 밀려난 Item을 반환한다.
- `unequip`: modifier를 제거하고 Item을 반환한다.
- `consumeEquippedItem`: 장착 스택에서 지정 수량만 소비하고 남은 수량은 슬롯에 유지한다.
- `applyModifiers`: 로드된 모든 장비 modifier를 Attribute에 다시 적용한다.
- `applyOwnerEffects`, `updateOwnerEffects`, `triggerOwnerDefeatedEntity`, `triggerDamageTakenEffects`, `tryPreventFatalDamage`: 장착자의 경험치 배율과 처치·피격·지속·치명적 피해 효과를 내부 슬롯 노출 없이 실행한다.
- `setItemMetadata/resetItemMetadata`: 장착 아이템의 delta를 변경하고 해당 슬롯을 dirty로 표시한다.
- `setItemDurability`, `changeItemDurability`, `increaseItemDurability`, `decreaseItemDurability`: 장착 아이템 내구도를 변경하고 해당 슬롯을 dirty로 표시한다.
- `ArmorDurabilityDamageMode.values/fromKey/fromInput`과 `damageArmorDurability(lifeDamage, maxLife, mode, random?)`: 일반 `SINGLE` 확률·가중 선택과 명시적 특수 공격용 `ALL`을 적용하고, 손상 슬롯·직전/현재 내구도·파괴 여부의 불변 snapshot을 반환한다. 확률·부위 난수는 테스트에서 각각 주입할 수 있다.
- `save`: 슬롯별 state와 스택 `count`를 Prisma에 반영한다. DB ID가 없는 신규 슬롯은 `(playerId, slot, slotIndex)` upsert로 저장해 겹친 저장이나 이전 성공 뒤 재시도에도 유니크 오류를 내지 않는다.

장비 modifier의 `source`는 데이터 정의 값 대신 실제 슬롯 기반 source로 치환되어, 특정 장비 해제 시 정확히 제거된다.

## 상점

각 `ShopData.recommendedLevel`은 구매품 조건의 성장 기준이다. 장비는 해당 구간의 약 72% 레벨과 무기·방어구 계열에 맞는 완만한 핵심 스탯 조건을, 효과가 있는 소모품은 약 55% 사용 레벨을 인스턴스 metadata로 받는다. 시작 상점은 사실상 Lv.1 조건이며 고레벨 장비만 초보 캐릭터에게 바로 이전해 사용할 수 없도록 제한한다.

아이템 조건은 `Item.requirements` 공개 snapshot과 `Player.getItemRequirementDeniedReason()`으로 검사한다. 감정 화면에는 레벨·스탯과 상점품/보물 완화/단조품 출처를 표시한다. 승천 유물함 장비는 같은 권역 상점품보다 완화된 약 50% 레벨·12% 핵심 스탯 조건을 사용해 희귀 획득의 조기 사용 보상을 유지한다.

루미나르 잡화점의 `general_store`는 시작용 견습 마법 지팡이와 Lv.20 성장용 성휘목 지팡이를 함께 판매한다. 성휘목 지팡이는 180골드·2개 재고·5분 재입고이며, 초반 마법사가 황혼왕릉 진입 전에 정상적인 장비 단계를 확보하는 경로다. Lv.40 전후에는 황혼왕릉 야영지의 애도목 지팡이로 교체한다.

가방 성장선은 루미나르 25kg, 피버릭 광산 50kg, 황혼왕릉 80kg, 유리사막 120kg, 설원 175kg, 안개파도 230kg, 카이로스 공방도시 300kg, 잿빛성흔 365kg, 벨카인 435kg, 루나리스 해구 510kg, 카미하라 숲 600kg, 아스트라 회랑 700kg, 에버프로스트 정원 820kg, 라그나벨 성단 960kg 순서다. 각 가방은 해당 안전 거점 상점에서 제한 재고로 구매해 같은 `bag` 슬롯에 교체 장착한다. 일반 보물상자는 40kg 여우꼬리 허리주머니, 철근미궁 보물함은 210kg 공명 접이배낭, 카미하라 숲 유물함은 680kg 기억호박 무저배낭을 낮은 확률로 제공한다.

역설 중계소부터 종언성채까지의 성장 거점은 대용량 체력·마나 포션을 마스터 데이터상 각각 20개씩 보유하고 180초마다 한 병을 재입고한다. 공유 상점의 5인 공급 보정을 적용한 실제 최대 재고는 100개, 실제 재입고 간격은 36초다. 개당 100,000 Gold의 반복 구매 가격은 Lv.269의 수백만 Gold와 Lv.500 이후 수천만 Gold 보유 구간에서 긴급 회복의 편의와 장기적인 재화 소모를 교환하도록 맞춘다.

은빛그물 숲 사냥꾼 거점의 `silverweb_hunter_store`는 사냥활·화살·해독제를 판매하고 `wolf_pelt`, `silverweb_silk`, `venom_gland`를 희귀도에 따라 매입한다.

황혼왕릉 마지막 등불 야영지의 `twilight_memorial_store`는 묘지기 향약을 마스터 재고 24개·60초 재입고로 공급하고 Lv.30~50 성장 구간용 `맹세철 장검`, `진혼 시위`, `애도목 지팡이`, `묘문 수호방패`를 판매한다. 풍화된 뼛조각·묘지기 천·깨진 맹세 휘장·애도의 백합·혼불 조각을 매입하며 같은 재료는 자동 발견 조합법에도 사용된다. 안개파도·카이로스·아셴바흐·카미하라·라그나벨·아오이의 안전 거점도 각각 독립된 향약 재고 12개와 60초 재입고를 제공한다. 5인 공유 공급 보정 뒤 실제 최대 재고는 황혼왕릉 120개, 각 후속 거점 60개이고 실제 재입고 간격은 12초다.

`적대 귀환 두루마리`는 사용 handler가 없는 자동 전용 stackable 아이템이다. 적대 구역 사망이 처음 확정될 때만 한 장을 소모하고 지역 위험도와 악명 가산까지 반영된 전체 부활 대기를 절반으로 줄인다. Lv.40~500 성장 상점 12곳은 마스터 재고 16개·90초 재입고로 공급해 실제 공유 재고 80개·18초 재입고를 제공하고, Lv.550~1000 승천 전초 10곳은 마스터 재고 20개·75초로 실제 100개·15초를 제공한다. 카이로스 잔해호 이후 후반 낚시터 8곳의 희귀 보물 표에서도 한두 장을 얻을 수 있다.

유리모래 대상단 야영지의 `glassdune_caravan_store`는 대추야자·물통·해독제·화살과 사막 직업 장비 다섯 종을 제한 재고로 판매하고, 유리모래 권역 소재 다섯 종을 희귀도에 따라 매입한다. 같은 소재는 여섯 자동 발견 조합법과 성물함 보상에도 재사용되어 사냥·채집·제작·상점 회수 경로를 이룬다.

서리잔향 파수초소의 `frostveil_outpost_store`는 행군식·빙결 저항·재생 소모품·화살과 설원 직업 장비 다섯 종을 제한 재고로 판매한다. 지역 소재 일곱 종은 희귀도에 따라 매입되며, 같은 소재는 일곱 자동 발견 조합법과 4~6시간 왕실 유물함 보상에 재사용된다.

안개파도 염등 항구의 `misttide_harbor_store`는 행군식·화염 저항·재생 소모품·화살과 해안 직업 장비 다섯 종을 제한 재고로 판매한다. 지역 소재 여덟 종은 희귀도에 따라 매입되며, 같은 소재는 여덟 자동 발견 조합법과 5~7시간 침몰왕도 유물함 보상에 재사용된다.

카이로스 공방도시 중계소의 `paradox_relay_store`는 지역 소모품·화살과 다섯 역할 장비를 제한 재고로 판매한다. 지역 소재 아홉 종은 희귀도에 따라 매입되며, 같은 소재는 아홉 자동 발견 제작법·두 퀘스트·6~8시간 원형 보관고 보상에 재사용된다.

아셴바흐 심연의 `ashen_waystation_store`는 지역 소모품·화살과 다섯 역할 장비를 제한 재고로 판매하고 소재 여덟 종을 매입한다. 같은 소재는 여덟 자동 발견 제작법, 세 보스 드롭과 7~10시간 봉인 유산고 보상에 재사용된다.

벨카인의 `voidcrown_waystation_store`는 지역 소모품·화살과 다섯 역할 장비를 제한 재고로 판매하고 소재 여섯 종을 매입한다. 같은 소재는 일곱 자동 발견 제작법, 두 보스 드롭과 8~11시간 비밀 유물함 보상에 재사용된다.

루나리스 해구의 `eclipse_dock_store`는 지역 소모품·화살과 다섯 역할 장비를 제한 재고로 판매하고 소재 여섯 종을 매입한다. 같은 소재는 일곱 자동 발견 제작법, 두 보스 드롭과 8~12시간 침수 유물함 보상에 재사용된다.

카미하라 숲의 `worldroot_waystation_store`는 지역 소모품·화살과 다섯 역할 장비를 제한 재고로 판매하고 소재 여섯 종을 매입한다. 같은 소재는 일곱 자동 발견 제작법, 두 보스 드롭과 9~13시간 기억호박 유물함 보상에 재사용된다.

아스트라 회랑·에버프로스트 정원·라그나벨 성단의 `nebula_waystation_store`, `chronofrost_refuge_store`, `endstar_bastion_store`는 각각 지역 소재 다섯 종을 매입하고 생존품·화살·가방·전사/궁수/암살자/마법사/방어 역할 장비를 판매한다. 권역마다 일곱 자동 발견 제작법이 같은 재료를 소비하며, 완성 장비는 Lv.500 밸런스 리포트에서 이전 권역 장비보다 역할별 성능이 단계적으로 증가하는지 비교한다.

Lv.500~1000 승천 변경의 10개 전초 상점은 권역 소재 하나를 매입하고 단층검·원환궁·경계송곳니·공명지팡이·심층방패와 성장 가방, 대용량 HP/MP 포션과 화살을 판매한다. 장비 수치는 50레벨 단위로 상승하고 군주 보스는 같은 권역 소재, 숨은 제단용 군주 인장과 낮은 확률의 양면 능력 장신구를 드롭한다. 권역 유물함은 4~8시간마다 소재 묶음 또는 역할 장비 하나를 지급하며 중량이 부족하면 `Player.receiveLoot()`가 현재 장소 바닥에 보존한다.

`data/shops.ts`가 `ShopData`를 등록하고 Location의 `shopId`가 상점을 노출한다. `BuyEntry`는 생성 함수·가격·1회 수량·최대 재고·재입고 시간을, `SellEntry`는 필터·가격을 가진다.

- `facility:lawful` 상점은 `Shop.getAccessDeniedReason(player)`로 카르마 정책을 검사한다. `/상점`, 구매, 개별 판매, 전체 판매와 자동완성에 같은 API를 적용해 우회 경로를 막는다.
- 구매는 현재 위치 상점, 생존 상태, 번호/수량, 재고, 골드, 인벤토리 무게를 검사한 뒤 재고와 골드를 차감하고 아이템을 추가한다.
- 판매는 `Inventory.countMatching/removeMatching`으로 filter에 맞는 아이템을 제거하고 골드를 지급한다.
- `Shop.update(dt)`가 재입고 timer를 누적하며 게임 루프가 모든 상점을 갱신한다.
- 상점 재고는 서버 전체 플레이어가 공유한다. 여러 명이 동시에 이용해도 공급량이 지나치게 줄지 않도록 모든 품목의 실제 최대 재고를 마스터 수치의 5배로 잡고 실제 재입고 간격은 1/5로 줄인다.
- 마스터 데이터의 1인 기준 재입고 시간은 최대 10분으로 제한하므로 다인원 보정 뒤 실제 품목 하나의 재입고는 최대 2분을 넘지 않는다.
- `Shop.getStock/getStockCapacity`가 현재 재고와 다인원 보정된 실제 최대 재고를 제공하며 상점 화면도 이 값을 표시한다.
- 재고는 메모리 상태여서 서버 재시작 시 최대치로 초기화된다.

현재 `general_store`가 포션, 여행자 빵, 맑은 샘물, 낡은 검, 낡은 방패, 독 단검, 가벼운 활·화살, 견습 마법 지팡이를 판매·매입하며 루미나르 장터의 `shop_general`(별등불 잡화점)에 연결되어 있다. `fishing_store`는 초보자·정교한 낚싯대와 지렁이 미끼를 판매하고 낚시 도구·미끼·등급별 물고기를 매입하며 루미나르 물빛 연못에 연결된다. 추가 10개 성장 낚시터 상점은 각 장소의 권장 레벨 낚싯대와 미끼를 같은 장소에서 공급한다. `silverweb_hunter_store`와 `twilight_memorial_store`는 각각 숲 사냥 재료와 왕릉 소재의 지역 경제를 담당한다.
