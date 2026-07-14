import { defineMonster } from '../models/Monster.js';
import { GameTags } from '../../../shared/tags.js';

defineMonster({
    id: 'slime',
    name: '슬라임',
    level: 1,
    exp: 10,
    baseAttribute: {
        maxLife: 30,
        atk: 10,
        def: 1,
        speed: 0.5,
    },
    drops: [
        { itemDataId: 'health_potion', minCount: 1, maxCount: 1, chance: 0.3 },
    ],
    expReward: 10,
    goldReward: { min: 1, max: 5 },
    equipments: [],
    tags: [
        GameTags.ENTITY_SLIME,
        GameTags.TRAIT_INANIMATE,
        GameTags.PROPERTY_WATER,
        GameTags.PROPERTY_POISON,
    ],
});

defineMonster({
    id: 'goblin',
    name: '고블린',
    level: 3,
    exp: 25,
    baseAttribute: {
        maxLife: 60,
        atk: 15,
        def: 3,
        speed: 0.7,
    },
    drops: [
        { itemDataId: 'health_potion', minCount: 1, maxCount: 1, chance: 0.2 },
        { itemDataId: 'old_sword',     minCount: 1, maxCount: 1, chance: 0.05 },
    ],
    expReward: 25,
    goldReward: { min: 5, max: 15 },
    equipments: [],
    tags: [GameTags.ENTITY_HUMANOID, GameTags.PROPERTY_NATURAL],
});

defineMonster({
    id: 'stone_golem',
    name: '돌 골렘',
    level: 5,
    exp: 50,
    baseAttribute: {
        maxLife: 120,
        atk: 18,
        def: 10,
        speed: 0.35,
    },
    drops: [
        { itemDataId: 'old_shield', minCount: 1, maxCount: 1, chance: 0.08 },
    ],
    expReward: 50,
    goldReward: { min: 10, max: 25 },
    equipments: [],
    tags: [GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_NATURAL],
});
