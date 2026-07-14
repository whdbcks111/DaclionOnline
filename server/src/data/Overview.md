# Data Overview

서버 시작 시 import 부작용으로 런타임 레지스트리에 들어가는 마스터 데이터를 둔다.

- `items.ts`: 아이템 정의와 사용 효과 등록.
- `monsters.ts`: 몬스터 능력치·보상·드롭 정의.
- `shops.ts`: 상점 매매 목록과 재고 정의.
- `locations.json`: 위치 좌표·연결·스폰·상점 연결의 원본.
- `locations.ts`: 연결 condition handler 등 코드형 위치 확장.

ID는 DB와 다른 데이터 파일에서 참조되므로 변경 시 참조 전체를 확인한다. 데이터 구조나 ID가 바뀌면 이 문서와 해당 [`docs/systems/`](../../../docs/systems) 문서를 갱신한다.
