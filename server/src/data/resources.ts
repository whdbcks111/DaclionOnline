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

const LABYRINTH_CACHE_REWARDS = Object.freeze({
    echo_treasure_chest: [
        { itemDataId: 'echo_hourglass', weight: 45 },
        { itemDataId: 'twisted_labyrinth_compass', weight: 35 },
        { itemDataId: 'resonance_evasion_shard', weight: 20 },
    ],
    crystal_treasure_chest: [
        { itemDataId: 'resonance_evasion_shard', weight: 50 },
        { itemDataId: 'echo_hourglass', weight: 30 },
        { itemDataId: 'twisted_labyrinth_compass', weight: 20 },
    ],
} as const);

export function rollLabyrinthCacheReward(
    resourceDataId: keyof typeof LABYRINTH_CACHE_REWARDS,
    random = Math.random,
): string {
    const rewards = LABYRINTH_CACHE_REWARDS[resourceDataId];
    let cursor = random() * rewards.reduce((sum, reward) => sum + reward.weight, 0);
    return rewards.find(reward => (cursor -= reward.weight) < 0)?.itemDataId ?? rewards[0].itemDataId;
}

const TWILIGHT_RELIQUARY_REWARDS = Object.freeze([
    { itemDataId: 'graveward_tonic', count: 2, weight: 34 },
    { itemDataId: 'weathered_bone', count: 5, weight: 18 },
    { itemDataId: 'broken_oath_badge', count: 3, weight: 16 },
    { itemDataId: 'soul_ember', count: 3, weight: 16 },
    { itemDataId: 'oathiron_sword', count: 1, weight: 4 },
    { itemDataId: 'requiem_bow', count: 1, weight: 4 },
    { itemDataId: 'mourning_staff', count: 1, weight: 4 },
    { itemDataId: 'gravekeeper_shield', count: 1, weight: 4 },
]);

const GLASSDUNE_RELIQUARY_REWARDS = Object.freeze([
    { itemDataId: 'shade_canteen', count: 3, weight: 26 },
    { itemDataId: 'glass_sand', count: 8, weight: 20 },
    { itemDataId: 'sunscarab_shell', count: 5, weight: 16 },
    { itemDataId: 'mirage_crystal', count: 3, weight: 14 },
    { itemDataId: 'sun_glyph_fragment', count: 2, weight: 12 },
    { itemDataId: 'dunebreaker_sword', count: 1, weight: 2.4 },
    { itemDataId: 'sunwire_bow', count: 1, weight: 2.4 },
    { itemDataId: 'mirage_fang_dagger', count: 1, weight: 2.4 },
    { itemDataId: 'helioglass_staff', count: 1, weight: 2.4 },
    { itemDataId: 'sunmirror_shield', count: 1, weight: 2.4 },
]);

const FROSTVEIL_RELIQUARY_REWARDS = Object.freeze([
    { itemDataId: 'winter_trail_ration', count: 4, weight: 22 },
    { itemDataId: 'frostward_tonic', count: 3, weight: 18 },
    { itemDataId: 'rime_crystal', count: 7, weight: 17 },
    { itemDataId: 'mirrorsteel_fragment', count: 5, weight: 15 },
    { itemDataId: 'aurora_shard', count: 3, weight: 12 },
    { itemDataId: 'rimecleaver_sword', count: 1, weight: 3.2 },
    { itemDataId: 'icesilk_longbow', count: 1, weight: 3.2 },
    { itemDataId: 'mirrorfang_dagger', count: 1, weight: 3.2 },
    { itemDataId: 'auroraprism_staff', count: 1, weight: 3.2 },
    { itemDataId: 'frostglass_bulwark', count: 1, weight: 3.2 },
]);

const MISTTIDE_RELIQUARY_REWARDS = Object.freeze([
    { itemDataId: 'brine_trail_ration', count: 5, weight: 20 },
    { itemDataId: 'seafoam_tonic', count: 3, weight: 16 },
    { itemDataId: 'black_coral', count: 7, weight: 16 },
    { itemDataId: 'abyssal_iron', count: 5, weight: 14 },
    { itemDataId: 'tide_pearl', count: 4, weight: 12 },
    { itemDataId: 'leviathan_bone', count: 3, weight: 10 },
    { itemDataId: 'tidebreaker_sword', count: 1, weight: 2.4 },
    { itemDataId: 'mistcurrent_bow', count: 1, weight: 2.4 },
    { itemDataId: 'blackcoral_sting', count: 1, weight: 2.4 },
    { itemDataId: 'deeppearl_staff', count: 1, weight: 2.4 },
    { itemDataId: 'drowned_admiral_shield', count: 1, weight: 2.4 },
]);

