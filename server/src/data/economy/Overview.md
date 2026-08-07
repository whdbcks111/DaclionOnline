# Economy Master Data

아이템과 상점의 안정 ID, 가격, 재고, 장비 metadata를 등록한다. `items.ts`가 다른 마스터 데이터의 참조 원본이므로 ID 변경 시 DB와 전체 데이터 참조를 검증한다.

사용자에게 보이는 밸런스 변경은 패치노트 대상이다.
