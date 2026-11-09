# Realtime Game UI

`RealtimeGame.tsx`는 SEED WALK와 테스트2의 공통 인증 로비, 소켓 참가/재접속/퇴장, 입력 heartbeat, 말풍선, Esc modal과 모바일 조작을 소유한다. `platformer` 옵션으로 고정 이벤트 prefix와 version, 점프 입력을 선택한다. 점프 입력은 Space/W/위 방향키의 새 누름마다 증가하는 jump counter이며 모바일은 점프 버튼을 제공한다. 채팅/메뉴에서는 입력을 정지하고 IME 조합 Enter는 전송하지 않는다.

`RealtimeScene.ts`는 렌더링/보간과 카메라 투영만 소유한다. SEED WALK는 Perlin 초원/원형 캐릭터, 테스트2는 사이드뷰 발판/사각 캐릭터/체크포인트 깃발을 그린다. 획득한 깃발은 황금색이며 서버만 위치/체크포인트/완주를 확정한다. `RealtimeGame.module.scss`는 전체화면 canvas와 모바일 조작·채팅·메뉴 레이아웃을 소유한다. Phaser와 이 UI는 게임 lazy chunk에서만 로드한다.
