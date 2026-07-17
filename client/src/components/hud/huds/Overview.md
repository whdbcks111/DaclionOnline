# HUD Views Overview

- `PlayerStatusHud`: 이름 옆 현재 레벨, 생명력·정신력·허기·갈증·공격 cooldown과 작은 상태효과 아이콘 목록. 일반 HUD drag 차단 상태에서도 효과 영역만 pointer event를 받아 hover/focus/touch로 레벨·계산 설명·남은 시간을 표시한다.
- `LocationHud`: 현재 위치의 Monster/Resource 통합 오브젝트와 플레이어 체력. 오브젝트 행에는 설정으로 숨길 수 있는 `공격`/`대상` 버튼이 있고 기존 명령을 숨김 실행한다.
- `MinimapHud`: 현재 및 인접 위치 좌표. 세부 설정을 켜면 잠금 상태가 아닌 인접 지역만 아래 목록으로 표시하고 `이동` 버튼으로 기존 `/이동 ID` 명령을 숨김 실행한다.
- `QuickSlotHud`: 저장한 채팅/명령 문자열을 즉시 전송.
- `SkillQuickHud`: 사용자가 켠 기본 공격과 보유 스킬을 독립된 큰 아이콘·작은 이름 버튼으로 표시한다. 클릭은 각각 숨김 `/공격`, `/스킬 ID` 명령을 실행하며 일반 모드의 pointer down 포커스 이동을 막아 모바일 채팅 키보드를 유지한다. 서버 공격/스킬 남은 쿨다운과 payload 수신 시각을 기준으로 시계 방향 clear가 진행되는 overlay를 0.1초 단위로 보간한다. 위치 편집 모드에서는 각 버튼을 viewport `%` 좌표로 따로 drag한다.
- `PartyHud`: 파티원별 레벨·HP·MP·파티장과 같은 장소 여부. 파티가 없으면 렌더링하지 않는다.

서버 HUD payload나 `HUD_DEFINITIONS`가 바뀌면 해당 HUD와 이 문서를 갱신한다. 모든 HUD는 작은 모바일 viewport와 PC에서 겹침·overflow를 확인한다.
