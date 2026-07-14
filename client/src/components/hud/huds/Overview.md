# HUD Views Overview

- `PlayerStatusHud`: 생명력·정신력·허기·갈증·공격 cooldown.
- `LocationHud`: 현재 위치의 Monster/Resource 통합 오브젝트와 플레이어 체력.
- `MinimapHud`: 현재 및 인접 위치 좌표.
- `QuickSlotHud`: 저장한 채팅/명령 문자열을 즉시 전송.

서버 HUD payload나 `HUD_DEFINITIONS`가 바뀌면 해당 HUD와 이 문서를 갱신한다. 모든 HUD는 작은 모바일 viewport와 PC에서 겹침·overflow를 확인한다.
