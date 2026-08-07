import { GameTags } from '../../../../shared/tags.js';
import { defineResource, registerResourceInteraction } from '../../models/actors/Resource.js';
import { defineInstanceDungeon } from '../../models/world/InstanceDungeon.js';
import { MonsterRank, MonsterStatProfile } from '../../models/actors/MonsterStats.js';
import { instanceDungeonManager } from '../../modules/world/instanceDungeon.js';
import { defineWorldMonster } from './monsters.js';

defineWorldMonster({
    id: 'rift_slime_vanguard',
    name: '원형질 균열 슬라임',
    description: '필드의 슬라임보다 원형에 가까운 개체. 동료와 동시에 침입자를 포위한다.',
    icon: 'monsters/grass_slime', // TODO(art): 전용 원형질 균열 슬라임 아이콘으로 교체.
    level: 10,
    statProfile: MonsterStatProfile.BRUISER,
    statWeights: { maxLife: 1.15, atk: 1.08 },
    drops: [{ itemDataId: 'health_potion', minCount: 1, maxCount: 2, chance: 0.3 }],
    goldReward: { min: 14, max: 28 },
    tags: [GameTags.ENTITY_SLIME, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_NATURAL, GameTags.PROPERTY_DARK],
});

defineWorldMonster({
    id: 'rift_slime_stalker',
    name: '자색 균열 추적체',
    description: '마녀의 시선이 농축된 자색 원형 개체. 전위 뒤에서 약해진 대상을 노린다.',
    icon: 'monsters/purple_slime', // TODO(art): 전용 자색 균열 추적체 아이콘으로 교체.
    level: 12,
    statProfile: MonsterStatProfile.SKIRMISHER,
    statWeights: { atk: 1.12, speed: 1.08 },
    drops: [{ itemDataId: 'mana_potion', minCount: 1, maxCount: 2, chance: 0.3 }],
    goldReward: { min: 18, max: 34 },
    attack: { damageType: 'magic', effect: { statusEffectId: 'poison', chance: 0.22, duration: 5, level: 1 } },
    tags: [GameTags.ENTITY_SLIME, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_POISON, GameTags.PROPERTY_DARK],
});

defineWorldMonster({
    id: 'rift_prime_core',
    name: '열화 이전의 늪핵',
    description: '루미나르의 늪핵들이 갈라져 나오기 전 원형에 가까운 균열 지배자.',
    icon: 'monsters/swamp_core', // TODO(art): 전용 균열 원형 보스 아이콘으로 교체.
    level: 15,
    statProfile: MonsterStatProfile.HYBRID,
    statRank: MonsterRank.BOSS,
    statWeights: { maxLife: 1.18, atk: 1.1, magicForce: 1.1, def: 1.05, magicDef: 1.05 },
    expReward: 15 * 20 * 8,
    drops: [
        { itemDataId: 'health_potion', minCount: 2, maxCount: 4, chance: 1 },
        { itemDataId: 'mana_potion', minCount: 2, maxCount: 4, chance: 1 },
    ],
    goldReward: { min: 140, max: 220 },
    challengePattern: {
        handler: 'rift:twofold-resonance',
        initialDelay: 5,
        interval: { min: 14, max: 18 },
    },
    tags: [
        GameTags.ENTITY_BOSS,
        GameTags.ENTITY_SLIME,
        GameTags.TRAIT_INANIMATE,
        GameTags.PROPERTY_POISON,
        GameTags.PROPERTY_DARK,
        'monster:rift-prime-core',
    ],
});

defineResource({
    id: 'unstable_dimensional_rift',
    name: '불안정한 차원 균열',
    level: 10,
    baseAttribute: { maxLife: 1 },
    hardness: 0,
    drops: [],
    expReward: { min: 0, max: 0 },
    interaction: 'enter_dimensional_rift',
    attackable: false,
    tags: [GameTags.PROPERTY_DARK, 'resource:dimensional-rift'],
});

defineResource({
    id: 'dimensional_return_rift',
    name: '귀환 차원 균열',
    level: 1,
    baseAttribute: { maxLife: 1 },
    hardness: 0,
    drops: [],
    expReward: { min: 0, max: 0 },
    interaction: 'exit_dimensional_rift',
    attackable: false,
    tags: [GameTags.PROPERTY_DARK, 'resource:dimensional-rift', 'resource:return-rift'],
});

defineInstanceDungeon({
    id: 'distorted_meadow_rift',
    name: '뒤틀린 초원 균열',
    recommendedLevel: 10,
    gateOpenSeconds: 10,
    durationSeconds: 5 * 60,
    maxPlayers: 5,
    tags: [GameTags.PROPERTY_NATURAL, GameTags.PROPERTY_DARK],
    rooms: [
        {
            key: 'threshold',
            name: '흔들리는 경계',
            objects: [
                { type: 'monster', dataId: 'rift_slime_vanguard', maxCount: 3, respawnTime: 0 },
            ],
        },
        {
            key: 'confluence',
            name: '원형질 합류점',
            objects: [
                { type: 'monster', dataId: 'rift_slime_vanguard', maxCount: 2, respawnTime: 0 },
                { type: 'monster', dataId: 'rift_slime_stalker', maxCount: 2, respawnTime: 0 },
            ],
        },
        {
            key: 'core',
            name: '균열의 핵',
            objects: [
                { type: 'monster', dataId: 'rift_prime_core', maxCount: 1, respawnTime: 0 },
            ],
        },
    ],
});

registerResourceInteraction('enter_dimensional_rift', (resource, player) => {
    instanceDungeonManager.enterFromGate(resource, player, 'distorted_meadow_rift');
});

registerResourceInteraction('exit_dimensional_rift', (resource, player) => (
    instanceDungeonManager.escapeThroughReturnRift(resource, player)
));
