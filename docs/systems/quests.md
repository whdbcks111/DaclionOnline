# 퀘스트 시스템

직업 전직소는 메인/서브 슬롯별 전사·궁수·암살자·마법사·대장장이 시험 10개를 같은 QuestData API로 정의한다. 전투 직업 목표는 실제 predicate와 일치하는 `무생물 속성`, `자연 속성`, `생명체 속성`, `불·얼음·독·자연 속성 적 처치`로 표시하며, 대장장이는 `resource:destroyed`를 추적해 메인 5개·서브 10개 광맥 파괴를 요구한다. 수락/보상 조건은 `CareerProfile.canAssign`을 사용하므로 Lv.20/50 제한, 기존 슬롯 보유와 메인·서브 동일 직업 금지를 보고 시점에도 다시 검증한다. 직업 보상은 `QuestReward.custom`에서 `CareerProfile.assign`만 호출한다.

`QuestReward.item`의 표시명은 퀘스트 정의 시점에 아이템 registry가 아직 준비되지 않았더라도 snapshot을 보여줄 때 `getItemData`로 다시 해석한다. 따라서 전직 보상에는 `apprentice_staff` 같은 내부 ID 대신 `견습 마법 지팡이`가 표시된다.

## 구성

```text
data/quests.ts
  └─ defineQuest(QuestData)
       ├─ QuestStage[]
       │    └─ QuestObjective[]
       ├─ QuestReward[]
       └─ 제공/보고 NPC ID

Player ── QuestBook ── Quest[] (메모리 + dirty)
                       ├─ QuestStatus
                       ├─ 현재 단계/목표 진행도
                       └─ metadata delta/영속 태그

GameEvent + Inventory/Progress 변경
  └─ QuestBook 진행 갱신
       └─ READY ── NPC 보고 ── 보상/COMPLETED
```

퀘스트 정의는 코드 마스터 데이터이며 플레이어별 상태만 `player_quests`에 저장한다. `QuestStatus`와 NPC용 `QuestMarker`는 key·표시명·색상을 가진 클래스형 enum이다. 상태는 진행 중, 보고 가능, 완료, 실패, 포기를 지원하며 수락 가능 여부는 저장하지 않고 정의의 조건과 현재 인스턴스에서 계산한다.

## 정의와 목표

`defineQuest()`는 `namespace:path` ID, 이름/별칭/설명/태그, 제공 NPC, 보고 NPC, 단계, 보상, 선행 퀘스트, 표시·수락 조건, 반복 정책과 callback을 등록한다. 단계와 목표 ID는 저장된 진행 key이므로 배포 뒤 이름을 함부로 바꾸지 않는다.

`QuestObjective`의 기본 factory는 다음과 같다.

| API | 판정 |
| --- | --- |
| `event` | 지정 `GameEvent`를 predicate와 amount 함수로 누적 |
| `kill` | `combat:entity_defeated`의 subject 조건 |
| `destroy` | `resource:destroyed`의 subject 조건 |
| `talk` | 지정 NPC의 `npc:dialogue_started` |
| `craft` | 지정 제작법의 `crafting:item_crafted`와 제작 수량 |
| `possess/item` | Inventory predicate의 현재 보유 수량, 선택적으로 보고 시 제출 |
| `visit` | 현재 `Player.locationId` |
| `custom` | Player 공개 API로 계산한 현재값 |

처치·파괴 조건은 개별 데이터 ID에 과도하게 결합하지 않고 `Entity.hasTag()` predicate를 우선한다. 아이템 목표는 raw `items` 배열 대신 `Inventory.countMatching/selectItems/replaceSelectedItems`를 쓴다. Inventory와 PlayerProgress 변경 구독, 레벨·장소 변경 setter가 현재 상태형 목표를 다시 검사한다.

최종 단계 목표가 끝나면 기본적으로 `READY`가 되고 지정 NPC에게 보고해야 한다. `completionMode: automatic` 정의만 즉시 보상을 지급한다. 여러 단계는 현재 단계 완료 시 순서대로 진행한다.

## 보상과 저장

`QuestReward`는 경험치, 골드, 아이템, 스킬, Progress flag와 custom 보상을 제공한다. 제출 아이템과 아이템 보상은 `Inventory.replaceSelectedItems` 한 번으로 선검증·교환하므로 중량 부족이나 제출물 변경 시 퀘스트를 완료하지 않는다. 완료 뒤 경험치·골드 등 나머지 공개 API를 적용하고 완료 상태를 잠근다.

