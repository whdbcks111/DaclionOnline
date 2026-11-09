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
npm run verify        # 서버 빌드·전체 테스트·마스터 참조/아이콘 검증·클라이언트 빌드
npm start             # 빌드된 서버 실행
cd client && npm run lint
cd server && npm run db:migrate:deploy  # 운영 schema migration + Client 생성 + metadata 데이터 변환
cd server && npm run db:migrate:item-metadata  # 아이템 metadata 데이터 변환만 재실행
cd server && npm run db:migrate:item-metadata -- --dry-run  # 변경 대상 수만 확인
cd server && npm run db:reset:game  # 계정 보존 운영 초기화 대상 count만 확인(dry-run)
cd server && npm run db:reset:game -- --confirm RESET-DACLION-GAME-DATA  # 서버를 중지한 뒤 실제 초기화
cd server && npm run data:validate  # 코드 마스터 상호 참조와 필수 아이콘 검사
cd server && npm run balance:report -- 50  # 실제 전투식으로 Lv.50 직업·주력 장비·버프 기준선 출력
```

기본 포트는 서버 `3001`, Vite `5173`이다.

`db:reset:game`은 `users` 행 전체를 보존하고 `players`를 삭제해 FK cascade로 인벤토리·장비·진행도·스킬·퀘스트를 함께 비운다. 실제 실행은 반드시 게임 서버를 먼저 중지하고 DB 백업을 확인한 뒤 수행한다. 루트에서도 `npm run db:reset:game -- --confirm RESET-DACLION-GAME-DATA`로 같은 명령을 실행할 수 있다. 다음 게임 입장에서 캐릭터 이름을 설정한 뒤 새 Player가 생성되므로 첫 모험 튜토리얼과 누적 플레이 24시간 미만 `🌱` 표시가 다시 시작된다.

## 환경 변수

| 위치 | 변수 | 기본값/용도 |
| --- | --- | --- |
| `server/.env` | `PORT` | `3001` |
| `server/.env` | `CORS_ORIGIN` | `http://localhost:5173` |
| `server/.env` | `NODE_ENV` | `development`; production이면 클라이언트 정적 파일 제공 |
| `server/.env` | `DATABASE_URL` | Prisma CLI가 읽는 MariaDB 연결 문자열 |
| `server/.env` | `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | 런타임 Prisma MariaDB adapter 연결 정보 |
| `server/.env` | `GMAIL_USER`, `GMAIL_APP_PASSWORD` | 인증 메일 전송 |
| `server/.env` | `SERVER_BOOT_STATE_PATH` | 선택. 서버 부팅 횟수·시각·적용/다음 패치 버전 상태 파일 경로. 기본값은 루트 `.runtime/server-boot.json` |
| `client/.env` | `VITE_SERVER_URL` | 기본 `http://localhost:3001` |

비밀값과 실제 `.env` 파일은 문서나 커밋에 넣지 않는다.

## 경로와 빌드 주의점

- 클라이언트는 `@shared/*` alias로 루트 `shared/`를 참조하며 `client/src/shared` 심볼릭 링크도 사용한다.
- 서버 TypeScript import는 ESM 출력에 맞춰 소스에서도 `.js` 확장자를 쓴다.
- 서버 빌드는 `data/` 아래 JSON의 상대 경로를 보존해 복사한다. 현재 장소 원본은 `src/data/world/locations.json`에서 `dist/server/src/data/world/locations.json`으로 배포된다.
- 프로필 이미지는 서버 작업 디렉터리 기준 `uploads/profiles/`에 저장되고 `/uploads`로 제공된다.

## 변경 완료 체크

1. 영향받은 패키지의 build/lint를 실행한다.
2. 이벤트 계약 변경은 서버와 클라이언트 양쪽 컴파일로 확인한다.
3. 수정한 소스 폴더의 `Overview.md`와 관련 `docs/` 문서를 갱신한다.
4. 생성물(`dist`)이나 비밀 파일이 의도치 않게 변경되지 않았는지 `git status`로 확인한다.
5. 사용자에게 보이는 변경이면 먼저 `.runtime/server-boot.json`의 `appliedPatchVersion`을 확인한다. 소스 최신 버전과 같으면 이미 적용된 버전이므로 `nextPatchVersion`으로 시작하고, 소스 최신 버전이 더 높고 직전 작업과 약 1시간 이내라면 같은 재부팅 전 버전에 합친다. 이후 `/패치노트`와 패치노트 화면에 함께 반영되는지 확인한다.