const PARADOX_RELIQUARY_REWARDS = Object.freeze([
    { itemDataId: 'cogwork_ration', count: 6, weight: 18 },
    { itemDataId: 'phase_tonic', count: 3, weight: 14 },
    { itemDataId: 'chronosteel_shard', count: 8, weight: 16 },
    { itemDataId: 'logic_core', count: 5, weight: 14 },
    { itemDataId: 'fracture_crystal', count: 4, weight: 12 },
    { itemDataId: 'paradox_thread', count: 3, weight: 10 },
    { itemDataId: 'paradox_edge', count: 1, weight: 3.2 },
    { itemDataId: 'photon_repeater', count: 1, weight: 3.2 },
    { itemDataId: 'voidspring_dagger', count: 1, weight: 3.2 },
    { itemDataId: 'logic_core_staff', count: 1, weight: 3.2 },
    { itemDataId: 'causality_aegis', count: 1, weight: 3.2 },
]);

const ASHEN_RELIQUARY_REWARDS = Object.freeze([
    { itemDataId: 'ashmarch_ration', count: 6, weight: 18 },
    { itemDataId: 'blackflame_ward', count: 3, weight: 14 },
    { itemDataId: 'night_iron', count: 8, weight: 16 },
    { itemDataId: 'blackflame_residue', count: 6, weight: 14 },
    { itemDataId: 'sovereign_seal_fragment', count: 4, weight: 12 },
    { itemDataId: 'mourning_eye', count: 4, weight: 10 },
    { itemDataId: 'sootcleaver_sword', count: 1, weight: 3.2 },
    { itemDataId: 'hornstring_bow', count: 1, weight: 3.2 },
    { itemDataId: 'gloamfang_dagger', count: 1, weight: 3.2 },
    { itemDataId: 'blackflame_staff', count: 1, weight: 3.2 },
    { itemDataId: 'ashguard_bulwark', count: 1, weight: 3.2 },
]);

export function rollTwilightReliquaryReward(random = Math.random): { itemDataId: string; count: number } {
    let cursor = random() * TWILIGHT_RELIQUARY_REWARDS.reduce((sum, reward) => sum + reward.weight, 0);
    const reward = TWILIGHT_RELIQUARY_REWARDS.find(entry => (cursor -= entry.weight) < 0)
        ?? TWILIGHT_RELIQUARY_REWARDS[0];
    return { itemDataId: reward.itemDataId, count: reward.count };
}

export function rollGlassduneReliquaryReward(random = Math.random): { itemDataId: string; count: number } {
    let cursor = random() * GLASSDUNE_RELIQUARY_REWARDS.reduce((sum, reward) => sum + reward.weight, 0);
    const reward = GLASSDUNE_RELIQUARY_REWARDS.find(entry => (cursor -= entry.weight) < 0)
        ?? GLASSDUNE_RELIQUARY_REWARDS[0];
    return { itemDataId: reward.itemDataId, count: reward.count };
}

export function rollFrostveilReliquaryReward(random = Math.random): { itemDataId: string; count: number } {
    let cursor = random() * FROSTVEIL_RELIQUARY_REWARDS.reduce((sum, reward) => sum + reward.weight, 0);
    const reward = FROSTVEIL_RELIQUARY_REWARDS.find(entry => (cursor -= entry.weight) < 0)
        ?? FROSTVEIL_RELIQUARY_REWARDS[0];
    return { itemDataId: reward.itemDataId, count: reward.count };
}

export function rollMisttideReliquaryReward(random = Math.random): { itemDataId: string; count: number } {
    let cursor = random() * MISTTIDE_RELIQUARY_REWARDS.reduce((sum, reward) => sum + reward.weight, 0);
    const reward = MISTTIDE_RELIQUARY_REWARDS.find(entry => (cursor -= entry.weight) < 0)
        ?? MISTTIDE_RELIQUARY_REWARDS[0];
    return { itemDataId: reward.itemDataId, count: reward.count };
}

export function rollParadoxReliquaryReward(random = Math.random): { itemDataId: string; count: number } {
    let cursor = random() * PARADOX_RELIQUARY_REWARDS.reduce((sum, reward) => sum + reward.weight, 0);
    const reward = PARADOX_RELIQUARY_REWARDS.find(entry => (cursor -= entry.weight) < 0)
        ?? PARADOX_RELIQUARY_REWARDS[0];
    return { itemDataId: reward.itemDataId, count: reward.count };
}

