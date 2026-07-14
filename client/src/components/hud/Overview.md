# HUD Components Overview

`HudContainer.tsx`가 `HudContext` 설정으로 HUD를 선택·배치·drag하고, `HudSettings.tsx`가 표시 여부, anchor, 단위, 투명도, 크기, 퀵슬롯을 편집한다. 실제 HUD 화면은 `huds/`에 둔다.

HUD ID나 설정 계약이 바뀌면 `HudContext`, Container, Settings, 하위 HUD와 이 문서를 함께 갱신한다. 위치/크기는 viewport와 다양한 화면 폭에서 검증한다.
