import { defineShop } from '../models/Shop.js';
import { GameTags } from '../../../shared/tags.js';

defineShop({
    id: 'general_store',
    buyList: [
        {
            label: '체력 포션',
            create: () => ({ itemDataId: 'health_potion', count: 1 }),
            count: 1,
            price: 10,
            stock: 20,
            restockTime: 30,
        },
        {
            label: '마나 포션',
            create: () => ({ itemDataId: 'mana_potion', count: 1 }),
            count: 1,
            price: 10,
            stock: 20,
            restockTime: 30,
        },
        {
            label: '여행자 빵',
            create: () => ({ itemDataId: 'traveler_bread', count: 1 }),
            count: 1,
            price: 6,
            stock: 30,
            restockTime: 20,
        },
        {
            label: '맑은 샘물',
            create: () => ({ itemDataId: 'fresh_water', count: 1 }),
            count: 1,
            price: 5,
            stock: 30,
            restockTime: 20,
        },
        {
            label: '낡은 검',
            create: () => ({ itemDataId: 'old_sword', count: 1 }),
            count: 1,
            price: 30,
            stock: 3,
            restockTime: 120,
        },
        {
            label: '낡은 방패',
            create: () => ({ itemDataId: 'old_shield', count: 1 }),
            count: 1,
            price: 25,
            stock: 3,
            restockTime: 120,
        },
        {
            label: '독 단검',
            create: () => ({ itemDataId: 'venom_dagger', count: 1 }),
            count: 1,
            price: 45,
            stock: 2,
            restockTime: 180,
        },
        {
            label: '가벼운 활',
            create: () => ({ itemDataId: 'light_bow', count: 1 }),
            count: 1,
            price: 40,
            stock: 3,
            restockTime: 120,
        },
        {
            label: '화살 10개',
            create: () => ({ itemDataId: 'wooden_arrow', count: 10 }),
            count: 10,
            price: 8,
            stock: 20,
            restockTime: 20,
        },
    ],
    sellList: [
        {
            label: '소모품',
            filter: (item) => item.data?.category === '소모품',
            count: 99,
            price: 4,
        },
        {
            label: '낡은 검',
            filter: (item) => item.itemDataId === 'old_sword',
            count: 1,
            price: 15,
        },
        {
            label: '낡은 방패',
            filter: (item) => item.itemDataId === 'old_shield',
            count: 1,
            price: 12,
        },
        {
            label: '독 단검',
            filter: (item) => item.itemDataId === 'venom_dagger',
            count: 1,
            price: 20,
        },
        {
            label: '가벼운 활',
            filter: (item) => item.itemDataId === 'light_bow',
            count: 1,
            price: 20,
        },
        {
            label: '화살',
            filter: (item) => item.itemDataId === 'wooden_arrow',
            count: 99,
            price: 1,
        },
    ],
    tags: [GameTags.SHOP_GENERAL],
});

defineShop({
    id: 'feveric_mine_store',
    buyList: [
        {
            label: '곡괭이',
            create: () => ({ itemDataId: 'basic_pickaxe', count: 1 }),
            count: 1,
            price: 50,
            stock: 5,
            restockTime: 120,
        },
    ],
    sellList: [
        { label: '돌', filter: item => item.itemDataId === 'stone', count: 99, price: 2 },
        { label: '석탄', filter: item => item.itemDataId === 'coal', count: 99, price: 5 },
        { label: '철', filter: item => item.itemDataId === 'iron_ore', count: 99, price: 10 },
        { label: '금', filter: item => item.itemDataId === 'gold_ore', count: 99, price: 25 },
        { label: '루비', filter: item => item.itemDataId === 'ruby', count: 99, price: 55 },
        { label: '에메랄드', filter: item => item.itemDataId === 'emerald', count: 99, price: 60 },
        { label: '다이아몬드', filter: item => item.itemDataId === 'diamond', count: 99, price: 180 },
        { label: '곡괭이', filter: item => item.itemDataId === 'basic_pickaxe', count: 1, price: 25 },
    ],
    tags: [GameTags.SHOP_MINING],
});
