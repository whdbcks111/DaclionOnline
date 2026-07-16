# HUD Views Overview

- `PlayerStatusHud`: 이름 옆 현재 레벨, 생명력·정신력·허기·갈증·공격 cooldown과 작은 상태효과 아이콘 목록. 일반 HUD drag 차단 상태에서도 효과 영역만 pointer event를 받아 hover/focus/touch로 레벨·계산 설명·남은 시간을 표시한다.
- `LocationHud`: 현재 위치의 Monster/Resource 통합 오브젝트와 플레이어 체력.
- `MinimapHud`: 현재 및 인접 위치 좌표.
- `QuickSlotHud`: 저장한 채팅/명령 문자열을 즉시 전송.
- `PartyHud`: 파티원별 레벨·HP·MP·파티장과 같은 장소 여부. 파티가 없으면 렌더링하지 않는다.

서버 HUD payload나 `HUD_DEFINITIONS`가 바뀌면 해당 HUD와 이 문서를 갱신한다. 모든 HUD는 작은 모바일 viewport와 PC에서 겹침·overflow를 확인한다.
