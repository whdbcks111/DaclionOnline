# Status Effects Components Overview

플레이어에게 걸린 상태이상을 화면 전체 피드백으로 바꾸는 클라이언트 전용 표현 계층이다. 서버 판정이나 상태효과 수명은 변경하지 않는다.

- `statusEffectVisuals.ts`: 상태효과 ID를 화염·독·빙결·감전 화면 preset, 독성 HP 색과 마비성 메시지 교란으로 변환하는 클래스형 enum과 resolver.
- `StatusEffectScreenEffects.tsx`: resolver 결과의 활성 레이어만 렌더링하는 포인터 입력 비활성 화면 overlay.
- `StatusEffectScreenEffects.module.scss`: 투명 알파 WebP 가장자리 이미지를 CSS `border-image` 9-slice로 늘린다. 화면 비율과 무관하게 중앙 채팅 영역은 덮지 않고 테두리 두께만 `vmin`과 `clamp()`로 반응한다. 화염·빙결·감전은 상위 paint containment에 격리되지 않은 가산 합성을 사용한다.

새 주요 상태효과는 서버 ID를 `StatusScreenEffectPreset` 또는 메시지 교란 ID 집합에 등록하고, 새 시각 계열이 필요할 때만 `client/public/effects/status/` 에셋을 추가한다.
