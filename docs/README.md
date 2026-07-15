# DaclionOnline 개발 문서

이 문서는 DaclionOnline을 수정할 때 가장 먼저 읽는 기준 문서다. 프로젝트는 채팅 입력과 Socket.io 이벤트를 사용자 인터페이스로 삼는 실시간 멀티플레이어 RPG이며, 서버가 게임 상태와 규칙의 권위(authority)를 가진다.

## 빠른 탐색

| 목적 | 먼저 볼 문서 |
| --- | --- |
| 전체 구조와 실행 흐름 파악 | [architecture/overview.md](architecture/overview.md) |
| 기능을 추가할 때 수정 지점 찾기 | [architecture/change-guide.md](architecture/change-guide.md) |
| Socket.io 이벤트 찾기 | [api/socket-events.md](api/socket-events.md) |
| HTTP 엔드포인트 찾기 | [api/http.md](api/http.md) |
| 서버 내부 공개 API 찾기 | [api/server-internal.md](api/server-internal.md) |
| 클라이언트 context/hook API 찾기 | [api/client-internal.md](api/client-internal.md) |
| 인증·세션·프로필 기능 | [systems/auth-session.md](systems/auth-session.md) |
| 채팅·채널·명령어 기능 | [systems/chat-command.md](systems/chat-command.md) |
| 플레이어·전투·위치·게임 루프 | [systems/player-world.md](systems/player-world.md) |
| 태그·속성 상성·효과 배율 | [systems/tags-effects.md](systems/tags-effects.md) |
| 상태효과·행동 제한·지속 피해 | [systems/status-effects.md](systems/status-effects.md) |
| 이벤트·통계·플래그·스킬 | [systems/progress-skills.md](systems/progress-skills.md) |
| 아이템·인벤토리·장비·상점 | [systems/items-shop.md](systems/items-shop.md) |
| 제작법 발견·재료 필터·제작 | [systems/crafting.md](systems/crafting.md) |
| NPC 배치·조건부 대화·선택지 | [systems/npc-dialogue.md](systems/npc-dialogue.md) |
| DB 모델과 저장 경계 | [data/database.md](data/database.md) |
| 실행·빌드·환경 설정 | [development.md](development.md) |

## 코드 계층

```text
client/src  ── Socket.io / HTTP ──>  server/src/modules
    │                                      │
    ├─ pages, components, context           ├─ commands (사용자 명령)
    │                                      ├─ models (게임 도메인)
    └──────── shared/types.ts ──────────────┤
                                           ├─ data (마스터 데이터)
                                           └─ Prisma ──> MariaDB
```

- `shared/types.ts`가 서버와 클라이언트 사이의 소켓 계약 및 공유 데이터 타입의 원본이다. 클라이언트의 `client/src/shared`는 `shared/`를 가리키는 심볼릭 링크다.
- `server/src/index.ts`가 서버 조립 지점이다. 새 초기화 모듈이나 마스터 데이터는 여기 또는 각 계층의 배럴 파일에서 로드되어야 한다.
- `server/src/modules/`는 통신, 세션, 온라인 상태, 주기 실행 같은 애플리케이션 서비스를 담당한다.
- `server/src/commands/`는 `/명령어` 진입점, `server/src/models/`는 재사용 가능한 게임 규칙과 상태를 담당한다.
- `client/src/pages/`는 라우트 단위 화면, `components/`는 UI, `context/`는 소켓·세션·HUD·테마 상태를 담당한다.

## 필수 구현 원칙

다음 원칙은 새 기능과 의미 있는 기존 코드 수정에 모두 적용한다. 기존 코드가 원칙과 다르면 수정 범위 안에서 공개 API를 먼저 보강하고 점진적으로 원칙에 맞춘다.

### 1. 고빈도 영속 데이터는 메모리 + dirty flush

서버의 영속 데이터 중 입출력이 잦고 즉시 확정이 중요하지 않은 게임 상태는 요청마다 DB를 읽고 쓰지 않는다. 시작/로그인 시 메모리에 로드하고, 도메인 API를 통한 변경에서 dirty를 표시한 뒤 주기적 flush와 정상 종료·unload 시 저장하는 구조를 기본으로 한다.

- 현재 기준 구현은 `modules/player.ts`의 온라인 Player map과 30초 저장, `Player/Inventory/Equipment/Stat/PlayerProgress/SkillBook`의 dirty 추적이다.
- 계정 생성, 인증 정보 변경처럼 즉시 성공 여부가 중요하거나 유실되면 안 되는 데이터는 트랜잭션/즉시 저장이 가능하다. 이 예외는 의도를 코드와 문서에 남긴다.
- 새 영속 상태는 메모리 소유자, dirty 설정 지점, flush 주기, unload/종료 저장, 실패 처리 방식을 설계한다.

### 2. 단순하고 정적으로 찾을 수 있는 기능 API

기능별 API는 불필요한 의존성 주입 컨테이너나 깊은 추상화 계층을 만들지 않는다. 현재 구조처럼 명시적으로 import 가능한 함수, 전통적인 manager/registry, 모델의 공개 메서드를 우선한다. 초기화와 상태 소유자는 한눈에 찾을 수 있어야 하며 호출부 수정이 간단해야 한다.

### 3. 다른 기능의 raw data 직접 접근 금지

다른 기능은 소유 기능이 제공하는 공개 API 함수/메서드로만 조회·변경한다. 배열, Map, 내부 레코드, DB row 같은 raw data를 가져와 외부에서 필터링하거나 직접 수정해 기능을 구현하지 않는다.

