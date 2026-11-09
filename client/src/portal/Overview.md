# Portal Client

`Portal.tsx`는 `/`의 게임 목록과 공통 계정 로그인 상태를 표시한다. `Login`, `Register`, `PasswordReset`은 포털 계정 인증 화면이며 게임 캐릭터를 생성하지 않는다. `Portal.module.scss`는 포털과 첫 게임 정보 입력 화면의 반응형 스타일을 소유한다.

로그인은 포털로 돌아오며 `/login?next=daclion`만 서버 게임 입장 화면으로 이동한다. 기존 계정은 동일 ID/PW로 로그인한다. 포털 닉네임과 게임 캐릭터 이름은 별도이며, 게임 시작 후 추가 정보는 해당 게임의 GameGate가 받는다. 가입 성공 후 쿠키를 반영해 소켓을 재연결하고 포털 세션을 복원한다.

포털의 표시 이름은 `GAME BOX`이며 화면·브라우저 제목·가입/비밀번호 재설정 메일에 동일하게 사용한다.

GAME BOX의 게임 시작 링크는 `/auth/daclion`을 통해 게임 도메인으로 이동한다. `next=daclion` 로그인 성공과 이미 로그인된 계정은 같은 인증 연결로 이동하며 게임 도메인의 쿠키를 공용 부모 도메인에 공유하지 않는다.

`AuthLayout.tsx/AuthLayout.module.scss`는 로그인·회원가입·비밀번호 찾기의 공통 포털 shell과 폼 스타일을 소유한다. 상단 브랜드/포털 복귀, PC·모바일 중앙 단일 입력 카드와 독립 스크롤을 제공한다. 각 화면은 label, autocomplete, form submit, 검증 결과의 alert/status를 사용한다. 가입 인증번호 입력은 발송 이후에만 표시한다. 기존 개별 인증 화면 SCSS는 공통 스타일로 통합했다.

게임 목록은 DaclionOnline과 SEED WALK 두 카드를 제공한다. SEED WALK는 포털 origin의 `/games/seed-walk/`로 이동하며 `Login`의 `next=seed-walk`는 안전한 고정 게임 경로로만 돌아간다.

인증 화면과 포털은 기존 계정 호환·계정 연결 홍보·중복 부가 안내 문구를 표시하지 않는다. 입력 label, 형식 안내, 인증/연결 상태 및 오류는 유지한다.

SEED WALK 카드 일러스트는 장애물 없는 초원과 플레이어를 표시한다.
