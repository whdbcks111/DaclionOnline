# World Master Data

장소 JSON과 연결 조건, 몬스터·자원·NPC, 승천 권역, 던전 퍼즐, 전문 도감 구성을 소유한다. `locations.json`은 배치 원본이고 `locations.ts`는 코드 조건 handler를 등록한다.

월드 변경은 `world.test.ts`, 전문 도감 초기화, 전체 마스터 데이터 검증을 함께 확인한다.

`instanceDungeons.ts`는 차원 균열 자원·상호작용, 균열 원형 몬스터와 최초 던전 템플릿을 정의한다. 동적 방 인스턴스 자체는 `modules/world/instanceDungeon.ts`가 원정마다 생성·폐기한다.

Lv.100 `굴절하는 차원 균열`은 유리모래 3 그림자 관측소가 아니라 안전 거점인 `glassdune_caravan` 대상단 상점에 배치한다.

`upperDimensionExpedition.ts`는 초월 후 Lv.1000 재도달자가 아르케를 우회해 들어가는 8개 상위차원 진입 장소, 역지옥문 안전 거점과 동서 정찰로, 안정 장소 ID와 연결 조건 ID를 소유한다. 영구 권한 판정은 `locations.ts`, 실제 개방·이동은 `modules/world/ascension.ts`가 담당한다.

`travelHubs.ts`는 루미나르와 Lv.28~500 지역 안전 거점 12곳의 공간 중계소 비용·선행 퀘스트, 공격 불가 `travel_relay` 상호작용 자원을 정의한다. 루미나르는 기본 해금이고 나머지는 지역 첫 복구·보급 퀘스트와 5만~800만 Gold 해금 비용을 요구하며, 목적지별 500~8만 Gold 사용료와 거주점 기능을 공유한다.