- 예: 인벤토리 항목 조회는 `inventory.items`를 직접 순회하지 않고 목적에 맞는 `Inventory` 조회 API를 사용한다.
- 필요한 API가 없다면 raw data를 우회 참조하지 말고 소유 클래스/모듈에 최소한의 목적형 API를 먼저 추가한다.
- 단순 snapshot이 꼭 필요하면 불변 DTO를 반환하는 공개 API를 만들고, 변경은 반드시 소유 기능의 명령형 API를 통과시킨다.

### 4. 모바일과 PC를 함께 지원하는 반응형 UI

UI 스타일은 고정 px 배치와 크기에 의존하지 않는다. 기존 SCSS token/mixin을 재사용하고 `%`, `rem`, `vh/vw`, `clamp()`, flex/grid와 media query를 적극 사용한다. 고정 px은 border, icon 최소치처럼 의도가 분명한 경우로 제한하며 모바일과 PC viewport에서 overflow, 터치 영역, 가독성, HUD 겹침을 확인한다.

### 5. 짧고 재사용 중심의 구현

코드는 중복, 우회 계층, 불필요한 boilerplate를 줄여 가능한 한 짧고 명확하게 작성한다. 기능 구현 전 현재 폴더와 상위 폴더의 `Overview.md`, 이 문서의 빠른 탐색 표, `docs/api/`를 먼저 확인한다. 이미 존재하는 모델/manager/정적 API와 UI primitive를 재사용하고, 기존 API 조합으로 해결할 수 없을 때만 가장 작은 새 API를 소유 계층에 추가한다.

### 6. 열거 가능한 도메인 타입은 클래스형 enum

슬롯, 스탯, 능력치처럼 순회·표시명·기본값·입력 별칭 등의 메타데이터가 필요한 타입은 Java 스타일 클래스형 enum으로 구현한다. 현재 기준 구현은 `AttributeType`, `StatType`, `EquipSlotType`이다.

- 자기 등록용 static 목록은 enum 인스턴스보다 먼저 선언한다.
- `values()`로 순회하고 `fromKey()`로 직렬화 key를 조회하며 사용자 입력이 있으면 `fromInput()`을 제공한다.
- label, 기본값, formatter, 설명, 최대 슬롯 수 같은 메타데이터는 별도 하드코딩 배열/Record가 아니라 타입 인스턴스가 소유한다.
- 문자열 union key는 DB 저장과 네트워크 직렬화 경계에서만 유지한다.

### 7. 의미 단위 커밋

의미 있는 작업이 완료되고 검증이 끝나면 관련 변경만 하나의 커밋으로 남긴다. 서로 독립적인 작업은 커밋을 나누며 메시지는 반드시 `name(scope): message` 형식을 따른다.

- `name`: `feat`, `fix`, `refactor`, `docs`, `test`, `style`, `chore`처럼 변경 성격을 나타낸다.
- `scope`: `inventory`, `chat`, `auth`, `docs`처럼 영향 기능 또는 계층을 짧게 적는다.
- `message`: 무엇이 완료됐는지 간결하게 적는다.
- 예: `chore(format): formatted code structure`
- 예: `feat(inventory): add item remove API`

### 8. 아이템 정의와 아이콘은 함께 추가

`data/items.ts`에 아이템 마스터 데이터를 추가하면 같은 작업에 `client/public/icons/items/{itemDataId}.png` 아이콘도 만든다. 기본 규격은 기존 아이콘과 같은 128×128 PNG, 투명 배경, 중앙 배치이며 파일명은 `itemDataId`와 일치시킨다. 정의의 `image` key를 별도로 바꾸면 해당 key 경로에 에셋이 실제로 존재하는지 확인한다.

아이템·스킬·상태이상 등 게임 아이콘은 밝은 색상, 단순한 형태와 굵고 명확한 실루엣을 가진 캐주얼 모바일 게임 스타일로 통일한다. 작은 HUD 크기에서도 즉시 구분되어야 하며 사실적인 질감이나 오래된 정통 RPG풍의 과도한 묘사는 피한다. 아이템과 상태이상은 128×128 투명 PNG를 기본으로 하고, 스킬은 속성 분위기를 전달하는 불투명 정사각형 카드형 배경을 허용한다. `SkillData`나 `StatusEffectType`처럼 기본 아이콘 경로를 제공하는 새 데이터 타입은 정의와 같은 작업에 대응 에셋을 추가한다.

## 문서 유지 규칙

의미 있는 코드 변경은 같은 변경에서 문서까지 완료해야 한다.

1. 수정한 소스 폴더의 `Overview.md`에서 역할, 주요 파일, 공개 API 또는 데이터 흐름이 여전히 맞는지 확인하고 갱신한다.
2. 새 소스 폴더를 만들면 그 폴더에 `Overview.md`를 함께 만든다.
3. 이벤트·엔드포인트·공개 함수가 바뀌면 `docs/api/`를 갱신한다.
4. 시스템 흐름이나 책임 경계가 바뀌면 `docs/systems/` 또는 `docs/architecture/`를 갱신한다.
5. DB 스키마나 저장 시점이 바뀌면 `docs/data/database.md`를 갱신한다.

단순 포맷팅이나 주석 교정처럼 동작·책임·API가 바뀌지 않는 변경은 문서 수정이 필요하지 않다.
