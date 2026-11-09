# SEED WALK World Models

`SeedWalkWorld.ts`는 한 시드의 비영속 맵과 플레이어 위치·연결·입력 소유자·tick을 소유한다. 공개 API는 `join/leave/input/update/snapshot/hasPlayer/size`다. 내부 Map을 외부에 노출하지 않으며 snapshot은 복사한 DTO다. 같은 계정의 탭은 한 캐릭터를 공유하고 마지막 입력 연결이 조작한다. 조작 연결이 끝나거나 입력이 300ms 이상 없으면 정지한다.

맵과 충돌·속도 원본은 `shared/seedWalk.ts`다. 맵별 최대 32명, 대각선 속도 정규화를 적용하며 지형/가장자리 충돌은 없다. 플레이어끼리는 이동을 막지 않는다. 새 접속은 초원 중앙에서 시작한다. 전투·인벤토리·게임 진행 저장은 없다.

map v2는 연못·길·바위·경계벽 없는 초원이다. `seedWalkChat(text)`와 `SeedWalkWorld.say(userId, connectionId, text, now)`는 120자/계정당 3초 3회 제한의 최신 말풍선 하나를 처리하며 5초 후 기존 루프에서 만료한다. snapshot의 선택적 `player.bubble.text`만 전달하고 영속 저장·채팅 로그는 없다. 클라이언트는 Enter/모바일 채팅 버튼으로 62% 위치의 폼을 열고 입력 중 정지, IME 안전 전송·Esc 취소와 카메라 투영 DOM 말풍선을 제공한다.
