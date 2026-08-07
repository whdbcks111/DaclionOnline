# Communication Modules

채팅, 채널, 명령 dispatcher, bot 메시지, 이메일과 시스템 우편을 소유한다. 외부 기능은 전송 API와 불변 메시지 snapshot을 사용하고 채널 history나 mailbox 저장 row를 직접 수정하지 않는다. 플레이어 채팅은 history 삽입 시 초월 여부를 포함한 헤더 상태를 snapshot해 과거 메시지 표시가 이후 성장 상태에 따라 바뀌지 않게 한다.

사용자 명령 진입점은 `commands/community`와 각 도메인 commands 폴더에 둔다.
