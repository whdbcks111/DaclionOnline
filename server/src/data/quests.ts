import { GameTags } from '../../../shared/tags.js';
import {
    defineQuest,
    QuestObjective,
    QuestReward,
    QuestStage,
} from '../models/Quest.js';
import { JobSlotType } from '../models/Job.js';
import './jobs.js';
import { canAcquireBlacksmithProfession, grantBlacksmithProfession } from '../modules/forging.js';
import type Entity from '../models/Entity.js';
import type Player from '../models/Player.js';

export const FIRST_SLIME_HUNT_QUEST_ID = 'luminair:first_slime_hunt';
export const TWILIGHT_TOMB_QUEST_IDS = Object.freeze({
    RESTLESS_DEAD: 'twilight-tomb:restless-dead',
    BROKEN_OATH: 'twilight-tomb:broken-oath',
} as const);
export const GLASSDUNE_QUEST_IDS = Object.freeze({
    CARAPACE_ROUTE: 'glassdune:carapace-route',
    SILENCE_SUN_VAULT: 'glassdune:silence-sun-vault',
} as const);

defineQuest({
    id: FIRST_SLIME_HUNT_QUEST_ID,
    name: '초원의 첫 의뢰',
    aliases: ['첫 의뢰', '슬라임 의뢰'],
    description: '바람결 초원의 슬라임을 3마리 처치하고 안내인 리아에게 보고하세요.',
    tags: ['quest:side', 'region:luminair'],
    giverNpcIds: ['town_guide'],
    turnInNpcIds: ['town_guide'],
    stages: [
        new QuestStage({
            id: 'hunt',
            description: '바람결 초원에서 슬라임 계열 몬스터를 처치하세요.',
            objectives: [
                QuestObjective.kill(
                    'slimes',
                    '슬라임 처치',
                    3,
                    target => target.hasTag(GameTags.ENTITY_SLIME),
                ),
            ],
        }),
    ],
    rewards: [
        QuestReward.exp(80),
        QuestReward.gold(100),
        QuestReward.item('health_potion', 2, '체력 포션'),
    ],
});

defineQuest({
    id: TWILIGHT_TOMB_QUEST_IDS.RESTLESS_DEAD,
    name: '꺼지지 않는 장송행렬',
    aliases: ['장송행렬', '왕릉 의뢰'],
    description: '황혼왕릉의 언데드 8기를 쓰러뜨리고 마지막 등불의 묘지기에게 보고하세요.',
    tags: ['quest:side', 'region:twilight-tombs'],
    giverNpcIds: ['twilight_keeper'],
    turnInNpcIds: ['twilight_keeper'],
    visible: player => player.level >= 28,
    canAccept: player => player.level >= 28,
    stages: [new QuestStage({
        id: 'quiet-procession',
        description: '황혼왕릉을 떠도는 언데드를 쓰러뜨려 장송행렬을 멈추세요.',
        objectives: [QuestObjective.kill(
            'undead',
            '언데드 처치',
            8,
            target => target.hasTag(GameTags.PROPERTY_UNDEAD),
        )],
    })],
    rewards: [
        QuestReward.exp(1_800),
        QuestReward.gold(320),
        QuestReward.item('graveward_tonic', 3, '묘지기 향약'),
    ],
});

defineQuest({
    id: TWILIGHT_TOMB_QUEST_IDS.BROKEN_OATH,
    name: '왕좌를 훔친 맹세',
    aliases: ['파계 기사왕', '왕좌의 맹세'],
    description: '황혼왕릉 깊은 곳에서 왕좌를 차지한 언데드 기사왕을 쓰러뜨리세요.',
    tags: ['quest:side', 'quest:boss', 'region:twilight-tombs'],
    giverNpcIds: ['twilight_keeper'],
    turnInNpcIds: ['twilight_keeper'],
    prerequisiteQuestIds: [TWILIGHT_TOMB_QUEST_IDS.RESTLESS_DEAD],
    visible: player => player.level >= 45,
    canAccept: player => player.level >= 45,
    stages: [new QuestStage({
        id: 'end-usurper',
        description: '파계의 왕좌에서 타락한 기사왕을 쓰러뜨리세요.',
        objectives: [QuestObjective.kill(
            'knight-king',
            '언데드 기사왕 처치',
            1,
            target => target.hasTag(GameTags.ENTITY_BOSS)
                && target.hasTag(GameTags.PROPERTY_UNDEAD)
                && target.hasTag(GameTags.PROPERTY_METAL),
        )],
    })],
    rewards: [
        QuestReward.exp(5_200),
        QuestReward.gold(780),
        QuestReward.item('gravekeeper_shield', 1, '묘문 수호방패'),
    ],
});

