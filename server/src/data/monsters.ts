import { defineMonster } from '../models/Monster.js';

defineMonster({
    id: 'slime',
    name: '슬라임',
    level: 1,
    exp: 10,
    baseAttribute: {
        life: 30,
        atk: 3,
        def: 1,
        speed: 0.8,
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
        life: 60,
        atk: 7,
        def: 3,
        speed: 1.0,
    },
    drops: [
        { itemDataId: 'health_potion', minCount: 1, maxCount: 1, chance: 0.2 },
        { itemDataId: 'old_sword',     minCount: 1, maxCount: 1, chance: 0.05 },
    ],
    expReward: 25,
    equipments: [],
});
