# Shared Overview

`ZoneType`은 `safe | neutral | hostile`이며 `LocationInfoData` 위험도는 `zoneType/zoneLabel/pvpAllowed`의 가공된 HUD 계약으로 전달된다. `tags.ts`는 각 위험도에 대응하는 지역 태그를 소유한다.

서버와 클라이언트가 함께 사용하는 네트워크 계약과 리소스를 둔다.

- `types.ts`: 태그, `monster | resource` 통합 오브젝트·NPC ID·지도 아이콘·대표색이 포함된 LocationData, 플레이어별 `WorldMapData`와 `worldMap` ChatNode, 타입색 `ShieldBarSegment`와 재사용 채팅 노드, `level/exp/maxExp/equippedTitle`을 가진 플레이어 HUD DTO, `newcomer/karmaMarked/equippedTitle` 메시지 헤더 표식, 서버 검증 `ChatReplyReference`, 채팅 타입을 포함한 단일 호환·최대 10장 묶음 이미지 메시지·정보 공개·채널·온라인 mention Socket.io 이벤트 map의 단일 기준. Player/Location HUD는 `syncId/revision`을 포함해 중복·역순 snapshot을 거르며, `AdjacentLocationData`는 플레이어 기준 `visible | locked`와 공개 잠금 사유를 포함한다. 관리자 계약에는 칭호 마스터 option·보유/장착 snapshot·부여/회수 action, 카르마 설정과 실제 장비·스킬 로테이션을 실행하는 `analyze_balance_profile`이 포함된다.
- `chat.ts`: 채널·근처·파티·광고·권한 10 공지의 `ChatType` 표시 메타데이터와 광고 제한·귓속말 회색 token을 공유하고, 구조화 ChatNode를 답장용 최대 120자 한 줄로 요약하며 서버 메시지 ID 형식을 검증한다.
- `commandInput.ts`: 슬래시 명령과 슬래시 없는 별칭 입력을 같은 방식으로 첫 토큰/나머지 인자로 분리하는 공용 parser.
- `patchNotes.ts`: 작업 묶음별 SemVer 사용자 공개 변경 기록, 배포일, `[+] 기능/콘텐츠`, `[/] 수정`, `[-] 삭제` 클래스형 분류와 버전 역순 불변 snapshot 조회 API. 튜토리얼 완성까지는 `0.x.x` 베타로 구분하고, `v` 접두사를 정규화하며 서버 명령과 클라이언트 화면이 같은 데이터를 사용한다.
- `minigames.ts`: 종류별 미니게임 세션·축/action trace DTO, 20ms 축 입력 병합·2,048개 상한·불변 전송 snapshot API와 낚시 포획, 실제 패턴 label·보스별 단색 theme·난이도 1~10·성장형 연쇄 폭발·세 줄 연사·교차 레이저를 지원하는 위험 회피, 난이도별 정박/엇박/연속박자 생성·가장 가까운 note 우선 타격 판정·짧은 터치 표시 지연 보정·품질 보정을 서버와 클라이언트가 공유하는 단조 리듬 시뮬레이터.
- `tags.ts`: `namespace:path` 검증, 액티브/패시브와 직업·원소 공유 쿨다운 계열, 무기·Entity·은신·투사체/탄약/도구/미끼/물고기/스킬북, 제작 부품과 활시위/화살대 호환 소재, 지역·속성 공용 태그 ID와 raw Set을 숨기는 `TagCollection/TagReadable/TagQuery` API.
- 은빛그물 숲 확장은 `location:forest` 권역과 `shop:hunter` 상점 분류를 동일한 공용 태그 API에 추가한다.
- 카르마 정책은 `npc:benevolent`, `facility:lawful`, `facility:sanctuary` 태그로 NPC·퀘스트·상점·교단의 역할을 마스터 데이터에 선언한다.
- 유리모래 사막의 `location:desert`, `shop:caravan`, `material:glass`, 서리잔향 설원·빙경궁의 `location:frozen`, `shop:frost`, `material:rime`, 역설기계고의 `location:clockwork`, `shop:clockwork`, `material:clockwork`, 공허왕관의 `location:voidcrown`, 월식해구의 `location:eclipse-trench`, 역근수해의 `location:worldroot`와 각 권역 shop/material 분류를 같은 공용 태그 API에서 소유한다.
- `package.json`: 서버 빌드와 브라우저 번들에서 공용 런타임 모듈을 ESM으로 일관되게 해석한다.
- `templates/`: 서버 메일에서 읽는 HTML 템플릿.

`tags.ts`는 `normalizeTag(s)`와 `isPropertyTag()`로 namespace 문법 및 `property:*` 상성 태그를 판별하고, `TagCollection`으로 정의·영속·런타임 태그를 raw Set 노출 없이 합성한다.

공유 타입 변경은 서버 생산자/소비자와 클라이언트 생산자/소비자를 같은 변경에서 수정하고 [`docs/api/socket-events.md`](../docs/api/socket-events.md)와 이 문서를 갱신한다.
