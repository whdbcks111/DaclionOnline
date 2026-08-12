# Profession Modules

연금술 draft, 낚시·단조 실행과 서버 검증 미니게임 세션을 소유한다. 입력 token/revision을 검증한 뒤 `models/professions`와 Inventory 공개 API에 실제 변경을 위임한다.

연금 추적 성공으로 결과 지급이 확정되면 완성 병 수·등록 조합 여부·품질을 `alchemy:brewed` 게임 이벤트로 발행해 칭호 통계가 소비한다.

미니게임 공용 계약은 `shared/minigames.ts`와 함께 변경한다.
