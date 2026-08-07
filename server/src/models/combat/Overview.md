# Combat Models

피해 계산과 pipeline, 위협·기여도, 투사체, 보호막, 상태효과, 속성 상성, 감정 snapshot을 소유한다. `CombatPipeline`, `ThreatTable`, `StatusEffectType` 등은 전투 기능의 공개 경계다.

데이터 정의는 `data/combat`에 두고, 공격 확정과 상태 변경은 이 폴더의 API를 우회하지 않는다.

해제 불가 효과는 `StatusEffectType.removable`과 제거 사유로 구분한다. 직접 제거·상쇄만 거부하고 만료·사망·정상 시스템 cleanup은 허용해 마녀의 주시·저주 전환과 안전 귀환을 같은 수명주기로 처리한다.
