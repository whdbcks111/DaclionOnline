# Shared Overview

`ZoneType`은 `safe | neutral | hostile`이며 `LocationInfoData` 위험도는 `zoneType/zoneLabel/pvpAllowed`의 가공된 HUD 계약으로 전달된다. `tags.ts`는 각 위험도에 대응하는 지역 태그를 소유한다.

서버와 클라이언트가 함께 사용하는 네트워크 계약과 리소스를 둔다.

- `types.ts`: 태그, `monster | resource` 통합 오브젝트·NPC ID·지도 아이콘·대표색이 포함된 LocationData, 플레이어별 `WorldMapData`와 `worldMap` ChatNode, 타입색 `ShieldBarSegment`와 재사용 채팅 노드, `level/exp/maxExp`를 가진 플레이어/위치 HUD DTO, 단일 호환·최대 10장 묶음 이미지 메시지·정보 공개·채널·온라인 mention Socket.io 이벤트 map의 단일 기준. Player/Location HUD는 `syncId/revision`을 포함해 중복·역순 snapshot을 거르며, `AdjacentLocationData`는 플레이어 기준 `visible | locked`와 공개 잠금 사유를 포함한다. 관리자 action 계약에는 실제 장비·스킬 로테이션을 실행하는 `analyze_balance_profile`이 포함된다.
- `commandInput.ts`: 슬래시 명령과 슬래시 없는 별칭 입력을 같은 방식으로 첫 토큰/나머지 인자로 분리하는 공용 parser.
- `minigames.ts`: 종류별 미니게임 세션·축/action trace DTO, 20ms 축 입력 병합·2,048개 상한·불변 전송 snapshot API와 낚시 포획, 실제 패턴 label·보스별 단색 theme·난이도 1~10·성장형 연쇄 폭발·세 줄 연사·교차 레이저를 지원하는 위험 회피, 난이도별 정박/엇박/연속박자 생성·가장 가까운 note 우선 타격 판정·짧은 터치 표시 지연 보정·품질 보정을 서버와 클라이언트가 공유하는 단조 리듬 시뮬레이터.
- `tags.ts`: `namespace:path` 검증, 액티브/패시브와 전사·궁수·암살자·마법·대장장이·원소 공유 쿨다운 스킬 계열, 검·도끼·활·단검·지팡이 무기 분류, 은신, 투사체/탄약/광맥/보물/채굴·낚시 도구/미끼·물고기·물고기 희귀도/스킬북, 낚시 가능 지역·속성 공용 태그 ID와 raw Set을 숨기는 `TagCollection/TagReadable/TagQuery` API.
- 은빛그물 숲 확장은 `location:forest` 권역과 `shop:hunter` 상점 분류를 동일한 공용 태그 API에 추가한다.
- 유리모래 사막의 `location:desert`, `shop:caravan`, `material:glass`, 서리잔향 설원·빙경궁의 `location:frozen`, `shop:frost`, `material:rime`, 역설기계고의 `location:clockwork`, `shop:clockwork`, `material:clockwork` 분류를 같은 공용 태그 API에서 소유한다.
- `package.json`: 서버 빌드와 브라우저 번들에서 공용 런타임 모듈을 ESM으로 일관되게 해석한다.
- `templates/`: 서버 메일에서 읽는 HTML 템플릿.

공유 타입 변경은 서버 생산자/소비자와 클라이언트 생산자/소비자를 같은 변경에서 수정하고 [`docs/api/socket-events.md`](../docs/api/socket-events.md)와 이 문서를 갱신한다.
