import { CraftingRecipeIngredient, defineCraftingRecipe } from '../models/Crafting.js';
import { getItemData } from '../models/Item.js';

defineCraftingRecipe({
    id: 'basic:iron_pickaxe',
    resultItemDataId: 'iron_pickaxe',
    aliases: ['철곡괭이'],
    description: '철과 돌을 다듬어 기본 곡괭이보다 튼튼한 철 곡괭이를 제작합니다.',
    ingredients: [
        CraftingRecipeIngredient.item('iron_ore', 3),
        CraftingRecipeIngredient.item('stone', 2),
    ],
    craftTime: 4,
    create: ({ quantity }) => ({
        itemDataId: 'iron_pickaxe',
        count: quantity,
        durability: getItemData('iron_pickaxe')?.baseDurability ?? null,
        metadataDelta: null,
        tags: [],
    }),
    tags: ['crafting:tool', 'crafting:mining'],
});

for (const recipe of [
    {
        id: 'twilight:graveward_tonic', result: 'graveward_tonic', time: 3,
        description: '애도의 백합과 혼불을 맑은 물에 안정시켜 묘지기 향약을 만듭니다.',
        ingredients: [['mourning_lily', 2], ['soul_ember', 1], ['fresh_water', 1]],
        tags: ['crafting:consumable', 'region:twilight-tombs'],
    },
    {
        id: 'twilight:oathiron_sword', result: 'oathiron_sword', time: 8,
        description: '깨진 기사 휘장과 제련된 철을 다시 접어 맹세철 장검을 만듭니다.',
        ingredients: [['broken_oath_badge', 4], ['refined_iron', 2]],
        tags: ['crafting:weapon', 'region:twilight-tombs'],
    },
    {
        id: 'twilight:requiem_bow', result: 'requiem_bow', time: 7,
        description: '묘지기 천과 은빛 거미실로 소리를 죽인 진혼 시위를 만듭니다.',
        ingredients: [['gravecloth', 4], ['silverweb_silk', 2]],
        tags: ['crafting:weapon', 'region:twilight-tombs'],
    },
    {
        id: 'twilight:mourning_staff', result: 'mourning_staff', time: 8,
        description: '애도의 백합과 혼불을 제련된 금에 묶어 애도목 지팡이를 만듭니다.',
        ingredients: [['mourning_lily', 3], ['soul_ember', 2], ['refined_gold', 1]],
        tags: ['crafting:weapon', 'region:twilight-tombs'],
    },
    {
        id: 'twilight:gravekeeper_shield', result: 'gravekeeper_shield', time: 9,
        description: '맹세 휘장과 뼛조각을 제련된 철로 고정해 묘문 수호방패를 만듭니다.',
        ingredients: [['broken_oath_badge', 3], ['weathered_bone', 4], ['refined_iron', 2]],
        tags: ['crafting:armor', 'region:twilight-tombs'],
    },
] as const) {
    defineCraftingRecipe({
        id: recipe.id,
        resultItemDataId: recipe.result,
        description: recipe.description,
        ingredients: recipe.ingredients.map(([itemDataId, count]) => CraftingRecipeIngredient.item(itemDataId, count)),
        craftTime: recipe.time,
        create: ({ quantity }) => ({
            itemDataId: recipe.result,
            count: quantity,
            durability: getItemData(recipe.result)?.baseDurability ?? null,
            metadataDelta: null,
            tags: [],
        }),
        tags: recipe.tags,
    });
}

