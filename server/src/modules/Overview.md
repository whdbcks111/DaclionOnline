# Modules Overview

`partyManager.areInSameParty()`는 내부 멤버 Map을 노출하지 않고 PVP 아군 공격을 차단하며, `getEventAudienceUserIds()`는 스킬·공격·회피 파티 피드 수신자 snapshot을 제공한다. `sendLocationInfo()`는 위험도 표시명과 PVP 허용 여부를 가공된 HUD snapshot으로 제공한다.

Socket/HTTP 요청, 세션과 온라인 상태, 주기 작업, 도메인 객체 수명처럼 애플리케이션 수준의 조정을 담당한다.

- `login.ts`, `socket.ts`: Socket.io 초기화·세션 쿠키 바인딩과 인메모리 세션·userId별 socket ID Set을 관리한다. 전체/채널 접속자는 다중 탭을 합친 고유 사용자 기준이며, 명시적 로그아웃과 disconnect 모두 socket ID 바인딩을 안전하게 해제한다. 마지막 연결 종료 시 재접속 여부를 저장 전후 확인해 Player를 unload하고 활성 NPC 대화도 종료한다.
- `register.ts`, `mail.ts`, `upload.ts`: 계정 등록·메일·프로필과 채팅 이미지 업로드. 채팅 이미지는 Sharp로 최대 1600px WebP에 재인코딩하고 소유권·표시 치수 snapshot API, 전체 100장·7일 보관 및 시작/매시간 정리를 제공한다.
- `chat.ts`, `channel.ts`, `message.ts`, `bot.ts`, `informationVisibility.ts`: 채팅 room, 히스토리, `/명령` 및 슬래시 없는 별칭 입력의 라우팅과 출력. `getCommandListFiltered(permission)`은 권한에 맞는 명령과 복사된 aliases snapshot을 제공한다. CHAT/COMMAND 행동 제한, 최대 10장 묶음 이미지 전송, 온라인 닉네임 `@` 자동완성과 귓속말, 공개하지 않는 일반 문장 SkillBook trigger, 이미지 노드를 포함할 수 있는 본인 전용 플레이어 표시 메시지와 `[파티]` 스킬·전투 필터 피드, 정보성 명령 공개/비공개 모드를 담당한다.
- `playerRegistry.ts`, `player.ts`, `party.ts`, `location.ts`, `game.ts`, `coroutine.ts`, `scheduler.ts`: 온라인 Player와 고유번호/닉네임 목적형 조회·prefix 검색, 최대 5명 런타임 파티·60초 초대·파티 HUD·같은 장소 몬스터 경험치 공유, 현재 Entity 보호막 구간과 표시 가능한 스킬 쿨다운이 포함된 0.5초 Player/Location HUD payload, Player/Progress/SkillBook 수명·dirty 저장, 통합 Location 오브젝트/NPC ID 검증·JSON 저장, 월드 프레임/제작 대기 실행을 담당한다. scheduler는 스킬·무기·아이템 효과가 재사용하는 key 교체/취소/반복 지연 API이며 미니게임 만료와 낚시 타이머가 사용한다. `player.ts`의 인접 위치 snapshot은 `Location.getAvailableConnections(player)`를 사용해 hidden을 제외하고 visible/locked 상태를 전송한다. 마지막 연결 종료와 Player unload는 파티·정보 공개 모드·제작·NPC 대화·질문 퍼즐 세션을 정리한다.
- `ranking.ts`: `Player.getPersistedRankingSnapshots`의 가공된 DTO를 10초 캐시하고 온라인 Player의 현재 공개 API snapshot으로 덮어쓴 뒤, 값 내림차순 공동 순위와 수치 공개 여부를 반환한다.
- `stateSync.ts`: `playerStats/locationInfo`의 내용 변경 시에만 revision을 올리고 socket별 전달 stamp를 비교해 완전한 snapshot을 전송한다. `syncId`가 바뀌면 낮은 revision도 새 stream으로 인정해 재접속·다중 탭의 부분 병합 오류를 피한다.
- `player.ts`의 HUD snapshot은 `level/exp/maxExp`를 포함하며 위치 플레이어 목록을 실제 socket 연결 상태로 다시 거른다. 마지막 연결이 끊긴 메모리 Player는 저장 후 registry에서 제거하되 저장 중 재접속하면 유지한다.
- `masterDataValidation.ts`: 아이템·스킬·직업·몬스터·자원·제작·퀘스트·NPC·장소 공개 레지스트리를 사용해 참조와 필수 아이콘 파일을 검증한다.
- `itemUse.ts`: 아이템 효과 handler 레지스트리.
- `itemAttack.ts`: `basicAttackOverride` key→함수 레지스트리와 탄약/무탄약 투사체 기본 공격 실행. `false` 반환은 직접 근접 공격 폴백을 뜻하며, 투사체 적중 뒤에도 발사 무기의 마스터/인스턴스 적중 효과를 같은 성공 피해 조건으로 실행한다.
- `minigame.ts`, `minigamePresets.ts`: 사용자별 단일 일회성 session/token/만료 상태, 공통 축·action 입력 정규화, 타입별 서버 validator·완료/취소 callback과 관리자용 보상 없는 낚시/일반 회피/수정 연쇄 낙석/지핵 공명 폭주/성계 교차포화/기초·고속 단조 프리셋. 회피 조작 속도는 대상 Player의 `speed`를 보드 이동량으로 변환하고 단조는 서버 beat 시각과 strike action으로 정확도·콤보를 재현한다. `data/bossPatterns.ts`는 같은 회피 validator를 실제 보스 3종의 주기 패턴·실패 피해·수정 보호 기믹에 연결한다. `fishing.ts`는 낚시 가능 장소·주손 낚싯대를 검사하고, 보조 미끼가 없으면 인벤토리 묶음을 자동 장착해 한 개만 소비한 뒤 남은 시간을 숨긴 입질 timer, 1초 입질 경고, 행운 등급, session/token 확인과 느슨한 입력 정규화 뒤 서버 재현하는 미니게임, 물고기/경험치 보상을 연결한다.
- `forging.ts`: `career:blacksmith` 정식 메인/서브/계보 조회와 구형 독립 flag의 비파괴 슬롯 이전, 가용 슬롯 전직 API, 대장장이 직업 또는 `metal_forging` 보유를 허용하는 단조 권한 API와 제련 소재 선검증, 제련 정밀도로 상한 45%까지 넓어지는 서버 권위 단조 리듬 판정, 실패 소재 파손/성공 조합형 장비 교환·이벤트 연결. 완성품에는 제작자 레벨·감각·제련 정밀도로 계산한 숙련 배율을 전달하고, 제련 처리량과 단조 정확도·재료 power를 현재 `maxExp` 비율로 환산하는 경험치 API를 제공한다.
- `adminPanel.ts`: 권한 10 세션을 재검증하고 온라인 우선 플레이어 목록·가공된 상세 snapshot·마스터 option을 제공하며, 단순 레벨 설정과 성장 지급분을 동반하는 `Player.adjustLevel` 조정, 인벤토리/보유 스킬 레벨·직업/상한 없는 상태효과 레벨·월드 운영과 전체 채팅·전체 알림·선택 온라인 플레이어 알림 action을 소유 도메인 API로 실행한다. 액션 결과는 요청 소켓의 기본 notification으로 피드백한다.

이벤트나 공개 함수, 초기화 책임이 바뀌면 이 문서와 [`docs/api/`](../../../docs/api), 관련 [`docs/systems/`](../../../docs/systems) 문서를 갱신한다.
