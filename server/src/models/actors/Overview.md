# Actor Models

Player, Monster, NPC, Resource와 이들의 기본 상태·수명주기를 소유한다. `Entity` 공통 규칙은 `models/core`, 전투 계산과 효과는 `models/combat`의 공개 API를 사용한다.

외부 기능은 actor 내부 컬렉션 대신 Player·Monster·Location이 제공하는 목적형 메서드와 snapshot을 사용한다.

Monster는 일반 파티 교전 선점과 별도로 인스턴스 현장 참가 권한을 소유한다. 모든 보스의 기본 공격은 두 몫을 솔로에게 중첩하거나 두 참가자에게 분산한다.
