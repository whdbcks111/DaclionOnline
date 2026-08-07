# DaclionOnline Agent Guide

## 작업 시작 순서

1. 모든 작업은 [`docs/README.md`](docs/README.md)를 먼저 읽는다.
2. 수정할 기능의 `docs/systems/` 문서와 소스 폴더의 `Overview.md`를 확인한다.
3. 공개 API·이벤트·저장 경계를 바꾸면 `docs/api/`, `docs/data/`, `docs/architecture/`의 관련 문서까지 확인한다.
4. 기존 API와 데이터를 먼저 재사용하고, 필요한 목적형 API가 없을 때만 소유 도메인에 가장 작은 API를 추가한다.

## 필수 개발 규칙

### 코드 구조와 도메인 경계

1. 기능 API는 복잡한 의존성 주입보다 정적으로 import 가능한 함수, manager/registry, 모델 공개 메서드 형태로 짧고 찾기 쉽게 만든다.
2. 다른 기능의 raw 배열·Map·레코드·DB row를 직접 참조하지 않는다. 반드시 소유 기능의 공개 API를 사용하고, 없으면 목적형 API를 먼저 추가한다.
3. 중복, 우회 계층, 불필요한 boilerplate를 만들지 않는다. 관련 `Overview.md`와 `docs/`를 탐색한 뒤 기존 코드/API를 재사용한다.
4. 슬롯·스탯·능력치처럼 열거 가능한 도메인 타입은 `values/fromKey/fromInput`과 메타데이터를 가진 Java 스타일 클래스형 enum으로 구현한다. 문자열 key는 DB·네트워크 직렬화 경계에만 둔다.
5. 서버는 `commands`, `data`, `models`, `modules`의 기술 계층을 유지하고 그 아래를 도메인 폴더로 나눈다. 새 파일은 기존 도메인 폴더에 배치하며, 최상위에는 조립점·공용 진입점·`Overview.md`만 둔다.
6. 한 폴더에 구현·테스트 파일이 12개를 넘거나 서로 다른 책임이 둘 이상 쌓이면 도메인 분리를 검토한다. 반대로 한 파일만 위한 폴더는 독립된 소유 경계가 아닌 한 만들지 않는다.
7. 테스트는 대상 구현과 같은 도메인 폴더에 둔다. 파일 이동 시 import, 실행 스크립트, 운영 스크립트, 문서 경로를 같은 변경에서 갱신한다.

### 서버 상태와 데이터 운용

1. 입출력이 잦고 즉시 확정이 중요하지 않은 영속 상태는 메모리에 로드해 변경하고 dirty 표시 후 주기적·unload·정상 종료 시 flush한다.
2. 계정 생성·인증 정보처럼 성공 여부가 즉시 확정되어야 하거나 유실되면 안 되는 데이터만 트랜잭션 또는 즉시 저장을 사용하고 예외 이유를 문서화한다.
3. 새 영속 상태에는 메모리 소유자, dirty 설정 지점, flush 주기, unload/종료 저장, 실패 처리 방식을 함께 설계한다.
4. 마스터 데이터 ID는 DB와 다른 데이터에서 참조하는 안정 식별자다. 변경하거나 이동할 때 전체 참조와 검증 스크립트를 확인한다.
5. 운영 데이터 변환은 재실행 가능한 `server/src/scripts/` 작업으로 만들고, 게임 런타임의 내부 컬렉션을 우회해 직접 수정하지 않는다.

### UI와 상호작용

1. UI는 고정 px 의존을 최소화하고 theme token, 상대 단위, `vh/vw`, `clamp()`, flex/grid, media query로 모바일과 PC를 함께 지원한다.
2. 단색 면, 얇은 경계선, 명확한 간격과 타이포그래피를 중심으로 평면적으로 구성한다. 장식 목적의 그라데이션, 네온 glow, 발광 외곽선, 과도한 그림자는 사용하지 않으며 게임 효과를 의미상 표현할 때만 제한적으로 쓴다.
3. 모바일과 PC viewport에서 overflow, 터치 영역, 가독성, HUD 겹침을 확인한다.

### 콘텐츠와 에셋

