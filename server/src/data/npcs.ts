import NPC, { Dialogue, DialogueScenario } from '../models/NPC.js';
import { defineProgress, ProgressType } from '../models/Progress.js';
import {
    ASHEN_ABYSS_QUEST_IDS,
    ECLIPSE_TRENCH_QUEST_IDS,
    FIRST_SLIME_HUNT_QUEST_ID,
    FROSTVEIL_QUEST_IDS,
    GLASSDUNE_QUEST_IDS,
    MISTTIDE_QUEST_IDS,
    PARADOX_QUEST_IDS,
    TWILIGHT_TOMB_QUEST_IDS,
    VOIDCROWN_QUEST_IDS,
    WORLDROOT_QUEST_IDS,
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
    id: 'misttide_navigator',
    name: '염등 항로지기 소마',
    description: '안개 속 항로를 밝히는 염등을 지키며 침몰왕도의 조류를 기록하는 항로지기입니다.',
    tags: ['npc:guide', 'npc:quest', 'region:misttide'],
    entryScenario: ({ player }) => {
        if (player.quests.canTurnIn(MISTTIDE_QUEST_IDS.END_DROWNED_COMMAND, 'misttide_navigator')) return 'boss_complete';
        if (player.quests.isActive(MISTTIDE_QUEST_IDS.END_DROWNED_COMMAND)) return 'boss_progress';
        if (player.quests.canTurnIn(MISTTIDE_QUEST_IDS.REPAIR_SALT_BEACON, 'misttide_navigator')) return 'beacon_complete';
        if (player.quests.isActive(MISTTIDE_QUEST_IDS.REPAIR_SALT_BEACON)) return 'beacon_progress';
        if (player.quests.canAccept(MISTTIDE_QUEST_IDS.END_DROWNED_COMMAND, 'misttide_navigator')) return 'boss_offer';
        return player.quests.canAccept(MISTTIDE_QUEST_IDS.REPAIR_SALT_BEACON, 'misttide_navigator') ? 'greeting' : 'lore';
    },
    scenarios: [
        new DialogueScenario('greeting', function* () {
            yield Dialogue.say('염등의 유리가 안개와 소금에 깎여 빛이 멀리 닿지 않아요. 흑산호 여덟 조각이면 등잔 테두리를 다시 세울 수 있는데, 구해 주실래요?');
            yield Dialogue.choice([
                { label: '흑산호를 모아 오겠습니다.', target: 'beacon_accept' },
                { label: '해안의 항로를 알려주세요.', target: 'lore' },
                { label: '지금은 쉬겠습니다.', target: 'end' },
            ]);
        }),
        new DialogueScenario('beacon_accept', function* () {
            yield Dialogue.acceptQuest(MISTTIDE_QUEST_IDS.REPAIR_SALT_BEACON);
            yield Dialogue.say('난파 해변 너머의 흑산호 암초를 살펴보세요. 채굴 도구가 있으면 암초에서도 직접 캘 수 있어요.');
            yield Dialogue.end();
        }),
        new DialogueScenario('beacon_progress', function* ({ player }) {
            const objective = player.quests.getSnapshot(MISTTIDE_QUEST_IDS.REPAIR_SALT_BEACON)?.objectives[0];
            yield Dialogue.say(`염등을 고치려면 흑산호가 ${objective?.required ?? 8}개 필요해요. 지금은 ${objective?.progress ?? 0}개가 모였네요.`);
            yield Dialogue.end();
        }),
        new DialogueScenario('beacon_complete', function* () {
            yield Dialogue.say('염등이 다시 안개 너머까지 비치기 시작했어요. 하지만 세이렌의 노래와 침몰제독의 명령이 남아 있는 한 항로는 곧 다시 닫힐 거예요.');
            yield Dialogue.turnInQuest(MISTTIDE_QUEST_IDS.REPAIR_SALT_BEACON);
            yield Dialogue.end();
        }),
        new DialogueScenario('boss_offer', function* () {
            yield Dialogue.say('세이렌 군주가 해안의 안개를 모으고, 침몰제독 아르켄은 바닷속 왕도에서 망자 함대를 일으키고 있어요. 두 지휘자를 모두 멈춰 주세요.');
            yield Dialogue.choice([
                { label: '끊어진 항로를 되찾겠습니다.', target: 'boss_accept' },
                { label: '더 준비하겠습니다.', target: 'end' },
            ]);
        }),
        new DialogueScenario('boss_accept', function* () {
            yield Dialogue.acceptQuest(MISTTIDE_QUEST_IDS.END_DROWNED_COMMAND);
            yield Dialogue.say('겹안개 물길에서 북쪽은 세이렌 원형암초, 남쪽은 침몰왕도 성문으로 이어져요. 조망 절벽의 조류시계를 풀면 숨은 조류동도 찾을 수 있고요.');
            yield Dialogue.end();
        }),
        new DialogueScenario('boss_progress', function* ({ player }) {
            const objectives = player.quests.getSnapshot(MISTTIDE_QUEST_IDS.END_DROWNED_COMMAND)?.objectives ?? [];
            const siren = objectives.find(objective => objective.id === 'siren-matriarch');
            const admiral = objectives.find(objective => objective.id === 'drowned-admiral');
            yield Dialogue.say(`세이렌 군주 ${siren?.progress ?? 0}/1, 침몰제독 ${admiral?.progress ?? 0}/1. 세이렌은 치유와 제어를 쓰는 이를 노리고, 제독은 도발에 거의 흔들리지 않아요.`);
            yield Dialogue.end();
        }),
        new DialogueScenario('boss_complete', function* () {
            yield Dialogue.say('안개가 걷히고 침몰왕도의 함대기도 가라앉았어요. 아르켄의 방패를 손봐 두었으니, 다음 항로에서 당신을 지켜 줄 거예요.');
            yield Dialogue.turnInQuest(MISTTIDE_QUEST_IDS.END_DROWNED_COMMAND);
            yield Dialogue.end();
        }),
        new DialogueScenario('lore', function* () {
            yield Dialogue.say('청해초 물목과 흑산호 암초가 겹안개 물길에서 합쳐져요. 북쪽 여울 끝에는 세이렌 군주가, 남쪽 성문 아래에는 침몰왕도가 있어요. 왕도 안에서는 시장과 기록원 두 길이 함대왕좌에서 다시 만나요.');
            yield Dialogue.end();
        }),
        new DialogueScenario('end', function* () {
            yield Dialogue.say('안개 속에서는 파도 소리보다 염등의 방향을 믿으세요.');
            yield Dialogue.end();
        }),
    ],
});

