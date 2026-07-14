# 개발과 실행

## 요구 환경

- Node 버전은 루트 `.nvmrc`를 따른다.
- MariaDB와 서버용 환경 변수가 필요하다.
- 루트, `server/`, `client/`는 각각 `package.json`과 lockfile을 가진다.

## 주요 명령

```bash
npm run install:all   # 루트/서버/클라이언트 의존성 설치
npm run dev           # 서버와 클라이언트 동시 실행
npm run dev:server    # tsx watch 서버
npm run dev:client    # Vite 클라이언트
npm run build         # .nvmrc 적용 후 서버와 클라이언트 빌드
npm run build:window  # 현재 셸 Node로 양쪽 빌드
npm start             # 빌드된 서버 실행
cd client && npm run lint
cd server && npm run db:migrate:deploy  # 운영 DB pending migration 적용 + Prisma Client 생성
```

기본 포트는 서버 `3001`, Vite `5173`이다.

## 환경 변수

| 위치 | 변수 | 기본값/용도 |
| --- | --- | --- |
| `server/.env` | `PORT` | `3001` |
| `server/.env` | `CORS_ORIGIN` | `http://localhost:5173` |
| `server/.env` | `NODE_ENV` | `development`; production이면 클라이언트 정적 파일 제공 |
| `server/.env` | `DATABASE_URL` | Prisma 설정에서 읽는 MariaDB 연결 문자열 |
| `server/.env` | `GMAIL_USER`, `GMAIL_APP_PASSWORD` | 인증 메일 전송 |
| `client/.env` | `VITE_SERVER_URL` | 기본 `http://localhost:3001` |

비밀값과 실제 `.env` 파일은 문서나 커밋에 넣지 않는다.

## 경로와 빌드 주의점

- 클라이언트는 `@shared/*` alias로 루트 `shared/`를 참조하며 `client/src/shared` 심볼릭 링크도 사용한다.
- 서버 TypeScript import는 ESM 출력에 맞춰 소스에서도 `.js` 확장자를 쓴다.
- 서버 빌드는 `locations.json`을 `dist/server/src/data/`로 복사한다.
- 프로필 이미지는 서버 작업 디렉터리 기준 `uploads/profiles/`에 저장되고 `/uploads`로 제공된다.

## 변경 완료 체크

1. 영향받은 패키지의 build/lint를 실행한다.
2. 이벤트 계약 변경은 서버와 클라이언트 양쪽 컴파일로 확인한다.
3. 수정한 소스 폴더의 `Overview.md`와 관련 `docs/` 문서를 갱신한다.
4. 생성물(`dist`)이나 비밀 파일이 의도치 않게 변경되지 않았는지 `git status`로 확인한다.

## 커밋 규칙

의미 있는 작업이 완료되고 관련 검증을 통과하면 변경을 의미 단위로 커밋한다. 커밋 메시지는 `name(scope): message` 형식을 사용한다.

```text
chore(format): formatted code structure
feat(inventory): add item remove API
docs(api): document socket event contract
fix(chat): prevent unauthorized channel access
```

서로 독립적으로 되돌릴 수 있는 변경은 별도 커밋으로 나누고, 한 작업을 설명하는 코드와 문서는 같은 커밋에 포함한다.
