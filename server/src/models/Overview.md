# Models Overview

서버가 권위를 갖는 게임 상태와 규칙을 표현한다.

- `Entity`, `Player`, `Monster`: 전투, 생명주기, 성장, AI.
- `AttributeType`/`Attribute`, `StatType`/`Stat`: 클래스형 enum 메타데이터, 기본 능력치와 Entity 기반 source modifier 계산.
- `Item`, `Inventory`, `EquipSlotType`/`Equipment`: 마스터/인스턴스, 무게·스택·슬롯·영속성.
- `Location`: 몬스터, 드롭, 연결 조건, 월드 레지스트리.
- `Shop`: 구매/판매 정의와 재고 timer.

공개 메서드나 모델 관계, 계산식, 저장 경계가 바뀌면 이 문서와 [`docs/api/server-internal.md`](../../../docs/api/server-internal.md), 관련 시스템 문서를 갱신한다.
