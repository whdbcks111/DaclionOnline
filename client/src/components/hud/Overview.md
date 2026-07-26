# HUD Components Overview

`LocationHud` 헤더는 가공된 지역 위험도 라벨을 표시하고, PVP 허용 지역의 다른 생존 플레이어 행에만 `/대상지정p #고유번호` 버튼을 노출한다.

오브젝트 행은 서버가 제공한 5분 초과 보스 `respawn` 정보가 있으면 이름 옆에 기본 리젠 시간을, 처치 상태에서는 감소하는 남은 시간을 표시한다. `icon`이 있는 몬스터는 이름 앞에 64×64 원본 비율을 유지한 작은 초상을 표시하고 자원처럼 아이콘이 없는 오브젝트는 기존 정렬을 유지한다.

`HudContainer.tsx`가 `HudContext` 설정으로 PlayerStatus/TargetStatus/Party/Location/Minimap/QuickSlot HUD를 선택·배치·drag하고, 묶음에 속하지 않는 전투 퀵 버튼 layer도 렌더링한다. `HudSettings.tsx`는 일반 HUD 설정과 기본 공격·보유 스킬별 버튼 On/Off·위치 초기화를 제공한다. 전투 퀵 버튼 설정 목록은 기본적으로 접혀 있고 활성/전체 개수를 표시하며, 펼치면 viewport 기준 최대 높이 안에서 독립적으로 scroll한다. 제목 옆 톱니는 전투 퀵 버튼에만 적용되는 크기 설정을 연다. 위치 정보 HUD 세부 설정은 오브젝트 공격·대상 버튼을 숨길 수 있고, 미니맵 세부 설정은 인접한 이동 가능 지역 목록과 이동 버튼을 켜거나 끈다. 실제 HUD 화면은 `huds/`에 둔다. 일반 HUD wrapper는 채팅 조작을 가리지 않도록 pointer event를 차단하며, 상태효과와 전투 퀵 버튼, 위치/미니맵 동작 버튼 같은 실제 상호작용 영역만 개별적으로 다시 활성화한다.

`TargetStatusHud`는 대상이 없으면 숨고 편집 모드에서만 미리보기를 제공한다. 서버가 가공한 이름·레벨·HP/MP·보호막·상태이상과 감각 단계별 몬스터 분석을 표시하며 PlayerStatus의 상태이상 hover primitive를 재사용한다. 몬스터 대상의 `icon`은 이름 바로 앞에 표시하고 플레이어처럼 아이콘이 없는 대상은 텍스트만 표시한다.

HUD ID나 설정 계약이 바뀌면 `HudContext`, Container, Settings, 하위 HUD와 이 문서를 함께 갱신한다. 위치/크기는 viewport와 다양한 화면 폭에서 검증한다.
