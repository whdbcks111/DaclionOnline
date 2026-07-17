# Shared Overview

서버와 클라이언트가 함께 사용하는 네트워크 계약과 리소스를 둔다.

- `types.ts`: 태그, `monster | resource` 통합 오브젝트·NPC ID·지도 아이콘·대표색이 포함된 LocationData, 플레이어별 `WorldMapData`와 `worldMap` ChatNode, 플레이어 레벨·상태효과·표시 가능한 스킬 쿨다운과 파티원 HP/MP HUD DTO, 관리자 패널 option/플레이어 snapshot/action, 정보 공개 모드·메시지·채널·온라인 mention completion Socket.io 양방향 이벤트 map의 단일 기준. `AdjacentLocationData`는 플레이어 기준 `visible | locked` 상태와 공개 잠금 사유를 선택적으로 포함한다.
- `commandInput.ts`: 슬래시 명령과 슬래시 없는 별칭 입력을 같은 방식으로 첫 토큰/나머지 인자로 분리하는 공용 parser.
- `minigames.ts`: 미니게임 세션·입력 trace DTO와 낚시 물고기 경로/채집 영역/게이지를 서버와 클라이언트가 동일하게 재생하는 결정론 시뮬레이터.
- `tags.ts`: `namespace:path` 검증, 검·도끼·활·단검·지팡이 무기 분류, 은신, 투사체/탄약/광맥/보물/채굴·낚시 도구/미끼·물고기/스킬북, 낚시 가능 지역·속성 공용 태그 ID와 raw Set을 숨기는 `TagCollection/TagReadable/TagQuery` API.
- `package.json`: 서버 빌드와 브라우저 번들에서 공용 런타임 모듈을 ESM으로 일관되게 해석한다.
- `templates/`: 서버 메일에서 읽는 HTML 템플릿.

공유 타입 변경은 서버 생산자/소비자와 클라이언트 생산자/소비자를 같은 변경에서 수정하고 [`docs/api/socket-events.md`](../docs/api/socket-events.md)와 이 문서를 갱신한다.
