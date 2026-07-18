# 제작법·제작 시스템

제작법은 `models/Crafting.ts`의 정적 레지스트리에 등록하며, 제작법 발견 상태는 기존 `PlayerProgress` flag로 저장한다. 재료 판정과 교환은 제작 코드가 Inventory raw 배열을 읽지 않고 `Inventory.selectItems/replaceSelectedItems`를 사용한다.

```text
data/crafting.ts::defineCraftingRecipe
  ↓
Player.update → updateCraftingRecipeDiscovery → PlayerProgress flag
  ↓
/제작법목록 또는 /제작 <이름> [개수]
  ↓
Inventory.selectItems → 제작 대기 → factory → replaceSelectedItems
```

## 제작법 정의

`CraftingRecipeData` 필드는 다음과 같다.

| 필드 | 의미 |
| --- | --- |
| `id` | `namespace:path` 형식의 영구 ID |
| `resultItemDataId` | 일반적인 결과 아이템 ID. `name`을 생략하면 이 아이템의 이름을 제작법 이름으로 쓴다. |
| `name`, `aliases`, `description` | 명령 검색과 UI 표시 정보 |
| `ingredients` | `CraftingRecipeIngredient` 배열. label, 필요 수량, `Item` predicate를 가진다. |
| `craftTime` | 1개 제작에 걸리는 초. 여러 개는 `craftTime × 개수`만큼 걸린다. |
| `create` | 플레이어, 제작법, 개수, 실제 선택된 재료를 받아 `ItemSnapshot` 결과를 만드는 factory |
| `discoveryCondition` | 선택. 생략하면 1회분 재료를 모두 소지했을 때 발견한다. 정의하면 기본 조건을 완전히 대체한다. |
| `tags` | 제작법 분류와 후속 조건에 쓸 태그 |

정의 ID로만 필터링할 때는 `CraftingRecipeIngredient.item(itemDataId, count)`를 쓴다. 아이템 상태를 보는 재료는 직접 predicate를 정의한다.

```ts
new CraftingRecipeIngredient(
    '내구도 50% 이상의 검',
    1,
    item => item.category === '검'
        && item.durability !== null
        && item.baseDurability !== null
        && item.durability >= item.baseDurability * 0.5,
)
```

factory의 `ingredients` 안에는 predicate에 실제로 선택된 `Item`과 수량이 들어온다. 따라서 수리, 합성, 메타데이터 승계처럼 재료 인스턴스의 상태에 따라 결과가 달라지는 제작을 만들 수 있다.

## 재료 선택과 소비

`Inventory.selectItems()`는 최대 유량으로 여러 predicate와 아이템 수량을 매칭한다. 하나의 아이템이 여러 재료 조건에 맞더라도 같은 수량을 중복 계산하지 않으며, 가능한 전체 배정이 있으면 찾는다.

`Inventory.replaceSelectedItems()`는 선택 수량, 결과 snapshot, 제작 후 총 무게를 먼저 검증한 뒤 재료 제거와 결과 추가를 하나의 도메인 작업으로 처리한다. 제작 대기 중에 재료가 달라지면 완료 시점에 다시 선택하고, 조건을 충족하지 못하면 소비 없이 실패한다.

## 발견·실행 수명주기

- 발견 상태는 `crafting:recipe/{namespace}/{path}` Progress flag로 저장되며 플레이어의 주기 저장, unload, 종료 flush에 포함된다.
- `Player.update()`가 0.5초 마다 미발견 제작법 조건을 검사하며, 발견 시 채팅과 notification을 보낸다.
- 한 플레이어는 동시에 하나의 제작만 진행한다. 접속 종료나 사망 시 취소된다.
- 재료는 시작 시 잠그거나 소비하지 않고 완료 시 교환한다. 따라서 중도 취소로 재료가 유실되지 않는다.
- 제작법 발견과 제작 완료는 각각 `crafting:recipe_discovered`, `crafting:item_crafted` GameEvent를 발행한다.

## 명령어와 현재 콘텐츠

- `/제작법목록`: 발견한 제작법의 재료, 1개당 시간, 현재 제작 가능 여부와 제작 버튼을 표시한다.
- `/제작 <제작법이름> [개수]`: 마지막 token이 숫자면 1~99의 제작 개수로 해석하고 생략 시 1개를 만든다.
- 현재 `basic:iron_pickaxe` 제작법이 있다. 철광석 3개와 돌 2개로 4초에 철 곡괭이 1개를 만든다.

## 조합형 단조 장비 기반

`Forging`은 일반 제작법과 달리 하나의 고정 마스터 아이템을 그대로 복제하지 않는다. 장검·도끼·단검·방패·곡괭이 `ForgeForm`과 철·금·루비·에메랄드·다이아몬드 `ForgeMaterial`을 조합하고, 리듬 단조 정확도로 효율을 계산한다. 형태와 재료는 기본 공격/방어 수치·내구도·속성 태그를 결정하며, 균형·날 선·묵직한·정밀한 trait 하나만 서버 난수로 선택되어 이름과 보조 능력치를 바꾼다.

결과는 `forged_*` 형태별 마스터 템플릿을 사용하되 `customName`, `customDescription`, `maxDurability`, `instanceModifiers`, `forge` metadata delta와 재료 속성 영속 태그만 저장한다. 따라서 같은 아이템 데이터 ID여도 서로 다른 이름·내구도·능력치를 갖는다. `Item` 공개 getter와 `Equipment`가 이 유효값을 사용하며 metadata 원본이나 장비 내부 row를 직접 읽지 않는다. 전용 아이콘 제작 전에는 각 형태의 기존 카테고리 아이콘을 fallback으로 사용한다.
