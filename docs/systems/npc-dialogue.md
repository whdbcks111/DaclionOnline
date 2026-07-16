# NPC·대화 시스템

루미나르 전직소의 전직관 세레나는 현재 수락 가능 직업 시험만 선택지로 표시하고, 진행 중/보고 가능 전직 퀘스트를 우선 진입점으로 안내한다. 실제 직업 변경은 대화 raw flag가 아니라 퀘스트 보상과 `CareerProfile` 공개 API가 소유한다.

## 구성

```text
data/npcs.ts
  └─ NPC.define(id, entryScenario, DialogueScenario[])
       └─ LocationData.npcIds[] ──> Location.getNpcs/getNpc/hasNpc
                                      └─ /위치 [NPC] / /대화 번호

player별 ActiveNpcDialogue (메모리)
  └─ scenario generator
       ├─ say / event / setFlag / acceptQuest / turnInQuest / goto / end
       └─ choice ── 일시 정지 ──> /대화선택 sessionId 번호 ──> 다음 scenario
```

NPC 정의는 `models/NPC.ts`의 정적 레지스트리가 소유한다. 장소 JSON은 정의 전체를 복사하지 않고 `npcIds`만 저장하며, `Location` 공개 API가 ID를 NPC 객체로 해석한다. 현재 예시는 루미나르 개척촌 광장의 `town_guide`(안내인 리아)다.

활성 대화는 `models/NpcDialogue.ts`의 player별 메모리 세션이다. 재접속이나 서버 재시작 시 이어지지 않는다. 대화에서 설정한 flag/state는 `PlayerProgress` 공개 API를 통해 기존 `player_progress` 테이블에 dirty 저장되므로 별도 NPC DB 테이블은 없다.

## 대화 정의

각 NPC는 플레이어 상태를 받아 첫 장면 key를 반환하는 `entryScenario(context)` 함수와 장면 목록을 가진다. 장면은 정적 액션 배열 대신 `Generator<DialogueAction>` 스크립트이므로 일반 TypeScript `if`, 반복문, 지역 변수를 그대로 쓸 수 있다.

```ts
NPC.define({
    id: 'town_guide',
    name: '안내인 리아',
    entryScenario: ({ player }) => player.progress.getFlag('npc:met-guide')
        ? 'returning'
        : 'first',
    scenarios: [
        new DialogueScenario('first', function* ({ player }) {
            if (player.level >= 5) yield Dialogue.say('이제 숲으로 가도 되겠네.');
            else yield Dialogue.say('먼저 초원에서 경험을 쌓아.');
            yield Dialogue.choice([
                { label: '알겠어요.', target: 'finish' },
            ]);
        }),
        new DialogueScenario('finish', function* () {
            yield Dialogue.setFlag('npc:met-guide');
            yield Dialogue.end();
        }),
    ],
});
```

지원 액션은 다음과 같다.

| API | 역할 |
| --- | --- |
| `Dialogue.say(content)` | NPC 이름 머리말과 문자열/ChatNode 대사 출력 |
| `Dialogue.event(callback)` | `DialogueContext`를 받는 동기식 게임 로직 실행 |
| `Dialogue.setFlag(id, value?)` | 등록된 PlayerProgress flag 설정 |
| `Dialogue.goto(scenarioKey)` | 같은 NPC의 다른 장면으로 즉시 이동 |
| `Dialogue.choice(choices)` | 버튼 선택지를 출력하고 세션을 정지 |
| `Dialogue.acceptQuest(id)` | 현재 NPC를 제공자로 검증해 퀘스트 수락 |
| `Dialogue.turnInQuest(id)` | 현재 NPC를 보고 대상으로 검증해 보상 수령·완료 |
| `Dialogue.end()` | 정상 종료 |

이벤트 callback은 DB row나 다른 기능의 raw 상태를 직접 수정하지 않고 Inventory, PlayerProgress, 퀘스트 등 소유 기능의 공개 API만 호출한다. 장시간 대기나 비동기 DB I/O를 generator 안에서 수행하지 않는다.

## 명령과 수명주기

- `/위치`의 `[ NPC ]` 목록은 장소별 번호, 설명, `/대화 번호` 버튼을 표시한다.
- NPC 이름 앞에는 QuestBook 공개 API로 계산한 수락 가능 `!`, 보고 가능 `?`, 진행 중 `·` marker가 표시된다.
- `/대화 번호`는 NPC의 진입점에서 새 세션을 시작한다.
- 선택지 버튼은 내부 `/대화선택 <sessionId> <번호>`를 사용한다. sessionId가 달라진 오래된 버튼은 거부된다.
- `/대화종료`는 플레이어가 직접 현재 대화를 끝낸다.
- 이동 시작 또는 직접 위치 변경, 사망, 명시적 로그아웃/unload, 마지막 소켓 연결 종료 시 같은 종료 API가 세션을 제거한다. 게임 루프의 `updateNpcDialogues()`도 상태 불일치를 매 frame 정리한다.

시작·선택·종료는 각각 `npc:dialogue_started`, `npc:dialogue_choice`, `npc:dialogue_ended` GameEvent를 발행한다. 종료 이벤트 data에는 NPC ID와 `completed/user/moved/defeated/unloaded/replaced/error` 사유가 포함된다.

## 새 NPC 추가 체크리스트

1. `data/npcs.ts`에 `NPC.define()`과 필요한 `DialogueScenario`를 추가한다.
2. 영속 조건/결과가 있으면 먼저 `defineProgress()`로 flag/state를 등록하고 PlayerProgress API만 사용한다.
3. `data/locations.json`의 대상 장소 `npcIds`에 NPC ID를 넣는다. 관리자는 위치 편집기의 NPC 배치 영역에서도 ID를 수정할 수 있다.
4. 새 대화 분기, 이벤트, 종료 경로를 테스트하고 이 문서와 data/models/commands Overview를 갱신한다.
