import NPC, { Dialogue, DialogueScenario } from '../models/NPC.js';
import { defineProgress, ProgressType } from '../models/Progress.js';
import {
    FIRST_SLIME_HUNT_QUEST_ID,
    FROSTVEIL_QUEST_IDS,
    GLASSDUNE_QUEST_IDS,
    TWILIGHT_TOMB_QUEST_IDS,
} from './quests.js';
import { CAREER_QUEST_IDS } from './quests.js';
import { BLACKSMITH_APPRENTICESHIP_QUEST_ID } from './quests.js';
import { JobSlotType, getAllJobs, JobTier } from '../models/Job.js';
import { canAcquireBlacksmithProfession, hasBlacksmithProfession } from '../modules/forging.js';

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
    id: 'twilight_keeper',
    name: '마지막 묘지기 이벤',
    description: '황혼왕릉 밖에서 꺼지지 않는 등불을 지키며 망자들의 이름을 기록하는 묘지기입니다.',
    tags: ['npc:guide', 'npc:quest', 'region:twilight-tombs'],
    entryScenario: ({ player }) => {
        if (player.quests.canTurnIn(TWILIGHT_TOMB_QUEST_IDS.BROKEN_OATH, 'twilight_keeper')) return 'boss_complete';
        if (player.quests.isActive(TWILIGHT_TOMB_QUEST_IDS.BROKEN_OATH)) return 'boss_progress';
        if (player.quests.canTurnIn(TWILIGHT_TOMB_QUEST_IDS.RESTLESS_DEAD, 'twilight_keeper')) return 'hunt_complete';
        if (player.quests.isActive(TWILIGHT_TOMB_QUEST_IDS.RESTLESS_DEAD)) return 'hunt_progress';
        if (player.quests.canAccept(TWILIGHT_TOMB_QUEST_IDS.BROKEN_OATH, 'twilight_keeper')) return 'boss_offer';
        return player.quests.canAccept(TWILIGHT_TOMB_QUEST_IDS.RESTLESS_DEAD, 'twilight_keeper') ? 'greeting' : 'lore';
    },
    scenarios: [
        new DialogueScenario('greeting', function* () {
            yield Dialogue.say('등불 너머는 황혼왕릉이오. 백골왕과 기사왕이 서로 다른 왕좌에서 같은 망자들을 부르고 있지. 먼저 바깥의 장송행렬부터 잠재워 주겠소?');
            yield Dialogue.choice([
                { label: '망자들을 잠재우겠습니다.', target: 'hunt_accept' },
                { label: '두 왕에 대해 알려주세요.', target: 'lore' },
                { label: '지금은 지나가겠습니다.', target: 'end' },
            ]);
        }),
        new DialogueScenario('hunt_accept', function* () {
            yield Dialogue.acceptQuest(TWILIGHT_TOMB_QUEST_IDS.RESTLESS_DEAD);
            yield Dialogue.say('왕릉의 언데드 여덟을 쓰러뜨리고 돌아오시오. 묘지기 향약을 준비해 두겠소.');
            yield Dialogue.end();
        }),
        new DialogueScenario('hunt_progress', function* ({ player }) {
            const objective = player.quests.getSnapshot(TWILIGHT_TOMB_QUEST_IDS.RESTLESS_DEAD)?.objectives[0];
            yield Dialogue.say(`장송의 발소리가 아직 들리는군. 지금까지 ${objective?.progress ?? 0}/${objective?.required ?? 8}기를 잠재웠소.`);
            yield Dialogue.end();
        }),
        new DialogueScenario('hunt_complete', function* () {
            yield Dialogue.say('등불의 흔들림이 한결 잦아들었소. 약속한 향약이오. 하지만 더 깊은 곳의 파계 기사왕이 다시 망자들을 일으킬 거요.');
            yield Dialogue.turnInQuest(TWILIGHT_TOMB_QUEST_IDS.RESTLESS_DEAD);
            yield Dialogue.end();
        }),
        new DialogueScenario('boss_offer', function* () {
            yield Dialogue.say('기사왕은 죽은 왕을 지키겠다 맹세하고는 그 왕을 베어 왕좌를 훔쳤소. 파계의 왕좌에서 그 맹세를 끝내 주겠소?');
            yield Dialogue.choice([
                { label: '기사왕을 쓰러뜨리겠습니다.', target: 'boss_accept' },
                { label: '조금 더 준비하겠습니다.', target: 'end' },
            ]);
        }),
        new DialogueScenario('boss_accept', function* () {
            yield Dialogue.acceptQuest(TWILIGHT_TOMB_QUEST_IDS.BROKEN_OATH);
            yield Dialogue.say('금 간 묘문에서 기사묘 쪽 길을 택하시오. 속삭임 지하묘를 지나면 파계의 왕좌가 나올 거요.');
            yield Dialogue.end();
        }),
        new DialogueScenario('boss_progress', function* () {
            yield Dialogue.say('기사왕은 도발보다 아군을 살리는 자를 더 먼저 노리오. 치유와 제어를 쓰는 동료를 지킬 준비를 하시오.');
            yield Dialogue.end();
        }),
        new DialogueScenario('boss_complete', function* () {
            yield Dialogue.say('파계의 맹세가 마침내 끝났군. 왕릉의 봉인문으로 만든 이 방패를 받아 주시오.');
            yield Dialogue.turnInQuest(TWILIGHT_TOMB_QUEST_IDS.BROKEN_OATH);
            yield Dialogue.end();
        }),
        new DialogueScenario('lore', function* () {
            yield Dialogue.say('백골왕은 왕관의 명령만 남아 치유사와 수호자를 먼저 노리고, 기사왕은 도발에도 쉽게 흔들리지 않소. 백골 왕좌의 석문에 답하면 숨은 납골당도 열릴 거요.');
            yield Dialogue.end();
        }),
        new DialogueScenario('end', function* () {
            yield Dialogue.say('등불이 보이는 동안은 돌아올 길을 잃지 않을 거요.');
            yield Dialogue.end();
        }),
    ],
});

