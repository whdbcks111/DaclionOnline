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
