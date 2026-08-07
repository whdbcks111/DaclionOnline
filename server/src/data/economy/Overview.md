# Economy Master Data

아이템과 상점의 안정 ID, 가격, 재고, 장비 metadata를 등록한다. `items.ts`가 다른 마스터 데이터의 참조 원본이므로 ID 변경 시 DB와 전체 데이터 참조를 검증한다.

사용자에게 보이는 밸런스 변경은 패치노트 대상이다.

`transcendent_compass`는 초월 시 한 번 지급되는 무게 0 귀속 아티팩트다. `transcendent_wayfarer_pack`은 Lv.2000 이하에서 최대 중량 1,000kg을 제공하는 환생 정리용 귀속 가방이다. 경험치 효과의 실제 계산은 Player 초월 정책이 소유하며 아이템은 소지·설명과 버리기/소각/거래 제한을 제공한다.
