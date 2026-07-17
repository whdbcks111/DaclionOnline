# Modules Overview

Socket/HTTP 요청, 세션과 온라인 상태, 주기 작업, 도메인 객체 수명처럼 애플리케이션 수준의 조정을 담당한다.

- `socket.ts`: Socket.io 초기화와 세션 쿠키 바인딩. 사용자의 마지막 소켓 연결이 끊기면 활성 NPC 대화를 unload 사유로 종료한다.
- `register.ts`, `login.ts`, `mail.ts`, `upload.ts`: 계정·세션·메일·프로필.
- `chat.ts`, `channel.ts`, `message.ts`, `bot.ts`, `informationVisibility.ts`: 채팅 room, 히스토리, `/명령` 및 슬래시 없는 별칭 입력의 라우팅과 출력. CHAT/COMMAND 행동 제한, 공개하지 않는 일반 문장 SkillBook trigger와 본인 전용 플레이어 표시 메시지, 플레이어별 정보성 명령 공개/비공개 모드와 async 출력 문맥을 담당한다.
- `playerRegistry.ts`, `player.ts`, `party.ts`, `location.ts`, `game.ts`, `coroutine.ts`: 온라인 Player와 고유번호/닉네임 목적형 조회, 최대 5명 런타임 파티·60초 초대·파티 HUD·같은 장소 몬스터 경험치 공유, Player/Progress/SkillBook 수명·dirty 저장, 통합 Location 오브젝트/NPC ID 검증·JSON 저장, 월드 프레임/제작 대기 실행. 마지막 연결 종료와 Player unload는 파티·정보 공개 모드·제작·NPC 대화를 정리한다.
- `itemUse.ts`: 아이템 효과 handler 레지스트리.
- `itemAttack.ts`: `basicAttackOverride` key→함수 레지스트리와 탄약/무탄약 투사체 기본 공격 실행. `false` 반환은 직접 근접 공격 폴백을 뜻한다.

이벤트나 공개 함수, 초기화 책임이 바뀌면 이 문서와 [`docs/api/`](../../../docs/api), 관련 [`docs/systems/`](../../../docs/systems) 문서를 갱신한다.
