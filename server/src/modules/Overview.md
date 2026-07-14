# Modules Overview

Socket/HTTP 요청, 세션과 온라인 상태, 주기 작업, 도메인 객체 수명처럼 애플리케이션 수준의 조정을 담당한다.

- `socket.ts`: Socket.io 초기화와 세션 쿠키 바인딩.
- `register.ts`, `login.ts`, `mail.ts`, `upload.ts`: 계정·세션·메일·프로필.
- `chat.ts`, `channel.ts`, `message.ts`, `bot.ts`: 채팅 room, 히스토리, 명령 라우팅과 출력.
- `player.ts`, `location.ts`, `game.ts`, `coroutine.ts`: 온라인 Player, 월드, 프레임/지연 실행.
- `itemUse.ts`: 아이템 효과 handler 레지스트리.

이벤트나 공개 함수, 초기화 책임이 바뀌면 이 문서와 [`docs/api/`](../../../docs/api), 관련 [`docs/systems/`](../../../docs/systems) 문서를 갱신한다.
