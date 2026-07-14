# Commands Overview

채팅에서 들어온 `/명령어` 또는 첫 단어가 등록된 별칭인 슬래시 없는 입력을 검증된 게임 동작으로 연결한다. 모든 명령은 `modules/bot.ts::registerCommand()`로 등록하고 `index.ts::initAllCommands()`가 분류별 초기화 함수를 호출한다.

- `general.ts`: 도움말, 랜덤, 공지, 관리자 eval.
- `player.ts`: 상태/인벤토리/아이템/장비/대상/공격/스탯. `/대상지정`은 공격 없이 `currentTarget`을 정하고, `/공격`은 통합 Location 오브젝트를 대상으로 `Player.performBasicAttack`을 호출한다. 양쪽 자동완성은 생존 대상을 먼저, 원래 번호를 유지한 사망·파괴 대상을 뒤에 표시한다. 상태창 장착 정보와 인벤토리는 `Item.image` 및 내구도 progress를 표시하며 아이템 이동은 metadata delta·내구도·영속 태그를 보존하는 snapshot API를 사용한다.
- `location.ts`: Monster/Resource 통합 위치 조회, 오브젝트 상호작용, 개별/전체 바닥 아이템 줍기와 coroutine 이동. `/위치`의 제압된 오브젝트는 progress 대신 붉은 `(사망)` 또는 `(파괴됨)` 상태를 표시한다.
- `shop.ts`: 상점 조회, 구매, 판매.
- `admin.ts`: 권한 10의 플레이어/월드 관리 명령.
- `progress.ts`: `/통계`로 공개 Progress snapshot을 공개 또는 비공개 표시한다.
- `skill.ts`: `/스킬목록`의 보유 스킬·상태·버튼 UI, `/스킬 이름` 발동과 `/스킬정보 이름`의 계산/색상 포맷 UI. 모든 명령은 SkillBook 공개 API만 사용하며 단축어는 각각 `sl`, `su`, `si`다.

명령 이름·인자·권한·자동완성·표시 방식이 바뀌면 이 문서와 [`docs/systems/chat-command.md`](../../../docs/systems/chat-command.md)를 갱신한다.