export function rollAshenReliquaryReward(random = Math.random): { itemDataId: string; count: number } {
    let cursor = random() * ASHEN_RELIQUARY_REWARDS.reduce((sum, reward) => sum + reward.weight, 0);
    const reward = ASHEN_RELIQUARY_REWARDS.find(entry => (cursor -= entry.weight) < 0)
        ?? ASHEN_RELIQUARY_REWARDS[0];
    return { itemDataId: reward.itemDataId, count: reward.count };
}

registerResourceInteraction('open_labyrinth_cache', (resource, player) => {
    if (resource.resourceDataId !== 'echo_treasure_chest'
        && resource.resourceDataId !== 'crystal_treasure_chest') return false;
    const itemDataId = rollLabyrinthCacheReward(resource.resourceDataId);
    if (!player.inventory.canAdd(itemDataId, 1)) {
        sendNotificationToUser(player.userId, {
            key: 'labyrinth-cache-full',
            message: '유물을 꺼내기에는 인벤토리 여유 공간이 부족합니다.',
        });
        return false;
    }
    player.inventory.addItem(itemDataId, 1);
    const itemName = getItemData(itemDataId)?.name ?? itemDataId;
    sendBotMessageToUser(player.userId, chat()
        .color('purple', builder => builder.weight('bold', nested => nested.text('[ 미궁의 보물 ]')))
        .text(`\n${itemName} x1을(를) 발견했습니다.`)
        .build());
    return true;
});

registerResourceInteraction('open_twilight_reliquary', (_resource, player) => {
    const reward = rollTwilightReliquaryReward();
    if (!player.inventory.canAdd(reward.itemDataId, reward.count)) {
        sendNotificationToUser(player.userId, {
            key: 'twilight-reliquary-full',
            message: '왕가의 유물을 꺼내기에는 인벤토리 여유 공간이 부족합니다.',
        });
        return false;
    }
    player.inventory.addItem(reward.itemDataId, reward.count);
    const itemName = getItemData(reward.itemDataId)?.name ?? reward.itemDataId;
    sendBotMessageToUser(player.userId, chat()
        .color('purple', builder => builder.weight('bold', nested => nested.text('[ 황혼왕릉의 유물 ]')))
        .text(`\n${itemName} x${reward.count}을(를) 발견했습니다.`)
        .build());
    return true;
});

registerResourceInteraction('open_glassdune_reliquary', (_resource, player) => {
    const reward = rollGlassduneReliquaryReward();
    if (!player.inventory.canAdd(reward.itemDataId, reward.count)) {
        sendNotificationToUser(player.userId, {
            key: 'glassdune-reliquary-full',
            message: '태양고의 유물을 꺼내기에는 인벤토리 여유 공간이 부족합니다.',
        });
        return false;
    }
    player.inventory.addItem(reward.itemDataId, reward.count);
    const itemName = getItemData(reward.itemDataId)?.name ?? reward.itemDataId;
    sendBotMessageToUser(player.userId, chat()
        .color('gold', builder => builder.weight('bold', nested => nested.text('[ 태양고의 유물 ]')))
        .text(`\n${itemName} x${reward.count}을(를) 발견했습니다.`)
        .build());
    return true;
});

registerResourceInteraction('open_frostveil_reliquary', (_resource, player) => {
    const reward = rollFrostveilReliquaryReward();
    if (!player.inventory.canAdd(reward.itemDataId, reward.count)) {
        sendNotificationToUser(player.userId, {
            key: 'frostveil-reliquary-full',
            message: '빙경궁의 유물을 꺼내기에는 인벤토리 여유 공간이 부족합니다.',
        });
        return false;
    }
    player.inventory.addItem(reward.itemDataId, reward.count);
    const itemName = getItemData(reward.itemDataId)?.name ?? reward.itemDataId;
    sendBotMessageToUser(player.userId, chat()
        .color('aqua', builder => builder.weight('bold', nested => nested.text('[ 빙경궁의 유물 ]')))
        .text(`\n${itemName} x${reward.count}을(를) 발견했습니다.`)
        .build());
    return true;
});

registerResourceInteraction('open_misttide_reliquary', (_resource, player) => {
    const reward = rollMisttideReliquaryReward();
    if (!player.inventory.canAdd(reward.itemDataId, reward.count)) {
        sendNotificationToUser(player.userId, {
            key: 'misttide-reliquary-full',
            message: '침몰왕도의 유물을 꺼내기에는 인벤토리 여유 공간이 부족합니다.',
        });
        return false;
    }
    player.inventory.addItem(reward.itemDataId, reward.count);
    const itemName = getItemData(reward.itemDataId)?.name ?? reward.itemDataId;
    sendBotMessageToUser(player.userId, chat()
        .color('aqua', builder => builder.weight('bold', nested => nested.text('[ 침몰왕도의 유산 ]')))
        .text(`\n${itemName} x${reward.count}을(를) 발견했습니다.`)
        .build());
    return true;
});