1. 게임 아이콘은 밝은 색상, 단순한 형태, 굵고 명확한 실루엣의 캐주얼 모바일 게임 스타일을 따른다. 기본 규격은 128×128 투명 PNG다.
2. 1차 콘텐츠 확장 기간에는 아이템·스킬마다 ImageGen 에셋을 만들지 않는다. 카테고리가 맞는 기존 128×128 아이콘을 명시적 fallback으로 재사용하고 교체 TODO를 남기며, 존재하지 않는 경로는 사용하지 않는다.
3. 전용 아트 제작 단계에서는 아이템·스킬 마스터 데이터와 ID가 같은 전용 아이콘을 같은 변경에 추가한다. 시전 배너가 필요한 스킬은 `client/public/icons/skill-headers/{skillDataId}.png` 256×64도 함께 추가한다.
4. 새 `AttributeType`은 대표색 1색과 무채색/포인트색 1~2색 이하의 `client/public/icons/attributes/{attributeKey}.png`를 함께 추가한다. 상태창·스킬 계수 표기는 `AttributeType.icon/iconMarkup`을 재사용한다.
5. 새 `property:*` 속성 또는 `/속성표` 노출 태그는 `defineTagEffectTagDisplay` 메타데이터와 `client/public/icons/affinities/{icon}.png`를 함께 추가한다.
6. 장소의 `mapIcon`은 `client/public/icons/map/{mapIcon}.png`, 직업 아이콘은 `client/public/icons/jobs/{key}.png`를 같은 변경에 추가한다. 엘리트 직업은 계보 아이콘을 재사용할 수 있다.

### 운영, 릴리스, 검증

1. 사용자에게 보이는 기능·콘텐츠·밸런스·오류 수정은 같은 변경에서 `shared/patchNotes.ts`도 갱신한다. 내부 구현명이 아니라 플레이어 관점의 `[+] 추가된 기능`, `[+] 추가된 콘텐츠`, `[/] 수정된 기능`, `[-] 삭제된 기능·콘텐츠` 형식을 사용한다.
2. 패치노트 수정 전에 `.runtime/server-boot.json`을 읽는다. `appliedPatchVersion`이 소스 최신 버전과 같으면 `nextPatchVersion`으로 새 버전을 시작한다. 소스 최신 버전이 더 높고 직전 작업 종료와 약 1시간 이내면 재부팅 전 같은 버전에 합친다. 파일이 없거나 유효하지 않으면 재부팅 여부를 추측하지 말고 사용자에게 확인한다.
3. 변경 위험에 맞춰 타입 검사, 관련 테스트, 마스터 데이터 검증, 클라이언트 빌드를 수행한다. 디렉터리 이동은 최소한 서버 전체 빌드와 전체 테스트를 통과해야 한다.
4. 의미 있는 작업 완료 후 관련 변경만 커밋한다. 메시지는 `name(scope): message` 형식을 사용한다. 예: `chore(format): formatted code structure`, `feat(inventory): add item remove API`.

## 문서 유지 규칙

1. 의미 있는 코드 변경은 수정한 폴더의 `Overview.md`와 관련 `docs/`를 같은 변경에서 갱신한다.
2. 새 소스 폴더에는 역할, 소유 파일, 공개 경계를 설명하는 `Overview.md`를 반드시 만든다.
3. 이벤트·엔드포인트·공개 함수 변경은 `docs/api/`, 시스템 흐름·책임 변경은 `docs/systems/` 또는 `docs/architecture/`, DB 스키마·저장 시점 변경은 `docs/data/database.md`에 반영한다.
4. 단순 포맷팅이나 주석 교정처럼 동작·책임·API가 바뀌지 않는 변경은 문서 수정 대상이 아니다.

## 문서 지도

### 프로젝트와 아키텍처

| 문서 | 역할 |
| --- | --- |
| [`docs/README.md`](docs/README.md) | 전체 문서 진입점, 코드 계층, 공통 구현 원칙 |
| [`docs/legacy-reference.md`](docs/legacy-reference.md) | 이전 텍스트 RPG의 기획과 UX 참고자료 |
| [`docs/content-scale.md`](docs/content-scale.md) | 현재 콘텐츠 규모, 검증 기준, 확장 우선순위 |
| [`docs/architecture/overview.md`](docs/architecture/overview.md) | 프로세스 조립, 서버 권위, 주요 데이터 흐름 |
| [`docs/architecture/change-guide.md`](docs/architecture/change-guide.md) | 기능 종류별 수정 위치와 추가 순서 |
| [`docs/architecture/runtime-foundations.md`](docs/architecture/runtime-foundations.md) | scheduler, 메모리 트랜잭션, 런타임 기반 규칙 |
| [`docs/development.md`](docs/development.md) | 설치, 실행, 빌드, 테스트, 환경 설정 |

### API와 저장소

| 문서 | 역할 |
| --- | --- |
| [`docs/api/socket-events.md`](docs/api/socket-events.md) | Socket.io 이벤트 계약과 송수신 주체 |
| [`docs/api/http.md`](docs/api/http.md) | HTTP 엔드포인트, 인증, 업로드 계약 |
| [`docs/api/server-internal.md`](docs/api/server-internal.md) | 서버 도메인 간 공개 함수와 manager API |
| [`docs/api/client-internal.md`](docs/api/client-internal.md) | 클라이언트 context, hook, 내부 UI API |
| [`docs/data/database.md`](docs/data/database.md) | Prisma 모델, 저장 소유권, flush·트랜잭션 경계 |