## UI 스타일 기준

새 화면과 컴포넌트는 기존 theme/spacing/radius token을 재사용하고 단색 면, 얇은 경계선, 여백과 타이포그래피로 계층을 만든다. 장식만을 위한 gradient, neon glow, 발광 외곽선과 여러 겹 그림자는 피한다. 상태 변화나 마법 효과처럼 시각 효과 자체에 의미가 있을 때만 범위를 좁혀 사용하며 모바일과 라이트/다크 테마를 함께 확인한다.

## 커밋 규칙

의미 있는 작업이 완료되고 관련 검증을 통과하면 변경을 의미 단위로 커밋한다. 커밋 메시지는 `name(scope): message` 형식을 사용한다.

```text
chore(format): formatted code structure
feat(inventory): add item remove API
docs(api): document socket event contract
fix(chat): prevent unauthorized channel access
```

서로 독립적으로 되돌릴 수 있는 변경은 별도 커밋으로 나누고, 한 작업을 설명하는 코드와 문서는 같은 커밋에 포함한다.

## 포털 배포

루트는 게임 포털이며 DaclionOnline 진입 경로는 `/games/daclion/`이다. 기존 도메인·포트·정적 파일 경로를 유지하므로 추가 DNS 설정은 없다. `server/` 작업 디렉터리에서 `npm run db:migrate:deploy` 후 빌드된 서버를 시작한다. 이 명령이 기존 캐릭터를 포털 계정에 자동 연결한다. 별도 확인은 `npm run db:migrate:portal -- --dry-run`으로 실행한다. 기존 계정 ID와 비밀번호를 그대로 사용한다. PM2 설정은 서버 cwd와 실제 빌드 경로를 고정한다.

운영 주소는 `http://gamebox.mcv.kr`과 `http://daclion.mcv.kr`이며 두 A 레코드는 같은 서버 IP를 가리킨다. Host 분기는 Express가 담당한다. 운영 빌드는 `VITE_SERVER_URL` 대신 현재 origin을 사용해 기존 개발 설정이 특정 게임 도메인으로 연결을 고정하지 않게 한다. `VITE_SERVER_URL`은 개발 환경에서만 적용한다. 현재 도메인과 일회용 로그인 연결의 계약은 [HTTP API](api/http.md#game-box와-게임-도메인)에 있다.

SEED WALK는 클라이언트의 Phaser 3.90.0을 사용한다. 서버의 dev dependency socket.io-client는 실제 두 클라이언트를 접속시키는 통합 테스트용이다. 게임 실행 경로는 `/games/seed-walk/`이며 로컬에서도 같은 경로로 테스트할 수 있다.

SEED WALK 입장은 시드 선택 없이 모든 사용자가 서버 고정 `gamebox` 공용 맵(최대 32명)에 참가한다.

테스트2는 `/games/test2/`에서 실행한다. `server/src/models/test2/Test2World.test.ts`와 `modules/test2/test2.integration.test.ts`가 전체 코스와 점프 보정/체크포인트/실제 두 소켓 통신을 검증한다.

## 운영 클라이언트 반영

`npm run build:client`는 운영 폴더를 건드리지 않고 `client/.build`에 생성한다. 검증 후 `npm run publish:client`로 반영하고 필요한 서버 재시작을 수행한다. `npm run verify`도 운영 파일을 변경하지 않는다. preview는 `.build`를 사용한다. 반영은 이전 해시 assets를 보존하고 모든 새 파일 준비 후 index.html을 마지막에 atomic rename한다. 실행 중 서버는 기존 index를 캐시하므로 재시작 전까지 이전 버전을 계속 제공해도 참조 파일이 사라지지 않는다. 이전 assets는 활성 브라우저의 lazy chunk에 필요하므로 배포 중 삭제하지 않는다. `cd client && npm run test:publish`로 누락 파일 거절과 기존 파일 보존을 검증한다.