registerResourceInteraction('open_paradox_reliquary', (_resource, player) => {
    const reward = rollParadoxReliquaryReward();
    if (!player.inventory.canAdd(reward.itemDataId, reward.count)) {
        sendNotificationToUser(player.userId, {
            key: 'paradox-reliquary-full',
            message: '시제품고의 유물을 꺼내기에는 인벤토리 여유 공간이 부족합니다.',
        });
        return false;
    }
    player.inventory.addItem(reward.itemDataId, reward.count);
    const itemName = getItemData(reward.itemDataId)?.name ?? reward.itemDataId;
    sendBotMessageToUser(player.userId, chat()
        .color('purple', builder => builder.weight('bold', nested => nested.text('[ 역설기계고 시제품 ]')))
        .text(`\n${itemName} x${reward.count}을(를) 발견했습니다.`)
        .build());
    return true;
});

registerResourceInteraction('open_ashen_reliquary', (_resource, player) => {
    const reward = rollAshenReliquaryReward();
    if (!player.inventory.canAdd(reward.itemDataId, reward.count)) {
        sendNotificationToUser(player.userId, {
            key: 'ashen-reliquary-full',
            message: '잿왕의 유물을 꺼내기에는 인벤토리 여유 공간이 부족합니다.',
        });
        return false;
    }
    player.inventory.addItem(reward.itemDataId, reward.count);
    const itemName = getItemData(reward.itemDataId)?.name ?? reward.itemDataId;
    sendBotMessageToUser(player.userId, chat()
        .color('purple', builder => builder.weight('bold', nested => nested.text('[ 잿왕성의 봉인 유산 ]')))
        .text(`\n${itemName} x${reward.count}을(를) 발견했습니다.`)
        .build());
    return true;
});

registerResourceInteraction('harvest_oasis_palm', (_resource, player) => {
    const count = randomInt({ min: 2, max: 4 }, Math.random);
    if (!player.inventory.canAdd('oasis_date', count)) {
        sendNotificationToUser(player.userId, {
            key: 'oasis-palm-full',
            message: '대추야자를 담을 인벤토리 여유 공간이 부족합니다.',
        });
        return false;
    }
    player.inventory.addItem('oasis_date', count);
    sendNotificationToUser(player.userId, {
        key: 'oasis-palm-harvested',
        message: `오아시스 대추야자 ${count}개를 따냈습니다.`,
    });
    return true;
});

registerResourceInteraction('harvest_snowmoss', (_resource, player) => {
    const count = randomInt({ min: 2, max: 5 }, Math.random);
    if (!player.inventory.canAdd('snowmoss', count)) {
        sendNotificationToUser(player.userId, {
            key: 'snowmoss-full',
            message: '눈솔이끼를 담을 인벤토리 여유 공간이 부족합니다.',
        });
        return false;
    }
    player.inventory.addItem('snowmoss', count);
    sendNotificationToUser(player.userId, {
        key: 'snowmoss-harvested',
        message: `눈 아래에서 눈솔이끼 ${count}개를 채집했습니다.`,
    });
    return true;
});

registerResourceInteraction('harvest_kelp_resin', (_resource, player) => {
    const count = randomInt({ min: 2, max: 5 }, Math.random);
    if (!player.inventory.canAdd('kelp_resin', count)) {
        sendNotificationToUser(player.userId, {
            key: 'kelp-resin-full',
            message: '청해초 수지를 담을 인벤토리 여유 공간이 부족합니다.',
        });
        return false;
    }
    player.inventory.addItem('kelp_resin', count);
    sendNotificationToUser(player.userId, {
        key: 'kelp-resin-harvested',
        message: `청해초 줄기에서 수지 ${count}개를 채집했습니다.`,
    });
    return true;
});

