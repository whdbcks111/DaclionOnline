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
        id: 'voidcrown:voidcrown_ration', result: 'voidcrown_ration', time: 6,
        description: '기아덩굴을 여행자 빵에 섞고 별먹으로 밀봉해 무광 행군식을 만듭니다.',
        ingredients: [['starved_vine', 3], ['traveler_bread', 2], ['astral_ink', 1]],
        tags: ['crafting:consumable', 'region:voidcrown'],
    },
    {
        id: 'voidcrown:voidcrown_draught', result: 'voidcrown_draught', time: 8,
        description: '기아덩굴과 왕관유리의 마력 흡수 흐름을 회복약에 안정시킵니다.',
        ingredients: [['starved_vine', 4], ['crown_glass', 2], ['health_potion', 2]],
        tags: ['crafting:consumable', 'region:voidcrown'],
    },
    {
        id: 'voidcrown:nullsilver_greatsword', result: 'nullsilver_greatsword', time: 24,
        description: '무광은을 섭정 인장과 함께 접고 왕관유리로 칼등을 고정해 파성검을 만듭니다.',
        ingredients: [['nullsilver', 14], ['regent_insignia', 4], ['crown_glass', 5]],
        tags: ['crafting:weapon', 'region:voidcrown'],
    },
    {
        id: 'voidcrown:crownstring_longbow', result: 'crownstring_longbow', time: 22,
        description: '공허비단을 여러 겹 꼬아 왕관유리와 무광은 활대에 고정합니다.',
        ingredients: [['void_silk', 12], ['crown_glass', 7], ['nullsilver', 6]],
        tags: ['crafting:weapon', 'region:voidcrown'],
    },
    {
        id: 'voidcrown:voidsilk_stiletto', result: 'voidsilk_stiletto', time: 21,
        description: '무광은 날을 공허비단으로 감고 별먹을 새겨 뒤늦게 나타나는 칼끝을 만듭니다.',
        ingredients: [['nullsilver', 9], ['void_silk', 8], ['astral_ink', 5]],
        tags: ['crafting:weapon', 'region:voidcrown'],
    },
    {
        id: 'voidcrown:starless_scepter', result: 'starless_scepter', time: 25,
        description: '왕관유리에 별먹으로 지운 성좌를 새기고 공허비단으로 마력 회로를 묶습니다.',
        ingredients: [['crown_glass', 10], ['astral_ink', 9], ['void_silk', 7]],
        tags: ['crafting:weapon', 'region:voidcrown'],
    },
    {
        id: 'voidcrown:regent_aegis', result: 'regent_aegis', time: 26,
        description: '무광은 판 사이에 왕관유리와 공허비단을 겹쳐 섭정의 무광방패를 만듭니다.',
        ingredients: [['nullsilver', 16], ['crown_glass', 8], ['void_silk', 8], ['regent_insignia', 4]],
        tags: ['crafting:armor', 'region:voidcrown'],
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
        id: 'eclipse:eclipse_ration', result: 'eclipse_ration', time: 6,
        description: '해구섬유의 속살을 월염수에 절이고 여행자 빵으로 말아 월식 해초말이를 만듭니다.',
        ingredients: [['abyss_fiber', 3], ['moon_brine', 2], ['traveler_bread', 2]],
        tags: ['crafting:consumable', 'region:eclipse-trench'],
    },
    {
        id: 'eclipse:tideheart_tonic', result: 'tideheart_tonic', time: 8,
        description: '밤진주의 마력과 월염수를 비전 영약에 안정시켜 조류심장 영약을 만듭니다.',
        ingredients: [['night_pearl', 3], ['moon_brine', 4], ['arcane_tonic', 2]],
        tags: ['crafting:consumable', 'region:eclipse-trench'],
    },
    {
        id: 'eclipse:drowned_edge', result: 'drowned_edge', time: 26,
        description: '침은의 푸른 결을 월식비늘로 고정하고 조류인장으로 무게 중심을 봉합니다.',
        ingredients: [['drowned_silver', 15], ['eclipse_scale', 7], ['tide_sigil', 4]],
        tags: ['crafting:weapon', 'region:eclipse-trench'],
    },
    {
        id: 'eclipse:mooncurrent_bow', result: 'mooncurrent_bow', time: 24,
        description: '해구섬유를 여러 겹 꼬아 월식비늘 활대와 밤진주 도르래에 연결합니다.',
        ingredients: [['abyss_fiber', 14], ['eclipse_scale', 8], ['night_pearl', 5]],
        tags: ['crafting:weapon', 'region:eclipse-trench'],
    },
    {
        id: 'eclipse:nightpearl_knife', result: 'nightpearl_knife', time: 23,
        description: '침은 단검의 칼등에 밤진주를 박고 월염수로 빛의 흔적을 지웁니다.',
        ingredients: [['drowned_silver', 10], ['night_pearl', 8], ['moon_brine', 6]],
        tags: ['crafting:weapon', 'region:eclipse-trench'],
    },
    {
        id: 'eclipse:eclipse_oracle_staff', result: 'eclipse_oracle_staff', time: 27,
        description: '밤진주와 조류인장을 해구섬유 회로로 묶어 빛과 어둠을 함께 다루는 예언봉을 만듭니다.',
        ingredients: [['night_pearl', 11], ['tide_sigil', 8], ['abyss_fiber', 8]],
        tags: ['crafting:weapon', 'region:eclipse-trench'],
    },
    {
        id: 'eclipse:white_night_bulwark', result: 'white_night_bulwark', time: 28,
        description: '월식비늘과 침은 판 사이에 해구섬유를 겹쳐 충격이 순환하는 조류방패를 만듭니다.',
        ingredients: [['eclipse_scale', 16], ['drowned_silver', 12], ['abyss_fiber', 8], ['tide_sigil', 4]],
        tags: ['crafting:armor', 'region:eclipse-trench'],
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
        id: 'worldroot:worldroot_ration', result: 'worldroot_ration', time: 6,
        description: '천근수피 속살을 태초수액과 함께 구워 오래 보존되는 수피 빵을 만듭니다.',
        ingredients: [['skyroot_bark', 3], ['primal_sap', 2], ['traveler_bread', 2]],
        tags: ['crafting:consumable', 'region:worldroot'],
    },
    {
        id: 'worldroot:primordial_draught', result: 'primordial_draught', time: 9,
        description: '태초수액과 심장씨앗의 맥동을 회복약에 안정시켜 태초맥 영약을 만듭니다.',
        ingredients: [['primal_sap', 5], ['heart_seed', 2], ['health_potion', 2]],
        tags: ['crafting:consumable', 'region:worldroot'],
    },
    {
        id: 'worldroot:rootbone_cleaver', result: 'rootbone_cleaver', time: 28,
        description: '근골철의 결을 천근수피로 고정하고 심장씨앗의 맥동으로 칼날을 깨웁니다.',
        ingredients: [['rootbone_iron', 16], ['skyroot_bark', 8], ['heart_seed', 4]],
        tags: ['crafting:weapon', 'region:worldroot'],
    },
    {
        id: 'worldroot:heartstring_greatbow', result: 'heartstring_greatbow', time: 26,
        description: '천근수피 활대에 심장씨앗과 기억호박을 연결해 맥동하는 활시위를 만듭니다.',
        ingredients: [['skyroot_bark', 15], ['heart_seed', 7], ['memory_amber', 6]],
        tags: ['crafting:weapon', 'region:worldroot'],
    },
    {
        id: 'worldroot:amber_memory_fang', result: 'amber_memory_fang', time: 25,
        description: '근골철 단검에 기억호박을 박고 태초수액으로 사냥의 기억을 고정합니다.',
        ingredients: [['rootbone_iron', 11], ['memory_amber', 9], ['primal_sap', 6]],
        tags: ['crafting:weapon', 'region:worldroot'],
    },
    {
        id: 'worldroot:origin_heart_staff', result: 'origin_heart_staff', time: 29,
        description: '태초수액과 심장씨앗을 기억호박 회로에 순환시켜 기원심장 지팡이를 만듭니다.',
        ingredients: [['primal_sap', 12], ['heart_seed', 9], ['memory_amber', 8]],
        tags: ['crafting:weapon', 'region:worldroot'],
    },
    {
        id: 'worldroot:canopy_heartshield', result: 'canopy_heartshield', time: 30,
        description: '천근수피와 근골철 사이에 태초수액과 심장씨앗을 봉해 충격을 순환시키는 방패를 만듭니다.',
        ingredients: [['skyroot_bark', 16], ['rootbone_iron', 13], ['primal_sap', 8], ['heart_seed', 4]],
        tags: ['crafting:armor', 'region:worldroot'],
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
        id: 'ashen:ashmarch_ration', result: 'ashmarch_ration', time: 5,
        description: '여행자 빵에 잿빛 힘줄의 열기를 스며들게 하고 맑은 물과 함께 밀봉해 재길 행군식을 만듭니다.',
        ingredients: [['ashen_sinew', 2], ['traveler_bread', 2], ['fresh_water', 1]],
        tags: ['crafting:consumable', 'region:ashen-abyss'],
    },
    {
        id: 'ashen:blackflame_ward', result: 'blackflame_ward', time: 7,
        description: '흑염 잔재를 비전 영약에 역류시켜 불꽃의 열을 밀어내는 흑염막이 영약을 만듭니다.',
        ingredients: [['blackflame_residue', 3], ['mourning_eye', 1], ['arcane_tonic', 1]],
        tags: ['crafting:consumable', 'region:ashen-abyss'],
    },
    {
        id: 'ashen:ashblood_elixir', result: 'ashblood_elixir', time: 7,
        description: '잿빛 힘줄과 심연가죽의 생명력을 회복약에 정제해 회혈 영약을 만듭니다.',
        ingredients: [['ashen_sinew', 4], ['abyssal_hide', 2], ['health_potion', 2]],
        tags: ['crafting:consumable', 'region:ashen-abyss'],
    },
    {
        id: 'ashen:sootcleaver_sword', result: 'sootcleaver_sword', time: 21,
        description: '밤쇠를 흑염 잔재와 함께 접고 재왕 인장으로 칼등을 고정해 재가름 장검을 만듭니다.',
        ingredients: [['night_iron', 12], ['blackflame_residue', 6], ['sovereign_seal_fragment', 3]],
        tags: ['crafting:weapon', 'region:ashen-abyss'],
    },
    {
        id: 'ashen:hornstring_bow', result: 'hornstring_bow', time: 20,
        description: '공허뿔을 활대로 다듬고 잿빛 힘줄과 심연가죽을 겹쳐 공허뿔 장궁을 만듭니다.',
        ingredients: [['hollow_horn', 8], ['ashen_sinew', 10], ['abyssal_hide', 5]],
        tags: ['crafting:weapon', 'region:ashen-abyss'],
    },
    {
        id: 'ashen:gloamfang_dagger', result: 'gloamfang_dagger', time: 19,
        description: '밤쇠 단검에 애도의 눈을 박고 저주뼈 가루를 봉해 황혼송곳을 만듭니다.',
        ingredients: [['night_iron', 8], ['mourning_eye', 5], ['cursebone_fragment', 7]],
        tags: ['crafting:weapon', 'region:ashen-abyss'],
    },
    {
        id: 'ashen:blackflame_staff', result: 'blackflame_staff', time: 22,
        description: '공허뿔 내부에 흑염 잔재와 애도의 눈을 배열해 흑염각 지팡이를 만듭니다.',
        ingredients: [['hollow_horn', 7], ['blackflame_residue', 9], ['mourning_eye', 6]],
        tags: ['crafting:weapon', 'region:ashen-abyss'],
    },
    {
        id: 'ashen:ashguard_bulwark', result: 'ashguard_bulwark', time: 23,
        description: '밤쇠 판 사이에 심연가죽과 저주뼈를 겹쳐 재성벽 방패를 만듭니다.',
        ingredients: [['night_iron', 14], ['abyssal_hide', 8], ['cursebone_fragment', 8]],
        tags: ['crafting:armor', 'region:ashen-abyss'],
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
        id: 'paradox:cogwork_ration', result: 'cogwork_ration', time: 5,
        description: '여행자 빵을 얇게 압축하고 기억 톱니의 온도 유지 장치로 밀봉해 태엽 작업식을 만듭니다.',
        ingredients: [['traveler_bread', 2], ['memory_gear', 1], ['mist_salt', 1]],
        tags: ['crafting:consumable', 'region:paradox-clockwork'],
    },
    {
        id: 'paradox:phase_tonic', result: 'phase_tonic', time: 6,
        description: '공허 용수철의 반동을 균열 수정에 가둬 위상 촉진제를 만듭니다.',
        ingredients: [['void_spring', 3], ['fracture_crystal', 2], ['fresh_water', 1]],
        tags: ['crafting:consumable', 'region:paradox-clockwork'],
    },
    {
        id: 'paradox:logic_elixir', result: 'logic_elixir', time: 6,
        description: '논리핵과 광자 렌즈를 비전 영약에 안정시켜 논리회로 영약을 만듭니다.',
        ingredients: [['logic_core', 2], ['photon_lens', 2], ['arcane_tonic', 1]],
        tags: ['crafting:consumable', 'region:paradox-clockwork'],
    },
    {
        id: 'paradox:temporal_salve', result: 'temporal_salve', time: 7,
        description: '역설 실과 균열 수정에 회복약을 스며들게 해 시간봉합 연고를 만듭니다.',
        ingredients: [['paradox_thread', 2], ['fracture_crystal', 2], ['health_potion', 2]],
        tags: ['crafting:consumable', 'region:paradox-clockwork'],
    },
    {
        id: 'paradox:paradox_edge', result: 'paradox_edge', time: 18,
        description: '시간강을 반복해 접고 역설 실로 두 궤적을 묶어 역설절단검을 만듭니다.',
        ingredients: [['chronosteel_shard', 10], ['paradox_thread', 4], ['automaton_plate', 4]],
        tags: ['crafting:weapon', 'region:paradox-clockwork'],
    },
    {
        id: 'paradox:photon_repeater', result: 'photon_repeater', time: 17,
        description: '광자 렌즈와 기억 톱니를 시위의 보조 연산 장치로 엮어 광자연사궁을 만듭니다.',
        ingredients: [['photon_lens', 7], ['memory_gear', 9], ['paradox_thread', 4]],
        tags: ['crafting:weapon', 'region:paradox-clockwork'],
    },
    {
        id: 'paradox:voidspring_dagger', result: 'voidspring_dagger', time: 16,
        description: '시간강 단검 안에 공허 용수철을 압축해 공허태엽 단검을 만듭니다.',
        ingredients: [['chronosteel_shard', 7], ['void_spring', 7], ['fracture_crystal', 3]],
        tags: ['crafting:weapon', 'region:paradox-clockwork'],
    },
    {
        id: 'paradox:logic_core_staff', result: 'logic_core_staff', time: 19,
        description: '논리핵과 광자 렌즈를 시간강 지지대에 배열해 논리핵 지팡이를 만듭니다.',
        ingredients: [['logic_core', 7], ['photon_lens', 6], ['chronosteel_shard', 6]],
        tags: ['crafting:weapon', 'region:paradox-clockwork'],
    },
    {
        id: 'paradox:causality_aegis', result: 'causality_aegis', time: 20,
        description: '자동인형 장갑판 사이에 논리핵과 역설 실을 넣어 인과율 방패를 만듭니다.',
        ingredients: [['automaton_plate', 12], ['logic_core', 5], ['paradox_thread', 5]],
        tags: ['crafting:armor', 'region:paradox-clockwork'],
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
