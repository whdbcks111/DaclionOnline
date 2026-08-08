# Community Commands

채팅 기본 명령과 우편·파티·거래·꾸미기처럼 플레이어 사이의 상호작용 진입점을 둔다. `general.ts`, `mailbox.ts`, `party.ts`, `trade.ts`, `cosmetics.ts`가 각 소유 module의 공개 API를 호출하며 세션이나 에스크로 내부 상태를 직접 읽지 않는다.

새 명령은 이 도메인의 기존 초기화 함수 또는 [`../index.ts`](../index.ts)에 등록한다.
