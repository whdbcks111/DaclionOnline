# DaclionOnline

멀티플레이어 온라인 게임 프로젝트. 실시간 채팅, 인증, 플레이어 관리, 커맨드 시스템을 포함한다.

## 기술 스택

- **Language**: TypeScript (strict mode)
- **Client**: React 19 + Vite 7, SCSS (CSS Modules), React Router, Socket.io-client
- **Server**: Express, Socket.io, Prisma ORM (MariaDB), Nodemailer
- **Shared**: `shared/` 디렉토리에서 서버/클라이언트 공통 타입 정의
- **Process Manager**: PM2 (production)
- **Dev Runner**: concurrently (server + client 동시 실행)

## 스크립트

```bash
npm run dev            # 서버 + 클라이언트 동시 개발 실행
npm run dev:server     # 서버만 실행 (tsx watch)
npm run dev:client     # 클라이언트만 실행 (Vite dev server, port 5173)
npm run build          # 서버 + 클라이언트 빌드
npm run install:all    # 루트 + 서버 + 클라이언트 의존성 설치
npm start              # 프로덕션 서버 실행
```

## 프로젝트 구조

```
DaclionOnline/
├── shared/                    # 서버-클라이언트 공통 코드
│   ├── types.ts               # 소켓 이벤트, 채팅, 인증 등 공통 타입
│   └── templates/             # 이메일 HTML 템플릿
├── server/                    # 백엔드
│   └── src/
├── client/                    # 프론트엔드
│   └── src/
├── package.json               # 루트 (concurrently로 dev 실행)
└── ecosystem.config.js        # PM2 설정
```

## Server (`server/src/`)

### 진입점
- `index.ts` — Express + HTTP 서버 초기화, 모듈 순차 로드, CORS, 정적 파일 서빙, Prisma 연결

### 설정
- `config/prisma.ts` — Prisma 클라이언트 (MariaDB 어댑터)

### 모듈 (`modules/`)
| 파일 | 역할 |
|------|------|
| `socket.ts` | Socket.io 초기화, 세션 토큰 미들웨어, 연결 관리 |
| `login.ts` | 로그인/로그아웃, PBKDF2 비밀번호 검증, 세션 관리 (인메모리), 멀티 로그인 지원 |
| `register.ts` | 회원가입, 이메일 인증 (6자리 코드, 5분 만료), 입력값 검증 |
| `chat.ts` | 채팅 메시지 수신/검증, `/` 명령어 감지 시 bot으로 위임 |
| `message.ts` | 메시지 브로드캐스트, 채팅 히스토리 (최대 100개), 봇 메시지 전송 |
| `bot.ts` | 명령어 등록/파싱/실행, 기본 명령어: `/help`, `/랜덤`, `/상태창` |
| `player.ts` | 플레이어 로드/언로드/저장, 온라인 플레이어 관리, 30초 주기 자동 저장 |
| `game.ts` | 게임 루프 (20 FPS, 50ms), earlyUpdate → update → lateUpdate |
| `coroutine.ts` | 제너레이터 기반 코루틴, `Wait(seconds)` 지원 |
| `mail.ts` | Nodemailer (Gmail), HTML 템플릿 로드 및 변수 치환 |

### 모델 (`models/`)
- `Player.ts` — 플레이어 엔티티 (level, exp), dirty flag 기반 저장 최적화, 프레임별 라이프사이클 (earlyUpdate/update/lateUpdate)

### 유틸 (`utils/`)
| 파일 | 역할 |
|------|------|
| `logger.ts` | 컬러 콘솔 로깅 (info, success, warn, error, debug, socket, http) |
| `validators.ts` | ID/PW/이메일/닉네임 검증, `isValidPayload` 타입 안전 검증 |
| `random.ts` | 랜덤 숫자/hex/base64 생성 |
| `chatBuilder.ts` | 채팅 메시지 빌더 (Fluent API: text, color, icon, bg, deco, size, hide, button) |
| `chatParser.ts` | 커스텀 채팅 태그 파서 (`[color=red]...[/color]` 등) |

### 타입 (`types/`)
- `index.ts` — 서버 전용 인터페이스 (Session 등)

### 데이터베이스 (`prisma/`)
- `schema.prisma` — User (username, email, password, nickname, permission) + Player (level, exp) 모델

## Client (`client/src/`)

### 진입점
- `main.tsx` — React 앱 마운트, ThemeProvider + SocketProvider 래핑
- `App.tsx` — React Router 설정 (Login, Register, Home 페이지)

### 페이지 (`pages/`)
| 파일 | 역할 |
|------|------|
| `Login.tsx` | 로그인 폼, 소켓 이벤트로 인증 처리 |
| `Register.tsx` | 회원가입 폼, 이메일 인증 코드 입력 |
| `Home.tsx` | 메인 게임 화면, 채팅 UI, 메시지 전송/수신 |

### 컨텍스트 (`context/`)
| 파일 | 역할 |
|------|------|
| `SocketContext.tsx` | Socket.io 클라이언트 인스턴스 관리, 연결 상태 |
| `ThemeContext.tsx` | 다크/라이트 테마 전환 |

### 컴포넌트 (`components/`)
| 파일 | 역할 |
|------|------|
| `ThemeToggle.tsx` | 테마 토글 버튼 |
| `Notification.tsx` | 알림 표시 컴포넌트 |
| `chat/ChatMessage.tsx` | 채팅 메시지 렌더링 (ChatNode 트리 재귀 렌더링) |
| `chat/CommandAutocomplete.tsx` | `/` 명령어 자동완성 UI |
| `chat/nodes/ColorNode.tsx` | `[color]` 태그 렌더링 |
| `chat/nodes/BgNode.tsx` | `[bg]` 배경색 태그 렌더링 |
| `chat/nodes/DecoNode.tsx` | `[deco]` 텍스트 데코레이션 렌더링 |
| `chat/nodes/SizeNode.tsx` | `[size]` 글자 크기 렌더링 |
| `chat/nodes/IconNode.tsx` | `[icon]` 아이콘 렌더링 |
| `chat/nodes/ButtonNode.tsx` | `[button]` 클릭 가능 버튼 렌더링 |
| `chat/nodes/HideNode.tsx` | `[hide]` 접기/펼치기 렌더링 |

### 스타일 (`styles/`)
| 파일 | 역할 |
|------|------|
| `global.scss` | 글로벌 스타일, 리셋, 기본 레이아웃 |
| `variables.scss` | SCSS 변수 (폰트, 간격, 반응형 브레이크포인트, 그림자) |
| `colors.scss` | CSS 커스텀 프로퍼티 기반 테마 색상 (라이트/다크) |
| `mixins.scss` | SCSS 믹스인 (flex-center, 반응형, 버튼, 카드 등) |
| `fonts.scss` | 커스텀 폰트 정의 (VITRO 폰트) |

### 에셋
- `assets/fonts/` — VITRO INSPIRE, PRIDE, CORE TTF 폰트

## 주요 규칙

- `@shared/*` 별칭으로 shared 디렉토리 import (Vite alias + tsconfig paths)
- SCSS는 CSS Modules 패턴 사용 (`*.module.scss`)
- 소켓 이벤트 타입은 `shared/types.ts`의 `ServerToClientEvents`, `ClientToServerEvents` 참조
- 서버 모듈은 `init*()` 함수 패턴으로 초기화
- 환경변수는 `server/.env`, `client/.env`에서 관리