defineQuest({
    id: GLASSDUNE_QUEST_IDS.CARAPACE_ROUTE,
    name: '황금갑으로 이은 길',
    aliases: ['사막 성충갑', '대상단 의뢰'],
    description: '유리모래 사막의 황금갑 성충을 사냥해 성충갑 6개를 모아 대상단 기록관에게 가져가세요.',
    tags: ['quest:side', 'region:glassdune'],
    giverNpcIds: ['glassdune_chronicler'],
    turnInNpcIds: ['glassdune_chronicler'],
    visible: player => player.level >= 70,
    canAccept: player => player.level >= 70,
    stages: [new QuestStage({
        id: 'collect-carapace',
        description: '유리모래 사해와 열기 능선에서 황금갑 태양충을 찾으세요.',
        objectives: [QuestObjective.item('sunscarab-shell', '황금갑 성충갑 수집', 6, 'sunscarab_shell', true)],
    })],
    rewards: [
        QuestReward.exp(8_000),
        QuestReward.gold(1_250),
        QuestReward.item('shade_canteen', 3, '그늘 수통'),
        QuestReward.item('oasis_date', 4, '오아시스 대추야자'),
    ],
});

defineQuest({
    id: GLASSDUNE_QUEST_IDS.SILENCE_SUN_VAULT,
    name: '빛을 먹는 유리거상',
    aliases: ['태양고 거상', '유리거상'],
    description: '태양거울 기둥을 먼저 파괴한 뒤 태양고의 유리거상을 멈추세요.',
    tags: ['quest:side', 'quest:boss', 'region:glassdune'],
    giverNpcIds: ['glassdune_chronicler'],
    turnInNpcIds: ['glassdune_chronicler'],
    prerequisiteQuestIds: [GLASSDUNE_QUEST_IDS.CARAPACE_ROUTE],
    visible: player => player.level >= 100,
    canAccept: player => player.level >= 100,
    stages: [new QuestStage({
        id: 'break-glass-colossus',
        description: '태양고 내부의 거울 기둥을 정리하고 유리거상을 제압하세요.',
        objectives: [QuestObjective.kill(
            'sun-vault-colossus',
            '태양고의 유리거상 처치',
            1,
            target => target.hasTag(GameTags.ENTITY_BOSS)
                && target.hasTag(GameTags.PROPERTY_LIGHT)
                && target.hasTag(GameTags.PROPERTY_STONE),
        )],
    })],
    rewards: [
        QuestReward.exp(18_000),
        QuestReward.gold(3_200),
        QuestReward.item('sunmirror_shield', 1, '태양거울 방패'),
    ],
});

export const CAREER_QUEST_IDS: Record<string, string> = {};
export const BLACKSMITH_APPRENTICESHIP_QUEST_ID = 'profession:blacksmith_apprenticeship';

function hasStandardBlacksmithTrial(player: Player): boolean {
    return JobSlotType.values().some(slot => {
        const id = CAREER_QUEST_IDS[`${slot.key}:career:blacksmith`];
        return Boolean(id && (player.quests.isActive(id) || player.quests.canTurnIn(id)));
    });
}

function hasLegacyBlacksmithTrial(player: Player): boolean {
    return player.quests.isActive(BLACKSMITH_APPRENTICESHIP_QUEST_ID)
        || player.quests.canTurnIn(BLACKSMITH_APPRENTICESHIP_QUEST_ID);
}

defineQuest({
    id: BLACKSMITH_APPRENTICESHIP_QUEST_ID,
    name: '불꽃 없는 제련법',
    description: '피버릭 갱도의 광맥을 직접 파괴해 소재의 결을 익히고 대장장이 로안에게 보고하세요.',
    tags: ['quest:profession', 'profession:blacksmith'],
    giverNpcIds: ['blacksmith_master'],
    turnInNpcIds: ['blacksmith_master'],
    visible: player => player.level >= 20 && canAcquireBlacksmithProfession(player) && !hasStandardBlacksmithTrial(player),
    canAccept: player => player.level >= 20 && canAcquireBlacksmithProfession(player) && !hasStandardBlacksmithTrial(player),
    stages: [new QuestStage({
        id: 'read_ore_grain',
        description: '채굴 도구로 광맥을 파괴해 서로 다른 광물의 결을 관찰하세요.',
        objectives: [QuestObjective.destroy('ore', '광맥 파괴', 8, target => target.hasTag(GameTags.RESOURCE_ORE))],
    })],
    rewards: [
        QuestReward.exp(600),
        QuestReward.item('iron_ore', 5, '철'),
        QuestReward.custom({
            label: '비어 있는 직업 슬롯 [ 대장장이 ] 전직',
            canGrant: canAcquireBlacksmithProfession,
            grant: player => {
                if (!grantBlacksmithProfession(player)) throw new Error('대장장이 직업 슬롯 배정에 실패했습니다.');
            },
        }),
    ],
});

