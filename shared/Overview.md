# Shared Overview

`ZoneType`은 `safe | neutral | hostile`이며 `LocationInfoData` 위험도는 `zoneType/zoneLabel/pvpAllowed`의 가공된 HUD 계약으로 전달된다. `LocationInfoData.capabilities`는 현재 플레이어가 실제 이용할 수 있는 낚시·상점 기능의 key·라벨·아이콘만 전달한다. `tags.ts`는 각 위험도에 대응하는 지역 태그를 소유한다.

서버와 클라이언트가 함께 사용하는 네트워크 계약과 리소스를 둔다.

`PlayerStatsData`는 공격 cooldown과 `autoAttackEnabled`, 플레이어 전투 기술에만 선택적으로 붙는 `SkillHudData.cadenceRemaining/cadenceDuration`, nullable 현재 대상의 선택적 표시 아이콘·HP/MP·보호막·상태이상과 감각 단계별 몬스터 분석 DTO를 공유한다. `LocationInfoData.objects`는 선택적 표시 아이콘과 서버가 판정한 `attack | target | interact` 행동을, `npcs`는 이름·설명·퀘스트 표식을 가져 위치 HUD가 Entity·NPC·QuestBook 내부 데이터를 직접 읽지 않는다. `tags.ts`의 `material:mana_crystal`은 원광·정제 소재·단조 결과가 같은 마력 재료 계보를 유지하게 한다.

- `types.ts`: 로그인·가입·로그아웃·이메일 코드 비밀번호 재설정, 태그, `monster | resource` 통합 오브젝트·NPC ID·지도 아이콘·대표색이 포함된 LocationData, 방문 후 공개되는 보스 구역 여부와 안전·중립·적대 위험도가 포함된 플레이어별 `WorldMapData`와 `worldMap` ChatNode, 현재 이용 가능한 낚시·상점 기능과 보스 왕관 표시 여부·타입색 `ShieldBarSegment`를 포함한 HUD DTO, `level/exp/maxExp/equippedTitle`을 가진 플레이어 HUD DTO, `newcomer/karmaMarked/equippedTitle` 메시지 헤더 표식, 서버 검증 `ChatReplyReference`, 자유 텍스트/허용 목록 구분이 포함된 명령 인자, 채팅 타입을 포함한 단일 호환·최대 10장 묶음 이미지 메시지·정보 공개·채널·온라인 mention·화면 전용 채팅 청소 Socket.io 이벤트 map의 단일 기준. `ClientPresenceState`는 다중 접속 중 focused/visible/hidden 화면을 구분한다. Player/Location HUD는 `syncId/revision`을 포함해 중복·역순 snapshot을 거르며, `AdjacentLocationData`는 플레이어 기준 `visible | locked`와 공개 잠금 사유를 포함한다. 관리자 계약에는 칭호 마스터 option·보유/장착 snapshot·부여/회수 action, 사람 확인 상태·강제 실행/해제 action, 카르마 설정과 실제 장비·스킬 로테이션을 실행하는 `analyze_balance_profile`이 포함된다. 사람 확인 계약은 정답을 제외한 raster 문제·만료 시각과 답안 제출만 공유한다.
- `hudPresets.ts`: 이름 있는 HUD snapshot의 버전·허용 좌표/크기·최대 프리셋/퀵슬롯 수와 서버·클라이언트 공용 정규화 API. `types.ts`의 프리셋 소켓 이벤트가 이 계약을 사용한다.
- `chat.ts`: 채널·근처·파티·광고·권한 10 공지의 `ChatType` 표시 메타데이터와 광고 제한·귓속말 회색 token을 공유하고, 구조화 ChatNode를 답장용 최대 120자 한 줄로 요약하며 서버 메시지 ID 형식을 검증한다.
- `commandInput.ts`: 슬래시 명령과 슬래시 없는 별칭 입력을 같은 방식으로 첫 토큰/나머지 인자로 분리하는 공용 parser.
- `patchNotes.ts`: 작업 묶음별 SemVer 사용자 공개 변경 기록, 배포일, `[+] 기능/콘텐츠`, `[/] 수정`, `[-] 삭제` 클래스형 분류와 버전 역순 불변 snapshot 조회 API. 튜토리얼 완성까지는 `0.x.x` 베타로 구분하고, `v` 접두사를 정규화하며 서버 명령과 클라이언트 화면이 같은 데이터를 사용한다. 현재 v1.0.27은 전투 제어·재생·방어·몬스터 생명력·전투 기술 0.9초 연계 간격, 낚시 통신 오탐, 방어구 내구도 손상과 적대 구역 부활 대기 완화를 안내한다.
- `minigames.ts`: 종류별 미니게임 세션, 준비·실시간 축·실시간 action·결과 확정 요청 DTO와 20ms 축 입력 병합·2,048개 상한 API. 낚시는 version 1 `FishingCaptureProof`와 불변 입력 snapshot, 100ms 간격+최종 그물·물고기·게이지 궤적 생성기를 제공한다. 낚시 포획, 실제 패턴 label·보스별 단색 theme·난이도 1~10·성장형 연쇄 폭발·세 줄 연사·교차 레이저를 지원하는 위험 회피, 난이도별 정박/엇박/연속박자 생성·가장 가까운 note 우선 타격 판정·품질 보정을 서버와 클라이언트가 공유하는 결정론 simulator를 함께 둔다.
- `tags.ts`: `namespace:path` 검증, 액티브/패시브와 직업·원소 공유 쿨다운 계열, 무기·Entity·은신·투사체/탄약/도구/미끼/물고기/스킬북/가방, 제작 부품과 활시위/화살대 호환 소재, 분기형 `location:dungeon`을 포함한 지역·속성 공용 태그 ID와 raw Set을 숨기는 `TagCollection/TagReadable/TagQuery` API.
- 은빛그물 숲 확장은 `location:forest` 권역과 `shop:hunter` 상점 분류를 동일한 공용 태그 API에 추가한다.
- 카르마 정책은 `npc:benevolent`, `facility:lawful`, `facility:sanctuary` 태그로 NPC·퀘스트·상점·교단의 역할을 마스터 데이터에 선언한다.
- 유리모래 사막의 `location:desert`, `shop:caravan`, `material:glass`, 서리잔향 설원·빙경궁의 `location:frozen`, `shop:frost`, `material:rime`, 카이로스 공방도시의 `location:clockwork`, `shop:clockwork`, `material:clockwork`, 벨카인·루나리스 해구·카미하라 숲과 Lv.380~500 아스트라 회랑·에버프로스트 정원·라그나벨 성단의 location/shop/material 분류를 같은 공용 태그 API에서 소유한다.
- `package.json`: 서버 빌드와 브라우저 번들에서 공용 런타임 모듈을 ESM으로 일관되게 해석한다.
- `templates/`: 서버 메일에서 읽는 회원가입·비밀번호 재설정 공용 인증번호 HTML 템플릿.

`tags.ts`는 `normalizeTag(s)`와 `isPropertyTag()`로 namespace 문법 및 `property:*` 상성 태그를 판별하고, `TagCollection`으로 정의·영속·런타임 태그를 raw Set 노출 없이 합성한다.
전용 보스 전투 공간은 공용 `GameTags.LOCATION_BOSS_ROOM` (`location:boss_room`) 태그로 표시한다.

공유 타입 변경은 서버 생산자/소비자와 클라이언트 생산자/소비자를 같은 변경에서 수정하고 [`docs/api/socket-events.md`](../docs/api/socket-events.md)와 이 문서를 갱신한다.