registerResourceInteraction('harvest_memory_coil', (_resource, player) => {
    const count = randomInt({ min: 2, max: 5 }, Math.random);
    if (!player.inventory.canAdd('memory_gear', count)) {
        sendNotificationToUser(player.userId, {
            key: 'memory-coil-full',
            message: '기억 톱니를 담을 인벤토리 여유 공간이 부족합니다.',
        });
        return false;
    }
    player.inventory.addItem('memory_gear', count);
    sendNotificationToUser(player.userId, {
        key: 'memory-coil-harvested',
        message: `기억 두루마리 장치에서 온전한 톱니 ${count}개를 분리했습니다.`,
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
    id: 'ember_ore_vein',
    name: '화맥 광맥',
    level: 42,
    baseAttribute: {
        maxLife: 1_100,
        def: 62,
        magicDef: 48,
    },
    requiredToolTags: [GameTags.TOOL_MINING],
    drops: [
        { itemDataId: 'ember_ore', weight: 100, minCount: 1, maxCount: 2 },
    ],
    expReward: { min: 820, max: 1_150 },
    interaction: 'inspect_ore',
    tags: [
        GameTags.RESOURCE_ORE, GameTags.TRAIT_INANIMATE, GameTags.MATERIAL_EMBER,
        GameTags.MATERIAL_STONE, GameTags.PROPERTY_FIRE,
    ],
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
    id: 'twilight_riddle_door',
    name: '왕명을 새긴 석문',
    level: 40,
    baseAttribute: { maxLife: 1, def: 9999, magicDef: 9999 },
    requiredToolTags: [],
    drops: [],
    expReward: { min: 0, max: 0 },
    interaction: 'twilight_tomb_riddle',
    attackable: false,
    tags: [GameTags.TRAIT_INANIMATE, GameTags.MATERIAL_STONE, GameTags.PROPERTY_UNDEAD],
});

defineResource({
    id: 'twilight_reliquary',
    name: '황혼 왕가의 유물함',
    level: 45,
    baseAttribute: { maxLife: 1, def: 9999, magicDef: 9999 },
    requiredToolTags: [],
    drops: [],
    expReward: { min: 0, max: 0 },
    interaction: 'open_twilight_reliquary',
    attackable: false,
    interactionCooldown: { min: 4 * 60 * 60, max: 6 * 60 * 60 },
    tags: [GameTags.RESOURCE_TREASURE, GameTags.TRAIT_INANIMATE, GameTags.MATERIAL_GOLD, GameTags.PROPERTY_DARK],
});

defineResource({
    id: 'glass_sand_vein',
    name: '굳은 유리모래맥',
    level: 78,
    baseAttribute: { maxLife: 3_800, def: 148, magicDef: 118 },
    requiredToolTags: [GameTags.TOOL_MINING],
    drops: [
        { itemDataId: 'glass_sand', weight: 72, minCount: 2, maxCount: 5 },
        { itemDataId: 'mirage_crystal', weight: 22, minCount: 1, maxCount: 2 },
        { itemDataId: 'sun_glyph_fragment', weight: 6, minCount: 1, maxCount: 1 },
    ],
    expReward: { min: 1_450, max: 2_050 },
    interaction: 'inspect_ore',
    tags: [GameTags.RESOURCE_ORE, GameTags.TRAIT_INANIMATE, GameTags.MATERIAL_GLASS, GameTags.PROPERTY_STONE],
});

defineResource({
    id: 'sun_mirror_pillar',
    name: '태양거울 기둥',
    level: 104,
    baseAttribute: { maxLife: 5_800, def: 195, magicDef: 145 },
    requiredToolTags: [],
    drops: [
        { itemDataId: 'sun_glyph_fragment', weight: 65, minCount: 1, maxCount: 2 },
        { itemDataId: 'mirage_crystal', weight: 35, minCount: 1, maxCount: 1 },
    ],
    expReward: { min: 1_800, max: 2_500 },
    tags: [GameTags.TRAIT_INANIMATE, GameTags.MATERIAL_GLASS, GameTags.MATERIAL_GOLD, GameTags.PROPERTY_LIGHT],
});

defineResource({
    id: 'glassdune_sundial',
    name: '그림자 없는 해시계',
    level: 84,
    baseAttribute: { maxLife: 1, def: 9999, magicDef: 9999 },
    requiredToolTags: [],
    drops: [],
    expReward: { min: 0, max: 0 },
    interaction: 'glassdune_sundial_riddle',
    attackable: false,
    tags: [GameTags.TRAIT_INANIMATE, GameTags.MATERIAL_STONE, GameTags.PROPERTY_LIGHT],
});

defineResource({
    id: 'glassdune_reliquary',
    name: '태양고 반사경 유물함',
    level: 100,
    baseAttribute: { maxLife: 1, def: 9999, magicDef: 9999 },
    requiredToolTags: [],
    drops: [],
    expReward: { min: 0, max: 0 },
    interaction: 'open_glassdune_reliquary',
    attackable: false,
    interactionCooldown: { min: 3 * 60 * 60, max: 5 * 60 * 60 },
    tags: [GameTags.RESOURCE_TREASURE, GameTags.TRAIT_INANIMATE, GameTags.MATERIAL_GLASS, GameTags.PROPERTY_LIGHT],
});

defineResource({
    id: 'rime_crystal_vein',
    name: '상고 수정맥',
    level: 126,
    baseAttribute: { maxLife: 7_500, def: 260, magicDef: 215 },
    requiredToolTags: [GameTags.TOOL_MINING],
    drops: [
        { itemDataId: 'rime_crystal', weight: 60, minCount: 1, maxCount: 3 },
        { itemDataId: 'frozen_core', weight: 24, minCount: 1, maxCount: 1 },
        { itemDataId: 'aurora_shard', weight: 12, minCount: 1, maxCount: 1 },
        { itemDataId: 'diamond', weight: 4, minCount: 1, maxCount: 1 },
    ],
    expReward: { min: 1_900, max: 2_700 },
    tags: [GameTags.TRAIT_INANIMATE, GameTags.MATERIAL_RIME, GameTags.MATERIAL_DIAMOND, GameTags.PROPERTY_ICE],
});

defineResource({
    id: 'snowmoss_patch',
    name: '눈솔이끼 군락',
    level: 120,
    baseAttribute: { maxLife: 1, def: 9999, magicDef: 9999 },
    requiredToolTags: [], drops: [], expReward: { min: 0, max: 0 },
    interaction: 'harvest_snowmoss', attackable: false,
    interactionCooldown: { min: 35 * 60, max: 55 * 60 },
    tags: [GameTags.TRAIT_INANIMATE, GameTags.MATERIAL_RIME, GameTags.PROPERTY_NATURAL, GameTags.PROPERTY_ICE],
});

defineResource({
    id: 'ice_prism_pedestal',
    name: '백광 분광대',
    level: 138,
    baseAttribute: { maxLife: 1, def: 9999, magicDef: 9999 },
    requiredToolTags: [], drops: [], expReward: { min: 0, max: 0 },
    interaction: 'frostveil_prism_riddle', attackable: false,
    tags: [GameTags.TRAIT_INANIMATE, GameTags.MATERIAL_RIME, GameTags.MATERIAL_GLASS, GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_ICE],
});

defineResource({
    id: 'frostveil_reliquary',
    name: '빙경궁 왕실 유물함',
    level: 145,
    baseAttribute: { maxLife: 1, def: 9999, magicDef: 9999 },
    requiredToolTags: [], drops: [], expReward: { min: 0, max: 0 },
    interaction: 'open_frostveil_reliquary', attackable: false,
    interactionCooldown: { min: 4 * 60 * 60, max: 6 * 60 * 60 },
    tags: [GameTags.RESOURCE_TREASURE, GameTags.TRAIT_INANIMATE, GameTags.MATERIAL_RIME, GameTags.PROPERTY_ICE, GameTags.PROPERTY_LIGHT],
});

defineResource({
    id: 'black_coral_outcrop',
    name: '흑산호 암초',
    level: 162,
    baseAttribute: { maxLife: 11_500, def: 385, magicDef: 335 },
    requiredToolTags: [GameTags.TOOL_MINING],
    drops: [
        { itemDataId: 'black_coral', weight: 58, minCount: 1, maxCount: 3 },
        { itemDataId: 'mist_salt', weight: 24, minCount: 2, maxCount: 5 },
        { itemDataId: 'abyssal_iron', weight: 13, minCount: 1, maxCount: 2 },
        { itemDataId: 'tide_pearl', weight: 5, minCount: 1, maxCount: 1 },
    ],
    expReward: { min: 2_600, max: 3_600 },
    tags: [GameTags.TRAIT_INANIMATE, GameTags.MATERIAL_CORAL, GameTags.PROPERTY_WATER, GameTags.PROPERTY_STONE],
});

defineResource({
    id: 'kelp_resin_patch',
    name: '청해초 군락',
    level: 158,
    baseAttribute: { maxLife: 1, def: 9999, magicDef: 9999 },
    requiredToolTags: [], drops: [], expReward: { min: 0, max: 0 },
    interaction: 'harvest_kelp_resin', attackable: false,
    interactionCooldown: { min: 40 * 60, max: 60 * 60 },
    tags: [GameTags.TRAIT_INANIMATE, GameTags.MATERIAL_CORAL, GameTags.PROPERTY_WATER, GameTags.PROPERTY_NATURAL],
});

defineResource({
    id: 'misttide_clock',
    name: '멈춘 조류시계',
    level: 170,
    baseAttribute: { maxLife: 1, def: 9999, magicDef: 9999 },
    requiredToolTags: [], drops: [], expReward: { min: 0, max: 0 },
    interaction: 'misttide_clock_riddle', attackable: false,
    tags: [GameTags.TRAIT_INANIMATE, GameTags.MATERIAL_CORAL, GameTags.PROPERTY_WATER, GameTags.PROPERTY_METAL],
});

defineResource({
    id: 'misttide_reliquary',
    name: '침몰왕도 항해 유물함',
    level: 178,
    baseAttribute: { maxLife: 1, def: 9999, magicDef: 9999 },
    requiredToolTags: [], drops: [], expReward: { min: 0, max: 0 },
    interaction: 'open_misttide_reliquary', attackable: false,
    interactionCooldown: { min: 5 * 60 * 60, max: 7 * 60 * 60 },
    tags: [GameTags.RESOURCE_TREASURE, GameTags.TRAIT_INANIMATE, GameTags.MATERIAL_CORAL, GameTags.PROPERTY_WATER, GameTags.PROPERTY_UNDEAD],
});

defineResource({
    id: 'oasis_date_palm',
    name: '오아시스 대추야자나무',
    level: 70,
    baseAttribute: { maxLife: 1, def: 9999, magicDef: 9999 },
    requiredToolTags: [],
    drops: [],
    expReward: { min: 0, max: 0 },
    interaction: 'harvest_oasis_palm',
    attackable: false,
    interactionCooldown: { min: 30 * 60, max: 45 * 60 },
    tags: [GameTags.TRAIT_INANIMATE, GameTags.MATERIAL_WOOD, GameTags.PROPERTY_NATURAL],
});

defineResource({
    id: 'silverweb_egg_cluster',
    name: '은빛그물 알주머니',
    level: 18,
    baseAttribute: { maxLife: 240, def: 18, magicDef: 10 },
    requiredToolTags: [],
    drops: [
        { itemDataId: 'silverweb_silk', weight: 72, minCount: 1, maxCount: 2 },
        { itemDataId: 'venom_gland', weight: 28, minCount: 1, maxCount: 1 },
    ],
    expReward: { min: 70, max: 110 },
    tags: [
        GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_INSECT,
        GameTags.PROPERTY_POISON, GameTags.PROPERTY_NATURAL,
    ],
});

for (const cache of [
    { id: 'echo_treasure_chest', name: '메아리 유물함', cooldown: { min: 2 * 60 * 60, max: 3 * 60 * 60 } },
    { id: 'crystal_treasure_chest', name: '공명 수정 보물함', cooldown: { min: 3 * 60 * 60, max: 5 * 60 * 60 } },
] as const) defineResource({
    id: cache.id,
    name: cache.name,
    level: 150,
    baseAttribute: { maxLife: 1, def: 9999, magicDef: 9999 },
    requiredToolTags: [],
    drops: [],
    expReward: { min: 0, max: 0 },
    interaction: 'open_labyrinth_cache',
    attackable: false,
    interactionCooldown: cache.cooldown,
    tags: [GameTags.RESOURCE_TREASURE, GameTags.TRAIT_INANIMATE, GameTags.MATERIAL_IRON],
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

defineResource({
    id: 'enhancement_crystal_vein',
    name: '강화 수정맥',
    level: 185,
    baseAttribute: { maxLife: 14_000, def: 130, magicDef: 230 },
    requiredToolTags: [GameTags.TOOL_MINING],
    drops: [{ itemDataId: 'enhancement_stone', weight: 1, minCount: 1, maxCount: 1 }],
    expReward: { min: 3_400, max: 4_600 },
    tags: [
        GameTags.RESOURCE_ORE,
        GameTags.TRAIT_INANIMATE,
        GameTags.MATERIAL_ENHANCEMENT_STONE,
        GameTags.PROPERTY_EARTH,
    ],
});

defineResource({
    id: 'chronosteel_vein',
    name: '시간강 광맥',
    level: 205,
    baseAttribute: { maxLife: 22_000, def: 285, magicDef: 330 },
    requiredToolTags: [GameTags.TOOL_MINING],
    drops: [
        { itemDataId: 'chronosteel_shard', weight: 58, minCount: 2, maxCount: 5 },
        { itemDataId: 'fracture_crystal', weight: 24, minCount: 1, maxCount: 2 },
        { itemDataId: 'void_spring', weight: 12, minCount: 1, maxCount: 2 },
        { itemDataId: 'logic_core', weight: 6, minCount: 1, maxCount: 1 },
    ],
    expReward: { min: 4_800, max: 6_400 },
    tags: [
        GameTags.RESOURCE_ORE, GameTags.TRAIT_INANIMATE, GameTags.MATERIAL_CLOCKWORK,
        GameTags.PROPERTY_METAL, GameTags.PROPERTY_DARK,
    ],
});

defineResource({
    id: 'memory_coil',
    name: '기억 두루마리 장치',
    level: 205,
    baseAttribute: { maxLife: 1, def: 9999, magicDef: 9999 },
    requiredToolTags: [], drops: [], expReward: { min: 0, max: 0 },
    interaction: 'harvest_memory_coil', attackable: false,
    interactionCooldown: { min: 50 * 60, max: 80 * 60 },
    tags: [GameTags.TRAIT_INANIMATE, GameTags.MATERIAL_CLOCKWORK, GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_METAL],
});

defineResource({
    id: 'causality_console',
    name: '인과율 연산대',
    level: 218,
    baseAttribute: { maxLife: 1, def: 9999, magicDef: 9999 },
    requiredToolTags: [], drops: [], expReward: { min: 0, max: 0 },
    interaction: 'paradox_causality_riddle', attackable: false,
    tags: [GameTags.TRAIT_INANIMATE, GameTags.MATERIAL_CLOCKWORK, GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_DARK],
});

defineResource({
    id: 'prototype_reliquary',
    name: '폐기 시제품 보관고',
    level: 225,
    baseAttribute: { maxLife: 1, def: 9999, magicDef: 9999 },
    requiredToolTags: [], drops: [], expReward: { min: 0, max: 0 },
    interaction: 'open_paradox_reliquary', attackable: false,
    interactionCooldown: { min: 6 * 60 * 60, max: 8 * 60 * 60 },
    tags: [GameTags.RESOURCE_TREASURE, GameTags.TRAIT_INANIMATE, GameTags.MATERIAL_CLOCKWORK, GameTags.PROPERTY_DARK],
});

defineResource({
    id: 'paradox_anchor',
    name: '역설 고정자',
    level: 232,
    baseAttribute: { maxLife: 28_000, def: 360, magicDef: 520 },
    requiredToolTags: [], drops: [], expReward: { min: 5_200, max: 6_800 },
    tags: [GameTags.TRAIT_INANIMATE, GameTags.MATERIAL_CLOCKWORK, GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_DARK],
});

defineResource({
    id: 'night_iron_vein',
    name: '밤쇠 광맥',
    level: 248,
    baseAttribute: { maxLife: 31_000, def: 430, magicDef: 390 },
    requiredToolTags: [GameTags.TOOL_MINING],
    drops: [
        { itemDataId: 'night_iron', weight: 62, minCount: 2, maxCount: 5 },
        { itemDataId: 'blackflame_residue', weight: 22, minCount: 1, maxCount: 3 },
        { itemDataId: 'cursebone_fragment', weight: 11, minCount: 1, maxCount: 2 },
        { itemDataId: 'sovereign_seal_fragment', weight: 5, minCount: 1, maxCount: 1 },
    ],
    expReward: { min: 6_300, max: 8_200 },
    tags: [
        GameTags.RESOURCE_ORE, GameTags.TRAIT_INANIMATE, GameTags.MATERIAL_ASHEN_ABYSS,
        GameTags.PROPERTY_METAL, GameTags.PROPERTY_DARK,
    ],
});

defineResource({
    id: 'ashen_seal_altar',
    name: '재왕 인장 제단',
    level: 258,
    baseAttribute: { maxLife: 1, def: 9999, magicDef: 9999 },
    requiredToolTags: [], drops: [], expReward: { min: 0, max: 0 },
    interaction: 'ashen_seal_riddle', attackable: false,
    tags: [
        GameTags.TRAIT_INANIMATE, GameTags.MATERIAL_ASHEN_ABYSS,
        GameTags.PROPERTY_FIRE, GameTags.PROPERTY_DARK,
    ],
});

defineResource({
    id: 'ashen_reliquary',
    name: '봉인된 잿왕 유물함',
    level: 265,
    baseAttribute: { maxLife: 1, def: 9999, magicDef: 9999 },
    requiredToolTags: [], drops: [], expReward: { min: 0, max: 0 },
    interaction: 'open_ashen_reliquary', attackable: false,
    interactionCooldown: { min: 7 * 60 * 60, max: 10 * 60 * 60 },
    tags: [
        GameTags.RESOURCE_TREASURE, GameTags.TRAIT_INANIMATE, GameTags.MATERIAL_ASHEN_ABYSS,
        GameTags.PROPERTY_DARK, GameTags.PROPERTY_UNDEAD,
    ],
});
