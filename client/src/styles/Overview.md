# Styles Overview

전역 스타일 기반과 재사용 token/mixin을 둔다.

- `variables.scss`: font, spacing, breakpoint, shadow 등 SCSS 변수.
- `themes.scss`: light/dark CSS custom properties.
- `mixins.scss`: layout, button, card, responsive helper.
- `global.scss`: reset, font, document 기본 스타일.

새 UI는 고정 px 의존을 최소화하고 기존 token, `%`, `rem`, `vh/vw`, `clamp()`와 media query를 사용해 모바일/PC를 모두 지원한다. 단색 면·얇은 경계·간격·타이포그래피 중심의 평면적인 구성을 기본으로 하며, 장식성 gradient·glow·발광 외곽선·과한 그림자는 의미상 필요한 효과가 아니면 사용하지 않는다. breakpoint나 전역 token이 바뀌면 이 문서와 영향을 받는 module styles를 갱신한다.
