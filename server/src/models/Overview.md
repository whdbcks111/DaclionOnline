# Models Overview

서버가 권위를 갖는 게임 상태와 규칙을 표현한다.

- `Combat`, `TagEffect`, `Entity`, `Player`, `Monster`: 치명타·단방향 태그 효과 배율·방어/관통 계산 API, 전투 생명주기, 성장, AI.
- `AttributeType`/`Attribute`, `StatType`/`Stat`: 클래스형 enum 메타데이터, 기본 능력치와 Entity 기반 source modifier 계산.
- `Item`, `Inventory`, `EquipSlotType`/`Equipment`: metadata override와 ID 기본 경로를 지원하는 이미지 API, 마스터/인스턴스 태그, 손실 없는 snapshot 이동, 무게·스택·슬롯·영속성. `Item.test.ts`가 이미지 우선순위와 안전 경로 fallback을 검증한다.
- `Location`: 장소 태그, 몬스터, raw 배열을 숨긴 태그 포함 드롭 조회·단일/전체 회수, 연결 조건, 월드 레지스트리.
- `Shop`: 상점 태그, 구매/판매 정의와 재고 timer.

공개 메서드나 모델 관계, 계산식, 저장 경계가 바뀌면 이 문서와 [`docs/api/server-internal.md`](../../../docs/api/server-internal.md), 관련 시스템 문서를 갱신한다.
