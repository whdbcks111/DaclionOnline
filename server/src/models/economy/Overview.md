# Economy Models

Item, Inventory, Equipment, Shop과 아이템 적중 효과를 소유한다. 아이템 선택·교환·장착·내구도·재고 변경은 공개 명령형 API를 통과하며 외부에서 raw 항목 배열을 수정하지 않는다. Inventory 정리는 metadata delta·내구도·영속 태그까지 같은 stackable 인스턴스만 병합한다.

마스터 정의는 `data/economy`, 사용자 명령은 `commands/economy`에 둔다.
