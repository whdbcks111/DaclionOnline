# HUD Components Overview

`HudContainer.tsx`가 `HudContext` 설정으로 PlayerStatus/Party/Location/Minimap/QuickSlot HUD를 선택·배치·drag하고, 묶음에 속하지 않는 스킬 퀵 버튼 layer도 렌더링한다. `HudSettings.tsx`는 일반 HUD 설정과 보유 스킬별 버튼 On/Off·위치 초기화를 제공한다. 실제 HUD 화면은 `huds/`에 둔다. 일반 HUD wrapper는 채팅 조작을 가리지 않도록 pointer event를 차단하며, 상태효과와 스킬 버튼 같은 실제 상호작용 영역만 개별적으로 다시 활성화한다.

HUD ID나 설정 계약이 바뀌면 `HudContext`, Container, Settings, 하위 HUD와 이 문서를 함께 갱신한다. 위치/크기는 viewport와 다양한 화면 폭에서 검증한다.
