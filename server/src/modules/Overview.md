# Modules Overview

Socket/HTTP 요청, 세션과 온라인 상태, 주기 작업, 도메인 객체 수명처럼 애플리케이션 수준의 조정을 담당한다.

- `socket.ts`: Socket.io 초기화와 세션 쿠키 바인딩. 사용자의 마지막 소켓 연결이 끊기면 활성 NPC 대화를 unload 사유로 종료한다.
- `register.ts`, `login.ts`, `mail.ts`, `upload.ts`: 계정·세션·메일·프로필.
- `chat.ts`, `channel.ts`, `message.ts`, `bot.ts`: 채팅 room, 히스토리, `/명령` 및 첫 단어가 정확한 별칭인 슬래시 없는 입력의 명령 라우팅과 출력. 명령이 아닌 문장은 일반 전송 전에 SkillBook 메시지 트리거를 검사하고, `sendPlayerTextToCurrentChannel`은 성공한 스킬의 플레이어 표시 메시지를 만든다.
- `playerRegistry.ts`, `player.ts`, `location.ts`, `game.ts`, `coroutine.ts`: 순환 import 없는 온라인 Player 레지스트리와 Player/Progress/SkillBook 수명·dirty 저장, 통합 Location 오브젝트/NPC ID 검증·JSON 저장, 투사체를 포함한 월드 프레임/제작 대기 실행. Player unload는 진행 중 제작과 NPC 대화를 종료한다.
- `itemUse.ts`: 아이템 효과 handler 레지스트리.
- `itemAttack.ts`: `basicAttackOverride` key→함수 레지스트리와 탄약/무탄약 투사체 기본 공격 실행. `false` 반환은 직접 근접 공격 폴백을 뜻한다.

이벤트나 공개 함수, 초기화 책임이 바뀌면 이 문서와 [`docs/api/`](../../../docs/api), 관련 [`docs/systems/`](../../../docs/systems) 문서를 갱신한다.
