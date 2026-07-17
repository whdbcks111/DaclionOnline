# Dialog Components Overview

관리자 도구를 비롯한 화면 위 입력·확인 흐름을 담당하는 공용 오버레이다.

- `Dialog.tsx`: portal, Escape/배경 닫기, 포커스 복원, 스크롤 잠금을 제공하는 접근 가능한 기반 다이얼로그.
- `FormDialog.tsx`: text/number/select/textarea/checkbox 필드 정의로 입력 폼과 비동기 실행 상태를 생성한다.
- `Dialog.module.scss`: PC 중앙 모달과 모바일 하단 시트 전환을 정의한다.

새 화면별 모달을 직접 만들기보다 이 API를 우선 재사용한다.
