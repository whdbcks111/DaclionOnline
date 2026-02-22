import { defineMonster } from '../models/Monster.js';

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
    equipments: [],
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
    equipments: [],
});
