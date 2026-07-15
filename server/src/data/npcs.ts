import NPC, { Dialogue, DialogueScenario } from '../models/NPC.js';
import { defineProgress, ProgressType } from '../models/Progress.js';

export const MONSTER_HUNT_QUESTION_FLAG = 'npc:monster-hunt-question';

defineProgress({
    id: MONSTER_HUNT_QUESTION_FLAG,
    type: ProgressType.FLAG,
    label: '몬스터 사냥 질문 완료',
    description: '마을 안내인에게 몬스터 사냥터를 물어보았습니다.',
    visible: false,
    tags: ['npc:dialogue'],
});

NPC.define({
    id: 'town_guide',
    name: '안내인 리아',
    description: '루미나르 개척촌을 찾은 모험가에게 길을 알려주는 안내인입니다.',
    tags: ['npc:guide'],
    entryScenario: ({ player }) => player.progress.getFlag(MONSTER_HUNT_QUESTION_FLAG)
        ? 'returning'
        : 'greeting',
    scenarios: [
        new DialogueScenario('greeting', function* () {
            yield Dialogue.say('안녕 모험가, 뭔가 필요해?');
            yield Dialogue.choice([
                { label: '아니, 괜찮아요.', target: 'goodbye' },
                { label: '네, 혹시 몬스터는 어디서 잡나요?', target: 'monster_help' },
            ]);
        }),
        new DialogueScenario('returning', function* ({ player }) {
            if (player.progress.getFlag(MONSTER_HUNT_QUESTION_FLAG)) {
                yield Dialogue.say('다시 만났네, 모험가. 바람결 초원으로 가는 길은 잘 찾았어?');
            }
            yield Dialogue.choice([
                { label: '네, 고마워요.', target: 'goodbye' },
                { label: '몬스터 사냥터를 다시 알려주세요.', target: 'monster_help' },
            ]);
        }),
        new DialogueScenario('goodbye', function* () {
            yield Dialogue.say('그래? 그럼 좋은 하루 돼~');
            yield Dialogue.end();
        }),
        new DialogueScenario('monster_help', function* () {
            yield Dialogue.say('광장 동쪽의 바람결 초원부터 시작해 봐. 초원 너머에는 안개수렁과 홍염산지가 이어지고, 남쪽 피버릭 갱도에서는 광물도 캘 수 있어. 도움이 필요하면 언제든 말해~');
            yield Dialogue.setFlag(MONSTER_HUNT_QUESTION_FLAG);
            yield Dialogue.end();
        }),
    ],
});
