# SEED WALK World Models

`SeedWalkWorld.ts`는 한 시드의 비영속 맵과 플레이어 위치·연결·입력 소유자·tick을 소유한다. 공개 API는 `join/leave/input/update/snapshot/hasPlayer/size`다. 내부 Map을 외부에 노출하지 않으며 snapshot은 복사한 DTO다. 같은 계정의 탭은 한 캐릭터를 공유하고 마지막 입력 연결이 조작한다. 조작 연결이 끝나거나 입력이 300ms 이상 없으면 정지한다.

맵과 충돌·속도 원본은 `shared/seedWalk.ts`다. 맵별 최대 32명, 대각선 속도 정규화와 벽 미끄러짐·작은 이동 substep을 적용한다. 플레이어끼리는 이동을 막지 않는다. 새 접속은 중앙의 안전 산책로에서 시작한다. 전투·인벤토리·게임 진행 저장은 없다.
