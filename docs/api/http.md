# HTTP API

게임 상호작용 대부분은 Socket.io를 사용한다. 파일 본문은 HTTP로 업로드하고 실제 채팅 전송은 Socket.io가 소유권과 행동 제한을 다시 검증한다.

## `POST /api/profile-image`

- 구현: `server/src/modules/upload.ts`
- 호출: `client/src/components/Drawer.tsx`
- 인증: `sessionToken` 쿠키. 클라이언트는 `credentials: 'include'`를 사용한다.
- Content-Type: `multipart/form-data`
- 필드: `image` 파일 1개
- 제한: 최대 5MB, JPEG/PNG/GIF/WebP MIME, 파일 magic bytes 검증

성공 응답:

```json
{ "ok": true, "profileImage": "생성된-파일명.png" }
```

실패 응답은 HTTP 400과 다음 형태를 사용한다.

```json
{ "error": "오류 설명" }
```

파일은 서버 작업 디렉터리의 `uploads/profiles/`에 저장되고 User의 `profileImage` 및 현재 메모리 세션이 갱신된다. 정적 조회 URL은 `GET /uploads/profiles/{filename}`이다.

## `POST /api/chat-image`

- 구현: `server/src/modules/upload.ts`
- 호출: `client/src/pages/Home.tsx`
- 인증: `sessionToken` 쿠키
- Content-Type: `multipart/form-data`
- 필드: `image` 파일 1개
- 입력 제한: 최대 15MB, `image/*` MIME, Sharp가 실제 이미지로 해석할 수 있는 형식, 최대 4천만 입력 pixel
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
