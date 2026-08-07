# Server Source Overview

`index.ts`가 Socket.io를 먼저 초기화한 뒤 인증, 채팅, 명령, 위치, 도감, 플레이어, 업로드 미디어 정리와 게임 루프를 조립하고 HTTP 라우트와 정적 파일을 연결한다. 아이템·몬스터·자원·투사체·상점·상성·통계·스킬·제작법·NPC 데이터 모듈은 시작 시 정적 import로 레지스트리에 등록하며, 참조 대상 정의가 먼저 로드되도록 순서를 유지한다. 전문 도감은 장소 JSON과 승천 권역까지 모두 등록한 뒤 `initializeCodexData()`로 마지막에 생성하고 이벤트 구독을 시작한 다음 Player 로드를 허용한다.

- `config/`: 외부 인프라 설정.
- `modules/`: 애플리케이션 서비스와 통신 경계. `auth`, `communication`, `infrastructure`, `operations`, `player`, `professions`, `social`, `world` 도메인으로 나뉜다.
- `commands/`: 사용자 `/명령어` 핸들러. `community`, `economy`, `operations`, `player`, `world` 도메인으로 나뉜다.
- `models/`: 게임 도메인 객체와 레지스트리. `actors`, `combat`, `core`, `economy`, `player`, `professions`, `progression`, `world`가 상태와 규칙을 소유한다.
- `data/`: 코드/JSON 마스터 데이터 등록. `combat`, `economy`, `professions`, `progression`, `world`로 나뉜다.
- `scripts/`: idempotent 운영 데이터 변환.
- `utils/`, `types/`: 공통 서버 지원 코드.

초기화 순서나 최상위 폴더 책임이 바뀌면 이 문서와 [`docs/architecture/overview.md`](../../docs/architecture/overview.md)를 갱신한다.

각 기술 계층의 최상위에는 조립점과 `Overview.md`만 두고 구현·테스트는 도메인 폴더에 함께 둔다. 새 파일의 위치는 가장 가까운 도메인 `Overview.md`에서 결정한다.
