# Dialog Components Overview

관리자 도구를 비롯한 화면 위 입력·확인 흐름을 담당하는 공용 오버레이다.

- `Dialog.tsx`: portal, Escape/배경 닫기, 포커스 복원, 스크롤 잠금을 제공하는 접근 가능한 기반 다이얼로그.
- `FormDialog.tsx`: text/number/select/textarea/checkbox 필드 정의로 입력 폼과 비동기 실행 상태를 생성한다. 모든 select는 검색 가능한 공용 선택기를 사용한다.
- `SearchableSelect.tsx`, `SearchableSelect.module.scss`: label·코드·설명을 검색하고 PC popover/모바일 하단 목록으로 선택하는 공용 combobox다. 목록은 `document.body` portal에 렌더링해 Dialog 본문 overflow에 잘리지 않으며, PC에서는 trigger 주변의 위·아래 여유 공간을 골라 배치하고 스크롤·resize 때 위치를 동기화한다. 항목 행은 개수와 무관하게 최소 높이를 유지하고, 넓고 높은 목록 영역만 viewport 상한 안에서 스크롤한다.
- `Dialog.module.scss`: PC 중앙 모달과 모바일 하단 시트 전환을 정의한다.

새 화면별 모달을 직접 만들기보다 이 API를 우선 재사용한다.
