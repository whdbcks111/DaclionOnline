# SEED WALK Client

`SeedWalk.tsx`는 `/games/seed-walk/`의 시드 선택, GAME BOX 인증, 입장·재접속·퇴장, 입력 heartbeat와 HUD를 소유한다. WASD/방향키와 모바일 왼쪽 아날로그 조이스틱을 지원하고 blur/hidden/unmount 시 정지 입력을 보낸다. 게임 연결은 SocketContext 세션을 재사용하며 로그인 후 `next=seed-walk`와 seed query로 돌아온다.

`SeedWalkScene.ts`는 Phaser 3 렌더링 전용 Scene이다. 공유 map v1로 64×64 타일을 재생성하고 원형 플레이어·눈·닉네임을 표시한다. 자신의 캐릭터는 흰 테두리와 `(나)`로 구분하며 카메라가 따라간다. 서버 위치를 보간할 뿐 클라이언트가 충돌·속도를 확정하지 않는다. World ID 변경 시 게임을 재생성하고 unmount 때 Phaser/ResizeObserver/키보드/타이머를 정리한다.

`SeedWalk.module.scss`는 반응형 로비, canvas/HUD와 모바일 왼쪽 아날로그 조이스틱을 소유한다. 게임과 Phaser는 lazy chunk이므로 포털 방문만으로 엔진을 로드하지 않는다.

초원 색상은 `seedWalkGrassNoise/seedWalkGrassColor`의 시드 기반 3-octave Perlin 노이즈로 위치별 밝기를 은은하게 바꾼다. 시드가 같으면 색 분포도 같고, 이 시각 표현은 기존 지형/충돌 v1 fixture를 변경하지 않는다.
