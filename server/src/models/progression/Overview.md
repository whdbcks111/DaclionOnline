# Progression Models

직업·전직, 스킬북, 퀘스트북, 통계·플래그, 칭호, 랭킹, 전문 도감과 밸런스 분석을 소유한다. Player는 이 객체들의 공개 API와 직렬화 snapshot만 사용한다.

안정 ID 정의는 `data/progression` 및 `data/combat/skills.ts`와 함께 확인한다.

`Ascension.ts`는 초월 단계, Lv.1000 전후 경험치 배율, 미초월 Lv.1500 상한, 환생 보너스 ID와 수치를 소유한다. `CareerProfile/SkillBook/QuestBook.resetForAscension()`은 각자의 영속 상태만 초기화하고 Player가 장비·레벨·능력치 초기화를 함께 조립한다.
