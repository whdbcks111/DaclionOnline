# World Commands

장소·지도·NPC·퀘스트·퍼즐·속성표·전문 도감처럼 월드 탐색 진입점을 둔다. 위치 이동과 대화 조건은 명령에서 재구현하지 않고 world model/module의 판정을 사용한다.

새 월드 명령 초기화 함수는 [`../index.ts`](../index.ts)에 등록한다.
