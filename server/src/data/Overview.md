# Data Overview

서버 시작 시 import 부작용으로 런타임 레지스트리에 들어가는 마스터 데이터를 둔다.

- `items.ts`: 아이템 이미지 key·`baseMetadata`·정의 태그·사용/공격 효과 등록. 인스턴스는 기본 metadata 전체를 복사하지 않고 top-level delta만 저장한다. 불 검, 독 단검, 가벼운 활/화살, 채굴 태그 곡괭이와 7종 광물이 있다.
- `projectiles.ts`: 코드에서 참조하는 투사체 마스터 데이터. 물리 화살과 무탄약 무기용 마력 구체 예시를 등록한다.
- `monsters.ts`: 몬스터 정의 태그, 능력치·보상·드롭 정의. 무생물·물·독 슬라임, 자연 고블린, 무생물 돌 골렘이 있다.
- `resources.ts`: 비공격 Entity 자원의 능력치, 도구 제한, 가중치 드롭, 범위 경험치, 상호작용 handler 정의. 현재 광석이 있다.
- `shops.ts`: 잡화점과 피버릭 광산 상점의 태그, 매매 목록과 재고 정의.
- `tagEffects.ts`: `source tag → target tag → modifier` 단방향 효과 테이블.
- `locations.json`: 위치 태그·좌표·연결·`monster | resource` 통합 오브젝트 배치·상점 연결의 원본.
- `locations.ts`: 연결 condition handler 등 코드형 위치 확장.

ID는 DB와 다른 데이터 파일에서 참조되므로 변경 시 참조 전체를 확인한다. 데이터 구조나 ID가 바뀌면 이 문서와 해당 [`docs/systems/`](../../../docs/systems) 문서를 갱신한다.
