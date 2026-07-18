import NPC, { Dialogue, DialogueScenario } from '../models/NPC.js';
import { defineProgress, ProgressType } from '../models/Progress.js';
import { FIRST_SLIME_HUNT_QUEST_ID } from './quests.js';
import { CAREER_QUEST_IDS } from './quests.js';
import { BLACKSMITH_APPRENTICESHIP_QUEST_ID } from './quests.js';
import { JobSlotType, getAllJobs, JobTier } from '../models/Job.js';
import { hasBlacksmithProfession } from '../modules/forging.js';

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
    entryScenario: ({ player }) => {
        if (player.quests.canTurnIn(FIRST_SLIME_HUNT_QUEST_ID, 'town_guide')) return 'quest_complete';
        if (player.quests.isActive(FIRST_SLIME_HUNT_QUEST_ID)) return 'quest_progress';
        return player.progress.getFlag(MONSTER_HUNT_QUESTION_FLAG) ? 'returning' : 'greeting';
    },
    scenarios: [
        new DialogueScenario('greeting', function* ({ player }) {
            yield Dialogue.say('안녕 모험가, 뭔가 필요해?');
            const choices = [
                { label: '아니, 괜찮아요.', target: 'goodbye' },
                { label: '네, 혹시 몬스터는 어디서 잡나요?', target: 'monster_help' },
            ];
            if (player.quests.canAccept(FIRST_SLIME_HUNT_QUEST_ID, 'town_guide')) {
                choices.push({ label: '제가 도울 일이 있나요?', target: 'quest_offer' });
            }
            yield Dialogue.choice(choices);
        }),
        new DialogueScenario('returning', function* ({ player }) {
            if (player.progress.getFlag(MONSTER_HUNT_QUESTION_FLAG)) {
                yield Dialogue.say('다시 만났네, 모험가. 바람결 초원으로 가는 길은 잘 찾았어?');
            }
            const choices = [
                { label: '네, 고마워요.', target: 'goodbye' },
                { label: '몬스터 사냥터를 다시 알려주세요.', target: 'monster_help' },
            ];
            if (player.quests.canAccept(FIRST_SLIME_HUNT_QUEST_ID, 'town_guide')) {
                choices.push({ label: '제가 도울 일이 있나요?', target: 'quest_offer' });
            }
            yield Dialogue.choice(choices);
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
        new DialogueScenario('quest_offer', function* () {
            yield Dialogue.say('바람결 초원의 슬라임들이 길을 막고 있어. 슬라임 셋을 정리하고 돌아와 줄래?');
            yield Dialogue.choice([
                { label: '제가 처리할게요.', target: 'quest_accept' },
                { label: '아직은 어려울 것 같아요.', target: 'goodbye' },
            ]);
        }),
        new DialogueScenario('quest_accept', function* () {
            yield Dialogue.acceptQuest(FIRST_SLIME_HUNT_QUEST_ID);
            yield Dialogue.say('고마워! 종류는 상관없으니 슬라임 셋을 처치하고 다시 이야기해 줘.');
            yield Dialogue.end();
        }),
        new DialogueScenario('quest_progress', function* ({ player }) {
            const objective = player.quests.getSnapshot(FIRST_SLIME_HUNT_QUEST_ID)?.objectives[0];
            yield Dialogue.say(`아직 슬라임이 길을 막고 있어. 현재 ${objective?.progress ?? 0}/${objective?.required ?? 3}마리를 처리했어.`);
            yield Dialogue.end();
        }),
        new DialogueScenario('quest_complete', function* () {
            yield Dialogue.say('초원의 길이 다시 조용해졌네. 약속한 보상이야. 정말 고마워!');
            yield Dialogue.turnInQuest(FIRST_SLIME_HUNT_QUEST_ID);
            yield Dialogue.end();
        }),
    ],
});

