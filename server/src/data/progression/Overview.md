# Progression Master Data

직업, 통계·플래그, 퀘스트, 칭호와 성장 단계 정의를 등록한다. 안정 ID와 선행 조건은 Player 저장 데이터 및 다른 마스터 데이터에서 참조하므로 임의로 변경하지 않는다.

스킬 실행 정의는 `data/combat`, 스킬 보유·성장은 `models/progression`에 둔다.

`ascension.ts`는 Lv.1000 아르케 제압 자격과 다클레비스 정보 확인에 쓰는 숨김 FLAG의 안정 ID를 소유한다. 이벤트 구독은 `modules/world/ascension.ts`, 조건부 NPC 대화는 `data/world/npcs.ts`가 이 공개 ID를 사용한다.
