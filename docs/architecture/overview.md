# 아키텍처 개요

## 프로젝트 계보

[LucadionTextRpg-React](../legacy-reference.md)는 DaclionOnline의 이전 세대 텍스트 RPG 프로젝트로 취급한다. 과거의 콘텐츠와 채팅 중심 UX를 참고할 수 있지만, 현재 아키텍처와 API의 기준은 이 저장소의 문서와 코드다. 레거시 구현을 그대로 이식하지 않고 현재 서버 권위형 구조와 개발 원칙에 맞게 재설계한다.

## 런타임 구성

루트 개발 명령은 React/Vite 클라이언트와 Express/Socket.io 서버를 함께 실행한다. 서버는 MariaDB를 Prisma로 접근하며, 프로덕션에서는 빌드된 클라이언트 정적 파일도 제공한다.

```text
Browser
  ├─ React Router 게임·게임 안내·관리자 화면
  ├─ SocketContext ───────────── Socket.io ──┐
  └─ profile upload ───────────── HTTP ───────┤
                                              v
Express + Socket.io (`server/src/index.ts`)
  ├─ modules/{domain}: 인증·통신·인프라·플레이어·생활·소셜·월드 애플리케이션 서비스
  ├─ commands/{domain}: 채팅 명령을 도메인 호출로 변환
  ├─ models/{domain}: actor·전투·core·경제·성장·월드 상태와 규칙
  ├─ data/{domain}: 전투·경제·생활·성장·월드 마스터 데이터
  └─ Prisma ─────────────────────────────── MariaDB
```

## 시작 순서

`server/src/index.ts`는 다음 순서로 서버를 조립한다.

1. 환경 변수와 Express/HTTP 서버를 준비한다.
2. `initSocket()`으로 Socket.io와 쿠키 기반 세션 바인딩 미들웨어를 연다.
3. `data/economy/items.ts`, `data/world/monsters.ts`, `data/world/resources.ts`, `data/combat/projectiles.ts`, `data/economy/shops.ts`, `data/progression/progress.ts`, `data/combat/skills.ts`, `data/professions/crafting.ts`, `data/world/npcs.ts`의 import 부작용으로 마스터 데이터를 레지스트리에 등록한다. 통계/플래그 정의가 참조 기능보다 먼저 등록되도록 순서를 유지한다.
4. 회원가입, 로그인, 채팅과 봇/명령어를 초기화한 뒤 Location JSON·승천 권역을 등록한다. 그 다음 `initializeCodexData()`로 전문 도감 엔트리를 만들고 확정 이벤트 구독을 시작한 후 Player 로드와 게임 루프를 초기화한다.
5. `/uploads` 정적 파일과 `/api/profile-image` 라우트를 연결한다.
6. 리슨 시작 후 Prisma 연결을 확인한다. 종료 신호에서는 온라인 플레이어를 저장한 후 DB 연결을 닫는다.

초기화 함수는 `getIO()`를 쓰므로 `initSocket()`보다 먼저 호출하면 안 된다. 명령어 파일은 `commands/index.ts`의 `initAllCommands()`를 통해 등록된다.

## 상태의 소유권과 수명

