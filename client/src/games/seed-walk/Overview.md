# SEED WALK Client

`SeedWalk.tsx`는 `/games/seed-walk/`의 공용 맵 입장, GAME BOX 인증, 입장·재접속·퇴장, 입력 heartbeat와 HUD를 소유한다. WASD/방향키와 모바일 왼쪽 아날로그 조이스틱을 지원하고 blur/hidden/unmount 시 정지 입력을 보낸다. 게임 연결은 SocketContext 세션을 재사용하며 로그인 후 `next=seed-walk`로 돌아온다.

`SeedWalkScene.ts`는 Phaser 3 렌더링 전용 Scene이다. 공유 map v2와 월드 좌표 기반 열린 초원을 그리고 원형 플레이어·눈·닉네임을 표시한다. 자신의 캐릭터는 흰 테두리와 `(나)`로 구분하며 카메라가 따라간다. 서버 위치를 보간할 뿐 클라이언트가 충돌·속도를 확정하지 않는다. World ID 변경 시 게임을 재생성하고 unmount 때 Phaser/ResizeObserver/키보드/타이머를 정리한다.

`SeedWalk.module.scss`는 반응형 로비, canvas/HUD와 모바일 왼쪽 아날로그 조이스틱을 소유한다. 게임과 Phaser는 lazy chunk이므로 포털 방문만으로 엔진을 로드하지 않는다.

초원 색상은 `seedWalkGrassNoise/seedWalkGrassColor`의 시드 기반 3-octave Perlin 노이즈로 위치별 밝기를 은은하게 바꾼다. 시드가 같으면 색 분포도 같고, 이 시각 표현은 월드 좌표에 따라 무한히 이어진다.

map v2는 연못·길·바위·경계벽 없는 초원이다. `seedWalkChat(text)`와 `SeedWalkWorld.say(userId, connectionId, text, now)`는 120자/계정당 3초 3회 제한의 최신 말풍선 하나를 처리하며 5초 후 기존 루프에서 만료한다. snapshot의 선택적 `player.bubble.text`만 전달하고 영속 저장·채팅 로그는 없다. 클라이언트는 Enter/모바일 채팅 버튼으로 62% 위치의 폼을 열고 입력 중 정지, IME 안전 전송·Esc 취소와 카메라 투영 DOM 말풍선을 제공한다.

SEED WALK 플레이 중에는 헤더·툴바·하단 안내·방향/좌표 라벨 없이 canvas가 전체 viewport를 채운다. Esc 또는 아이콘 메뉴 버튼이 native modal dialog를 열며 계속하기·테마·맵 나가기·포털 이동과 접속 인원을 제공한다. 메뉴 중 자신의 입력만 정지하고 멀티플레이 월드는 계속된다. Esc는 채팅이 열려 있으면 채팅만 취소하고, 그 외 메뉴를 토글한다. dialog의 기본 focus trap을 사용한다.
