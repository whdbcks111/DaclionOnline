# Portal Client

`Portal.tsx`는 `/`의 게임 목록과 공통 계정 로그인 상태를 표시한다. `Login`, `Register`, `PasswordReset`은 포털 계정 인증 화면이며 게임 캐릭터를 생성하지 않는다. `Portal.module.scss`는 포털과 첫 게임 정보 입력 화면의 반응형 스타일을 소유한다.

로그인은 포털로 돌아오며 `/login?next=daclion`만 서버 게임 입장 화면으로 이동한다. 기존 계정은 동일 ID/PW로 로그인한다. 포털 닉네임과 게임 캐릭터 이름은 별도이며, 게임 시작 후 추가 정보는 해당 게임의 GameGate가 받는다. 가입 성공 후 쿠키를 반영해 소켓을 재연결하고 포털 세션을 복원한다.
