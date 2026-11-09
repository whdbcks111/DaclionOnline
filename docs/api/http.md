# HTTP API

게임 상호작용 대부분은 Socket.io를 사용한다. 파일 본문은 HTTP로 업로드하고 실제 채팅 전송은 Socket.io가 소유권과 행동 제한을 다시 검증한다.

## `POST /api/profile-image`

- 구현: `server/src/modules/infrastructure/upload.ts`
- 호출: `client/src/components/Drawer.tsx`
- 인증: `sessionToken` 쿠키. 클라이언트는 `credentials: 'include'`를 사용한다.
- Content-Type: `multipart/form-data`
- 필드: `image` 파일 1개
- 제한: 최대 5MB, JPEG/PNG/GIF/WebP MIME, 파일 magic bytes 검증, 사용자당 10분 10회
- multipart 제한: 실제 파일 part 1개·field 0개·field nesting 0. Busboy의 한도 도달 이벤트가 정상 단일 part를 초과로 오인하지 않도록 내부 `parts` 임계값은 2를 사용한다.

성공 응답:

```json
{ "ok": true, "profileImage": "사용자ID-시각-UUID.webp" }
```

실패 응답은 HTTP 400과 다음 형태를 사용한다.

```json
{ "error": "오류 설명" }
```

입력은 Sharp가 최대 512×512 WebP로 재인코딩한다. 파일은 서버 작업 디렉터리의 `uploads/profiles/`에 저장되고 User의 `profileImage` 및 현재 메모리 세션이 갱신된다. DB 갱신이 성공하면 직전 파일을 삭제하고, DB에서 참조되지 않는 파일은 10분 유예 뒤 시작·매시간 정리한다. 정적 조회 URL은 `GET /uploads/profiles/{filename}`이다.

## `POST /api/chat-image`

- 구현: `server/src/modules/infrastructure/upload.ts`
- 호출: `client/src/games/daclion/Home.tsx`
- 인증: `sessionToken` 쿠키
- Content-Type: `multipart/form-data`
- 필드: `image` 파일 1개
- 입력 제한: 최대 15MB, `image/*` MIME, Sharp가 실제 이미지로 해석할 수 있는 형식, 최대 4천만 입력 pixel
- 요청 제한: 사용자당 분당 30회, 실제 파일 part 1개·field 0개·field nesting 0. 내부 `parts` 임계값은 Busboy 한도 이벤트 특성 때문에 2를 사용한다.
- 저장 규격: 최대 1600×1600, WebP 품질 78. 애니메이션 입력은 프레임을 유지한다.

성공 응답:

```json
{ "ok": true, "filename": "사용자ID-시각-UUID.webp", "url": "/uploads/chat/파일명.webp" }
```

클라이언트는 파일 선택 또는 클립보드 붙여넣기로 최대 10장을 전송 대기열에 넣고, 각 파일을 이 API로 업로드한 뒤 성공한 `filename[]`만 `sendImageMessages`로 전달한다. 서버는 묶음 전체의 사용자 ID, 실제 파일 존재 여부와 7일 보관 기간을 확인한 뒤 현재 채널에 하나의 다중 이미지 ChatNode 메시지를 보낸다. 업로드 파일은 `uploads/chat/`에서 전체 최신 100장, 생성 후 최대 7일만 유지하며 서버 시작과 매시간 정리한다.

## 기타 HTTP 동작

- 개발 환경에서 Express CORS는 `CORS_ORIGIN`과 credentials를 허용한다.
- 프로덕션에서는 `client/dist`를 정적으로 제공하고 SPA 경로를 `index.html`로 fallback한다.
- 잘못 인코딩된 URI는 400으로 종료한다.

새 HTTP API를 추가할 때는 `server/src/index.ts`의 `/api` 라우팅 경계, 인증/권한, payload 검증, 응답 타입을 함께 정의하고 이 문서를 갱신한다.

## GAME BOX와 게임 도메인

운영 서버는 같은 IP/포트에서 Host로 사이트를 구분한다. `gamebox.mcv.kr/`는 GAME BOX, `daclion.mcv.kr/`는 DaclionOnline 진입 화면이다. 게임 도메인의 HTML title도 Daclion Online으로 제공한다. 다른 호스트와 로컬 개발은 기존 단일 origin 경로를 유지한다.

| 엔드포인트 | 허용 도메인 | 동작 |
| --- | --- | --- |
| `GET /auth/start` | daclion.mcv.kr | 120초짜리 HttpOnly/SameSite=Lax state 쿠키를 생성하고 포털 인증 연결로 redirect |
| `GET /auth/daclion?state=…` | gamebox.mcv.kr | state가 없으면 게임의 연결 시작으로 redirect. 포털 세션이 없으면 로그인으로, 있으면 30초 유효 일회용 코드로 게임 callback에 redirect |
| `GET /auth/portal?code=…&state=…` | daclion.mcv.kr | 게임 호스트의 state 쿠키 일치와 코드·세션 유효성을 확인하고 호스트 전용 세션 쿠키를 설정한 뒤 게임 루트로 redirect |

`/auth/*` 응답은 `Cache-Control: no-store`, `Referrer-Policy: no-referrer`를 사용한다. 로그인 토큰을 URL로 보내지 않으며 일회용 코드는 서버 메모리에만 보관하고 최대 1,000개로 제한한다. HTTPS 요청에는 Secure 쿠키를 사용한다. `.mcv.kr` 전체를 대상으로 하는 Domain 쿠키는 발급하지 않는다. 게임 도메인의 로그인/가입/비밀번호 재설정 HTTP 요청은 GAME BOX로 이동하고 포털의 `/games/daclion/*`는 인증 연결을 거쳐 게임으로 이동한다. 게임과 포털은 기존 세션 하나를 연결하므로 로그아웃·비밀번호 재설정의 세션 폐기는 양쪽에 적용된다.