NPC.define({
    id: 'glassdune_chronicler',
    name: '대상단 기록관 마온',
    description: '유리모래 사막의 바람길과 신기루를 지도에 기록하는 대상단 기록관입니다.',
    tags: ['npc:guide', 'npc:quest', 'region:glassdune'],
    entryScenario: ({ player }) => {
        if (player.quests.canTurnIn(GLASSDUNE_QUEST_IDS.SILENCE_SUN_VAULT, 'glassdune_chronicler')) return 'boss_complete';
        if (player.quests.isActive(GLASSDUNE_QUEST_IDS.SILENCE_SUN_VAULT)) return 'boss_progress';
        if (player.quests.canTurnIn(GLASSDUNE_QUEST_IDS.CARAPACE_ROUTE, 'glassdune_chronicler')) return 'carapace_complete';
        if (player.quests.isActive(GLASSDUNE_QUEST_IDS.CARAPACE_ROUTE)) return 'carapace_progress';
        if (player.quests.canAccept(GLASSDUNE_QUEST_IDS.SILENCE_SUN_VAULT, 'glassdune_chronicler')) return 'boss_offer';
        return player.quests.canAccept(GLASSDUNE_QUEST_IDS.CARAPACE_ROUTE, 'glassdune_chronicler') ? 'greeting' : 'lore';
    },
    scenarios: [
        new DialogueScenario('greeting', function* () {
            yield Dialogue.say('이 사막은 모래가 아니라 잘게 쪼개진 유리로 움직이오. 황금갑 태양충의 등껑질이 있으면 바람길을 안전하게 표시할 수 있는데, 여섯 개를 구해 주겠소?');
            yield Dialogue.choice([
                { label: '성충갑을 모아 오겠습니다.', target: 'carapace_accept' },
                { label: '사막의 길을 알려주세요.', target: 'lore' },
                { label: '지금은 쉬겠습니다.', target: 'end' },
            ]);
        }),
        new DialogueScenario('carapace_accept', function* () {
            yield Dialogue.acceptQuest(GLASSDUNE_QUEST_IDS.CARAPACE_ROUTE);
            yield Dialogue.say('황금갑 태양충은 사해와 열기 능선에 많소. 성충갑 여섯 개를 가져오면 식량과 물을 나누지.');
            yield Dialogue.end();
        }),
        new DialogueScenario('carapace_progress', function* ({ player }) {
            const objective = player.quests.getSnapshot(GLASSDUNE_QUEST_IDS.CARAPACE_ROUTE)?.objectives[0];
            yield Dialogue.say(`반사 표식을 만들려면 ${objective?.required ?? 6}개가 필요하오. 지금은 ${objective?.progress ?? 0}개군.`);
            yield Dialogue.end();
        }),
        new DialogueScenario('carapace_complete', function* () {
            yield Dialogue.say('이정도면 바람에도 반사광이 잘 보이겠군. 이제 당신도 태양고로 향하는 길을 잊지 않을 거요.');
            yield Dialogue.turnInQuest(GLASSDUNE_QUEST_IDS.CARAPACE_ROUTE);
            yield Dialogue.end();
        }),
        new DialogueScenario('boss_offer', function* () {
            yield Dialogue.say('태양고의 유리거상이 다시 움직이기 시작했소. 거울 기둥이 하나라도 남아 있으면 빛이 상처를 되돌리니, 기둥부터 깨야 하오.');
            yield Dialogue.choice([
                { label: '태양고의 거상을 멈추겠습니다.', target: 'boss_accept' },
                { label: '더 준비하겠습니다.', target: 'end' },
            ]);
        }),
        new DialogueScenario('boss_accept', function* () {
            yield Dialogue.acceptQuest(GLASSDUNE_QUEST_IDS.SILENCE_SUN_VAULT);
            yield Dialogue.say('유리골을 지나면 태양고요. 석화의 태양안은 회피할 수 없으니 아이템으로 회복할 준비도 하시오.');
            yield Dialogue.end();
        }),
        new DialogueScenario('boss_progress', function* () {
            yield Dialogue.say('거울 기둥 세 개를 먼저 깨시오. 기둥이 사라지면 유리거상에게 온전한 피해를 줄 수 있소.');
            yield Dialogue.end();
        }),
        new DialogueScenario('boss_complete', function* () {
            yield Dialogue.say('태양고의 빛이 조용해졌군. 거상의 거울 파편으로 만든 이 방패를 받으시오.');
            yield Dialogue.turnInQuest(GLASSDUNE_QUEST_IDS.SILENCE_SUN_VAULT);
            yield Dialogue.end();
        }),
        new DialogueScenario('lore', function* () {
            yield Dialogue.say('바람문을 넘어 사해에서 두 길로 나뉘오. 신기루길은 전갈여왕에게, 잠긴 열주로는 해시계에게 이어지지. 해시계의 답을 찾으면 숨은 오아시스도 드러난다오.');
            yield Dialogue.end();
        }),
        new DialogueScenario('end', function* () {
            yield Dialogue.say('그늘이 짧아지면 길도 짧게 잡으시오.');
            yield Dialogue.end();
        }),
    ],
});

