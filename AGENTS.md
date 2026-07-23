# DaclionOnline Agent Guide

## 가장 먼저 읽을 문서

모든 작업은 [`docs/README.md`](docs/README.md)를 먼저 읽고 그 문서의 필수 구현 원칙과 문서 유지 규칙을 따른다.

## 필수 개발 규칙

1. 입출력이 잦고 즉시 확정이 중요하지 않은 서버 영속 상태는 메모리에 로드해 변경하고 dirty 표시 후 주기적·unload·종료 시 flush한다.
2. 기능 API는 복잡한 의존성 주입보다 정적으로 import 가능한 함수, manager/registry, 모델 공개 메서드 형태로 짧고 찾기 쉽게 만든다.
3. 다른 기능의 raw 배열·Map·레코드·DB row를 직접 참조해 구현하지 않는다. 반드시 소유 기능의 공개 API를 쓰고, 없으면 목적형 API를 먼저 추가한다.
4. UI는 고정 px 의존을 최소화하고 token, 상대 단위, `vh/vw`, `clamp()`, flex/grid, media query로 모바일과 PC를 모두 지원한다.
5. 구현 전에 관련 `Overview.md`와 `docs/`를 탐색해 기존 코드/API를 재사용하고, 중복과 불필요한 계층 없이 가장 짧고 명확하게 작성한다.
6. 슬롯·스탯·능력치처럼 열거 가능한 도메인 타입은 `values/fromKey/fromInput`과 메타데이터를 가진 Java 스타일 클래스형 enum을 사용하고 문자열 key는 직렬화 경계에만 둔다.
7. 의미 있는 작업 완료 후 관련 변경을 커밋하며 메시지는 `name(scope): message` 형식을 따른다. 예: `chore(format): formatted code structure`, `feat(inventory): add item remove API`.
8. 전용 아이콘 제작 단계의 게임 아이콘은 밝은 색상, 단순한 형태, 굵고 명확한 실루엣의 캐주얼 모바일 게임 스타일과 128×128 규격으로 통일한다.
9. 1차 콘텐츠 확장 기간에는 아이템·스킬마다 ImageGen 에셋을 만들지 않고 카테고리가 맞는 기존 128×128 아이콘을 명시적 fallback으로 재사용하며 교체 TODO를 남긴다. 존재하지 않는 경로는 금지한다. 전용 아트 제작 단계가 시작되면 아이템 마스터 데이터와 `client/public/icons/items/{itemDataId}.png`를 같은 변경에 추가한다.
10. 새 `AttributeType` 능력치를 추가할 때는 대표색 1색과 무채색/포인트색 1~2색 이하로 구성한 `client/public/icons/attributes/{attributeKey}.png` 128×128 투명 아이콘을 함께 추가하고, 상태창·스킬 계수 표기는 `AttributeType.icon/iconMarkup`을 재사용한다.
10. 새 `property:*` 속성 또는 속성표에 노출할 태그를 추가할 때는 `defineTagEffectTagDisplay` 표시 메타데이터와 `client/public/icons/affinities/{icon}.png` 128×128 투명 배경 아이콘을 같은 변경에 추가한다.
11. 장소에 `mapIcon`을 추가할 때는 `client/public/icons/map/{mapIcon}.png` 128×128 투명 배경 랜드마크 아이콘을 같은 변경에 추가한다.
12. 직업 정의에 아이콘을 추가할 때는 `client/public/icons/jobs/{key}.png` 128×128 투명 배경 아이콘을 같은 변경에 추가한다. 엘리트 직업은 계보 아이콘을 재사용할 수 있다.
13. UI는 테마 token과 단색 면, 얇은 경계선, 명확한 간격·타이포그래피를 중심으로 깔끔하고 평면적으로 구성한다. 장식 목적의 그라데이션, 네온 glow, 발광 외곽선, 과도한 그림자는 기본적으로 사용하지 않으며 게임 효과를 의미상 표현해야 할 때만 제한적으로 사용한다.
14. 사용자에게 보이는 기능·콘텐츠·밸런스·오류 수정은 같은 변경에서 `shared/patchNotes.ts`의 현재 작업 묶음 버전 항목도 갱신한다. 직전 작업 종료와 약 1시간 이내에 이어지거나 같은 서버 재시작 전 작업이면 같은 버전에 합치고, 1시간 이상 떨어졌거나 서버 재시작·배포 경계가 있으면 새 버전을 시작한다. 내부 구현명이 아닌 플레이어 관점의 `[+] 추가된 기능`, `[+] 추가된 콘텐츠`, `[/] 수정된 기능`, `[-] 삭제된 기능·콘텐츠` 형식으로 작성한다.

## 문서 경로

- [`docs/legacy-reference.md`](docs/legacy-reference.md)
- [`docs/content-scale.md`](docs/content-scale.md)
- [`docs/architecture/overview.md`](docs/architecture/overview.md)
- [`docs/architecture/change-guide.md`](docs/architecture/change-guide.md)
- [`docs/architecture/runtime-foundations.md`](docs/architecture/runtime-foundations.md)
- [`docs/api/socket-events.md`](docs/api/socket-events.md)
- [`docs/api/http.md`](docs/api/http.md)
- [`docs/api/server-internal.md`](docs/api/server-internal.md)
- [`docs/api/client-internal.md`](docs/api/client-internal.md)
- [`docs/systems/auth-session.md`](docs/systems/auth-session.md)
- [`docs/systems/chat-command.md`](docs/systems/chat-command.md)
- [`docs/systems/player-world.md`](docs/systems/player-world.md)
- [`docs/systems/combat-ai.md`](docs/systems/combat-ai.md)
- [`docs/systems/pvp-regions.md`](docs/systems/pvp-regions.md)
- [`docs/systems/karma.md`](docs/systems/karma.md)
- [`docs/systems/patch-notes.md`](docs/systems/patch-notes.md)
- [`docs/systems/shields.md`](docs/systems/shields.md)
- [`docs/systems/items-shop.md`](docs/systems/items-shop.md)
- [`docs/systems/crafting.md`](docs/systems/crafting.md)
- [`docs/systems/minigames-fishing.md`](docs/systems/minigames-fishing.md)
- [`docs/systems/tags-effects.md`](docs/systems/tags-effects.md)
- [`docs/systems/status-effects.md`](docs/systems/status-effects.md)
- [`docs/systems/npc-dialogue.md`](docs/systems/npc-dialogue.md)
- [`docs/systems/tutorial-guide.md`](docs/systems/tutorial-guide.md)
- [`docs/systems/dungeon-puzzles.md`](docs/systems/dungeon-puzzles.md)
- [`docs/systems/progress-skills.md`](docs/systems/progress-skills.md)
- [`docs/systems/titles.md`](docs/systems/titles.md)
- [`docs/systems/party.md`](docs/systems/party.md)
- [`docs/systems/trading.md`](docs/systems/trading.md)
- [`docs/systems/rankings.md`](docs/systems/rankings.md)
- [`docs/systems/careers.md`](docs/systems/careers.md)
- [`docs/systems/admin-panel.md`](docs/systems/admin-panel.md)
- [`docs/data/database.md`](docs/data/database.md)
- [`docs/development.md`](docs/development.md)
- 소스 폴더별 `Overview.md`: `server/**/Overview.md`, `client/**/Overview.md`, `shared/**/Overview.md`

## 문서 동기화

의미 있는 코드 변경 시 같은 변경에서 해당 폴더의 `Overview.md`와 관련 `docs/` 문서를 갱신한다. 새 소스 폴더에는 역할과 주요 파일을 설명하는 `Overview.md`를 반드시 함께 만든다.
