# 인증·세션·프로필 시스템

## 구성 요소

| 계층 | 파일 | 책임 |
| --- | --- | --- |
| 공유 계약 | `shared/types.ts` | 로그인/회원가입/세션 복원/결과 타입 |
| 서버 | `modules/register.ts` | 이메일 코드, 입력 중복 검사, PBKDF2 해시, 계정 생성 |
| 서버 | `modules/login.ts` | 로그인, 세션, 접속자 수, 닉네임, 로그아웃 |
| 서버 | `modules/socket.ts` | 연결 handshake 쿠키를 `socket.data.sessionToken`에 바인딩 |
| 서버 | `modules/upload.ts` | 인증된 프로필 이미지 업로드 |
| 서버 | `modules/mail.ts` | Gmail 전송과 HTML 템플릿 치환 |
| 클라이언트 | `context/SocketContext.tsx` | 소켓 연결과 현재 `SessionInfo` 보관 |
| 클라이언트 | `pages/Login.tsx`, `pages/Register.tsx` | 인증 UI와 이벤트 호출 |
| 클라이언트 | `App.tsx` | 세션 복원/무효에 따른 라우팅 |
| 클라이언트 | `components/Drawer.tsx` | 닉네임 및 프로필 이미지 변경 UI |

## 회원가입 흐름

1. `sendVerifyCode(email)`은 socket ID 단위로 6자리 코드를 만들고 HTML 메일을 전송한다.
2. 코드는 5분 뒤 만료되며 재전송은 60초 후 가능하다.
3. `verifyCode(code)` 성공 시 해당 socket의 인증 엔트리를 verified로 표시한다.
4. `register`는 verified 상태, ID/PW/email/nickname 형식, DB 중복을 검사한다.
5. 비밀번호는 32-byte hex salt와 PBKDF2-SHA512(10,000회, 64-byte) 해시로 저장한다.
6. Prisma nested create로 `User`와 기본 `Player`를 만들고 인메모리 세션 토큰을 발급한다.

검증 상태는 socket ID에 묶여 있으므로 연결이 바뀌면 다시 인증해야 한다. 현재 인증된 이메일과 `register` payload의 이메일을 별도로 대조하는 필드는 없다. 이 동작을 바꿀 때는 `VerifyEntry`와 등록 검증을 함께 바꾼다.

## 로그인과 세션 수명

- 세션 토큰은 `randomHex(32)`로 만들며 `sessionMap`에만 저장된다. 서버 재시작 후에는 복원되지 않는다.
- 사용자 한 명이 여러 토큰/소켓으로 로그인할 수 있다. `userSessions`는 userId별 토큰 Set, `onlineUsers`는 userId별 socket ID Set을 가진다.
- 쿠키는 클라이언트 로그인/가입 화면에서 `sessionToken`으로 설정되고 Socket.io와 HTTP upload에서 사용된다.
- 유효한 쿠키로 연결하면 `sessionRestore`를 보내고 Player를 메모리에 로드한다.
- 마지막 세션 로그아웃 시 Player를 저장하고 온라인 Player 맵에서 내린다.
- 연결 해제는 온라인 카운트만 내리며 세션 토큰 자체는 제거하지 않는다.
- 전체 접속자와 채널별 접속자는 소켓/탭 수가 아니라 중복 없는 userId 수로 계산한다. 명시적 로그아웃은 같은 토큰에 연결된 모든 소켓의 온라인 바인딩을 즉시 해제하므로 이후 disconnect 순서와 무관하게 잔여 인원이 남지 않는다.

## 권한

`User.permission`과 메모리 `Session.permission`이 권한 원본이다. 일반 사용자는 0, 현재 관리자 기능은 10 이상을 요구한다.

- 명령 실행: `modules/bot.ts`가 `CommandConfig.permission` 검사.
- 위치 편집 이벤트: `modules/location.ts`가 각 요청에서 재검사.
- 관리자 UI 라우트는 편의 기능일 뿐, 보안은 서버 검사에 의존한다.

## 닉네임과 프로필

- 닉네임 변경은 서버 validator와 DB unique 검사를 통과한 후 User와 해당 사용자의 모든 메모리 세션을 갱신한다.
- 프로필 이미지는 HTTP API가 DB와 요청 세션의 `profileImage`를 갱신한다. 다른 활성 세션 객체는 즉시 갱신하지 않는다.
- 파일 저장/응답 계약은 [HTTP API](../api/http.md)를 참고한다.
