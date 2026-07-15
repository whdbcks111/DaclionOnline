import { GameTags } from '../../../shared/tags.js';
import {
    defineQuest,
    QuestObjective,
    QuestReward,
    QuestStage,
} from '../models/Quest.js';

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
