# World Commands

장소·지도·NPC·퀘스트·퍼즐·속성표·전문 도감처럼 월드 탐색 진입점을 둔다. 위치 이동과 대화 조건은 명령에서 재구현하지 않고 world model/module의 판정을 사용한다.

공간 중계소 목록·이동은 `/중계소`와 짧은 입력 `/ㅈㄱㅅ`, `/th`가 같은 TravelHub 공개 API를 사용한다.

새 월드 명령 초기화 함수는 [`../index.ts`](../index.ts)에 등록한다.

공통 계정 세션은 `modules/portal/login.ts`의 공개 API를 사용한다. 포털 로그인과 실제 게임 입장은 분리되며 게임 이름은 Player의 표시명을 사용한다.
