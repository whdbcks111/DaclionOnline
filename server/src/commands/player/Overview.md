# Player Commands

캐릭터 정보·직업·스킬·진행도·랭킹·칭호·튜토리얼·카르마 등 개인 성장과 상태를 다루는 명령을 둔다. 조회는 불변 snapshot을 사용하고 변경은 Player 또는 소유 module의 공개 메서드에 위임한다.

월드 배치나 플레이어 간 상호작용 명령은 각각 `world`, `community` 폴더에 둔다.

공통 계정 세션은 `modules/portal/login.ts`의 공개 API를 사용한다. 포털 로그인과 실제 게임 입장은 분리되며 게임 이름은 Player의 표시명을 사용한다.