NPC.define({
    id: 'frostveil_warden',
    name: '설원 파수대장 베른',
    description: '빙경궁으로 이어지는 길과 설원 보급로를 지키는 파수대장입니다.',
    tags: ['npc:guide', 'npc:quest', 'region:frostveil'],
    entryScenario: ({ player }) => {
        if (player.quests.canTurnIn(FROSTVEIL_QUEST_IDS.BREAK_FROZEN_THRONE, 'frostveil_warden')) return 'boss_complete';
        if (player.quests.isActive(FROSTVEIL_QUEST_IDS.BREAK_FROZEN_THRONE)) return 'boss_progress';
        if (player.quests.canTurnIn(FROSTVEIL_QUEST_IDS.WINTER_SUPPLY, 'frostveil_warden')) return 'supply_complete';
        if (player.quests.isActive(FROSTVEIL_QUEST_IDS.WINTER_SUPPLY)) return 'supply_progress';
        if (player.quests.canAccept(FROSTVEIL_QUEST_IDS.BREAK_FROZEN_THRONE, 'frostveil_warden')) return 'boss_offer';
        return player.quests.canAccept(FROSTVEIL_QUEST_IDS.WINTER_SUPPLY, 'frostveil_warden') ? 'greeting' : 'lore';
    },
    scenarios: [
        new DialogueScenario('greeting', function* () {
            yield Dialogue.say('상고바람이 보급 천막까지 찢고 있소. 빙실 거미줄이라면 가볍고 얼어도 끊어지지 않지. 일곱 타래를 구해 줄 수 있겠소?');
            yield Dialogue.choice([
                { label: '빙실 거미줄을 모아 오겠습니다.', target: 'supply_accept' },
                { label: '빙경궁으로 가는 길을 알려주세요.', target: 'lore' },
                { label: '지금은 쉬겠습니다.', target: 'end' },
            ]);
        }),
        new DialogueScenario('supply_accept', function* () {
            yield Dialogue.acceptQuest(FROSTVEIL_QUEST_IDS.WINTER_SUPPLY);
            yield Dialogue.say('상고송 숲과 얼어붙은 호수에 빙실 발톱거미가 많소. 일곱 타래면 파수대의 천막을 모두 고칠 수 있지.');
            yield Dialogue.end();
        }),
        new DialogueScenario('supply_progress', function* ({ player }) {
            const objective = player.quests.getSnapshot(FROSTVEIL_QUEST_IDS.WINTER_SUPPLY)?.objectives[0];
            yield Dialogue.say(`필요한 빙실은 ${objective?.required ?? 7}타래요. 지금은 ${objective?.progress ?? 0}타래를 모았군.`);
            yield Dialogue.end();
        }),
        new DialogueScenario('supply_complete', function* () {
            yield Dialogue.say('이 정도면 다음 눈보라도 버틸 수 있겠소. 보급품을 챙기고 빙하 협곡부터 천천히 살피시오.');
            yield Dialogue.turnInQuest(FROSTVEIL_QUEST_IDS.WINTER_SUPPLY);
            yield Dialogue.end();
        }),
        new DialogueScenario('boss_offer', function* () {
            yield Dialogue.say('빙경 여왕 에르시나가 왕좌에서 깨어났소. 그녀의 극광은 주문을 끊고, 빙경 관통창은 회피조차 허락하지 않소. 왕좌의 냉기를 멈춰 주겠소?');
            yield Dialogue.choice([
                { label: '얼어붙은 왕좌를 깨겠습니다.', target: 'boss_accept' },
                { label: '더 준비하겠습니다.', target: 'end' },
            ]);
        }),
        new DialogueScenario('boss_accept', function* () {
            yield Dialogue.acceptQuest(FROSTVEIL_QUEST_IDS.BREAK_FROZEN_THRONE);
            yield Dialogue.say('궁의 거울회랑에서 두 길이 갈리오. 백광 분광대의 수수께끼를 풀면 숨은 빙하동의 왕실 유물도 찾을 수 있소.');
            yield Dialogue.end();
        }),
        new DialogueScenario('boss_progress', function* () {
            yield Dialogue.say('침묵이 오기 전 회복과 보호막을 준비하고, 관통창의 예고가 보이면 피해를 견딜 수단을 먼저 쓰시오.');
            yield Dialogue.end();
        }),
        new DialogueScenario('boss_complete', function* () {
            yield Dialogue.say('왕좌의 빛이 맑아졌군. 에르시나가 남긴 분광 지팡이를 가져가시오. 냉기를 지배할 힘은 쓰는 자에게 달렸으니.');
            yield Dialogue.turnInQuest(FROSTVEIL_QUEST_IDS.BREAK_FROZEN_THRONE);
            yield Dialogue.end();
        }),
        new DialogueScenario('lore', function* () {
            yield Dialogue.say('백광성역에서 서리잔향 고개를 넘으면 파수초소요. 상고송 숲과 얼어붙은 호수를 지나 빙하 협곡으로 가면 빙경궁이 나오지. 극광다리는 사령묘 관문으로 이어지오.');
            yield Dialogue.end();
        }),
        new DialogueScenario('end', function* () {
            yield Dialogue.say('눈보라 속에서는 발자국보다 바람이 끊기는 곳을 보시오.');
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
        if (player.level >= 20 && !canAcquireBlacksmithProfession(player)) return 'slot_unavailable';
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
        new DialogueScenario('slot_unavailable', function* ({ player }) {
            const reason = !player.career.mainJobId
                ? '메인 직업 슬롯을 사용할 수 있는 20레벨이 필요하네.'
                : !player.career.subJobId
                    ? '이미 메인 직업이 있으니 50레벨에 서브 직업 슬롯이 열리면 다시 찾아오게.'
                    : '메인과 서브 직업 슬롯이 모두 차 있군. 대장장이도 정식 직업이니 빈 슬롯 없이는 전직할 수 없네.';
            yield Dialogue.say(reason);
            yield Dialogue.end();
        }),
        new DialogueScenario('end', function* () {
            yield Dialogue.say('금속은 도망가지 않으니 준비되면 오게.');
            yield Dialogue.end();
        }),
    ],
});

const careerJobs = getAllJobs().filter(job => job.tier === JobTier.FIRST);
const careerQuestEntries = JobSlotType.values().flatMap(slot => careerJobs.flatMap(job => {
    const questId = CAREER_QUEST_IDS[`${slot.key}:${job.id}`];
    return questId ? [{ slot, job, questId, key: `${slot.key}_${job.id.split(':')[1]}` }] : [];
}));

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
