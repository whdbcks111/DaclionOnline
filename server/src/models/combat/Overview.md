# Combat Models

피해 계산과 pipeline, 위협·기여도, 투사체, 보호막, 상태효과, 속성 상성, 감정 snapshot을 소유한다. `CombatPipeline`, `ThreatTable`, `StatusEffectType` 등은 전투 기능의 공개 경계다.

데이터 정의는 `data/combat`에 두고, 공격 확정과 상태 변경은 이 폴더의 API를 우회하지 않는다.
