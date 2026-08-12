# Actor Models

Player, Monster, NPC, Resource와 이들의 기본 상태·수명주기를 소유한다. `Entity` 공통 규칙은 `models/core`, 전투 계산과 효과는 `models/combat`의 공개 API를 사용한다.

외부 기능은 actor 내부 컬렉션 대신 Player·Monster·Location이 제공하는 목적형 메서드와 snapshot을 사용한다.

Player 로드는 직업 동기화와 SkillBook 패시브 modifier 복원을 마친 뒤 저장된 생명력·정신력을 현재 최대치로 clamp한다.

NPC는 플레이어 진행에 따른 선택적 `isVisibleTo(Player)` 판정을 제공하며 Location의 NPC 목록·번호·존재 확인과 실제 대화 시작이 같은 조건을 사용한다.

Monster는 일반 파티 교전 선점과 별도로 인스턴스 현장 참가 권한을 소유한다. 모든 보스의 기본 공격은 하나의 정상 공격 주기 안에서 두 몫을 솔로에게 중첩하거나 두 참가자에게 분산하며, 추가 몫이 다음 AI tick의 쿨다운을 해제하지 않는다.
