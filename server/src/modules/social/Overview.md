# Social Modules

파티, 거래, 랭킹 조회와 카르마 이벤트 연결을 소유한다. manager가 초대·세션 Map을 단독 소유하고 외부에는 불변 snapshot과 명령형 API만 제공한다.

영속 수치 변경은 Player의 dirty 경계, 거래 교환은 에스크로와 원자 적용 규칙을 따른다.

공통 계정 세션은 `modules/portal/login.ts`의 공개 API를 사용한다. 포털 로그인과 실제 게임 입장은 분리되며 게임 이름은 Player의 표시명을 사용한다.
