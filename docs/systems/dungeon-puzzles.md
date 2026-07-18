# 던전 퍼즐 시스템

던전 퍼즐은 `Resource` 상호작용·파괴, `PlayerProgress` 플래그, `Location` 연결 조건을 조합한다. 전용 던전 엔진이 월드 상태를 복제하지 않고 기존 소유 API를 연결하는 구조다.

## 질문형 장치

`models/DungeonPuzzle.ts`의 `defineQuestionPuzzle()`로 질문, 허용 정답, 선택지, 성공 플래그를 등록한다. 상호작용 handler는 `beginQuestionPuzzle()`을 호출하고 플레이어는 `/퍼즐답 <정답>`으로 응답한다.

- 세션은 userId별 메모리에 최대 120초 유지되며 장소를 벗어나거나 시간이 지나면 무효가 된다.
- 정답은 NFKC 정규화 후 공백·문장부호·대소문자 차이를 무시한다.
- 성공은 `PlayerProgress.setFlag()`로 영속되고 `Location` condition이 같은 flag를 읽어 플레이어별 문을 연다.
- logout/unload에서는 `clearDungeonPuzzleSession()`으로 세션을 정리한다.

## 순간이동 유물

`defineTeleportArtifact()`는 `현재 locationId → 목적 locationId` 표를 등록한다. `activateTeleportArtifact()`는 목적지가 실제 registry에 있을 때만 Player의 공개 장소 setter로 이동시킨다. 일반 이동과 지도에는 유물 전용 연결을 `hidden` condition으로 감추고, 데이터 연결성만 유지한다.

## 파괴문과 보스 오브젝트

파괴문과 공명 수정은 공격 가능한 `Resource`다. 외부 조건은 raw `objects[]`를 순회하지 않고 `Location.isResourceDefeated(resourceDataId)`로 파괴 여부를 확인한다.

- `녹슨 봉인문`: 파괴된 동안만 다음 길의 condition이 `visible`이 되며 10분 뒤 재생성된다.
- `지핵 공명 수정`: 보스의 보호·패턴을 해제하는 공용 파괴 목표다. 현재 철근미궁 수정실에 3개가 배치되어 후속 보스 패턴이 참조한다.

## 현재 철근미궁 흐름

```text
매몰 미로 --질문 해답--> 뿌리 회랑 --분기/순환--> 메아리 금고
                                                     │ 유물 전이
                                                     v
                                              봉인문 회랑 --문 파괴--> 뒤집힌 지핵
                                                                            │
                                                                            └─ 지핵 수정실
```

신규 퍼즐은 `data/dungeonPuzzles.ts`에 정의와 condition/interaction 연결을 모으고, 대응하는 `ResourceData`와 `locations.json` 배치를 같은 변경에 추가한다.
