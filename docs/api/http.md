# HTTP API

게임 상호작용 대부분은 Socket.io를 사용한다. 현재 애플리케이션 HTTP API는 프로필 이미지 업로드 하나다.

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

## 기타 HTTP 동작

- 개발 환경에서 Express CORS는 `CORS_ORIGIN`과 credentials를 허용한다.
- 프로덕션에서는 `client/dist`를 정적으로 제공하고 SPA 경로를 `index.html`로 fallback한다.
- 잘못 인코딩된 URI는 400으로 종료한다.

새 HTTP API를 추가할 때는 `server/src/index.ts`의 `/api` 라우팅 경계, 인증/권한, payload 검증, 응답 타입을 함께 정의하고 이 문서를 갱신한다.
