# Commands Overview

채팅에서 들어온 `/명령어` 또는 첫 단어가 등록된 별칭인 슬래시 없는 입력을 검증된 게임 동작으로 연결한다. 모든 명령은 `modules/bot.ts::registerCommand()`로 등록하고 `index.ts::initAllCommands()`가 분류별 초기화 함수를 호출한다.

- `general.ts`: 도움말, 랜덤, 공지, 관리자 eval.
- `player.ts`: 상태/인벤토리/아이템/장비/공격/스탯. `/공격`은 통합 Location 오브젝트를 대상으로 `Player.performBasicAttack`을 호출해 장착 무기의 오버라이드 또는 근접 폴백을 사용한다. 상태창 장착 정보와 인벤토리는 `Item.image` 및 내구도 progress를 표시하며 아이템 이동은 metadata delta·내구도·영속 태그를 보존하는 snapshot API를 사용한다.
- `location.ts`: Monster/Resource 통합 위치 조회, 오브젝트 상호작용, 개별/전체 바닥 아이템 줍기와 coroutine 이동.
- `shop.ts`: 상점 조회, 구매, 판매.
- `admin.ts`: 권한 10의 플레이어/월드 관리 명령.

명령 이름·인자·권한·자동완성·표시 방식이 바뀌면 이 문서와 [`docs/systems/chat-command.md`](../../../docs/systems/chat-command.md)를 갱신한다.
