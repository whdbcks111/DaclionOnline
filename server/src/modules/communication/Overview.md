# Communication Modules

채팅, 채널, 명령 dispatcher, bot 메시지, 이메일과 시스템 우편을 소유한다. 외부 기능은 전송·복합 보상 인코딩·관리자 회수 API와 불변 메시지 snapshot을 사용하고 channel history나 mailbox 저장 row를 직접 수정하지 않는다. 우편은 기존 v1 아이템 첨부와 v2 아이템·Gold·칭호·스킬 묶음을 함께 읽으며 조건부 claim과 보상 영속화를 한 transaction에 확정한다. 플레이어 채팅은 history 삽입 시 초월 여부를 포함한 헤더 상태를 snapshot해 과거 메시지 표시가 이후 성장 상태에 따라 바뀌지 않게 한다. 감정표현 선택기 요청에는 보유 항목의 안정 ID·이름·이미지만 반환하고 사용 요청은 채팅 행동 가능 여부와 보유권을 다시 검사한다.

사용자 명령 진입점은 `commands/community`와 각 도메인 commands 폴더에 둔다.
