# 인증·세션·프로필 시스템

## 구성 요소

| 계층 | 파일 | 책임 |
| --- | --- | --- |
| 공유 계약 | `shared/types.ts` | 로그인/회원가입/세션 복원/결과 타입 |
| 서버 | `modules/register.ts` | 이메일 코드, 입력 중복 검사, PBKDF2 해시, 계정 생성 |
| 서버 | `modules/login.ts` | 로그인, 세션, 접속자 수, 닉네임, 로그아웃 |
| 서버 | `modules/passwordReset.ts` | 가입 이메일 확인 코드와 비밀번호 재설정, 기존 세션 폐기 |
| 서버 | `modules/socket.ts` | 연결 handshake 쿠키를 `socket.data.sessionToken`에 바인딩 |
| 서버 | `modules/upload.ts` | 인증된 프로필·채팅 이미지 업로드와 임시 미디어 정리 |
| 서버 | `modules/mail.ts` | Gmail 전송과 HTML 템플릿 치환 |
| 클라이언트 | `context/SocketContext.tsx` | 소켓 연결과 현재 `SessionInfo` 보관 |
| 클라이언트 | `pages/Login.tsx`, `pages/Register.tsx` | 인증 UI와 이벤트 호출 |
| 클라이언트 | `pages/PasswordReset.tsx` | 이메일 코드 기반 비밀번호 재설정 UI |
| 클라이언트 | `App.tsx` | 세션 복원/무효에 따른 라우팅 |
| 클라이언트 | `components/Drawer.tsx` | 닉네임 및 프로필 이미지 변경 UI |

## 회원가입 흐름

1. `sendVerifyCode(email)`은 socket ID 단위로 6자리 코드를 만들고 HTML 메일을 전송한다.
2. 코드는 5분 뒤 만료되며 재전송은 60초 후 가능하다.
3. `verifyCode(code)` 성공 시 해당 socket의 인증 엔트리를 verified로 표시한다. 엔트리는 코드를 발송한 정규화 이메일도 함께 소유하고, 한 발급 건의 오답은 최대 5회까지만 허용한다.
4. `register`는 verified 상태와 만료 시각을 다시 확인하고, 가입 payload의 이메일을 소문자·공백 제거 후 인증 엔트리 이메일과 정확히 대조한다. 이후 ID/PW/email/nickname 형식과 DB 중복을 검사한다.
5. 비밀번호는 32-byte hex salt와 PBKDF2-SHA512(10,000회, 64-byte) 해시로 저장한다. 해싱은 기존 DB 문자열과 호환되는 비동기 worker-pool API를 사용해 로그인 요청이 Node 이벤트 루프를 막지 않는다.
6. 가입 시에는 `User`와 인메모리 세션 토큰만 만들고, 클라이언트가 새 쿠키로 소켓을 재연결한다.
7. 재연결된 인증 소켓이 `loadPlayerByUserId()`를 호출하면 DB에 Player가 없는 첫 접속만 `Player.create()`와 첫 모험 튜토리얼·지원품 지급을 한 흐름으로 시작한다.

검증 상태는 socket ID와 정규화 이메일에 함께 묶이므로 연결이 바뀌거나 이메일 입력을 바꾸면 다시 인증해야 한다. 클라이언트는 이메일 입력 변경 즉시 인증 완료 표시와 입력 코드를 초기화하지만 최종 권한 검사는 항상 서버의 `VerifyEntry.email` 대조가 담당한다.

메일 발송은 IP당 10분 5회, 인증 확인은 IP+socket당 분당 12회, 가입 확정은 IP당 10분 8회로 제한한다. 인증 확인의 분당 제한과 별개로 오답 5회에 도달한 코드는 즉시 폐기해 6자리 전수 대입을 허용하지 않는다.

## 비밀번호 재설정

