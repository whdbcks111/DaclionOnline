import { defineResource, registerResourceInteraction } from '../models/Resource.js';
import { getItemData } from '../models/Item.js';
import { sendBotMessageToUser, sendNotificationToUser } from '../modules/message.js';
import { chat } from '../utils/chatBuilder.js';
import { GameTags } from '../../../shared/tags.js';

registerResourceInteraction('inspect_ore', (resource, player) => {
    sendNotificationToUser(player.userId, {
        key: `resource:${resource.resourceDataId}`,
        message: '단단한 광맥이다. 채굴 속성이 있는 도구로 공격하면 캘 수 있을 것 같다.',
    });
});

interface TreasureReward {
    label: string;
    weight: number;
    gold: { min: number; max: number };
    itemDataId?: string;
    itemCount?: { min: number; max: number };
}

const TREASURE_REWARDS: readonly TreasureReward[] = [
    { label: '묵직한 동전 주머니', weight: 33.5, gold: { min: 35, max: 90 } },
    { label: '회복 물자', weight: 22, gold: { min: 10, max: 30 }, itemDataId: 'health_potion', itemCount: { min: 1, max: 2 } },
    { label: '정신력 물자', weight: 14, gold: { min: 10, max: 30 }, itemDataId: 'mana_potion', itemCount: { min: 1, max: 2 } },
    { label: '화살 묶음', weight: 14, gold: { min: 5, max: 20 }, itemDataId: 'wooden_arrow', itemCount: { min: 8, max: 18 } },
    { label: '정제 전 철광석', weight: 9, gold: { min: 15, max: 35 }, itemDataId: 'iron_ore', itemCount: { min: 1, max: 3 } },
    { label: '붉은 보석함', weight: 4, gold: { min: 30, max: 60 }, itemDataId: 'ruby', itemCount: { min: 1, max: 1 } },
    { label: '빛나는 보석함', weight: 2, gold: { min: 50, max: 100 }, itemDataId: 'diamond', itemCount: { min: 1, max: 1 } },
    { label: '너울그물 낚싯대 보관함', weight: 0.75, gold: { min: 20, max: 40 }, itemDataId: 'wide_net_fishing_rod', itemCount: { min: 1, max: 1 } },
    { label: '급류바늘 낚싯대 보관함', weight: 0.75, gold: { min: 20, max: 40 }, itemDataId: 'swift_current_fishing_rod', itemCount: { min: 1, max: 1 } },
];

function randomInt(range: { min: number; max: number }, random: () => number): number {
    return Math.floor(random() * (range.max - range.min + 1)) + range.min;
}

export function rollTreasureReward(random = Math.random): { label: string; gold: number; itemDataId?: string; itemCount?: number } {
    const totalWeight = TREASURE_REWARDS.reduce((sum, reward) => sum + reward.weight, 0);
    let cursor = random() * totalWeight;
    const reward = TREASURE_REWARDS.find(entry => (cursor -= entry.weight) < 0) ?? TREASURE_REWARDS[0];
    return {
        label: reward.label,
        gold: randomInt(reward.gold, random),
        itemDataId: reward.itemDataId,
        itemCount: reward.itemCount ? randomInt(reward.itemCount, random) : undefined,
    };
}

registerResourceInteraction('open_treasure_chest', (_resource, player) => {
    const reward = rollTreasureReward();
    if (reward.itemDataId && reward.itemCount
        && !player.inventory.canAdd(reward.itemDataId, reward.itemCount)) {
        sendNotificationToUser(player.userId, {
            key: 'treasure-full',
            message: '보물상자의 물건을 꺼내기에는 인벤토리 여유 공간이 부족합니다.',
        });
        return false;
    }

    if (reward.itemDataId && reward.itemCount) {
        player.inventory.addItem(reward.itemDataId, reward.itemCount);
    }
    player.gold += reward.gold;

    const message = chat()
        .color('gold', b => b.weight('bold', b2 => b2.text('[ 보물상자 ] ')))
        .text(`${reward.label}을(를) 발견했습니다!\n`)
        .text(`Gold +${reward.gold}`);
    if (reward.itemDataId && reward.itemCount) {
        message.text(`\n${getItemData(reward.itemDataId)?.name ?? reward.itemDataId} x${reward.itemCount}`);
    }
    sendBotMessageToUser(player.userId, message.build());
    sendNotificationToUser(player.userId, {
        key: 'treasure-opened',
        message: '보물상자를 열었습니다!',
    });
    return true;
});

defineResource({
    id: 'ore_deposit',
    name: '광석',
    level: 3,
    baseAttribute: {
        maxLife: 45,
        def: 3,
    },
    requiredToolTags: [GameTags.TOOL_MINING],
    drops: [
        { itemDataId: 'stone', weight: 50, minCount: 1, maxCount: 1 },
        { itemDataId: 'coal', weight: 25, minCount: 1, maxCount: 1 },
        { itemDataId: 'iron_ore', weight: 13, minCount: 1, maxCount: 1 },
        { itemDataId: 'gold_ore', weight: 5, minCount: 1, maxCount: 1 },
        { itemDataId: 'ruby', weight: 3, minCount: 1, maxCount: 1 },
        { itemDataId: 'emerald', weight: 3, minCount: 1, maxCount: 1 },
        { itemDataId: 'diamond', weight: 1, minCount: 1, maxCount: 1 },
    ],
    expReward: { min: 18, max: 30 },
    interaction: 'inspect_ore',
    tags: [GameTags.RESOURCE_ORE, GameTags.TRAIT_INANIMATE, GameTags.MATERIAL_STONE],
});