| 상태 | 소유 위치 | 수명/저장 |
| --- | --- | --- |
| 세션 토큰, 다중 세션, userId별 온라인 socket ID Set | `modules/auth/login.ts` | 프로세스 메모리, 재시작 시 소실 |
| 현재 채널, 채팅 히스토리 | `modules/communication/channel.ts` | 프로세스 메모리, 채널당 공개 100개 |
| 정보 열람 공개 모드 | `modules/player/informationVisibility.ts` | 사용자별 프로세스 메모리, 기본 비공개, 마지막 연결 종료 시 소실 |
| 온라인 Player 인스턴스 | `modules/player/player.ts` | 로그인 중 메모리, 30초 자동 저장 및 정상 로그아웃/종료 시 저장 |
| 파티·초대 | `modules/social/party.ts` | 최대 5명/초대 60초의 프로세스 메모리, 연결 종료·나가기·강퇴·해산 시 소실 |
| 위치 런타임, Monster/Resource 통합 오브젝트, 바닥 아이템 | `models/world/Location.ts` | 프로세스 메모리; 위치 정의만 JSON 저장 |
| 상점 재고/재입고 타이머 | `models/economy/Shop.ts` | 프로세스 메모리 |
| Player Progress/Skill | `Player.progress`, `Player.skills` | 로그인 중 메모리, Player와 같은 30초/unload/종료 dirty flush |
| 전문 도감 진행/rank | `Player.codex` → `Player.progress` | 횟수·백금/분류 flag·보스 최고 기록은 기존 PlayerProgress dirty flush; 엔트리/분류/타임어택 보너스는 source별 복원 |
| 제작법 발견/진행 | `Player.progress` flag / `models/professions/Crafting.ts` | 발견은 PlayerProgress로 영속, 진행 작업은 접속 중 메모리에만 유지 |
| 최근 GameEvent trace | `models/core/GameEvent.ts` | 최근 500개 메모리 스냅샷, 재시작 시 소실 |
| NPC 정의/활성 대화 | `models/actors/NPC.ts` / `models/actors/NpcDialogue.ts` | 정의는 코드 레지스트리, player별 세션은 메모리이며 이동·사망·logout 시 폐기 |
| NPC 호감도/제작 의뢰 | `models/progression/NpcRelationship.ts` → `Player.progress` | NPC별 호감도·KST 일일량·최대 답례·당일 주문과 누적 완료를 기존 dirty flush로 영속 |
| 프로필/채팅 꾸미기 | `models/progression/PlayerCosmetics.ts` → `Player.progress` | 레벨 이정표·Gold 감정표현 보유·원형/카드 프레임 선택을 영속하고 채팅 히스토리에는 전송 시점 외형만 snapshot |
| Entity 상태효과/행동 제한 | `models/combat/StatusEffect.ts` / `models/core/Action.ts` | 효과와 tick/source별 제한은 메모리, 제압·재시작 시 소실 |
| User/Player/Item/Equipment/PlayerProgress/PlayerSkill | Prisma 모델 | MariaDB 영속 저장 |
| 현재 HUD 배치·투명도·퀵슬롯·스킬/아이템 버튼 | `HudContext.tsx`, `skillHudConfig.ts` | 계정 ID로 분리한 브라우저 `localStorage` |
| 이름 있는 HUD 프리셋 | `Player.hudPresets`, `modules/player/hudPreset.ts` | `players.hud_presets` JSON; 명시적 저장/불러오기/삭제 |

## 주요 요청 흐름

### 로그인

`Login.tsx` → `login` 이벤트 → `modules/auth/login.ts` → Prisma `User` 검증 → 세션 생성 → `modules/player/player.ts`가 Player/Inventory/Equipment/Progress/SkillBook 로드 → `loginResult` → `SocketContext`가 세션 상태 저장.

### 채팅과 명령어

`Home.tsx` → `sendMessage` → `modules/communication/chat.ts`. `/` 또는 슬래시 없는 별칭은 `modules/communication/bot.ts`가 명령을 찾아 `commands/{domain}/*.ts` 핸들러를 실행한다. `information: true` 명령은 `modules/player/informationVisibility.ts`의 사용자 모드와 async 문맥에 따라 입력·결과를 현재 room 또는 본인에게 전송한다. 남은 일반 문장은 스킬 message trigger를 먼저 검사하고 일치하지 않을 때 `modules/communication/message.ts`와 `modules/communication/channel.ts`를 통해 현재 room에 저장·전송한다.

### 게임 루프

`modules/infrastructure/game.ts`가 20 FPS로 온라인 Player의 `earlyUpdate → update → lateUpdate`, Projectile, 모든 Location 오브젝트, Shop, Coroutine과 NPC 대화 세션 유효성을 갱신한다. Player update는 제작법 발견 조건도 주기적으로 검사하고, Coroutine이 제작 대기 시간을 처리한다. 별도 500ms 타이머가 `playerStats`와 `locationInfo` HUD 데이터를 각 사용자에게 보낸다.

## 신뢰 경계

- 클라이언트 입력은 신뢰하지 않는다. 소켓 핸들러에서 타입, 세션, 권한, 값 범위를 검증한다.
- 관리자 위치 편집은 서버에서 `permission >= 10`을 다시 확인한다. 클라이언트 라우트 노출 여부는 보안 경계가 아니다.
- 프로필 업로드는 세션 쿠키, MIME 화이트리스트, 5MB 제한, magic bytes를 확인한 후 저장한다.
- 게임 규칙과 보상 계산은 서버 모델에서 수행하고 클라이언트는 전달받은 상태를 표시한다.
