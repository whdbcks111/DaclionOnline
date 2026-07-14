import { defineItem } from '../models/Item.js';
import { startCoroutine, Wait } from '../modules/coroutine.js';
import { registerItemUse } from '../modules/itemUse.js';
import { sendNotificationToUser } from '../modules/message.js';
import { getPlayerByUserId } from '../modules/player.js';
import logger from '../utils/logger.js';
import { GameTags } from '../../../shared/tags.js';
import {
    executeProjectileItemAttack,
    ItemAttackOverrideKeys,
    registerItemAttackOverride,
} from '../modules/itemAttack.js';

registerItemAttackOverride(ItemAttackOverrideKeys.PROJECTILE, executeProjectileItemAttack);

registerItemUse('heal_hp', (inv, item, finish) => {
    function* healRoutine(amount: number, time: number) {
        try {
            const player = getPlayerByUserId(inv.playerId);
            if(!player) return;

            inv.removeItem(item.id, 1);
            sendNotificationToUser(player.userId, { key: 'item:heal_hp', message: '꿀꺽꿀꺽...', length: time * 1000 });
            yield Wait(time);
            player.life += amount;
            sendNotificationToUser(player.userId, { key: 'item:heal_hp', message: `생명력을 ${amount.toFixed(0)}만큼 회복했습니다!` });
        }
        catch(e) {
            logger.error(e);
        }
        finally {
            finish();
        }
    }
    startCoroutine(healRoutine(item.getMetadata<number>('amount') ?? 0, item.getMetadata<number>('time') ?? 1));
});

registerItemUse('heal_mp', (inv, item, finish) => {
    function* healRoutine(amount: number, time: number) {
        try {
            const player = getPlayerByUserId(inv.playerId);
            if(!player) return;

            inv.removeItem(item.id, 1);
            sendNotificationToUser(player.userId, { key: 'item:heal_mp', message: '꿀꺽꿀꺽...', length: time * 1000 });
            yield Wait(time);
            player.mentality += amount;
            sendNotificationToUser(player.userId, { key: 'item:heal_mp', message: `정신력을 ${amount.toFixed(0)}만큼 회복했습니다!` });
        }
        catch(e) {
            logger.error(e);
        }
        finally {
            finish();
        }
    }
    startCoroutine(healRoutine(item.getMetadata<number>('amount') ?? 0, item.getMetadata<number>('time') ?? 1));
});

defineItem({
    id: 'health_potion',
    name: '체력 포션',
    description: '마시면 HP를 50 회복한다.',
    image: 'items/health_potion',
    category: '소모품',
    weight: 0.5,
    stackable: true,
    maxStack: 99,
    baseMetadata: { amount: 50 },
    onUse: 'heal_hp',
    equipSlot: null,
    modifiers: null,
    baseDurability: null,
    tags: [GameTags.ITEM_CONSUMABLE, GameTags.PROPERTY_NATURAL],
});

defineItem({
    id: 'mana_potion',
    name: '마나 포션',
    description: '마시면 MP를 30 회복한다.',
    image: 'items/mana_potion',
    category: '소모품',
    weight: 0.5,
    stackable: true,
    maxStack: 99,
    baseMetadata: { amount: 50 },
    onUse: 'heal_mp',
    equipSlot: null,
    modifiers: null,
    baseDurability: null,
    tags: [GameTags.ITEM_CONSUMABLE, GameTags.PROPERTY_WATER],
});

defineItem({
    id: 'old_sword',
    name: '낡은 검',
    description: '녹슬고 낡은 검. 그래도 쓸 수는 있다.',
    image: 'items/old_sword',
    category: '장검',
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
    tags: [GameTags.ITEM_WEAPON, GameTags.PROPERTY_FIRE],
});

defineItem({
    id: 'old_shield',
    name: '낡은 방패',
    description: '낡은 나무 방패.',
    image: 'items/old_shield',
    category: '방패',
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
    tags: [GameTags.ITEM_ARMOR, GameTags.MATERIAL_WOOD],
});

defineItem({
    id: 'venom_dagger',
    name: '독 단검',
    description: '독을 머금은 단검. 무생물에게는 독 효과가 통하지 않는다.',
    image: 'items/venom_dagger',
    category: '단검',
    weight: 1.5,
    stackable: false,
    maxStack: 1,
    baseMetadata: null,
    onUse: null,
    equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'atk', op: 'add', value: 3, source: '' },
    ],
    baseDurability: 40,
    tags: [GameTags.ITEM_WEAPON, GameTags.PROPERTY_POISON],
});

defineItem({
    id: 'light_bow',
    name: '가벼운 활',
    description: '가벼운 화살을 소모해 원거리 기본 공격을 한다. 화살이 없으면 근접 공격한다.',
    image: 'items/light_bow',
    category: '활',
    weight: 1.8,
    stackable: false,
    maxStack: 1,
    baseMetadata: {
        basicAttackOverride: ItemAttackOverrideKeys.PROJECTILE,
        projectileAttack: { ammunitionItemId: 'wooden_arrow' },
    },
    onUse: null,
    equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'atk', op: 'add', value: 2, source: '' },
    ],
    baseDurability: 80,
    tags: [GameTags.ITEM_WEAPON, GameTags.MATERIAL_WOOD],
});

defineItem({
    id: 'wooden_arrow',
    name: '화살',
    description: '투사체 기본 공격에 한 발씩 소모되는 가벼운 나무 화살.',
    image: 'items/wooden_arrow',
    category: '탄약',
    weight: 0.1,
    stackable: true,
    maxStack: 99,
    baseMetadata: {
        projectile: {
            dataId: 'basic_arrow',
            overrides: {
                name: '가벼운 화살',
                damageBonus: 2,
                attributeOverrides: { armorPen: 1 },
            },
        },
    },
    onUse: null,
    equipSlot: null,
    modifiers: null,
    baseDurability: null,
    tags: [GameTags.ITEM_AMMUNITION, GameTags.MATERIAL_WOOD, GameTags.PROPERTY_NATURAL],
});
