# Models Overview

서버가 권위를 갖는 게임 상태와 규칙을 표현한다.

- `Combat`, `TagEffect`, `Entity`, `Player`, `Monster`: 치명타·공격용 본체+무기/피격용 본체 전용 태그 문맥·단방향 효과 배율·방어/관통 계산 API, 공격 쿨다운 확정, 전투 생명주기, 성장, AI. `attackOwner`로 실제 피해원과 보상·어그로 귀속 주체를 분리한다.
- `Projectile`: `Entity`를 상속하는 비영속 투사체, 마스터 데이터/JSON 오버라이드 검증, owner·target·비행 시간·적중 수명주기와 정적 레지스트리 API. 상성은 owner 장비가 아닌 투사체 본체 태그만 사용한다.
- `AttributeType`/`Attribute`, `StatType`/`Stat`: 클래스형 enum 메타데이터, 기본 능력치와 Entity 기반 source modifier 계산.
- `Item`, `Inventory`, `EquipSlotType`/`Equipment`: `baseMetadata`+인스턴스 delta와 내구도의 조회·설정·증가·차감·dirty callback, 기본 공격 오버라이드 key, 이미지 API, 마스터/인스턴스 태그, 손실 없는 snapshot 이동, 무게·스택·슬롯·영속성. `removeItemInstance`는 DB ID가 없는 신규 탄약도 정확히 소비한다.
- `Location`: 장소 태그, 몬스터, raw 배열을 숨긴 태그 포함 드롭 조회·단일/전체 회수, 연결 조건, 월드 레지스트리.
- `Shop`: 상점 태그, 구매/판매 정의와 재고 timer.

공개 메서드나 모델 관계, 계산식, 저장 경계가 바뀌면 이 문서와 [`docs/api/server-internal.md`](../../../docs/api/server-internal.md), 관련 시스템 문서를 갱신한다.
