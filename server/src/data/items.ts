import { defineItem } from '../models/Item.js';

defineItem({
    id: 'health_potion',
    name: '체력 포션',
    description: '마시면 HP를 50 회복한다.',
    category: 'consumable',
    weight: 0.5,
    stackable: true,
    maxStack: 99,
    baseMetadata: null,
    onUse: 'heal_hp_50',
    equipSlot: null,
    modifiers: null,
    baseDurability: null,
});

defineItem({
    id: 'mana_potion',
    name: '마나 포션',
    description: '마시면 MP를 30 회복한다.',
    category: 'consumable',
    weight: 0.5,
    stackable: true,
    maxStack: 99,
    baseMetadata: null,
    onUse: 'heal_mp_30',
    equipSlot: null,
    modifiers: null,
    baseDurability: null,
});

defineItem({
    id: 'old_sword',
    name: '낡은 검',
    description: '녹슬고 낡은 검. 그래도 쓸 수는 있다.',
    category: 'weapon',
    weight: 3.0,
    stackable: false,
    maxStack: 1,
    baseMetadata: null,
    onUse: null,
    equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'atk', op: 'add', value: 5, source: '' },
    ],
    baseDurability: 50,
});

defineItem({
    id: 'old_shield',
    name: '낡은 방패',
    description: '낡은 나무 방패.',
    category: 'armor',
    weight: 2.5,
    stackable: false,
    maxStack: 1,
    baseMetadata: null,
    onUse: null,
    equipSlot: 'offHand',
    modifiers: [
        { attribute: 'def', op: 'add', value: 3, source: '' },
    ],
    baseDurability: 60,
});