1. 로그인 화면의 비밀번호 찾기는 별도 `/password-reset` 화면으로 이동한다.
2. `sendPasswordResetCode(email)`은 정규화한 가입 이메일을 조회하고 계정이 있을 때만 6자리 코드를 메일로 보낸다. 응답은 계정 존재 여부와 관계없이 같은 문구를 사용한다.
3. 코드는 요청 socket과 사용자 ID에 묶여 5분 동안 유효하며, 60초 재전송 제한·IP당 10분 5회 발송 제한·발급 건당 오답 5회·IP+socket당 분당 12회 확인 제한을 적용한다.
4. `resetPassword({ code, pw })`는 공용 비밀번호 형식을 다시 검증하고 새 salt와 PBKDF2 해시를 즉시 DB에 저장한다.
5. 변경 성공 뒤 해당 사용자의 모든 세션과 socket 바인딩을 폐기하고 온라인 Player를 저장·unload한다. 다른 기기의 기존 로그인은 `sessionInvalid`를 받아 새 비밀번호로 다시 로그인해야 한다.

## 로그인과 세션 수명

- 세션 토큰은 `randomHex(32)`로 만들며 `sessionMap`에만 저장된다. 서버 재시작 후에는 복원되지 않는다.
- 사용자 한 명이 여러 토큰/소켓으로 로그인할 수 있다. `userSessions`는 userId별 토큰 Set, `onlineUsers`는 userId별 socket ID Set을 가진다.
- 쿠키는 클라이언트 로그인/가입 화면에서 `sessionToken`으로 설정되고 Socket.io와 HTTP upload에서 사용된다.
- 유효한 쿠키로 연결하면 `sessionRestore`를 보내고 Player를 메모리에 로드한다.
- 로그인 요청은 IP당 분당 20회로 제한하고, 비밀번호 일치 여부와 무관하게 같은 제한을 소비한다.
- 마지막 세션 로그아웃 시 어떤 저장 `await`보다 먼저 해당 토큰과 연결된 모든 socket 바인딩을 폐기한다. Player는 unload 진행 상태가 되어 지연 도착한 구매·버리기 명령에서 조회되지 않고, 저장을 마친 뒤 온라인 Player 맵에서 내린다.
- 연결 해제는 온라인 카운트만 내리며 세션 토큰 자체는 제거하지 않는다.
- 전체 접속자와 채널별 접속자는 소켓/탭 수가 아니라 중복 없는 userId 수로 계산한다. 명시적 로그아웃은 같은 토큰에 연결된 모든 소켓의 온라인 바인딩을 즉시 해제하므로 이후 disconnect 순서와 무관하게 잔여 인원이 남지 않는다.
- 게임 햄버거 메뉴의 로그아웃 버튼은 현재 cookie token으로 기존 `logout` 이벤트를 호출하며, 성공 응답 뒤 cookie와 클라이언트 세션 상태를 지우고 로그인 화면으로 이동한다.

## 권한

`User.permission`과 메모리 `Session.permission`이 권한 원본이다. 일반 사용자는 0, 현재 관리자 기능은 10 이상을 요구한다.

- 명령 실행: `modules/bot.ts`가 `CommandConfig.permission` 검사.
- 위치 편집 이벤트: `modules/location.ts`가 각 요청에서 재검사.
- 관리자 UI 라우트는 편의 기능일 뿐, 보안은 서버 검사에 의존한다.

## 닉네임과 프로필

- 닉네임은 1~12자의 한글 완성형, 한글 초성 `ㄱ-ㅎ`, 영문, 숫자, 언더스코어만 허용하며 다른 사용자와 중복될 수 없다.
- 닉네임 변경은 서버 validator와 DB unique 검사를 통과한 후 User와 해당 사용자의 모든 메모리 세션을 갱신한다. 일반 계정은 `users.nickname_changed_at`을 기준으로 24시간에 한 번 변경할 수 있고 권한 10 이상은 이 제한을 받지 않는다. 현재 닉네임을 그대로 제출하는 요청은 변경 횟수를 소비하지 않는다.
- 프로필 이미지는 HTTP API가 입력을 512×512 이하 WebP로 재인코딩한 뒤 DB와 요청 세션의 `profileImage`를 갱신한다. 사용자별 업로드를 직렬화하고 DB 갱신 성공 뒤 이전 파일을 삭제하며, 참조가 끊긴 과거 파일도 시작·매시간 정리한다. 다른 활성 세션 객체는 즉시 갱신하지 않는다.
- 파일 저장/응답 계약은 [HTTP API](../api/http.md)를 참고한다.