`QuestBook`은 로그인 시 모든 인스턴스를 로드하고 변경마다 quest ID별 versioned dirty를 표시한다. 30초 주기·unload·종료의 `Player.save()`에 포함되며 보상 수령은 중요 작업이므로 완료 직후 같은 aggregate 저장을 추가 요청한다. 저장 중 새 변경은 dirty version 비교로 다음 flush에 남는다.

`player_quests`의 복합키는 `(player_id, quest_data_id)`다. status, 현재 stage ID, 목표 진행 JSON, metadata delta, 영속 태그, 완료 횟수와 수락/보고 가능/완료/반복 가능 시각을 저장한다. `PlayerProgress`는 선행 조건과 NPC 세계 플래그에 계속 사용하며 퀘스트 인스턴스를 대신하지 않는다.

## NPC와 명령

대화 generator는 `Dialogue.acceptQuest(id)`와 `Dialogue.turnInQuest(id)`를 yield한다. 두 액션은 현재 NPC ID를 QuestBook에 전달해 제공/보고 NPC인지 재검증한다. `/위치` NPC 이름 앞에는 수락 가능 `!`, 보고 가능 `?`, 진행 중 `·` marker가 표시된다.

- `/퀘스트목록` (`questlist`, `ql`): 수락·완료한 퀘스트와 첫 목표 진행 표시.
- `/퀘스트정보 이름` (`questinfo`, `qi`): 상태, 설명, 현재 단계 목표, 보상과 포기 버튼 표시.
- `/퀘스트포기 이름` (`questabandon`, `qa`): 포기 가능한 ACTIVE 퀘스트를 포기한다.

첫 데이터 `luminair:first_slime_hunt`는 안내인 리아가 제안한다. `entity:slime` 태그 대상 3마리를 처치하고 리아에게 보고하면 경험치 80, 골드 100, 체력 포션 2개를 받는다.

황혼왕릉의 `꺼지지 않는 장송행렬`은 Lv.28부터 `property:undead` 대상 8기를 추적한다. 완료 뒤 Lv.45부터 선행 퀘스트가 필요한 `왕좌를 훔친 맹세`가 열리며, 개별 구현 ID 대신 `entity:boss + property:undead + property:metal` 조합으로 타락한 기사왕을 판정한다. 두 퀘스트는 마지막 묘지기 이벤에게 수락·보고하고 향약·골드·경험치와 지역 방패를 보상한다.

유리모래 사막의 `갑각으로 찾는 길`은 태양갑각 6개를 실제 제출하며, 완료 뒤 `태양고의 침묵`이 열린다. 두 번째 퀘스트는 `entity:boss + property:light + property:stone` 조합으로 태양고 거신 제압을 추적한다. 둘 모두 대상단 기록관 마온에게 수락·보고하며 경험치·골드·생존품과 태양거울 방패를 보상한다.

서리잔향 설원의 `눈보라를 버티는 실`은 빙실 거미줄 7개를 실제 제출하며, 완료 뒤 `얼어붙은 왕좌를 깨는 빛`이 열린다. 두 번째 퀘스트는 `entity:boss + property:ice + property:light` 조합으로 빙경 여왕을 추적한다. 둘 모두 설원 파수대장 베른에게 수락·보고하며 경험치·골드·설원 생존품과 극광분광 지팡이를 보상한다.

## 추가 체크리스트

1. `data/quests.ts`에 stable ID와 단계/목표/보상을 정의한다.
2. 목표에 필요한 동작이 아직 이벤트가 아니면 실제 상태가 확정되는 소유 모델에서 표준 `GameEventIds`를 추가한다.
3. NPC 대화 진입점에서 `canAccept/isActive/canTurnIn`으로 분기하고 수락·보고 액션을 넣는다.
4. 보유/제출 아이템은 Inventory 목적형 API만 사용한다.
5. 재접속 진행 복원, 중복 보상 차단, 포기/재수락, 인벤토리 부족과 정의 ID 호환을 테스트한다.
6. data/models/commands Overview, 이 문서와 DB/API 문서를 함께 갱신한다.
