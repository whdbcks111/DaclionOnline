# SEED WALK Client

`SeedWalk.tsx`는 공통 `components/realtime-game/RealtimeGame`을 기본 옵션으로 여는 `/games/seed-walk/` 진입점이다. 렌더링, 말풍선, 인증과 입력 UI는 공통 컴포넌트가 소유한다. 지형은 shared map v2의 Perlin 초원이며 서버 위치만 보간한다. 전체화면 플레이 중 안내 헤더를 두지 않고 Esc 메뉴와 모바일 메뉴/채팅/조이스틱을 사용한다.