defineResource({
    id: 'dense_ore_deposit',
    name: '응축 광맥',
    level: 15,
    baseAttribute: {
        maxLife: 180,
        def: 18,
    },
    requiredToolTags: [GameTags.TOOL_MINING],
    drops: [
        { itemDataId: 'stone', weight: 24, minCount: 2, maxCount: 4 },
        { itemDataId: 'coal', weight: 24, minCount: 1, maxCount: 3 },
        { itemDataId: 'iron_ore', weight: 28, minCount: 1, maxCount: 3 },
        { itemDataId: 'gold_ore', weight: 12, minCount: 1, maxCount: 2 },
        { itemDataId: 'ruby', weight: 5, minCount: 1, maxCount: 1 },
        { itemDataId: 'emerald', weight: 5, minCount: 1, maxCount: 1 },
        { itemDataId: 'diamond', weight: 2, minCount: 1, maxCount: 1 },
    ],
    expReward: { min: 180, max: 260 },
    interaction: 'inspect_ore',
    tags: [GameTags.RESOURCE_ORE, GameTags.TRAIT_INANIMATE, GameTags.MATERIAL_IRON],
});

defineResource({
    id: 'crystal_ore_deposit',
    name: '수정 광맥',
    level: 27,
    baseAttribute: {
        maxLife: 420,
        def: 34,
        magicDef: 24,
    },
    requiredToolTags: [GameTags.TOOL_MINING],
    drops: [
        { itemDataId: 'iron_ore', weight: 22, minCount: 2, maxCount: 4 },
        { itemDataId: 'gold_ore', weight: 24, minCount: 1, maxCount: 3 },
        { itemDataId: 'ruby', weight: 20, minCount: 1, maxCount: 2 },
        { itemDataId: 'emerald', weight: 20, minCount: 1, maxCount: 2 },
        { itemDataId: 'diamond', weight: 14, minCount: 1, maxCount: 1 },
    ],
    expReward: { min: 430, max: 600 },
    interaction: 'inspect_ore',
    tags: [GameTags.RESOURCE_ORE, GameTags.TRAIT_INANIMATE, GameTags.MATERIAL_DIAMOND],
});

defineResource({
    id: 'treasure_chest',
    name: '낡은 보물상자',
    level: 1,
    baseAttribute: { maxLife: 1, def: 9999, magicDef: 9999 },
    requiredToolTags: [],
    drops: [],
    expReward: { min: 0, max: 0 },
    interaction: 'open_treasure_chest',
    attackable: false,
    interactionCooldown: { min: 60 * 60, max: 2 * 60 * 60 },
    tags: [GameTags.RESOURCE_TREASURE, GameTags.TRAIT_INANIMATE, GameTags.MATERIAL_WOOD],
});

defineResource({
    id: 'ironroot_riddle_door',
    name: '질문을 새긴 뿌리문',
    level: 155,
    baseAttribute: { maxLife: 1, def: 9999, magicDef: 9999 },
    requiredToolTags: [],
    drops: [],
    expReward: { min: 0, max: 0 },
    interaction: 'ironroot_riddle_door',
    attackable: false,
    tags: [GameTags.TRAIT_INANIMATE, GameTags.MATERIAL_IRON, GameTags.PROPERTY_EARTH],
});

defineResource({
    id: 'ironroot_relay_artifact',
    name: '뒤집힌 고리 유물',
    level: 160,
    baseAttribute: { maxLife: 1, def: 9999, magicDef: 9999 },
    requiredToolTags: [],
    drops: [],
    expReward: { min: 0, max: 0 },
    interaction: 'ironroot_relay_artifact',
    attackable: false,
    tags: [GameTags.TRAIT_INANIMATE, GameTags.MATERIAL_IRON, GameTags.PROPERTY_DARK],
});

defineResource({
    id: 'ironroot_breakable_gate',
    name: '녹슨 봉인문',
    level: 165,
    baseAttribute: { maxLife: 18_000, def: 210, magicDef: 95 },
    requiredToolTags: [],
    drops: [],
    expReward: { min: 3_800, max: 4_600 },
    tags: [GameTags.TRAIT_INANIMATE, GameTags.MATERIAL_IRON, GameTags.PROPERTY_EARTH],
});

defineResource({
    id: 'ironroot_resonance_crystal',
    name: '지핵 공명 수정',
    level: 175,
    baseAttribute: { maxLife: 9_500, def: 85, magicDef: 260 },
    requiredToolTags: [],
    drops: [],
    expReward: { min: 2_200, max: 3_000 },
    tags: [GameTags.TRAIT_INANIMATE, GameTags.MATERIAL_DIAMOND, GameTags.PROPERTY_EARTH],
});
