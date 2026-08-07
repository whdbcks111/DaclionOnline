import NPC, { Dialogue, DialogueScenario } from '../../models/actors/NPC.js';
import { defineProgress, ProgressType } from '../../models/progression/Progress.js';
import {
    ASHEN_ABYSS_QUEST_IDS,
    CHRONOFROST_QUEST_IDS,
    CLERIC_PRECEPTOR_NPC_ID,
    ECLIPSE_TRENCH_QUEST_IDS,
    ENDSTAR_QUEST_IDS,
    DAILY_COMMISSION_LAST_CLAIM_DAY,
    DAILY_COMMISSION_NPC_ID,
    expireStaleDailyCommission,
    FIRST_SLIME_HUNT_QUEST_ID,
    FROSTVEIL_QUEST_IDS,
    GLASSDUNE_QUEST_IDS,
    MISTTIDE_QUEST_IDS,
    NEBULA_QUEST_IDS,
    PARADOX_QUEST_IDS,
    TWILIGHT_TOMB_QUEST_IDS,
    THIRD_ADVANCEMENT_DEFINITIONS,
    THIRD_ADVANCEMENT_NPC_ID,
    VOIDCROWN_QUEST_IDS,
    WORLDROOT_QUEST_IDS,
    getDailyCommissionDayKey,
    getDailyCommissionDefinition,
    getPlayerDailyCommission,
} from '../progression/quests.js';
import { CAREER_QUEST_IDS } from '../progression/quests.js';
import { BLACKSMITH_APPRENTICESHIP_QUEST_ID } from '../progression/quests.js';
import { JobSlotType, getAllJobs, JobTier } from '../../models/progression/Job.js';
import { getQuestData } from '../../models/progression/Quest.js';
import { canAcquireBlacksmithProfession, hasBlacksmithProfession } from '../../modules/professions/forging.js';
import { GameTags } from '../../../../shared/tags.js';
import type Player from '../../models/actors/Player.js';
import {
    DACLEVIS_REVELATION_FLAG,
    ORIGINBOUNDARY_SOVEREIGN_DEFEATED_FLAG,
} from '../progression/ascension.js';
import { isAscended } from '../../models/progression/Ascension.js';
import { ascendPlayer, getAscensionDeniedReason } from '../../modules/world/ascension.js';

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
    tags: ['npc:guide', GameTags.NPC_BENEVOLENT],
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
    id: DAILY_COMMISSION_NPC_ID,
    name: '의뢰관리인 세나',
    description: '매일 모험가의 현재 숙련도에 맞는 성장 의뢰를 배정하는 루미나르 광장 관리인입니다.',
    tags: ['npc:guide', 'npc:quest', 'quest:daily', GameTags.NPC_BENEVOLENT],
    entryScenario: ({ player }) => {
        expireStaleDailyCommission(player);
        const active = getPlayerDailyCommission(player);
        if (active && player.quests.canTurnIn(active.questDataId, DAILY_COMMISSION_NPC_ID)) return 'complete';
        if (active) return 'progress';
        if (player.progress.getState(DAILY_COMMISSION_LAST_CLAIM_DAY) === getDailyCommissionDayKey()) {
            return 'claimed';
        }
        return 'offer';
    },
    scenarios: [
        new DialogueScenario('offer', function* ({ player }) {
            const definition = getDailyCommissionDefinition(player.level, player.userId);
            yield Dialogue.say(
                `오늘의 배정은 ${definition.type.label}입니다. ${definition.type.instruction} `
                + `목표는 ${definition.type.objectiveLabel} ${definition.required}${definition.type.unit}입니다. `
                + `완료하면 필요 경험치 50%, Gold ${definition.gold.toLocaleString('ko-KR')}와 회복·활동 보급품을 지급합니다.`,
            );
            yield Dialogue.choice([
                { label: '오늘의 의뢰를 받겠습니다.', target: 'accept' },
                { label: '나중에 다시 오겠습니다.', target: 'end' },
            ]);
        }),
        new DialogueScenario('accept', function* ({ player }) {
            const definition = getDailyCommissionDefinition(player.level, player.userId);
            yield Dialogue.acceptQuest(definition.id);
            yield Dialogue.say('오늘 배정은 자정까지 유지됩니다. 목표를 달성한 뒤 광장으로 돌아와 정산해 주세요.');
            yield Dialogue.end();
        }),
        new DialogueScenario('progress', function* ({ player }) {
            const quest = getPlayerDailyCommission(player);
            const objective = quest ? player.quests.getSnapshot(quest.questDataId)?.objectives[0] : undefined;
            yield Dialogue.say(
                `${objective?.label ?? '오늘의 의뢰'} 진행도는 `
                + `${objective?.progress ?? 0}/${objective?.required ?? 0}입니다.`,
            );
            yield Dialogue.end();
        }),
        new DialogueScenario('complete', function* ({ player }) {
            const quest = getPlayerDailyCommission(player);
            yield Dialogue.say('오늘의 의뢰를 마쳤군요. 성장 경험치와 골드, 보급품을 함께 정산하겠습니다.');
            if (quest) yield Dialogue.turnInQuest(quest.questDataId);
            yield Dialogue.end();
        }),
        new DialogueScenario('claimed', function* () {
            yield Dialogue.say('오늘의 의뢰 보상은 이미 정산했습니다. 한국 표준시 자정이 지나면 새 의뢰를 준비해 두겠습니다.');
            yield Dialogue.end();
        }),
        new DialogueScenario('end', function* () {
            yield Dialogue.say('준비가 되면 광장으로 다시 찾아오세요.');
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
                { label: '카이로스 공방도시에 대해 알려주세요.', target: 'lore' },
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
    description: '아셴바흐 심연에서 검은 불꽃의 열을 읽어 살아 돌아올 길을 기록하는 길잡이입니다.',
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
            yield Dialogue.say('회색불길이 다시 길을 비추기 시작했어요. 이제 문지기 너머 흑염 회랑과 카르모르 성까지 귀환로가 끊기지 않을 거예요.');
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
const jobMasterCareerQuestEntries = careerQuestEntries.filter(entry =>
    getQuestData(entry.questId)?.giverNpcIds.includes('job_master'));
const clericCareerQuestEntries = careerQuestEntries.filter(entry =>
    getQuestData(entry.questId)?.giverNpcIds.includes(CLERIC_PRECEPTOR_NPC_ID));

NPC.define({
    id: 'job_master',
    name: '전직관 세레나',
    description: '모험가의 자질을 살펴 전직 시험을 안내하는 루미나르 전직관입니다.',
    tags: ['npc:career', GameTags.NPC_BENEVOLENT],
    entryScenario: ({ player }) => {
        const ready = jobMasterCareerQuestEntries.find(entry => player.quests.canTurnIn(entry.questId, 'job_master'));
        if (ready) return `complete_${ready.key}`;
        const active = careerQuestEntries.find(entry => player.quests.isActive(entry.questId));
        return active ? 'progress' : 'menu';
    },
    scenarios: [
        new DialogueScenario('menu', function* ({ player }) {
            yield Dialogue.say('어서 와요. 직업은 힘의 크기보다 앞으로 걸어갈 방식을 정하는 선택이에요.');
            const choices = jobMasterCareerQuestEntries
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
        ...jobMasterCareerQuestEntries.flatMap(entry => [
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
    id: CLERIC_PRECEPTOR_NPC_ID,
    name: '새벽교단 교리사제 엘리안',
    description: '새벽의 빛을 전투와 보호의 기도로 다루는 성직자 후보를 이끄는 교리사제입니다.',
    tags: ['npc:career', 'npc:priest', GameTags.NPC_BENEVOLENT],
    entryScenario: ({ player }) => {
        const ready = clericCareerQuestEntries.find(entry =>
            player.quests.canTurnIn(entry.questId, CLERIC_PRECEPTOR_NPC_ID));
        if (ready) return `complete_${ready.key}`;
        const active = careerQuestEntries.find(entry => player.quests.isActive(entry.questId));
        return active ? 'progress' : 'menu';
    },
    scenarios: [
        new DialogueScenario('menu', function* ({ player }) {
            yield Dialogue.say('빛은 힘을 과시하기보다 어둠 속에서 길을 잃지 않도록 지키는 약속입니다. 그 약속을 짊어질 준비가 되었나요?');
            const choices = clericCareerQuestEntries
                .filter(entry => player.quests.canAccept(entry.questId, CLERIC_PRECEPTOR_NPC_ID))
                .map(entry => ({
                    label: `${entry.slot.label}: 성직자 서약을 시작한다`,
                    target: `offer_${entry.key}`,
                }));
            if (choices.length === 0) {
                const next = !player.career.mainJobId
                    ? '성직자의 첫 서약은 Lv.20부터 받아들일 수 있습니다.'
                    : !player.career.subJobId
                        ? '두 번째 서약은 Lv.50부터 가능하며 메인 직업과 다른 길이어야 합니다.'
                        : '두 직업의 서약을 모두 세웠군요. 이제 그 조합에 맞는 엘리트의 길을 닦으세요.';
                yield Dialogue.say(next);
                yield Dialogue.end();
                return;
            }
            choices.push({ label: '아직 서약하지 않는다.', target: 'goodbye' });
            yield Dialogue.choice(choices);
        }),
        new DialogueScenario('progress', function* () {
            yield Dialogue.say('이미 선택한 전직 시험이 진행 중입니다. 퀘스트에 기록된 인도자에게 시험 결과를 보고하세요.');
            yield Dialogue.end();
        }),
        new DialogueScenario('goodbye', function* () {
            yield Dialogue.say('준비된 마음으로 돌아오세요. 예배당의 등불은 꺼지지 않습니다.');
            yield Dialogue.end();
        }),
        ...clericCareerQuestEntries.flatMap(entry => [
            new DialogueScenario(`offer_${entry.key}`, function* () {
                yield Dialogue.say(`${entry.slot.label} 성직자의 길을 청했군요. 독·어둠·언데드의 위협을 정화해 빛을 지킬 의지를 증명하세요.`);
                yield Dialogue.acceptQuest(entry.questId);
                yield Dialogue.end();
            }),
            new DialogueScenario(`complete_${entry.key}`, function* () {
                yield Dialogue.say('정화의 끝에서도 자비와 경계를 잃지 않았군요. 새벽교단의 이름으로 성직자의 서약을 인정합니다.');
                yield Dialogue.turnInQuest(entry.questId);
                yield Dialogue.end();
            }),
        ]),
    ],
});

NPC.define({
    id: THIRD_ADVANCEMENT_NPC_ID,
    name: '계승관 아르덴',
    description: '세 왕좌를 넘을 준비가 된 엘리트 모험가의 마지막 계보를 심판하는 계승관입니다.',
    tags: ['npc:career', GameTags.NPC_BENEVOLENT],
    entryScenario: ({ player }) => {
        const ready = THIRD_ADVANCEMENT_DEFINITIONS.find(definition =>
            player.quests.canTurnIn(definition.questId, THIRD_ADVANCEMENT_NPC_ID));
        if (ready) return `complete_${ready.lineage}`;
        if (THIRD_ADVANCEMENT_DEFINITIONS.some(definition => player.quests.isActive(definition.questId))) {
            return 'progress';
        }
        const available = THIRD_ADVANCEMENT_DEFINITIONS.find(definition =>
            player.quests.canAccept(definition.questId, THIRD_ADVANCEMENT_NPC_ID));
        if (available) return `offer_${available.lineage}`;
        return player.career.thirdJob ? 'inherited' : 'locked';
    },
    scenarios: [
        new DialogueScenario('progress', function* ({ player }) {
            // 대화 시작 이벤트가 4단계 귀환 보고를 완료했다면 같은 대화에서 바로 보상한다.
            const ready = THIRD_ADVANCEMENT_DEFINITIONS.find(definition =>
                player.quests.canTurnIn(definition.questId, THIRD_ADVANCEMENT_NPC_ID));
            if (ready) {
                yield Dialogue.goto(`complete_${ready.lineage}`);
                return;
            }
            const active = THIRD_ADVANCEMENT_DEFINITIONS.find(definition =>
                player.quests.isActive(definition.questId));
            const snapshot = active ? player.quests.getSnapshot(active.questId) : undefined;
            if (!active || !snapshot) {
                yield Dialogue.say('현재 진행 중인 계승 시험을 확인할 수 없군.');
                yield Dialogue.end();
                return;
            }
            const progress = snapshot.objectives
                .map(objective => `${objective.label} ${objective.progress}/${objective.required}`)
                .join(', ');
            yield Dialogue.say(`${snapshot.stageDescription}\n현재 진행: ${progress}`);
            yield Dialogue.end();
        }),
        new DialogueScenario('locked', function* ({ player }) {
            const reason = player.level < 500
                ? '3차 계승의 문은 Lv.500에 열린다. 그때까지 너의 길을 더 단련해라.'
                : !player.career.eliteJob
                    ? '원래 메인과 서브 계보에 맞는 엘리트 직업을 먼저 완성해라.'
                    : '다른 계승 시험이 진행 중이거나, 아직 계승의 조건을 갖추지 못했다.';
            yield Dialogue.say(reason);
            yield Dialogue.end();
        }),
        new DialogueScenario('inherited', function* ({ player }) {
            yield Dialogue.say(`${player.career.thirdJob?.name ?? '3차 직업'}의 계보는 이미 너에게 이어졌다. 세 왕좌의 기억을 잃지 마라.`);
            yield Dialogue.end();
        }),
        new DialogueScenario('end', function* () {
            yield Dialogue.say('왕관은 도망가지 않는다. 준비되면 다시 와라.');
            yield Dialogue.end();
        }),
        ...THIRD_ADVANCEMENT_DEFINITIONS.flatMap(definition => [
            new DialogueScenario(`offer_${definition.lineage}`, function* () {
                yield Dialogue.say(`${definition.thirdJobName}의 길은 단순한 수치로 열리지 않는다. 세 성역을 순례하고, 너의 전술을 증명한 후, 세 왕좌를 모두 넘어라.`);
                yield Dialogue.choice([
                    { label: `${definition.thirdJobName} 계승 시험을 시작한다.`, target: `accept_${definition.lineage}` },
                    { label: '아직은 준비되지 않았다.', target: 'end' },
                ]);
            }),
            new DialogueScenario(`accept_${definition.lineage}`, function* () {
                yield Dialogue.acceptQuest(definition.questId);
                yield Dialogue.say('첫 번째 시험은 순례다. 성운 길목, 시계서리 피난처, 끝별 요새에 수락 후 직접 도착해라.');
                yield Dialogue.end();
            }),
            new DialogueScenario(`complete_${definition.lineage}`, function* () {
                yield Dialogue.say(`세 왕좌의 증표가 하나의 왕관으로 연결됐다. 지금부터 너는 ${definition.thirdJobName}다.`);
                yield Dialogue.turnInQuest(definition.questId);
                yield Dialogue.end();
            }),
        ]),
    ],
});

NPC.define({
    id: 'atonement_priest',
    name: '새벽교단 고해사제 세라',
    description: '헌금을 받아 감당할 수 있는 악업을 씻도록 돕는 새벽교단의 사제입니다.',
    tags: ['npc:priest', GameTags.NPC_BENEVOLENT, GameTags.FACILITY_SANCTUARY],
    entryScenario: ({ player }) => player.karma > 0 ? 'greeting' : 'clear',
    scenarios: [
        new DialogueScenario('clear', function* () {
            yield Dialogue.say('당신에게서는 씻어낼 악업이 느껴지지 않아요. 지금의 길을 잃지 마세요.');
            yield Dialogue.end();
        }),
        new DialogueScenario('greeting', function* ({ player }) {
            yield Dialogue.say(`현재 카르마는 ${player.karma.toFixed(1)}입니다. 헌금 100G마다 카르마 1을 씻을 수 있지만, 교단이 감당할 수 없는 악업은 돈으로 지울 수 없어요.`);
            yield Dialogue.choice([
                { label: '1,000G를 헌금한다.', target: 'donate_1000' },
                { label: '5,000G를 헌금한다.', target: 'donate_5000' },
                { label: '20,000G를 헌금한다.', target: 'donate_20000' },
                { label: '지금은 돌아간다.', target: 'end' },
            ]);
        }),
        ...([1_000, 5_000, 20_000] as const).map(amount => {
            const key = `donate_${amount}`;
            return new DialogueScenario(key, function* ({ player }) {
                let result: ReturnType<typeof player.atoneKarma> | undefined;
                yield Dialogue.event(() => { result = player.atoneKarma(amount); });
                if (!result?.success || !result.quote) {
                    yield Dialogue.say(result?.reason ?? '헌금을 처리하지 못했습니다.');
                    yield Dialogue.end();
                    return;
                }
                yield Dialogue.say(
                    `${result.quote.goldSpent.toLocaleString()}G를 헌금해 카르마 ${result.quote.karmaReduction.toFixed(1)}을 씻었습니다. 남은 카르마는 ${player.karma.toFixed(1)}입니다.`,
                );
                yield Dialogue.end();
            });
        }),
        new DialogueScenario('end', function* () {
            yield Dialogue.say('스스로 멈추기로 한 선택도 속죄의 시작이에요.');
            yield Dialogue.end();
        }),
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
    description: '루나리스 해구의 빛과 어둠이 바뀌는 주기를 기록하며 침수된 관측선을 지키는 항해사입니다.',
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
            yield Dialogue.say('벨카인 아래의 해구는 달이 보이지 않아도 월식을 반복해요. 관측선을 움직이려면 월염수 열여섯 병과 침은 열두 덩이가 필요합니다.');
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
            yield Dialogue.say('조류기관이 다시 뛰기 시작했어요. 이제 해구와 에일린 대성당 사이의 귀환 항로를 잃지 않을 겁니다.');
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
    description: '카미하라 숲가 잊은 이름과 길을 기억호박에 옮겨 기록하는 마지막 수호자입니다.',
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
                { label: '카미하라 숲의 구조를 알려주세요.', target: 'lore' },
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
            yield Dialogue.say('잊혔던 길의 이름이 돌아왔습니다. 이제 에오나의 심장으로 향하는 동안에도 되돌아올 방향을 기억할 수 있어요.');
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
            yield Dialogue.say(`역근 포식수 ${devourer?.progress ?? 0}/1, 심장씨앗 ${seeds?.progress ?? 0}/3, 에오나의 심장 ${heart?.progress ?? 0}/1. 박동이 강해질수록 본체보다 씨앗의 빛을 먼저 찾으세요.`);
            yield Dialogue.end();
        }),
        new DialogueScenario('heart_complete', function* () {
            yield Dialogue.say('에오나의 심장이 조용해졌습니다. 수해는 사라지지 않겠지만 이제 첫 기억과 마지막 망각이 서로를 삼키지는 않을 겁니다.');
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

interface FrontierQuestNpcDefinition {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly regionTag: string;
    readonly firstQuestId: string;
    readonly secondQuestId: string;
    readonly greeting: string;
    readonly firstGuidance: string;
    readonly secondGuidance: string;
    readonly lore: string;
    readonly completion: string;
}

function defineFrontierQuestNpc(data: FrontierQuestNpcDefinition): void {
    const progressText = (player: Player, questId: string) => {
        const objectives = player.quests.getSnapshot(questId)?.objectives ?? [];
        return objectives.map(objective => `${objective.label} ${objective.progress}/${objective.required}`).join(', ');
    };
    NPC.define({
        id: data.id,
        name: data.name,
        description: data.description,
        tags: ['npc:guide', 'npc:quest', data.regionTag],
        entryScenario: ({ player }) => {
            if (player.quests.canTurnIn(data.secondQuestId, data.id)) return 'second_complete';
            if (player.quests.isActive(data.secondQuestId)) return 'second_progress';
            if (player.quests.canTurnIn(data.firstQuestId, data.id)) return 'first_complete';
            if (player.quests.isActive(data.firstQuestId)) return 'first_progress';
            if (player.quests.canAccept(data.secondQuestId, data.id)) return 'second_offer';
            return player.quests.canAccept(data.firstQuestId, data.id) ? 'greeting' : 'lore';
        },
        scenarios: [
            new DialogueScenario('greeting', function* () {
                yield Dialogue.say(data.greeting);
                yield Dialogue.choice([
                    { label: '제가 복구 작업을 맡겠습니다.', target: 'first_accept' },
                    { label: '이 지역의 길을 알려주세요.', target: 'lore' },
                    { label: '조금 더 준비하겠습니다.', target: 'end' },
                ]);
            }),
            new DialogueScenario('first_accept', function* () {
                yield Dialogue.acceptQuest(data.firstQuestId);
                yield Dialogue.say(data.firstGuidance);
                yield Dialogue.end();
            }),
            new DialogueScenario('first_progress', function* ({ player }) {
                yield Dialogue.say(`${progressText(player, data.firstQuestId)}. 필요한 재료를 모두 회수한 뒤 다시 찾아오세요.`);
                yield Dialogue.end();
            }),
            new DialogueScenario('first_complete', function* () {
                yield Dialogue.say('필요한 흐름이 다시 이어졌습니다. 이 거점은 이제 다음 관문까지 길을 잃지 않을 겁니다.');
                yield Dialogue.turnInQuest(data.firstQuestId);
                yield Dialogue.end();
            }),
            new DialogueScenario('second_offer', function* () {
                yield Dialogue.say(data.secondGuidance);
                yield Dialogue.choice([
                    { label: '두 수호자를 모두 제압하겠습니다.', target: 'second_accept' },
                    { label: '전투 동선을 먼저 확인하겠습니다.', target: 'lore' },
                ]);
            }),
            new DialogueScenario('second_accept', function* () {
                yield Dialogue.acceptQuest(data.secondQuestId);
                yield Dialogue.say('중간 관문의 수호자를 먼저 쓰러뜨린 뒤 가장 깊은 왕좌로 향하세요. 두 전투는 서로 다른 위협 우선순위와 기술 순서를 사용합니다.');
                yield Dialogue.end();
            }),
            new DialogueScenario('second_progress', function* ({ player }) {
                yield Dialogue.say(`${progressText(player, data.secondQuestId)}. 쓰러뜨리지 못한 수호자의 방까지 이어지는 다른 갈림길도 확인하세요.`);
                yield Dialogue.end();
            }),
            new DialogueScenario('second_complete', function* () {
                yield Dialogue.say(data.completion);
                yield Dialogue.turnInQuest(data.secondQuestId);
                yield Dialogue.end();
            }),
            new DialogueScenario('lore', function* () {
                yield Dialogue.say(data.lore);
                yield Dialogue.end();
            }),
            new DialogueScenario('end', function* () {
                yield Dialogue.say('준비가 끝나면 다시 말을 걸어주세요. 이 너머의 길은 서두르는 사람보다 돌아올 길을 기억하는 사람을 필요로 합니다.');
                yield Dialogue.end();
            }),
        ],
    });
}

defineFrontierQuestNpc({
    id: 'nebula_navigator',
    name: '성도항해사 벨라',
    description: '아스트라 회랑의 오래된 별길과 중력 흐름을 유성등 지도에 다시 기록하는 항해사입니다.',
    regionTag: 'region:nebula-corridor',
    firstQuestId: NEBULA_QUEST_IDS.RESTORE_BEACON,
    secondQuestId: NEBULA_QUEST_IDS.END_SOVEREIGN,
    greeting: '에오나의 심장의 뿌리 위에는 별이 길처럼 흐르는 아스트라 회랑이 있습니다. 하지만 유성등이 꺼져 돌아오는 궤도가 보이지 않아요.',
    firstGuidance: '성운유리는 성진 가오리와 중력각에게서, 궤도편은 궤도절단 사냥꾼과 혜철 성운맥에서 얻을 수 있습니다.',
    secondGuidance: '낙성감시자 모르가가 상층 길을 막고 성운제 아스테리온은 사건지평으로 전투자를 고립시킵니다. 빛나는 섬광 뒤의 어두운 봉쇄를 조심하세요.',
    lore: '정거장 뒤 하층 갈림길은 성진 단구와 무음 궤도로 나뉘어 중력 합류정에서 만납니다. 낙성감시자 뒤 상층도 극광다리와 암흑물질 수로로 갈라졌다 왕관 전실에서 합쳐집니다.',
    completion: '성운관이 꺼지고 별길이 다시 자유롭게 흐릅니다. 동결된 시간의 문이 회랑 끝에서 열렸습니다.',
});

defineFrontierQuestNpc({
    id: 'chronofrost_keeper',
    name: '영시계지기 노엔',
    description: '얼어붙은 시간의 오차를 역행사 모래시계에 기록하는 에버프로스트 정원의 마지막 관리인입니다.',
    regionTag: 'region:chronofrost',
    firstQuestId: CHRONOFROST_QUEST_IDS.RESTART_CLOCK,
    secondQuestId: CHRONOFROST_QUEST_IDS.END_ZERO_HOUR,
    greeting: '이 시계원은 시간이 멈춘 것이 아니라 어제와 내일이 서로를 밀어내고 있습니다. 하층 진자를 움직이지 않으면 어느 길도 현재에 머물지 못해요.',
    firstGuidance: '시빙정은 동결분 유령과 진자강 시빙맥에서, 역행사는 역설원 추적자와 뒤집힌 설원에서 회수할 수 있습니다.',
    secondGuidance: '빙시계 파수장은 영시 절단과 진자뢰를 번갈아 쓰고, 크로니아는 가장 위험한 전투자의 시간을 먼저 얼립니다. 이동 제한을 풀 수단을 준비하세요.',
    lore: '피난소 뒤 길은 얼어붙은 분침과 모래시계 묘역으로 갈라져 진자 합류정에서 만납니다. 파수장 뒤에는 어제 회랑과 내일 금고가 각각 왕좌로 이어집니다.',
    completion: '멈췄던 초침이 한 칸 움직였습니다. 빼앗겼던 내일이 돌아왔고 라그나벨 성단으로 향하는 최후의 시간이 열렸습니다.',
});

defineFrontierQuestNpc({
    id: 'endstar_observer',
    name: '종성관측자 이오',
    description: '꺼진 성좌의 이름을 하나씩 기록하며 아직 태어나지 않은 별의 가능성을 지키는 관측자입니다.',
    regionTag: 'region:endstar',
    firstQuestId: ENDSTAR_QUEST_IDS.RELIGHT_CONSTELLATION,
    secondQuestId: ENDSTAR_QUEST_IDS.END_LAST_CONSTELLATION,
    greeting: '여기는 모든 별이 끝나는 곳이지만, 끝은 하나로 정해져 있지 않습니다. 피난 성좌의 연결이 끊겨 그 사실을 증명할 길이 사라졌어요.',
    firstGuidance: '잔광편은 재별수와 성좌 사냥꾼에게서, 창세정은 소멸 세라프와 창세정 파수자에게서 찾을 수 있습니다.',
    secondGuidance: '전령 에녹은 폭발 뒤 침묵으로 반격을 막고, 라스트라는 창세·소멸·붕괴 중 하나를 무작위로 선고합니다. 한 가지 방어만으로는 버틸 수 없습니다.',
    lore: '성단 요새 뒤 길은 재별무리와 침묵태양으로 나뉘어 종언 합류환에서 만납니다. 전령의 고리 뒤에는 창세 항로와 소멸 항로가 최후지평에서 다시 합쳐집니다.',
    completion: '라스트라가 정한 마지막 별자리가 풀렸습니다. 이제 Lv.500의 지평선 너머는 정해진 종말이 아니라 다음 확장을 기다리는 빈 하늘입니다.',
});

NPC.define({
    id: 'origin_end_remnant',
    name: '기원종언의 잔재',
    description: '아르케가 무너진 자리에 남은 빛과 어둠의 형상. 세계 바깥을 응시하고 있습니다.',
    tags: ['npc:ascension', 'npc:remnant', GameTags.NPC_BENEVOLENT],
    isVisible: ({ player }) => player.progress.getFlag(ORIGINBOUNDARY_SOVEREIGN_DEFEATED_FLAG),
    entryScenario: ({ player }) => isAscended(player.progress)
        ? 'ascended'
        : player.progress.getFlag(DACLEVIS_REVELATION_FLAG) ? 'returning' : 'awakening',
    scenarios: [
        new DialogueScenario('awakening', function* () {
            yield Dialogue.say('마침내 아르케의 경계가 갈라졌다. 나를 쓰러진 적의 망령이라 여기지 마라. 나는 그가 마지막까지 지키려 했던 경고다.');
            yield Dialogue.choice([
                { label: '무엇을 경고하려는 겁니까?', target: 'fractures' },
                { label: '지금은 듣지 않겠습니다.', target: 'end' },
            ]);
        }),
        new DialogueScenario('fractures', function* () {
            yield Dialogue.say('루미나르 곳곳의 균열은 자연재해가 아니다. 그 안의 원형 개체가 이 세계로 새어 나오며 약해지고 갈라져, 네가 알던 몬스터가 되었다.');
            yield Dialogue.say('옛사람들이 지옥문이라 부른 의식도 지옥 하나를 여는 문이 아니었다. 세계보다 높은 적대 차원에 좌표를 고정하려던 불완전한 통로였다.');
            yield Dialogue.choice([
                { label: '그 균열을 만든 존재는 누구입니까?', target: 'witch' },
                { label: '여기까지만 듣겠습니다.', target: 'end' },
            ]);
        }),
        new DialogueScenario('witch', function* () {
            yield Dialogue.say('대마녀 다클레비스. 루미나르 밖의 차원에서 시선과 저주만으로 세계의 경계를 찢는 자다. 네가 균열에서 느낀 주시는 그녀가 아직 직접 내려오지 않았다는 증거에 불과하다.');
            yield Dialogue.say('아르케는 그녀의 부하가 아니었다. 시작과 종말의 경계를 지켜, 이 세계의 존재가 준비 없이 바깥으로 흩어지는 것을 막고 있었다.');
            yield Dialogue.choice([
                { label: '다클레비스에게 갈 방법을 알려주세요.', target: 'transcendence' },
                { label: '이 사실을 정리할 시간이 필요합니다.', target: 'remember' },
            ]);
        }),
        new DialogueScenario('transcendence', function* () {
            yield Dialogue.say('지금의 육체로 경계를 넘으면 힘이 아니라 존재 자체가 무너진다. 한 생의 성장과 기술을 영혼의 격으로 압축하고, 처음부터 다시 걸어 경계를 견딜 그릇을 만드는 초월이 필요하다.');
            yield Dialogue.say('초월은 되돌릴 수 없는 선택이다. 준비가 끝나 다시 나를 찾으면, 무엇을 잃고 무엇을 영원히 지닐지 네게 확인시키겠다.');
            yield Dialogue.goto('remember');
        }),
        new DialogueScenario('remember', function* () {
            yield Dialogue.setFlag(DACLEVIS_REVELATION_FLAG);
            yield Dialogue.say('다클레비스의 이름을 기억하라. 이제부터 균열은 우연한 재난이 아니라, 그녀에게 닿기 위한 역방향의 길이다.');
            yield Dialogue.end();
        }),
        new DialogueScenario('returning', function* () {
            yield Dialogue.say('다클레비스의 차원으로 향할 결심이 섰느냐? 네가 원한다면 지금 한 생의 힘을 영혼에 새길 수 있다.');
            yield Dialogue.choice([
                { label: '초월 환생의 대가와 보상을 확인하겠습니다.', target: 'ascension_offer' },
                { label: '균열과 지옥문의 정체를 다시 듣겠습니다.', target: 'fractures' },
                { label: '초월이 필요한 이유를 다시 듣겠습니다.', target: 'transcendence' },
                { label: '아직 준비 중입니다.', target: 'end' },
            ]);
        }),
        new DialogueScenario('ascension_offer', function* ({ player }) {
            const deniedReason = getAscensionDeniedReason(player);
            if (deniedReason) {
                yield Dialogue.say(deniedReason);
                yield Dialogue.goto('returning');
                return;
            }
            yield Dialogue.say('초월하면 레벨·경험치·분배 능력치·직업·모든 스킬과 퀘스트 기록이 초기화되고, 장착품은 인벤토리로 돌아간다. 인벤토리·골드·도감·칭호와 그 밖의 수집 기록은 보존된다.');
            yield Dialogue.say('대신 Lv.1로 환생하며 보너스 스탯 포인트 25, 영구 패시브 [초월자의 혼], 귀속 아티팩트 [초월자의 나침반]을 받는다. 나침반은 Lv.1000 미만 경험치를 10배로 만든다.');
            yield Dialogue.choice([
                { label: '초기화 내용을 이해했습니다. 최종 확인으로 갑니다.', target: 'ascension_confirm' },
                { label: '아직 초월하지 않겠습니다.', target: 'end' },
            ]);
        }),
        new DialogueScenario('ascension_confirm', function* () {
            yield Dialogue.say('마지막으로 묻겠다. 이 선택은 되돌릴 수 없다. 지금의 삶을 영혼에 새기고 Lv.1로 환생하겠느냐?');
            yield Dialogue.choice([
                { label: '되돌릴 수 없음을 이해했습니다. 초월합니다.', target: 'ascension_execute' },
                { label: '취소합니다.', target: 'end' },
            ]);
        }),
        new DialogueScenario('ascension_execute', function* ({ player }) {
            const deniedReason = getAscensionDeniedReason(player);
            if (deniedReason) {
                yield Dialogue.say(deniedReason);
                yield Dialogue.end();
                return;
            }
            yield Dialogue.say('한 생의 경계를 접는다. 다음 눈을 뜰 때 너는 처음의 땅에 서 있겠지만, 영혼은 이미 세계 바깥을 기억할 것이다.');
            yield Dialogue.event(({ player: ascender }) => { ascendPlayer(ascender); });
        }),
        new DialogueScenario('ascended', function* () {
            yield Dialogue.say('네 영혼에는 이미 바깥 차원의 방향이 새겨졌다. 다시 Lv.1000의 경계에 도달하면 아르케와 싸울 필요 없이 다음 원정로를 열 수 있다.');
            yield Dialogue.choice([
                { label: '균열과 다클레비스의 정체를 다시 듣겠습니다.', target: 'fractures' },
                { label: '새 삶을 시작하겠습니다.', target: 'end' },
            ]);
        }),
        new DialogueScenario('end', function* () {
            yield Dialogue.say('경계를 넘는 선택은 서두를 일이 아니다. 준비가 되었을 때 다시 오라.');
            yield Dialogue.end();
        }),
    ],
});