NPC.define({
    id: 'paradox_curator',
    name: '기록보존관 이델',
    description: '기계고가 자기 기록을 덮어쓰기 전에 온전한 기억 톱니를 분리해 보관하는 마지막 기록관입니다.',
    tags: ['npc:guide', 'npc:quest', 'region:paradox-clockwork'],
    entryScenario: ({ player }) => {
        if (player.quests.canTurnIn(PARADOX_QUEST_IDS.CLOSE_CAUSALITY_ENGINE, 'paradox_curator')) return 'architect_complete';
        if (player.quests.isActive(PARADOX_QUEST_IDS.CLOSE_CAUSALITY_ENGINE)) return 'architect_progress';
        if (player.quests.canTurnIn(PARADOX_QUEST_IDS.RESTORE_ARCHIVE, 'paradox_curator')) return 'archive_complete';
        if (player.quests.isActive(PARADOX_QUEST_IDS.RESTORE_ARCHIVE)) return 'archive_progress';
        if (player.quests.canAccept(PARADOX_QUEST_IDS.CLOSE_CAUSALITY_ENGINE, 'paradox_curator')) return 'architect_offer';
        return player.quests.canAccept(PARADOX_QUEST_IDS.RESTORE_ARCHIVE, 'paradox_curator') ? 'greeting' : 'lore';
    },
    scenarios: [
        new DialogueScenario('greeting', function* () {
            yield Dialogue.say('이곳의 기계는 움직임을 멈춘 게 아니에요. 실패한 시간을 지우고 같은 하루를 다시 조립하고 있죠. 온전한 기억 톱니 열둘과 논리핵 다섯이면 바깥으로 이어지는 기록부터 복원할 수 있어요.');
            yield Dialogue.choice([
                { label: '기록 부품을 모아 오겠습니다.', target: 'archive_accept' },
                { label: '역설기계고에 대해 알려주세요.', target: 'lore' },
                { label: '지금은 쉬겠습니다.', target: 'end' },
            ]);
        }),
        new DialogueScenario('archive_accept', function* () {
            yield Dialogue.acceptQuest(PARADOX_QUEST_IDS.RESTORE_ARCHIVE);
            yield Dialogue.say('기억 톱니는 외곽 기계충과 두루마리 장치에서, 논리핵은 논리식 골렘과 기록고 파수기에게서 찾을 수 있어요.');
            yield Dialogue.end();
        }),
        new DialogueScenario('archive_progress', function* ({ player }) {
            const objectives = player.quests.getSnapshot(PARADOX_QUEST_IDS.RESTORE_ARCHIVE)?.objectives ?? [];
            const gears = objectives.find(objective => objective.id === 'memory-gears');
            const cores = objectives.find(objective => objective.id === 'logic-cores');
            yield Dialogue.say(`기억 톱니 ${gears?.progress ?? 0}/${gears?.required ?? 12}, 논리핵 ${cores?.progress ?? 0}/${cores?.required ?? 5}. 순서가 섞이지 않도록 온전한 것만 가져와 주세요.`);
            yield Dialogue.end();
        }),
        new DialogueScenario('archive_complete', function* () {
            yield Dialogue.say('항로 기록이 돌아왔어요. 시간강 주조로 뒤편에서 중앙 인과기관까지 가는 길도 확인됐지만, 두 곳의 수호 연산이 아직 작동 중이에요.');
            yield Dialogue.turnInQuest(PARADOX_QUEST_IDS.RESTORE_ARCHIVE);
            yield Dialogue.end();
        }),
        new DialogueScenario('architect_offer', function* () {
            yield Dialogue.say('시간강 거신이 주조로를 봉쇄했고, 오르도는 중앙 인과기관에서 실패한 세계를 계속 덮어쓰고 있어요. 거신을 멈춘 뒤 설계자의 역설 고정자부터 파괴해 주세요.');
            yield Dialogue.choice([
                { label: '기계고의 반복을 끝내겠습니다.', target: 'architect_accept' },
                { label: '조금 더 준비하겠습니다.', target: 'end' },
            ]);
        }),
        new DialogueScenario('architect_accept', function* () {
            yield Dialogue.acceptQuest(PARADOX_QUEST_IDS.CLOSE_CAUSALITY_ENGINE);
            yield Dialogue.say('중앙 인과기관에는 고정자가 셋 있어요. 하나라도 남아 있으면 오르도가 충격의 대부분을 실패한 시간대로 밀어냅니다.');
            yield Dialogue.end();
        }),
        new DialogueScenario('architect_progress', function* ({ player }) {
            const objectives = player.quests.getSnapshot(PARADOX_QUEST_IDS.CLOSE_CAUSALITY_ENGINE)?.objectives ?? [];
            const colossus = objectives.find(objective => objective.id === 'chronosteel-colossus');
            const architect = objectives.find(objective => objective.id === 'paradox-architect');
            yield Dialogue.say(`시간강 거신 ${colossus?.progress ?? 0}/1, 역설설계자 ${architect?.progress ?? 0}/1. 설계자에게 가기 전에 고정자 세 개를 모두 부수세요.`);
            yield Dialogue.end();
        }),
        new DialogueScenario('architect_complete', function* () {
            yield Dialogue.say('기계고의 시계가 처음으로 다음 시각을 가리켰어요. 오르도가 남긴 인과율 방패와 반전 연산서를 당신에게 맡기겠습니다.');
            yield Dialogue.turnInQuest(PARADOX_QUEST_IDS.CLOSE_CAUSALITY_ENGINE);
            yield Dialogue.end();
        }),
        new DialogueScenario('lore', function* () {
            yield Dialogue.say('외곽의 폐철 수거로와 광학 회랑은 논리 기록고에서 합쳐져요. 주조로를 지나면 균열 분기소에서 기억 회랑과 방정식 교량으로 갈라지고, 인과율 연산대를 풀면 숨은 시제품고가 열립니다.');
            yield Dialogue.end();
        }),
        new DialogueScenario('end', function* () {
            yield Dialogue.say('같은 복도를 두 번 지나도 톱니의 흠집은 달라요. 기록을 믿되, 눈앞의 길을 더 믿으세요.');
            yield Dialogue.end();
        }),
    ],
});

