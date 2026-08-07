# Actor Models

Player, Monster, NPC, Resource와 이들의 기본 상태·수명주기를 소유한다. `Entity` 공통 규칙은 `models/core`, 전투 계산과 효과는 `models/combat`의 공개 API를 사용한다.

외부 기능은 actor 내부 컬렉션 대신 Player·Monster·Location이 제공하는 목적형 메서드와 snapshot을 사용한다.
