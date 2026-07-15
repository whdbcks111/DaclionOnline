# Server Source Overview

`index.ts`가 Socket.io를 먼저 초기화한 뒤 인증, 채팅, 명령, 플레이어, 위치, 게임 루프를 조립하고 HTTP 라우트와 정적 파일을 연결한다. 아이템·몬스터·자원·투사체·상점·상성·통계·스킬·제작법·NPC 데이터 모듈은 시작 시 정적 import로 레지스트리에 등록하며, 참조 대상 정의가 먼저 로드되도록 순서를 유지한다.

- `config/`: 외부 인프라 설정.
- `modules/`: 애플리케이션 서비스와 통신 경계.
- `commands/`: 사용자 `/명령어` 핸들러.
- `models/`: 게임 도메인 객체와 레지스트리.
- `data/`: 코드/JSON 마스터 데이터 등록.
- `scripts/`: idempotent 운영 데이터 변환.
- `utils/`, `types/`: 공통 서버 지원 코드.

초기화 순서나 최상위 폴더 책임이 바뀌면 이 문서와 [`docs/architecture/overview.md`](../../docs/architecture/overview.md)를 갱신한다.