for (const recipe of [
    {
        id: 'glassdune:shade_canteen', result: 'shade_canteen', time: 3,
        description: '유리모래로 수통 안감을 만들고 맑은 물을 담아 사막용 음료를 만듭니다.',
        ingredients: [['glass_sand', 2], ['fresh_water', 1]],
        tags: ['crafting:consumable', 'region:glassdune'],
    },
    {
        id: 'glassdune:dunebreaker_sword', result: 'dunebreaker_sword', time: 10,
        description: '제련된 철 사이에 유리모래를 접어 넣어 모래맥 파검을 만듭니다.',
        ingredients: [['glass_sand', 8], ['refined_iron', 4], ['sun_glyph_fragment', 1]],
        tags: ['crafting:weapon', 'region:glassdune'],
    },
    {
        id: 'glassdune:sunwire_bow', result: 'sunwire_bow', time: 9,
        description: '황금갑 성충갑을 가는 섬유로 풀어 화살의 비행을 잡는 태양사 장궁을 만듭니다.',
        ingredients: [['sunscarab_shell', 6], ['silverweb_silk', 3], ['refined_gold', 2]],
        tags: ['crafting:weapon', 'region:glassdune'],
    },
    {
        id: 'glassdune:mirage_fang_dagger', result: 'mirage_fang_dagger', time: 9,
        description: '신기루 수정을 단검 형태로 깨고 전갈 독을 결정 사이에 봉합니다.',
        ingredients: [['mirage_crystal', 3], ['dune_scorpion_venom', 4], ['refined_iron', 2]],
        tags: ['crafting:weapon', 'region:glassdune'],
    },
    {
        id: 'glassdune:helioglass_staff', result: 'helioglass_staff', time: 11,
        description: '신기루 수정과 태양 문양을 결합해 마력 굴절경을 가진 지팡이를 만듭니다.',
        ingredients: [['mirage_crystal', 4], ['sun_glyph_fragment', 3], ['refined_gold', 2]],
        tags: ['crafting:weapon', 'region:glassdune'],
    },
    {
        id: 'glassdune:sunmirror_shield', result: 'sunmirror_shield', time: 12,
        description: '성충갑과 태양 문양을 유리모래 판 위에 고정해 태양거울 방패를 만듭니다.',
        ingredients: [['sunscarab_shell', 5], ['glass_sand', 7], ['sun_glyph_fragment', 2]],
        tags: ['crafting:armor', 'region:glassdune'],
    },
] as const) defineCraftingRecipe({
    id: recipe.id,
    resultItemDataId: recipe.result,
    description: recipe.description,
    ingredients: recipe.ingredients.map(([itemDataId, count]) => CraftingRecipeIngredient.item(itemDataId, count)),
    craftTime: recipe.time,
    create: ({ quantity }) => ({
        itemDataId: recipe.result,
        count: quantity,
        durability: getItemData(recipe.result)?.baseDurability ?? null,
        metadataDelta: null,
        tags: [],
    }),
    tags: recipe.tags,
});

for (const recipe of [
    {
        id: 'misttide:brine_trail_ration', result: 'brine_trail_ration', time: 4,
        description: '여행자 빵과 말린 식재료에 해무 소금을 더해 오래 보관되는 염풍 행군식을 만듭니다.',
        ingredients: [['mist_salt', 3], ['traveler_bread', 1], ['fresh_water', 1]],
        tags: ['crafting:consumable', 'region:misttide'],
    },
    {
        id: 'misttide:seafoam_tonic', result: 'seafoam_tonic', time: 5,
        description: '해무 소금과 청해초 수지를 정신력 물약에 안정시켜 해포말 영약을 만듭니다.',
        ingredients: [['mist_salt', 3], ['kelp_resin', 3], ['mana_potion', 1]],
        tags: ['crafting:consumable', 'region:misttide'],
    },
    {
        id: 'misttide:tideheart_draught', result: 'tideheart_draught', time: 6,
        description: '조류진주의 박동을 청해초 수지로 붙잡아 조류심장 회복약을 만듭니다.',
        ingredients: [['tide_pearl', 2], ['kelp_resin', 4], ['health_potion', 1]],
        tags: ['crafting:consumable', 'region:misttide'],
    },
    {
        id: 'misttide:tidebreaker_sword', result: 'tidebreaker_sword', time: 14,
        description: '심해철과 침수 군단 휘장을 겹쳐 파도를 가르는 파식 조류검을 만듭니다.',
        ingredients: [['abyssal_iron', 8], ['drowned_insignia', 5], ['black_coral', 4]],
        tags: ['crafting:weapon', 'region:misttide'],
    },
    {
        id: 'misttide:mistcurrent_bow', result: 'mistcurrent_bow', time: 13,
        description: '해무비늘을 청해초 수지로 겹쳐 화살의 흔들림을 지우는 해무 조류궁을 만듭니다.',
        ingredients: [['siren_scale', 7], ['kelp_resin', 6], ['tide_pearl', 3]],
        tags: ['crafting:weapon', 'region:misttide'],
    },
    {
        id: 'misttide:blackcoral_sting', result: 'blackcoral_sting', time: 12,
        description: '흑산호를 얇은 날로 갈아 심해철 자루에 고정해 흑산호 침을 만듭니다.',
        ingredients: [['black_coral', 9], ['abyssal_iron', 4], ['kelp_resin', 3]],
        tags: ['crafting:weapon', 'region:misttide'],
    },
    {
        id: 'misttide:deeppearl_staff', result: 'deeppearl_staff', time: 15,
        description: '조류진주와 해수룡 골편을 결합해 심해의 마력을 압축하는 지팡이를 만듭니다.',
        ingredients: [['tide_pearl', 7], ['leviathan_bone', 5], ['siren_scale', 5]],
        tags: ['crafting:weapon', 'region:misttide'],
    },
    {
        id: 'misttide:drowned_admiral_shield', result: 'drowned_admiral_shield', time: 16,
        description: '해수룡 골편과 심해철을 침수 군단 휘장으로 묶어 침몰제독 방패를 만듭니다.',
        ingredients: [['leviathan_bone', 8], ['abyssal_iron', 9], ['drowned_insignia', 7]],
        tags: ['crafting:armor', 'region:misttide'],
    },
] as const) defineCraftingRecipe({
    id: recipe.id,
    resultItemDataId: recipe.result,
    description: recipe.description,
    ingredients: recipe.ingredients.map(([itemDataId, count]) => CraftingRecipeIngredient.item(itemDataId, count)),
    craftTime: recipe.time,
    create: ({ quantity }) => ({
        itemDataId: recipe.result,
        count: quantity,
        durability: getItemData(recipe.result)?.baseDurability ?? null,
        metadataDelta: null,
        tags: [],
    }),
    tags: recipe.tags,
});

