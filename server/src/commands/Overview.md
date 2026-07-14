# Commands Overview

채팅에서 들어온 `/명령어`를 검증된 게임 동작으로 연결한다. 모든 명령은 `modules/bot.ts::registerCommand()`로 등록하고 `index.ts::initAllCommands()`가 분류별 초기화 함수를 호출한다.

- `general.ts`: 도움말, 랜덤, 공지, 관리자 eval.
- `player.ts`: 상태/인벤토리/아이템/장비/공격/스탯. 인벤토리는 `Item.image` 아이콘을 표시하며 아이템 이동은 metadata·내구도·영속 태그를 보존하는 snapshot API를 사용한다.
- `location.ts`: 위치 조회, 개별/전체 바닥 아이템 줍기와 coroutine 이동.
- `shop.ts`: 상점 조회, 구매, 판매.
- `admin.ts`: 권한 10의 플레이어/월드 관리 명령.

명령 이름·인자·권한·자동완성·표시 방식이 바뀌면 이 문서와 [`docs/systems/chat-command.md`](../../../docs/systems/chat-command.md)를 갱신한다.
