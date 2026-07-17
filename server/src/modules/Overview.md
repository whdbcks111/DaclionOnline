# Modules Overview

Socket/HTTP 요청, 세션과 온라인 상태, 주기 작업, 도메인 객체 수명처럼 애플리케이션 수준의 조정을 담당한다.

- `login.ts`, `socket.ts`: Socket.io 초기화·세션 쿠키 바인딩과 인메모리 세션·userId별 socket ID Set을 관리한다. 전체/채널 접속자는 다중 탭을 합친 고유 사용자 기준이며, 명시적 로그아웃과 disconnect 모두 socket ID 바인딩을 안전하게 해제한다. 마지막 연결 종료 시 활성 NPC 대화도 unload 사유로 종료한다.
- `register.ts`, `mail.ts`, `upload.ts`: 계정 등록·메일·프로필.
- `chat.ts`, `channel.ts`, `message.ts`, `bot.ts`, `informationVisibility.ts`: 채팅 room, 히스토리, `/명령` 및 슬래시 없는 별칭 입력의 라우팅과 출력. `getCommandListFiltered(permission)`은 권한에 맞는 명령과 복사된 aliases snapshot을 제공한다. CHAT/COMMAND 행동 제한, 온라인 닉네임 `@` 자동완성과 채널을 넘는 양방향 필터 히스토리 귓속말, 공개하지 않는 일반 문장 SkillBook trigger와 본인 전용 플레이어 표시 메시지, 플레이어별 정보성 명령 공개/비공개 모드와 async 출력 문맥을 담당한다.
- `playerRegistry.ts`, `player.ts`, `party.ts`, `location.ts`, `game.ts`, `coroutine.ts`: 온라인 Player와 고유번호/닉네임 목적형 조회·prefix 검색, 최대 5명 런타임 파티·60초 초대·파티 HUD·같은 장소 몬스터 경험치 공유, 표시 가능한 스킬 쿨다운이 포함된 0.5초 Player HUD payload, Player/Progress/SkillBook 수명·dirty 저장, 통합 Location 오브젝트/NPC ID 검증·JSON 저장, 월드 프레임/제작 대기 실행. `player.ts`의 인접 위치 snapshot은 `Location.getAvailableConnections(player)`를 사용해 hidden을 제외하고 visible/locked 상태를 전송한다. 마지막 연결 종료와 Player unload는 파티·정보 공개 모드·제작·NPC 대화를 정리한다.
- `itemUse.ts`: 아이템 효과 handler 레지스트리.
- `itemAttack.ts`: `basicAttackOverride` key→함수 레지스트리와 탄약/무탄약 투사체 기본 공격 실행. `false` 반환은 직접 근접 공격 폴백을 뜻한다.
- `minigame.ts`: 사용자별 단일 일회성 session/token/만료 상태와 타입별 서버 validator·완료/취소 callback. `fishing.ts`는 낚시 가능 장소·주손 낚싯대·보조 미끼를 검사하고 입질 timer, 행운 등급, 검증 미니게임, 물고기/경험치 보상을 연결한다.
- `adminPanel.ts`: 권한 10 세션을 재검증하고 온라인 우선 플레이어 목록·가공된 상세 snapshot·마스터 option을 제공하며, 플레이어/인벤토리/보유 스킬 레벨·직업/상태효과/월드 운영과 전체 채팅·전체 알림·선택 온라인 플레이어 알림 action을 소유 도메인 API로 실행한다. 액션 결과는 요청 소켓의 기본 notification으로 피드백한다.

이벤트나 공개 함수, 초기화 책임이 바뀌면 이 문서와 [`docs/api/`](../../../docs/api), 관련 [`docs/systems/`](../../../docs/systems) 문서를 갱신한다.
