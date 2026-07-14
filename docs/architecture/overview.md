# 아키텍처 개요

## 런타임 구성

루트 개발 명령은 React/Vite 클라이언트와 Express/Socket.io 서버를 함께 실행한다. 서버는 MariaDB를 Prisma로 접근하며, 프로덕션에서는 빌드된 클라이언트 정적 파일도 제공한다.

```text
Browser
  ├─ React Router 화면
  ├─ SocketContext ───────────── Socket.io ──┐
  └─ profile upload ───────────── HTTP ───────┤
                                              v
Express + Socket.io (`server/src/index.ts`)
  ├─ modules: 인증, 채팅, 채널, 플레이어, 위치, 게임 루프
  ├─ commands: 채팅 명령을 도메인 호출로 변환
  ├─ models: Entity/Player/Monster/Location/Inventory/Shop
  ├─ data: 아이템·몬스터·상점·위치 마스터 데이터
  └─ Prisma ─────────────────────────────── MariaDB
```

## 시작 순서

`server/src/index.ts`는 다음 순서로 서버를 조립한다.

1. 환경 변수와 Express/HTTP 서버를 준비한다.
2. `initSocket()`으로 Socket.io와 쿠키 기반 세션 바인딩 미들웨어를 연다.
3. 회원가입, 로그인, 채팅, 봇/명령어, 플레이어, 위치, 게임 루프를 초기화한다.
4. `data/items.ts`, `data/monsters.ts`, `data/shops.ts`의 import 부작용으로 마스터 데이터를 레지스트리에 등록한다.
5. `/uploads` 정적 파일과 `/api/profile-image` 라우트를 연결한다.
6. 리슨 시작 후 Prisma 연결을 확인한다. 종료 신호에서는 온라인 플레이어를 저장한 후 DB 연결을 닫는다.

초기화 함수는 `getIO()`를 쓰므로 `initSocket()`보다 먼저 호출하면 안 된다. 명령어 파일은 `commands/index.ts`의 `initAllCommands()`를 통해 등록된다.

## 상태의 소유권과 수명

| 상태 | 소유 위치 | 수명/저장 |
| --- | --- | --- |
| 세션 토큰, 다중 세션, 온라인 소켓 수 | `modules/login.ts` | 프로세스 메모리, 재시작 시 소실 |
| 현재 채널, 채팅 히스토리 | `modules/channel.ts` | 프로세스 메모리, 채널당 공개 100개 |
| 온라인 Player 인스턴스 | `modules/player.ts` | 로그인 중 메모리, 30초 자동 저장 및 정상 로그아웃/종료 시 저장 |
| 위치 런타임, 몬스터, 바닥 아이템 | `models/Location.ts` | 프로세스 메모리; 위치 정의만 JSON 저장 |
| 상점 재고/재입고 타이머 | `models/Shop.ts` | 프로세스 메모리 |
| User/Player/Item/Equipment | Prisma 모델 | MariaDB 영속 저장 |
| HUD 배치·투명도·퀵슬롯 | `HudContext.tsx` | 브라우저 `localStorage` |

## 주요 요청 흐름

### 로그인

`Login.tsx` → `login` 이벤트 → `modules/login.ts` → Prisma `User` 검증 → 세션 생성 → `modules/player.ts`가 Player/Inventory/Equipment 로드 → `loginResult` → `SocketContext`가 세션 상태 저장.

### 채팅과 명령어

`Home.tsx` → `sendMessage` → `modules/chat.ts`. 일반 문장은 `modules/message.ts`와 `modules/channel.ts`를 통해 현재 room에 저장·전송한다. `/`로 시작하면 `modules/bot.ts`가 명령을 찾아 `commands/*.ts` 핸들러를 실행하고, 핸들러가 모델과 메시지 API를 호출한다.

### 게임 루프

`modules/game.ts`가 20 FPS로 온라인 Player의 `earlyUpdate → update → lateUpdate`, 모든 Location/Monster, Shop, Coroutine을 갱신한다. 별도 500ms 타이머가 `playerStats`와 `locationInfo` HUD 데이터를 각 사용자에게 보낸다.

## 신뢰 경계

- 클라이언트 입력은 신뢰하지 않는다. 소켓 핸들러에서 타입, 세션, 권한, 값 범위를 검증한다.
- 관리자 위치 편집은 서버에서 `permission >= 10`을 다시 확인한다. 클라이언트 라우트 노출 여부는 보안 경계가 아니다.
- 프로필 업로드는 세션 쿠키, MIME 화이트리스트, 5MB 제한, magic bytes를 확인한 후 저장한다.
- 게임 규칙과 보상 계산은 서버 모델에서 수행하고 클라이언트는 전달받은 상태를 표시한다.