NPC.define({
    id: 'ashen_wayfinder',
    name: '회색불길 길잡이 타렌',
    description: '잿빛성흔 심연에서 검은 불꽃의 열을 읽어 살아 돌아올 길을 기록하는 길잡이입니다.',
    tags: ['npc:guide', 'npc:quest', 'region:ashen-abyss'],
    entryScenario: ({ player }) => {
        if (player.quests.canTurnIn(ASHEN_ABYSS_QUEST_IDS.END_ASHEN_COURT, 'ashen_wayfinder')) return 'court_complete';
        if (player.quests.isActive(ASHEN_ABYSS_QUEST_IDS.END_ASHEN_COURT)) return 'court_progress';
        if (player.quests.canTurnIn(ASHEN_ABYSS_QUEST_IDS.RELIGHT_WAYSTATION, 'ashen_wayfinder')) return 'fire_complete';
        if (player.quests.isActive(ASHEN_ABYSS_QUEST_IDS.RELIGHT_WAYSTATION)) return 'fire_progress';
        if (player.quests.canAccept(ASHEN_ABYSS_QUEST_IDS.END_ASHEN_COURT, 'ashen_wayfinder')) return 'court_offer';
        return player.quests.canAccept(ASHEN_ABYSS_QUEST_IDS.RELIGHT_WAYSTATION, 'ashen_wayfinder') ? 'greeting' : 'lore';
    },
    scenarios: [
        new DialogueScenario('greeting', function* () {
            yield Dialogue.say('저 불꽃은 빛을 내지 않지만, 심연에서 돌아오는 길만큼은 기억해요. 화로가 꺼지기 전에 흑염 잔재 열둘과 밤쇠 여덟 덩이를 구해 주시겠어요?');
            yield Dialogue.choice([
                { label: '길잡이 화로를 복구하겠습니다.', target: 'fire_accept' },
                { label: '심연의 길을 알려주세요.', target: 'lore' },
                { label: '지금은 쉬겠습니다.', target: 'end' },
            ]);
        }),
        new DialogueScenario('fire_accept', function* () {
            yield Dialogue.acceptQuest(ASHEN_ABYSS_QUEST_IDS.RELIGHT_WAYSTATION);
            yield Dialogue.say('흑염 잔재는 사제와 회랑의 망령에게서, 밤쇠는 밤쇠 회랑의 광맥과 근위기사에게서 얻을 수 있어요.');
            yield Dialogue.end();
        }),
        new DialogueScenario('fire_progress', function* ({ player }) {
            const objectives = player.quests.getSnapshot(ASHEN_ABYSS_QUEST_IDS.RELIGHT_WAYSTATION)?.objectives ?? [];
            const residue = objectives.find(objective => objective.id === 'blackflame-residue');
            const iron = objectives.find(objective => objective.id === 'night-iron');
            yield Dialogue.say(`흑염 잔재 ${residue?.progress ?? 0}/${residue?.required ?? 12}, 밤쇠 ${iron?.progress ?? 0}/${iron?.required ?? 8}. 화로가 버틸 수 있도록 갈라지지 않은 것만 가져와 주세요.`);
            yield Dialogue.end();
        }),
        new DialogueScenario('fire_complete', function* () {
            yield Dialogue.say('회색불길이 다시 길을 비추기 시작했어요. 이제 문지기 너머 흑염 회랑과 잿왕성까지 귀환로가 끊기지 않을 거예요.');
            yield Dialogue.turnInQuest(ASHEN_ABYSS_QUEST_IDS.RELIGHT_WAYSTATION);
            yield Dialogue.end();
        }),
        new DialogueScenario('court_offer', function* () {
            yield Dialogue.say('세 아귀 문지기가 외곽을 지키고, 모르칸은 흑염 군세를 다시 세우고 있어요. 둘을 넘으면 재왕 벨카르의 명령도 끝낼 수 있습니다.');
            yield Dialogue.choice([
                { label: '재가 된 왕조를 끝내겠습니다.', target: 'court_accept' },
                { label: '조금 더 준비하겠습니다.', target: 'end' },
            ]);
        }),
        new DialogueScenario('court_accept', function* () {
            yield Dialogue.acceptQuest(ASHEN_ABYSS_QUEST_IDS.END_ASHEN_COURT);
            yield Dialogue.say('벨카르는 도발보다 치유와 보호, 제어를 만드는 이를 먼저 심판해요. 봉인 예배당의 맹세를 풀면 숨은 유산고를 거쳐 외성으로 우회할 수도 있습니다.');
            yield Dialogue.end();
        }),
        new DialogueScenario('court_progress', function* ({ player }) {
            const objectives = player.quests.getSnapshot(ASHEN_ABYSS_QUEST_IDS.END_ASHEN_COURT)?.objectives ?? [];
            const gatekeeper = objectives.find(objective => objective.id === 'three-maw-gatekeeper');
            const general = objectives.find(objective => objective.id === 'blackflame-general');
            const sovereign = objectives.find(objective => objective.id === 'ashen-sovereign');
            yield Dialogue.say(`세 아귀 문지기 ${gatekeeper?.progress ?? 0}/1, 흑염대장 ${general?.progress ?? 0}/1, 재왕 ${sovereign?.progress ?? 0}/1. 앞선 관문을 넘을수록 적은 위협 행동을 더 정확하게 읽습니다.`);
            yield Dialogue.end();
        }),
        new DialogueScenario('court_complete', function* () {
            yield Dialogue.say('왕관의 불씨가 꺼졌어요. 심연은 여전히 어둡지만, 이제 그 어둠이 누구의 명령을 따르지는 않겠죠.');
            yield Dialogue.turnInQuest(ASHEN_ABYSS_QUEST_IDS.END_ASHEN_COURT);
            yield Dialogue.end();
        }),
        new DialogueScenario('lore', function* () {
            yield Dialogue.say('망자골은 공허어금니 굴과 백골바람 골짜기로 갈라져 문지기 앞에서 합쳐져요. 그 너머 흑염 회랑은 여러 번 순환하고, 외성에서는 병영과 석익수 성벽 길이 왕관계단에서 다시 만납니다.');
            yield Dialogue.end();
        }),
        new DialogueScenario('end', function* () {
            yield Dialogue.say('회색불길이 보이지 않으면 발밑의 재가 어느 쪽으로 흐르는지 살펴보세요.');
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

NPC.define({
    id: 'voidcrown_warden',
    name: '빈 왕관 기록수호자 세린',
    description: '왕이 사라진 뒤 성채의 명령과 귀환로를 분리해 기록해 온 마지막 자유 기록관입니다.',
    tags: ['npc:guide', 'npc:quest', 'region:voidcrown'],
    entryScenario: ({ player }) => {
        if (player.quests.canTurnIn(VOIDCROWN_QUEST_IDS.END_REGENCY, 'voidcrown_warden')) return 'regency_complete';
        if (player.quests.isActive(VOIDCROWN_QUEST_IDS.END_REGENCY)) return 'regency_progress';
        if (player.quests.canTurnIn(VOIDCROWN_QUEST_IDS.RESTORE_WARD, 'voidcrown_warden')) return 'ward_complete';
        if (player.quests.isActive(VOIDCROWN_QUEST_IDS.RESTORE_WARD)) return 'ward_progress';
        if (player.quests.canAccept(VOIDCROWN_QUEST_IDS.END_REGENCY, 'voidcrown_warden')) return 'regency_offer';
        return player.quests.canAccept(VOIDCROWN_QUEST_IDS.RESTORE_WARD, 'voidcrown_warden') ? 'greeting' : 'lore';
    },
    scenarios: [
        new DialogueScenario('greeting', function* () {
            yield Dialogue.say('이 성채의 길은 왕의 명령을 받은 자만 되돌려 보냅니다. 우리만의 귀환표식을 새기려면 무광은 열넷과 별먹 열 병이 필요해요.');
            yield Dialogue.choice([
                { label: '귀환표식을 복구하겠습니다.', target: 'ward_accept' },
                { label: '성채의 구조를 알려주세요.', target: 'lore' },
                { label: '조금 더 준비하겠습니다.', target: 'end' },
            ]);
        }),
        new DialogueScenario('ward_accept', function* () {
            yield Dialogue.acceptQuest(VOIDCROWN_QUEST_IDS.RESTORE_WARD);
            yield Dialogue.say('무광은은 외성 광맥과 파수병에게서, 별먹은 왕실 서기관과 점성술사에게서 얻을 수 있어요.');
            yield Dialogue.end();
        }),
        new DialogueScenario('ward_progress', function* ({ player }) {
            const objectives = player.quests.getSnapshot(VOIDCROWN_QUEST_IDS.RESTORE_WARD)?.objectives ?? [];
            const silver = objectives.find(objective => objective.id === 'nullsilver');
            const ink = objectives.find(objective => objective.id === 'astral-ink');
            yield Dialogue.say(`무광은 ${silver?.progress ?? 0}/${silver?.required ?? 14}, 별먹 ${ink?.progress ?? 0}/${ink?.required ?? 10}. 빛을 반사하는 은이나 마른 먹은 표식을 망가뜨려요.`);
            yield Dialogue.end();
        }),
        new DialogueScenario('ward_complete', function* () {
            yield Dialogue.say('귀환표식이 왕의 명령과 분리됐어요. 이제 성채 깊은 곳에서도 스스로 돌아올 길을 기억할 수 있습니다.');
            yield Dialogue.turnInQuest(VOIDCROWN_QUEST_IDS.RESTORE_WARD);
            yield Dialogue.end();
        }),
        new DialogueScenario('regency_offer', function* () {
            yield Dialogue.say('테오른은 외성의 길을 몸처럼 움직이고, 라시엘은 왕관 기둥이 하나라도 남으면 대부분의 공격을 무효화해요. 기둥부터 부숴야 합니다.');
            yield Dialogue.choice([
                { label: '왕 없는 섭정을 끝내겠습니다.', target: 'regency_accept' },
                { label: '성채의 길을 더 살피겠습니다.', target: 'end' },
            ]);
        }),
        new DialogueScenario('regency_accept', function* () {
            yield Dialogue.acceptQuest(VOIDCROWN_QUEST_IDS.END_REGENCY);
            yield Dialogue.say('무관성주는 공허창과 성벽 파단을 정해진 순서로 쓰지만, 라시엘은 치유와 방벽, 제어를 가장 많이 만든 이를 계산해 기술 순서를 바꿉니다.');
            yield Dialogue.end();
        }),
        new DialogueScenario('regency_progress', function* ({ player }) {
            const objectives = player.quests.getSnapshot(VOIDCROWN_QUEST_IDS.END_REGENCY)?.objectives ?? [];
            const castellan = objectives.find(objective => objective.id === 'crownless-castellan');
            const pillars = objectives.find(objective => objective.id === 'voidcrown-pillars');
            const regent = objectives.find(objective => objective.id === 'voidcrown-regent');
            yield Dialogue.say(`무관성주 ${castellan?.progress ?? 0}/1, 왕관 기둥 ${pillars?.progress ?? 0}/3, 공허섭정 ${regent?.progress ?? 0}/1. 왕좌에서는 섭정보다 기둥을 먼저 노리세요.`);
            yield Dialogue.end();
        }),
        new DialogueScenario('regency_complete', function* () {
            yield Dialogue.say('왕관이 명령을 잃고 단순한 금속으로 돌아왔어요. 이제 이 성채의 다음 기록은 살아남은 이들이 직접 정할 겁니다.');
            yield Dialogue.turnInQuest(VOIDCROWN_QUEST_IDS.END_REGENCY);
            yield Dialogue.end();
        }),
        new DialogueScenario('lore', function* () {
            yield Dialogue.say('하층 안뜰에서 서쪽 성벽과 동쪽 정원으로 갈라져 외성문에서 합쳐집니다. 상층은 관측소와 무광 주조실로 다시 갈라지고, 빈 왕좌 서약을 풀면 무성좌 비밀금고를 거쳐 왕관 첨탑으로 우회할 수 있어요.');
            yield Dialogue.end();
        }),
        new DialogueScenario('end', function* () {
            yield Dialogue.say('왕관 문양보다 바닥의 귀환표식을 믿으세요. 이곳의 왕관은 아직도 거짓 명령을 내립니다.');
            yield Dialogue.end();
        }),
    ],
});

NPC.define({
    id: 'eclipse_navigator',
    name: '조류항해사 미레나',
    description: '월식해구의 빛과 어둠이 바뀌는 주기를 기록하며 침수된 관측선을 지키는 항해사입니다.',
    tags: ['npc:guide', 'npc:quest', 'region:eclipse-trench'],
    entryScenario: ({ player }) => {
        if (player.quests.canTurnIn(ECLIPSE_TRENCH_QUEST_IDS.END_WHITE_NIGHT, 'eclipse_navigator')) return 'white_night_complete';
        if (player.quests.isActive(ECLIPSE_TRENCH_QUEST_IDS.END_WHITE_NIGHT)) return 'white_night_progress';
        if (player.quests.canTurnIn(ECLIPSE_TRENCH_QUEST_IDS.RESTORE_DOCK, 'eclipse_navigator')) return 'dock_complete';
        if (player.quests.isActive(ECLIPSE_TRENCH_QUEST_IDS.RESTORE_DOCK)) return 'dock_progress';
        if (player.quests.canAccept(ECLIPSE_TRENCH_QUEST_IDS.END_WHITE_NIGHT, 'eclipse_navigator')) return 'white_night_offer';
        return player.quests.canAccept(ECLIPSE_TRENCH_QUEST_IDS.RESTORE_DOCK, 'eclipse_navigator') ? 'greeting' : 'lore';
    },
    scenarios: [
        new DialogueScenario('greeting', function* () {
            yield Dialogue.say('공허왕관 아래의 해구는 달이 보이지 않아도 월식을 반복해요. 관측선을 움직이려면 월염수 열여섯 병과 침은 열두 덩이가 필요합니다.');
            yield Dialogue.choice([
                { label: '조류기관을 복구하겠습니다.', target: 'dock_accept' },
                { label: '해구의 길을 알려주세요.', target: 'lore' },
                { label: '조금 더 준비하겠습니다.', target: 'end' },
            ]);
        }),
        new DialogueScenario('dock_accept', function* () {
            yield Dialogue.acceptQuest(ECLIPSE_TRENCH_QUEST_IDS.RESTORE_DOCK);
            yield Dialogue.say('월염수는 입구의 갑각류에게서, 침은은 침몰광맥과 창병에게서 얻을 수 있어요. 물속의 밝은 길만 따라가면 오히려 순환하게 되니 조심하세요.');
            yield Dialogue.end();
        }),
        new DialogueScenario('dock_progress', function* ({ player }) {
            const objectives = player.quests.getSnapshot(ECLIPSE_TRENCH_QUEST_IDS.RESTORE_DOCK)?.objectives ?? [];
            const brine = objectives.find(objective => objective.id === 'moon-brine');
            const silver = objectives.find(objective => objective.id === 'drowned-silver');
            yield Dialogue.say(`월염수 ${brine?.progress ?? 0}/${brine?.required ?? 16}, 침은 ${silver?.progress ?? 0}/${silver?.required ?? 12}. 조류기관은 두 재료의 비율이 어긋나면 관측선을 더 깊이 끌고 내려갑니다.`);
            yield Dialogue.end();
        }),
        new DialogueScenario('dock_complete', function* () {
            yield Dialogue.say('조류기관이 다시 뛰기 시작했어요. 이제 해구와 백야성소 사이의 귀환 항로를 잃지 않을 겁니다.');
            yield Dialogue.turnInQuest(ECLIPSE_TRENCH_QUEST_IDS.RESTORE_DOCK);
            yield Dialogue.end();
        }),
        new DialogueScenario('white_night_offer', function* () {
            yield Dialogue.say('리바이어던이 두 조류의 합류점을 막고, 세르미아는 조류거울로 백야를 고정하고 있어요. 거울이 하나라도 남으면 대사제의 몸으로 피해가 제대로 닿지 않습니다.');
            yield Dialogue.choice([
                { label: '고정된 월식을 끝내겠습니다.', target: 'white_night_accept' },
                { label: '성소를 먼저 살피겠습니다.', target: 'end' },
            ]);
        }),
        new DialogueScenario('white_night_accept', function* () {
            yield Dialogue.acceptQuest(ECLIPSE_TRENCH_QUEST_IDS.END_WHITE_NIGHT);
            yield Dialogue.say('리바이어던은 해일과 수압 분쇄를 번갈아 쓰지만, 세르미아는 파티의 치유와 보호를 계산해 백야와 월식의 순서를 바꿉니다. 마지막 제단에서는 거울부터 부수세요.');
            yield Dialogue.end();
        }),
        new DialogueScenario('white_night_progress', function* ({ player }) {
            const objectives = player.quests.getSnapshot(ECLIPSE_TRENCH_QUEST_IDS.END_WHITE_NIGHT)?.objectives ?? [];
            const leviathan = objectives.find(objective => objective.id === 'moon-tide-leviathan');
            const mirrors = objectives.find(objective => objective.id === 'white-night-mirrors');
            const hierophant = objectives.find(objective => objective.id === 'white-night-hierophant');
            yield Dialogue.say(`월조 리바이어던 ${leviathan?.progress ?? 0}/1, 조류거울 ${mirrors?.progress ?? 0}/3, 백야대사제 ${hierophant?.progress ?? 0}/1. 밝은 제단에서도 어두운 거울의 뒷면을 놓치지 마세요.`);
            yield Dialogue.end();
        }),
        new DialogueScenario('white_night_complete', function* () {
            yield Dialogue.say('해구의 빛이 다시 시간에 따라 움직여요. 끝나지 않던 백야가 끝났으니 이 물길도 언젠가는 새벽을 맞을 겁니다.');
            yield Dialogue.turnInQuest(ECLIPSE_TRENCH_QUEST_IDS.END_WHITE_NIGHT);
            yield Dialogue.end();
        }),
        new DialogueScenario('lore', function* () {
            yield Dialogue.say('관측선 아래에서 밝은 암초와 어두운 침몰선으로 갈라지고 월조 분지에서 합쳐집니다. 성소에 들어가면 성가 회랑과 수문 기관실이 다시 갈라지며, 월식 조류제단의 답을 찾으면 침수된 보물고로 우회할 수 있어요.');
            yield Dialogue.end();
        }),
        new DialogueScenario('end', function* () {
            yield Dialogue.say('빛이 길을 보여주는 동안에도 조류의 방향을 확인하세요. 이 해구의 빛은 절반의 시간 동안 거짓말을 합니다.');
            yield Dialogue.end();
        }),
    ],
});

NPC.define({
    id: 'worldroot_keeper',
    name: '기억수호자 오르넬',
    description: '역근수해가 잊은 이름과 길을 기억호박에 옮겨 기록하는 마지막 수호자입니다.',
    tags: ['npc:guide', 'npc:quest', 'region:worldroot'],
    entryScenario: ({ player }) => {
        if (player.quests.canTurnIn(WORLDROOT_QUEST_IDS.AWAKEN_HEART, 'worldroot_keeper')) return 'heart_complete';
        if (player.quests.isActive(WORLDROOT_QUEST_IDS.AWAKEN_HEART)) return 'heart_progress';
        if (player.quests.canTurnIn(WORLDROOT_QUEST_IDS.RESTORE_MEMORY, 'worldroot_keeper')) return 'memory_complete';
        if (player.quests.isActive(WORLDROOT_QUEST_IDS.RESTORE_MEMORY)) return 'memory_progress';
        if (player.quests.canAccept(WORLDROOT_QUEST_IDS.AWAKEN_HEART, 'worldroot_keeper')) return 'heart_offer';
        return player.quests.canAccept(WORLDROOT_QUEST_IDS.RESTORE_MEMORY, 'worldroot_keeper') ? 'greeting' : 'lore';
    },
    scenarios: [
        new DialogueScenario('greeting', function* () {
            yield Dialogue.say('이 수해는 길을 막는 게 아니라 길의 이름을 잊게 만듭니다. 기억호박 열여섯과 태초수액 열둘이 있으면 귀환로의 기억을 되살릴 수 있어요.');
            yield Dialogue.choice([
                { label: '수해의 기억을 복원하겠습니다.', target: 'memory_accept' },
                { label: '역근수해의 구조를 알려주세요.', target: 'lore' },
                { label: '조금 더 준비하겠습니다.', target: 'end' },
            ]);
        }),
        new DialogueScenario('memory_accept', function* () {
            yield Dialogue.acceptQuest(WORLDROOT_QUEST_IDS.RESTORE_MEMORY);
            yield Dialogue.say('기억호박은 빛나방과 수호자에게서, 태초수액은 수액 사제와 수해의 밝은 뿌리에서 얻을 수 있습니다.');
            yield Dialogue.end();
        }),
        new DialogueScenario('memory_progress', function* ({ player }) {
            const objectives = player.quests.getSnapshot(WORLDROOT_QUEST_IDS.RESTORE_MEMORY)?.objectives ?? [];
            const amber = objectives.find(objective => objective.id === 'memory-amber');
            const sap = objectives.find(objective => objective.id === 'primal-sap');
            yield Dialogue.say(`기억호박 ${amber?.progress ?? 0}/${amber?.required ?? 16}, 태초수액 ${sap?.progress ?? 0}/${sap?.required ?? 12}. 망각포자가 묻은 호박은 길 대신 죽은 기억을 보여주니 섞지 마세요.`);
            yield Dialogue.end();
        }),
        new DialogueScenario('memory_complete', function* () {
            yield Dialogue.say('잊혔던 길의 이름이 돌아왔습니다. 이제 태초심장으로 향하는 동안에도 되돌아올 방향을 기억할 수 있어요.');
            yield Dialogue.turnInQuest(WORLDROOT_QUEST_IDS.RESTORE_MEMORY);
            yield Dialogue.end();
        }),
        new DialogueScenario('heart_offer', function* () {
            yield Dialogue.say('역근 포식수가 심장으로 가는 뿌리를 삼키고, 아르보르는 심장씨앗으로 상처를 다른 박동에 흘립니다. 씨앗이 남은 동안 본체를 공격해도 대부분 회복될 거예요.');
            yield Dialogue.choice([
                { label: '뒤틀린 박동을 멈추겠습니다.', target: 'heart_accept' },
                { label: '심장 성역을 먼저 살피겠습니다.', target: 'end' },
            ]);
        }),
        new DialogueScenario('heart_accept', function* () {
            yield Dialogue.acceptQuest(WORLDROOT_QUEST_IDS.AWAKEN_HEART);
            yield Dialogue.say('포식수는 낙하와 포자 숨결을 차례로 쓰지만, 아르보르는 치유·보호·제어를 계산해 태초 박동과 망각 개화의 순서를 바꿉니다. 씨앗부터 파괴하세요.');
            yield Dialogue.end();
        }),
        new DialogueScenario('heart_progress', function* ({ player }) {
            const objectives = player.quests.getSnapshot(WORLDROOT_QUEST_IDS.AWAKEN_HEART)?.objectives ?? [];
            const devourer = objectives.find(objective => objective.id === 'inverse-root-devourer');
            const seeds = objectives.find(objective => objective.id === 'primordial-heart-seeds');
            const heart = objectives.find(objective => objective.id === 'primordial-heart-arbor');
            yield Dialogue.say(`역근 포식수 ${devourer?.progress ?? 0}/1, 심장씨앗 ${seeds?.progress ?? 0}/3, 태초심장 ${heart?.progress ?? 0}/1. 박동이 강해질수록 본체보다 씨앗의 빛을 먼저 찾으세요.`);
            yield Dialogue.end();
        }),
        new DialogueScenario('heart_complete', function* () {
            yield Dialogue.say('태초심장이 조용해졌습니다. 수해는 사라지지 않겠지만 이제 첫 기억과 마지막 망각이 서로를 삼키지는 않을 겁니다.');
            yield Dialogue.turnInQuest(WORLDROOT_QUEST_IDS.AWAKEN_HEART);
            yield Dialogue.end();
        }),
        new DialogueScenario('lore', function* () {
            yield Dialogue.say('길잡이 둥지 아래에서 광휘뿌리와 부패공동으로 갈라지고 역근 포식장의 문에서 합쳐집니다. 심장 성역은 성수관과 종자기록고로 다시 갈라지며, 첫 기억의 제단을 풀면 기억호박 유물고를 거쳐 심장고리로 우회할 수 있습니다.');
            yield Dialogue.end();
        }),
        new DialogueScenario('end', function* () {
            yield Dialogue.say('이곳에서는 표지보다 기억을 믿으세요. 같은 뿌리가 두 번 보인다면 길을 잃은 것이 아니라 이름을 잊은 겁니다.');
            yield Dialogue.end();
        }),
    ],
});
