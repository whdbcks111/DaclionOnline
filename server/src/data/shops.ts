import { defineShop } from '../models/Shop.js';

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
    ],
});
