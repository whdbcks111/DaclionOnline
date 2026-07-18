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

export const FIRST_SLIME_HUNT_QUEST_ID = 'luminair:first_slime_hunt';

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

export const CAREER_QUEST_IDS: Record<string, string> = {};
export const BLACKSMITH_APPRENTICESHIP_QUEST_ID = 'profession:blacksmith_apprenticeship';

defineQuest({
    id: BLACKSMITH_APPRENTICESHIP_QUEST_ID,
    name: '불꽃 없는 제련법',
    description: '피버릭 갱도의 광맥을 직접 파괴해 소재의 결을 익히고 대장장이 로안에게 보고하세요.',
    tags: ['quest:profession', 'profession:blacksmith'],
    giverNpcIds: ['blacksmith_master'],
    turnInNpcIds: ['blacksmith_master'],
    visible: player => player.level >= 20 && canAcquireBlacksmithProfession(player),
    canAccept: player => player.level >= 20 && canAcquireBlacksmithProfession(player),
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

const careerQuestDefinitions = [
    { id: 'warrior', name: '전사', label: '무생물 속성 적 처치', weapon: 'training_axe', matches: (target: { hasTag(tag: string): boolean }) => target.hasTag(GameTags.TRAIT_INANIMATE) },
    { id: 'archer', name: '궁수', label: '자연 속성 적 처치', weapon: 'light_bow', matches: (target: { hasTag(tag: string): boolean }) => target.hasTag(GameTags.PROPERTY_NATURAL) },
    { id: 'assassin', name: '암살자', label: '생명체 속성 적 처치', weapon: 'venom_dagger', matches: (target: { hasTag(tag: string): boolean }) => target.hasTag(GameTags.TRAIT_LIVING) },
    { id: 'mage', name: '마법사', label: '불·얼음·독·자연 속성 적 처치', weapon: 'apprentice_staff', matches: (target: { hasTag(tag: string): boolean }) => [GameTags.PROPERTY_FIRE, GameTags.PROPERTY_ICE, GameTags.PROPERTY_POISON, GameTags.PROPERTY_NATURAL].some(tag => target.hasTag(tag)) },
] as const;

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
        visible: player => player.level >= slot.requiredLevel && player.career.canAssign(slot, jobId).success,
        canAccept: player => player.career.canAssign(slot, jobId).success,
        stages: [new QuestStage({
            id: 'trial',
            description: `${job.name}의 방식에 맞는 전투 경험을 쌓으세요.`,
            objectives: [QuestObjective.kill('defeat', job.label, slot === JobSlotType.MAIN ? 5 : 10, job.matches)],
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