for (const recipe of [
    {
        id: 'frostveil:frostward_tonic', result: 'frostward_tonic', time: 4,
        description: '눈솔이끼와 상고 수정을 맑은 물에 달여 상고막이 영약을 만듭니다.',
        ingredients: [['snowmoss', 3], ['rime_crystal', 1], ['fresh_water', 1]],
        tags: ['crafting:consumable', 'region:frostveil'],
    },
    {
        id: 'frostveil:aurora_recovery_draught', result: 'aurora_recovery_draught', time: 5,
        description: '극광 파편과 눈솔이끼의 흐름을 안정시켜 극광 회복약을 만듭니다.',
        ingredients: [['aurora_shard', 2], ['snowmoss', 3], ['mana_potion', 1]],
        tags: ['crafting:consumable', 'region:frostveil'],
    },
    {
        id: 'frostveil:rimecleaver_sword', result: 'rimecleaver_sword', time: 12,
        description: '경철과 제련된 철 사이에 상고 수정을 접어 넣어 빙맥 절단검을 만듭니다.',
        ingredients: [['mirrorsteel_fragment', 6], ['rime_crystal', 5], ['refined_iron', 4]],
        tags: ['crafting:weapon', 'region:frostveil'],
    },
    {
        id: 'frostveil:icesilk_longbow', result: 'icesilk_longbow', time: 11,
        description: '빙실 거미줄과 서리늑대 가죽을 겹쳐 빠르고 안정적인 빙실 연궁을 만듭니다.',
        ingredients: [['ice_silk', 7], ['frostwolf_hide', 4], ['rime_crystal', 3]],
        tags: ['crafting:weapon', 'region:frostveil'],
    },
    {
        id: 'frostveil:mirrorfang_dagger', result: 'mirrorfang_dagger', time: 10,
        description: '경철 파편을 얇게 갈아 상고 수정의 냉기를 품은 경빙 송곳니를 만듭니다.',
        ingredients: [['mirrorsteel_fragment', 5], ['rime_crystal', 4], ['frozen_core', 2]],
        tags: ['crafting:weapon', 'region:frostveil'],
    },
    {
        id: 'frostveil:auroraprism_staff', result: 'auroraprism_staff', time: 13,
        description: '극광 파편을 상고 수정 프리즘에 고정해 극광분광 지팡이를 만듭니다.',
        ingredients: [['aurora_shard', 6], ['rime_crystal', 5], ['refined_gold', 3]],
        tags: ['crafting:weapon', 'region:frostveil'],
    },
    {
        id: 'frostveil:frostglass_bulwark', result: 'frostglass_bulwark', time: 14,
        description: '경철판과 빙결 핵을 포개어 깨져도 다시 얼어붙는 빙경 성벽방패를 만듭니다.',
        ingredients: [['mirrorsteel_fragment', 8], ['frozen_core', 4], ['rime_crystal', 5]],
        tags: ['crafting:armor', 'region:frostveil'],
    },
] as const) defineCraftingRecipe({
    id: recipe.id,
    resultItemDataId: recipe.result,
    description: recipe.description,
    ingredients: recipe.ingredients.map(([itemDataId, count]) => CraftingRecipeIngredient.item(itemDataId, count)),
    craftTime: recipe.time,
    create: ({ quantity }) => ({
        itemDataId: recipe.result,
        count: quantity,
        durability: getItemData(recipe.result)?.baseDurability ?? null,
        metadataDelta: null,
        tags: [],
    }),
    tags: recipe.tags,
});
