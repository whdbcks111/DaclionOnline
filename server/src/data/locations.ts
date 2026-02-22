import { defineLocation } from '../models/Location.js';

defineLocation({
    id: 'town_square',
    name: '마을 광장',
    zoneType: 'safe',
    x: 0,
    y: 0,
    z: 0,
    spawns: [],
    connections: [
        { locationId: 'field' },
        { locationId: 'shop_street' },
    ],
});

defineLocation({
    id: 'field',
    name: '초원',
    zoneType: 'safe',
    x: 100,
    y: 0,
    z: 0,
    spawns: [
        { monsterDataId: 'slime', maxCount: 5, respawnTime: 30 },
    ],
    connections: [
        { locationId: 'town_square' },
        { locationId: 'dark_forest' },
    ],
});

defineLocation({
    id: 'shop_street',
    name: '상점 거리',
    zoneType: 'safe',
    x: -50,
    y: 0,
    z: 0,
    spawns: [],
    connections: [
        { locationId: 'town_square' },
    ],
});

defineLocation({
    id: 'dark_forest',
    name: '어두운 숲',
    zoneType: 'normal',
    x: 200,
    y: 0,
    z: 0,
    spawns: [
        { monsterDataId: 'goblin', maxCount: 3, respawnTime: 60 },
    ],
    connections: [
        { locationId: 'field' },
    ],
});