interface CareerQuestDefinition {
    readonly id: string;
    readonly name: string;
    readonly weapon: string;
    readonly stageDescription: string;
    readonly createObjective: (slot: JobSlotType) => QuestObjective;
}

function killTrial(
    label: string,
    matches: (target: Entity) => boolean,
): (slot: JobSlotType) => QuestObjective {
    return slot => QuestObjective.kill('defeat', label, slot === JobSlotType.MAIN ? 5 : 10, matches);
}

const careerQuestDefinitions: readonly CareerQuestDefinition[] = [
    { id: 'warrior', name: '전사', weapon: 'training_axe', stageDescription: '전사의 방식에 맞는 전투 경험을 쌓으세요.', createObjective: killTrial('무생물 속성 적 처치', target => target.hasTag(GameTags.TRAIT_INANIMATE)) },
    { id: 'archer', name: '궁수', weapon: 'light_bow', stageDescription: '궁수의 방식에 맞는 전투 경험을 쌓으세요.', createObjective: killTrial('자연 속성 적 처치', target => target.hasTag(GameTags.PROPERTY_NATURAL)) },
    { id: 'assassin', name: '암살자', weapon: 'venom_dagger', stageDescription: '암살자의 방식에 맞는 전투 경험을 쌓으세요.', createObjective: killTrial('생명체 속성 적 처치', target => target.hasTag(GameTags.TRAIT_LIVING)) },
    { id: 'mage', name: '마법사', weapon: 'apprentice_staff', stageDescription: '마법사의 방식에 맞는 전투 경험을 쌓으세요.', createObjective: killTrial('불·얼음·독·자연 속성 적 처치', target => [GameTags.PROPERTY_FIRE, GameTags.PROPERTY_ICE, GameTags.PROPERTY_POISON, GameTags.PROPERTY_NATURAL].some(tag => target.hasTag(tag))) },
    {
        id: 'blacksmith',
        name: '대장장이',
        weapon: 'iron_pickaxe',
        stageDescription: '광맥을 직접 파괴하며 소재의 결을 읽는 감각과 단단한 체력을 증명하세요.',
        createObjective: slot => QuestObjective.destroy(
            'ore',
            '광맥 파괴',
            slot === JobSlotType.MAIN ? 5 : 10,
            target => target.hasTag(GameTags.RESOURCE_ORE),
        ),
    },
];

for (const slot of JobSlotType.values()) for (const job of careerQuestDefinitions) {
    const questId = `career:${slot.key}_${job.id}_promotion`;
    const jobId = `career:${job.id}`;
    CAREER_QUEST_IDS[`${slot.key}:${jobId}`] = questId;
    defineQuest({
        id: questId,
        name: `${slot.label} ${job.name} 전직 시험`,
        description: `${job.name}의 기본 소양을 증명하고 ${slot.label}(으)로 전직하세요.`,
        tags: ['quest:career', `career:${slot.key}`],
        giverNpcIds: ['job_master'],
        turnInNpcIds: ['job_master'],
        visible: player => player.level >= slot.requiredLevel
            && player.career.canAssign(slot, jobId).success
            && (job.id !== 'blacksmith' || !hasLegacyBlacksmithTrial(player)),
        canAccept: player => player.career.canAssign(slot, jobId).success
            && (job.id !== 'blacksmith' || !hasLegacyBlacksmithTrial(player)),
        stages: [new QuestStage({
            id: 'trial',
            description: job.stageDescription,
            objectives: [job.createObjective(slot)],
        })],
        rewards: [
            ...(slot === JobSlotType.MAIN ? [QuestReward.item(job.weapon, 1)] : []),
            QuestReward.custom({
                label: `${slot.label} [ ${job.name} ] 전직`,
                canGrant: player => player.career.canAssign(slot, jobId).success,
                grant: player => { player.career.assign(slot, jobId); },
            }),
        ],
    });
}