NPC.define({
    id: 'blacksmith_master',
    name: '마도 대장장이 로안',
    description: '용광로 대신 마력으로 불순물을 밀어내는 간결한 제련법을 가르치는 장인입니다.',
    tags: ['npc:profession', 'profession:blacksmith'],
    entryScenario: ({ player }) => {
        if (player.quests.canTurnIn(BLACKSMITH_APPRENTICESHIP_QUEST_ID, 'blacksmith_master')) return 'complete';
        if (player.quests.isActive(BLACKSMITH_APPRENTICESHIP_QUEST_ID)) return 'progress';
        if (hasBlacksmithProfession(player)) return 'trained';
        return 'greeting';
    },
    scenarios: [
        new DialogueScenario('greeting', function* ({ player }) {
            if (player.level < 20) {
                yield Dialogue.say('금속의 결을 읽으려면 아직 경험이 부족하군. 20레벨이 되면 다시 찾아오게.');
                yield Dialogue.end();
                return;
            }
            yield Dialogue.say('복잡한 용광로와 연료 장부는 잊게. 마력으로 불순물을 걷고, 망치질에는 자네의 박자만 담으면 되지.');
            yield Dialogue.choice([
                { label: '대장장이의 제련법을 배우겠습니다.', target: 'accept' },
                { label: '조금 더 생각해 보겠습니다.', target: 'end' },
            ]);
        }),
        new DialogueScenario('accept', function* () {
            yield Dialogue.acceptQuest(BLACKSMITH_APPRENTICESHIP_QUEST_ID);
            yield Dialogue.say('피버릭 광맥 여덟 개를 직접 깨 보고 오게. 광물이 갈라지는 방향부터 익혀야 하네.');
            yield Dialogue.end();
        }),
        new DialogueScenario('progress', function* ({ player }) {
            const objective = player.quests.getSnapshot(BLACKSMITH_APPRENTICESHIP_QUEST_ID)?.objectives[0];
            yield Dialogue.say(`광맥의 결을 더 살펴보게. 지금은 ${objective?.progress ?? 0}/${objective?.required ?? 8}개군.`);
            yield Dialogue.end();
        }),
        new DialogueScenario('complete', function* () {
            yield Dialogue.say('이제 불꽃 없이도 금속 속 불순물이 보이겠군. 마력 제련과 금속 단조를 전수하겠네.');
            yield Dialogue.turnInQuest(BLACKSMITH_APPRENTICESHIP_QUEST_ID);
            yield Dialogue.end();
        }),
        new DialogueScenario('trained', function* () {
            yield Dialogue.say('마력 제련으로 소재를 만들고, /단조 명령으로 형태와 재료를 골라 보게. 완성도는 망치 박자가 결정하네.');
            yield Dialogue.end();
        }),
        new DialogueScenario('end', function* () {
            yield Dialogue.say('금속은 도망가지 않으니 준비되면 오게.');
            yield Dialogue.end();
        }),
    ],
});

const careerJobs = getAllJobs().filter(job => job.tier === JobTier.FIRST);
const careerQuestEntries = JobSlotType.values().flatMap(slot => careerJobs.map(job => ({
    slot,
    job,
    questId: CAREER_QUEST_IDS[`${slot.key}:${job.id}`],
    key: `${slot.key}_${job.id.split(':')[1]}`,
})));

NPC.define({
    id: 'job_master',
    name: '전직관 세레나',
    description: '모험가의 자질을 살펴 전직 시험을 안내하는 루미나르 전직관입니다.',
    tags: ['npc:career'],
    entryScenario: ({ player }) => {
        const ready = careerQuestEntries.find(entry => player.quests.canTurnIn(entry.questId, 'job_master'));
        if (ready) return `complete_${ready.key}`;
        const active = careerQuestEntries.find(entry => player.quests.isActive(entry.questId));
        return active ? 'progress' : 'menu';
    },
    scenarios: [
        new DialogueScenario('menu', function* ({ player }) {
            yield Dialogue.say('어서 와요. 직업은 힘의 크기보다 앞으로 걸어갈 방식을 정하는 선택이에요.');
            const choices = careerQuestEntries
                .filter(entry => player.quests.canAccept(entry.questId, 'job_master'))
                .map(entry => ({
                    label: `${entry.slot.label}: ${entry.job.name} 시험을 선택한다`,
                    target: `offer_${entry.key}`,
                }));
            if (choices.length === 0) {
                const next = !player.career.mainJobId ? '메인 직업은 Lv.20부터 선택할 수 있어요.'
                    : !player.career.subJobId ? '서브 직업은 Lv.50부터 선택할 수 있으며 메인과 같은 직업은 고를 수 없어요.'
                    : '모든 1차 전직을 마쳤군요. Lv.200에는 두 직업의 조합에 맞춰 엘리트 직업으로 각성합니다.';
                yield Dialogue.say(next);
                yield Dialogue.end();
                return;
            }
            choices.push({ label: '조금 더 생각해 볼게요.', target: 'goodbye' });
            yield Dialogue.choice(choices);
        }),
        new DialogueScenario('progress', function* () {
            yield Dialogue.say('선택한 전직 시험이 아직 진행 중이에요. 퀘스트 목록에서 목표를 확인하고 돌아오세요.');
            yield Dialogue.end();
        }),
        new DialogueScenario('goodbye', function* () {
            yield Dialogue.say('서두르지 않아도 괜찮아요. 자신의 전투 방식을 충분히 생각해 보세요.');
            yield Dialogue.end();
        }),
        ...careerQuestEntries.flatMap(entry => [
            new DialogueScenario(`offer_${entry.key}`, function* () {
                yield Dialogue.say(`${entry.job.name}의 길을 선택했군요. 시험을 마치면 ${entry.slot.label}(으)로 인정하겠습니다.`);
                yield Dialogue.acceptQuest(entry.questId);
                yield Dialogue.end();
            }),
            new DialogueScenario(`complete_${entry.key}`, function* () {
                yield Dialogue.say(`시험을 통과했습니다. 지금부터 ${entry.job.name}의 힘을 다룰 자격이 있어요.`);
                yield Dialogue.turnInQuest(entry.questId);
                yield Dialogue.end();
            }),
        ]),
    ],
});
