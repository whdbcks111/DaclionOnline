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
import { StatusEffectType } from '../models/StatusEffect.js';

registerItemAttackOverride(ItemAttackOverrideKeys.PROJECTILE, executeProjectileItemAttack);

registerItemUse('heal_hp', (inv, item, finish) => {
    function* healRoutine(amount: number, time: number) {
        try {
            const player = getPlayerByUserId(inv.playerId);
            if(!player) return;

            inv.removeItem(item.id, 1);
            sendNotificationToUser(player.userId, { key: 'item:heal_hp', message: '꿀꺽꿀꺽...', length: time * 1000 });
            yield Wait(time);
            const result = player.heal(amount);
            sendNotificationToUser(player.userId, { key: 'item:heal_hp', message: `생명력을 ${result.healedAmount.toFixed(0)}만큼 회복했습니다!` });
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

registerItemUse('learn_skill', (inv, item, finish) => {
    try {
        const player = getPlayerByUserId(inv.playerId);
        if (!player) return;
        const skillDataId = item.getMetadata<string>('skillDataId');
        if (!skillDataId) {
            sendNotificationToUser(player.userId, {
                key: 'item:learn_skill:invalid',
                message: '이 스킬북에는 유효한 스킬 정보가 없습니다.',
            });
            return;
        }
        const result = player.skills.grant(skillDataId, `item:${item.itemDataId}`);
        if (!result.acquired) {
            sendNotificationToUser(player.userId, {
                key: `item:learn_skill:owned:${skillDataId}`,
                message: `이미 스킬 [ ${result.skill.name} ] 을(를) 보유하고 있습니다.`,
            });
            return;
        }
        inv.removeItemInstance(item, 1);
    } catch (error) {
        logger.error('스킬북 사용 실패', error);
    } finally {
        finish();
    }
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
    description: '독을 머금은 단검. 물리 공격 적중 시 50% 확률로 8초간 1레벨 맹독을 부여한다.',
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
    onBasicAttackHit: ({ target }) => {
        if (Math.random() < 0.5) {
            target.applyStatusEffect(StatusEffectType.DEADLY_POISON, 8, 1);
        }
    },
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

defineItem({
    id: 'basic_pickaxe',
    name: '곡괭이',
    description: '광석처럼 단단한 자원을 채굴할 수 있는 기본 곡괭이.',
    image: 'items/basic_pickaxe',
    category: '도구',
    weight: 2.8,
    stackable: false,
    maxStack: 1,
    baseMetadata: null,
    onUse: null,
    equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'atk', op: 'add', value: 4, source: '' },
    ],
    baseDurability: 100,
    tags: [GameTags.ITEM_TOOL, GameTags.TOOL_MINING, GameTags.MATERIAL_IRON],
});

defineItem({
    id: 'iron_pickaxe',
    name: '철 곡괭이',
    description: '철과 돌을 조합해 만든 튼튼한 채굴 도구.',
    image: 'items/iron_pickaxe',
    category: '도구',
    weight: 3.2,
    stackable: false,
    maxStack: 1,
    baseMetadata: null,
    onUse: null,
    equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'atk', op: 'add', value: 7, source: '' },
    ],
    baseDurability: 180,
    tags: [GameTags.ITEM_TOOL, GameTags.TOOL_MINING, GameTags.MATERIAL_IRON],
});

defineItem({
    id: 'seismic_crush_skillbook',
    name: '지각 붕괴 스킬북',
    description: '사용하면 스킬 [ 지각 붕괴 ] 를 획득하는 희귀한 수정 각인서.',
    image: 'items/seismic_crush_skillbook',
    category: '스킬북',
    weight: 0.3,
    stackable: true,
    maxStack: 10,
    baseMetadata: { skillDataId: 'seismic_crush' },
    onUse: 'learn_skill',
    equipSlot: null,
    modifiers: null,
    baseDurability: null,
    tags: [GameTags.ITEM_CONSUMABLE, GameTags.ITEM_SKILL_BOOK, GameTags.MATERIAL_DIAMOND],
});

const mineralItems = [
    { id: 'stone', name: '돌', description: '가장 흔한 광물 자원.', weight: 0.8, tag: GameTags.MATERIAL_STONE },
    { id: 'coal', name: '석탄', description: '연료로 사용할 수 있는 검은 광물.', weight: 0.5, tag: GameTags.MATERIAL_COAL },
    { id: 'iron_ore', name: '철', description: '도구와 장비 제작에 쓰이는 철 광석.', weight: 0.7, tag: GameTags.MATERIAL_IRON },
    { id: 'gold_ore', name: '금', description: '희소하고 가치 있는 금 광석.', weight: 0.6, tag: GameTags.MATERIAL_GOLD },
    { id: 'ruby', name: '루비', description: '붉게 빛나는 희귀 보석.', weight: 0.2, tag: GameTags.MATERIAL_RUBY },
    { id: 'emerald', name: '에메랄드', description: '초록빛을 띠는 희귀 보석.', weight: 0.2, tag: GameTags.MATERIAL_EMERALD },
    { id: 'diamond', name: '다이아몬드', description: '극히 희귀하고 단단한 보석.', weight: 0.2, tag: GameTags.MATERIAL_DIAMOND },
] as const;

for (const mineral of mineralItems) {
    defineItem({
        id: mineral.id,
        name: mineral.name,
        description: mineral.description,
        image: `items/${mineral.id}`,
        category: '광물',
        weight: mineral.weight,
        stackable: true,
        maxStack: 99,
        baseMetadata: null,
        onUse: null,
        equipSlot: null,
        modifiers: null,
        baseDurability: null,
        tags: [mineral.tag],
    });
}
