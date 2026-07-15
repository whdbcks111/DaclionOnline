# Commands Overview

채팅에서 들어온 `/명령어` 또는 첫 단어가 등록된 별칭인 슬래시 없는 입력을 검증된 게임 동작으로 연결한다. 모든 명령은 `modules/bot.ts::registerCommand()`로 등록하고 `index.ts::initAllCommands()`가 분류별 초기화 함수를 호출한다.

- `general.ts`: 도움말, 랜덤, 공지, 관리자 eval.
- `player.ts`: 상태/인벤토리/아이템/장비/대상/공격/스탯. `/대상지정`은 공격 없이 `currentTarget`을 정하고, `/공격`은 통합 Location 오브젝트를 대상으로 `Player.performBasicAttack`을 호출한다. 양쪽 자동완성은 생존 대상을 먼저, 원래 번호를 유지한 사망·파괴 대상을 뒤에 표시한다. 상태창 맨 아래는 효과 아이콘·레벨·시간·hover 설명을, 장착 정보와 인벤토리는 `Item.image` 및 내구도 progress를 표시한다.
- `location.ts`: Monster/Resource 통합 위치 조회, 오브젝트 상호작용, 개별/전체 바닥 아이템 줍기와 coroutine 이동. `/이동`은 `ActionType.LOCATION_TRAVEL` 제한을 검사하고 장소 ID·구분 기호 없는 이름·유일한 부분 이름을 허용하며, `/위치`의 제압된 오브젝트는 붉은 상태를 표시한다.
- `shop.ts`: 상점 조회, 구매, 판매.
- `admin.ts`: 권한 10의 플레이어/월드 관리 명령. `/상태이상부여`는 온라인 대상만 조회해 `Entity.applyStatusEffect` 공개 API를 호출한다.
- `progress.ts`: `/통계`로 공개 Progress snapshot을 공개 또는 비공개 표시한다.
- `skill.ts`: `/스킬목록`의 보유 스킬 아이콘·발동/쿨다운·버튼 UI, `/스킬 이름` 발동과 `/스킬정보 이름`의 아이콘·계산 설명·소모값·재사용 대기시간·발동 조건 UI. 모든 명령은 SkillBook 공개 API만 사용하며 단축어는 각각 `sl`, `su`, `si`다.
- `crafting.ts`: `/제작법목록`의 발견 제작법·재료·시간·버튼 UI와 `/제작 <이름> [개수]` 파싱/시작. 명령 metadata는 이름과 선택 개수를 두 인자로 표시하되, 실행 시에는 이름 중간 공백을 보존하고 마지막 숫자 token만 개수로 해석한다.
- `npc.ts`: `/대화 번호`, 선택지 버튼의 session 검증, `/대화종료`. 명령 입력은 숨기며 모든 상태 변경은 NpcDialogue 공개 API를 사용한다.

명령 이름·인자·권한·자동완성·표시 방식이 바뀌면 이 문서와 [`docs/systems/chat-command.md`](../../../docs/systems/chat-command.md)를 갱신한다.
