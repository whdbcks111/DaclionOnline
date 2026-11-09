# 테스트2 Models

`Test2World.ts`는 서버 권위 위치/속도/입력 소유자/체크포인트/완주/추락 횟수/5초 말풍선을 메모리에서 소유한다. 공개 API는 `join/leave/input/respawn/say/update/snapshot/hasPlayer/size`다. 다른 기능이 내부 players/connection Map을 조회하지 않는다. 같은 계정의 여러 연결은 한 캐릭터를 공유한다. 마지막 연결 종료 시 플레이어를 제거한다.

공유 `test2.ts`의 60Hz physics를 사용하고 300ms 입력 만료 후에도 중력은 계속 적용한다. jump counter의 증가만 새 점프 버퍼를 생성하므로 heartbeat/키 유지로 자동 점프하지 않는다. 착지 시 체크포인트는 증가만 하며, 추락이나 `respawn`은 마지막 체크포인트로 복귀한다. snapshot은 말풍선까지 복사한다. 모든 진행은 비영속이고 재접속/재시작 후 처음부터 시작한다. 테스트는 전체 코스 도달 가능성, 코요테/버퍼 경계, 입력 소유권, 체크포인트와 추락 복귀를 검증한다.
