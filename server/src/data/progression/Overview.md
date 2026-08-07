# Progression Master Data

직업, 통계·플래그, 퀘스트, 칭호와 성장 단계 정의를 등록한다. 안정 ID와 선행 조건은 Player 저장 데이터 및 다른 마스터 데이터에서 참조하므로 임의로 변경하지 않는다.

스킬 실행 정의는 `data/combat`, 스킬 보유·성장은 `models/progression`에 둔다.

`ascension.ts`는 Lv.1000 아르케 제압 자격과 다클레비스 정보 확인에 쓰는 숨김 FLAG를 정의하고, 모델이 소유한 초월 단계·보상 안정 ID를 다시 공개한다. 이벤트 구독과 실제 환생 조립은 `modules/world/ascension.ts`, 조건부 NPC 대화와 2단계 재확인은 `data/world/npcs.ts`가 담당한다.
