import { GameTags } from '../../../shared/tags.js';
import {
    defineQuest,
    QuestObjective,
    QuestReward,
    QuestStage,
} from '../models/Quest.js';
import { JobSlotType } from '../models/Job.js';
import './jobs.js';

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

const careerQuestDefinitions = [
    { id: 'warrior', name: '전사', label: '단단한 적 제압', weapon: 'training_axe', matches: (target: { hasTag(tag: string): boolean }) => target.hasTag(GameTags.TRAIT_INANIMATE) },
    { id: 'archer', name: '궁수', label: '자연 속성 적 제압', weapon: 'light_bow', matches: (target: { hasTag(tag: string): boolean }) => target.hasTag(GameTags.PROPERTY_NATURAL) },
    { id: 'assassin', name: '암살자', label: '생명체 적 제압', weapon: 'venom_dagger', matches: (target: { hasTag(tag: string): boolean }) => target.hasTag(GameTags.TRAIT_LIVING) },
    { id: 'mage', name: '마법사', label: '속성 적 제압', weapon: 'apprentice_staff', matches: (target: { hasTag(tag: string): boolean }) => [GameTags.PROPERTY_FIRE, GameTags.PROPERTY_ICE, GameTags.PROPERTY_POISON, GameTags.PROPERTY_NATURAL].some(tag => target.hasTag(tag)) },
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