### 플레이어와 운영 시스템

| 문서 | 역할 |
| --- | --- |
| [`docs/systems/auth-session.md`](docs/systems/auth-session.md) | 가입, 로그인, 세션, 프로필, 비밀번호 재설정 |
| [`docs/systems/chat-command.md`](docs/systems/chat-command.md) | 채팅 채널, 메시지, 명령 등록과 실행 |
| [`docs/systems/player-world.md`](docs/systems/player-world.md) | 플레이어 상태, 위치, 월드 루프와 이동 |
| [`docs/systems/tutorial-guide.md`](docs/systems/tutorial-guide.md) | 첫 접속 튜토리얼과 계층형 게임 안내 |
| [`docs/systems/admin-panel.md`](docs/systems/admin-panel.md) | 관리자 조회·변경 도구와 권한 경계 |
| [`docs/systems/patch-notes.md`](docs/systems/patch-notes.md) | 패치 버전 데이터, 부팅 상태, 명령·화면 노출 |
| [`docs/systems/anti-automation.md`](docs/systems/anti-automation.md) | 반복 행동 감지와 사람 확인 흐름 |

### 전투와 성장 시스템

| 문서 | 역할 |
| --- | --- |
| [`docs/systems/combat-ai.md`](docs/systems/combat-ai.md) | 전투 pipeline, 몬스터 AI, 위협·기여도 |
| [`docs/systems/pvp-regions.md`](docs/systems/pvp-regions.md) | PVP 대상 판정, 지역 위험도, 사망 패널티 |
| [`docs/systems/karma.md`](docs/systems/karma.md) | 카르마·악명·현상 대상과 시설 제한 |
| [`docs/systems/shields.md`](docs/systems/shields.md) | 보호막 타입, 흡수 순서, UI snapshot |
| [`docs/systems/tags-effects.md`](docs/systems/tags-effects.md) | 태그, 속성 상성, 효과 배율 registry |
| [`docs/systems/status-effects.md`](docs/systems/status-effects.md) | 상태효과 수명주기, 제어, 지속 피해와 저장 |
| [`docs/systems/progress-skills.md`](docs/systems/progress-skills.md) | 이벤트, 통계, 플래그, 스킬 획득·성장 |
| [`docs/systems/careers.md`](docs/systems/careers.md) | 메인·서브·엘리트 직업과 전직 |
| [`docs/systems/titles.md`](docs/systems/titles.md) | 업적형 칭호와 장착 패시브 |
| [`docs/systems/codex.md`](docs/systems/codex.md) | 몬스터·자원·장소·제작 전문 도감 |
| [`docs/systems/adaptive-music.md`](docs/systems/adaptive-music.md) | 장소별 합성 음악과 전투 레이어 전환 |

### 콘텐츠, 경제, 소셜 시스템

| 문서 | 역할 |
| --- | --- |
| [`docs/systems/items-shop.md`](docs/systems/items-shop.md) | 아이템, 인벤토리, 장비, 상점 |
| [`docs/systems/crafting.md`](docs/systems/crafting.md) | 제작법 발견, 재료 선택, 제작 처리 |
| [`docs/systems/minigames-fishing.md`](docs/systems/minigames-fishing.md) | 서버 검증 미니게임과 낚시 |
| [`docs/systems/npc-dialogue.md`](docs/systems/npc-dialogue.md) | NPC 배치, 조건부 대화, 선택지 |
| [`docs/systems/quests.md`](docs/systems/quests.md) | 퀘스트 수락, 목표 추적, 보고와 보상 |
| [`docs/systems/dungeon-puzzles.md`](docs/systems/dungeon-puzzles.md) | 질문문, 유물, 파괴문 던전 퍼즐 |
| [`docs/systems/party.md`](docs/systems/party.md) | 파티 초대, HUD, 경험치 공유 |
| [`docs/systems/trading.md`](docs/systems/trading.md) | 플레이어 거래, 에스크로, 확인 단계 |
| [`docs/systems/mailbox.md`](docs/systems/mailbox.md) | 시스템 우편, 아이템 첨부, 원자적 수령 |
| [`docs/systems/rankings.md`](docs/systems/rankings.md) | 플레이어 순위와 수치 공개 설정 |

## 소스 폴더 문서

각 `server/**/Overview.md`, `client/**/Overview.md`, `shared/**/Overview.md`는 해당 폴더의 책임, 주요 파일, 공개 API와 데이터 흐름을 설명한다. 파일을 찾을 때는 가장 가까운 `Overview.md`부터 읽는다.
