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

## 문서 경로

- [`docs/architecture/overview.md`](docs/architecture/overview.md)
- [`docs/architecture/change-guide.md`](docs/architecture/change-guide.md)
- [`docs/api/socket-events.md`](docs/api/socket-events.md)
- [`docs/api/http.md`](docs/api/http.md)
- [`docs/api/server-internal.md`](docs/api/server-internal.md)
- [`docs/api/client-internal.md`](docs/api/client-internal.md)
- [`docs/systems/auth-session.md`](docs/systems/auth-session.md)
- [`docs/systems/chat-command.md`](docs/systems/chat-command.md)
- [`docs/systems/player-world.md`](docs/systems/player-world.md)
- [`docs/systems/items-shop.md`](docs/systems/items-shop.md)
- [`docs/systems/crafting.md`](docs/systems/crafting.md)
- [`docs/systems/tags-effects.md`](docs/systems/tags-effects.md)
- [`docs/systems/progress-skills.md`](docs/systems/progress-skills.md)
- [`docs/data/database.md`](docs/data/database.md)
- [`docs/development.md`](docs/development.md)
- 소스 폴더별 `Overview.md`: `server/**/Overview.md`, `client/**/Overview.md`, `shared/**/Overview.md`

## 문서 동기화

의미 있는 코드 변경 시 같은 변경에서 해당 폴더의 `Overview.md`와 관련 `docs/` 문서를 갱신한다. 새 소스 폴더에는 역할과 주요 파일을 설명하는 `Overview.md`를 반드시 함께 만든다.
