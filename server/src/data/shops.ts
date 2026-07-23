import { defineShop } from '../models/Shop.js';
import { GameTags } from '../../../shared/tags.js';
import { FishRarity } from '../models/Fishing.js';

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
            label: '전투 강장제',
            create: () => ({ itemDataId: 'battle_tonic', count: 1 }),
            count: 1,
            price: 28,
            stock: 8,
            restockTime: 90,
        },
        {
            label: '비전 영약',
            create: () => ({ itemDataId: 'arcane_tonic', count: 1 }),
            count: 1,
            price: 28,
            stock: 8,
            restockTime: 90,
        },
        {
            label: '신속의 물약',
            create: () => ({ itemDataId: 'swift_tonic', count: 1 }),
            count: 1,
            price: 32,
            stock: 6,
            restockTime: 120,
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
        {
            label: '견습 마법 지팡이',
            create: () => ({ itemDataId: 'apprentice_staff', count: 1 }),
            count: 1,
            stock: 2,
            price: 55,
            restockTime: 180,
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
        {
            label: '견습 마법 지팡이',
            filter: (item) => item.itemDataId === 'apprentice_staff',
            count: 1,
            price: 25,
        },
    ],
    tags: [GameTags.SHOP_GENERAL],
});

defineShop({
    id: 'fishing_store',
    buyList: [
        {
            label: '초보자 낚싯대',
            create: () => ({ itemDataId: 'beginner_fishing_rod', count: 1 }),
            count: 1,
            price: 45,
            stock: 5,
            restockTime: 120,
        },
        {
            label: '정교한 낚싯대',
            create: () => ({ itemDataId: 'refined_fishing_rod', count: 1 }),
            count: 1,
            price: 650,
            stock: 2,
            restockTime: 600,
        },
        {
            label: '통통한 지렁이 미끼 10개',
            create: () => ({ itemDataId: 'earthworm_bait', count: 10 }),
            count: 10,
            price: 12,
            stock: 30,
            restockTime: 30,
        },
    ],
    sellList: [
        { label: '낚시 도구', filter: item => item.hasTag(GameTags.TOOL_FISHING), count: 1, price: 20 },
        { label: '미끼', filter: item => item.hasTag(GameTags.ITEM_BAIT), count: 99, price: 1 },
        { label: '일반 물고기', filter: item => item.hasTag(GameTags.FISH_RARITY_COMMON), count: 99, price: FishRarity.COMMON.sellPrice },
        { label: '고급 물고기', filter: item => item.hasTag(GameTags.FISH_RARITY_UNCOMMON), count: 99, price: FishRarity.UNCOMMON.sellPrice },
        { label: '희귀 물고기', filter: item => item.hasTag(GameTags.FISH_RARITY_RARE), count: 99, price: FishRarity.RARE.sellPrice },
        { label: '서사 물고기', filter: item => item.hasTag(GameTags.FISH_RARITY_EPIC), count: 99, price: FishRarity.EPIC.sellPrice },
        { label: '전설 물고기', filter: item => item.hasTag(GameTags.FISH_RARITY_LEGENDARY), count: 99, price: FishRarity.LEGENDARY.sellPrice },
        { label: '신화 물고기', filter: item => item.hasTag(GameTags.FISH_RARITY_MYTHIC), count: 99, price: FishRarity.MYTHIC.sellPrice },
    ],
    tags: [GameTags.SHOP_FISHING],
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

defineShop({
    id: 'silverweb_hunter_store',
    buyList: [
        {
            label: '은빛그물 사냥활',
            create: () => ({ itemDataId: 'silverweb_hunter_bow', count: 1 }),
            count: 1,
            price: 180,
            stock: 3,
            restockTime: 240,
        },
        {
            label: '화살 20개',
            create: () => ({ itemDataId: 'wooden_arrow', count: 20 }),
            count: 20,
            price: 18,
            stock: 20,
            restockTime: 30,
        },
        {
            label: '은이파리 해독제',
            create: () => ({ itemDataId: 'forest_antidote', count: 1 }),
            count: 1,
            price: 24,
            stock: 12,
            restockTime: 75,
        },
    ],
    sellList: [
        { label: '적갈색 늑대 가죽', filter: item => item.itemDataId === 'wolf_pelt', count: 99, price: 8 },
        { label: '은빛 거미실', filter: item => item.itemDataId === 'silverweb_silk', count: 99, price: 11 },
        { label: '자빛 독샘', filter: item => item.itemDataId === 'venom_gland', count: 99, price: 18 },
        { label: '활', filter: item => item.hasTag(GameTags.WEAPON_BOW), count: 1, price: 45 },
    ],
    tags: [GameTags.SHOP_HUNTER],
});

defineShop({
    id: 'twilight_memorial_store',
    buyList: [
        {
            label: '묘지기 향약',
            create: () => ({ itemDataId: 'graveward_tonic', count: 1 }),
            count: 1,
            price: 38,
            stock: 12,
            restockTime: 90,
        },
        {
            label: '화살 20개',
            create: () => ({ itemDataId: 'wooden_arrow', count: 20 }),
            count: 20,
            price: 20,
            stock: 18,
            restockTime: 35,
        },
        {
            label: '맹세철 장검',
            create: () => ({ itemDataId: 'oathiron_sword', count: 1 }),
            count: 1,
            price: 280,
            stock: 2,
            restockTime: 480,
        },
        {
            label: '진혼 시위',
            create: () => ({ itemDataId: 'requiem_bow', count: 1 }),
            count: 1,
            price: 270,
            stock: 2,
            restockTime: 480,
        },
        {
            label: '애도목 지팡이',
            create: () => ({ itemDataId: 'mourning_staff', count: 1 }),
            count: 1,
            price: 300,
            stock: 2,
            restockTime: 480,
        },
        {
            label: '묘문 수호방패',
            create: () => ({ itemDataId: 'gravekeeper_shield', count: 1 }),
            count: 1,
            price: 290,
            stock: 2,
            restockTime: 480,
        },
    ],
    sellList: [
        { label: '풍화된 뼛조각', filter: item => item.itemDataId === 'weathered_bone', count: 99, price: 4 },
        { label: '묘지기 천', filter: item => item.itemDataId === 'gravecloth', count: 99, price: 7 },
        { label: '깨진 맹세 휘장', filter: item => item.itemDataId === 'broken_oath_badge', count: 99, price: 16 },
        { label: '애도의 백합', filter: item => item.itemDataId === 'mourning_lily', count: 99, price: 13 },
        { label: '혼불 조각', filter: item => item.itemDataId === 'soul_ember', count: 99, price: 22 },
    ],
    tags: [GameTags.SHOP_GENERAL],
});

defineShop({
    id: 'glassdune_caravan_store',
    buyList: [
        {
            label: '오아시스 대추야자',
            create: () => ({ itemDataId: 'oasis_date', count: 1 }),
            count: 1, price: 42, stock: 24, restockTime: 45,
        },
        {
            label: '그늘 수통',
            create: () => ({ itemDataId: 'shade_canteen', count: 1 }),
            count: 1, price: 58, stock: 20, restockTime: 55,
        },
        {
            label: '은이파리 해독제',
            create: () => ({ itemDataId: 'forest_antidote', count: 1 }),
            count: 1, price: 65, stock: 12, restockTime: 90,
        },
        {
            label: '화살 30개',
            create: () => ({ itemDataId: 'wooden_arrow', count: 30 }),
            count: 30, price: 45, stock: 20, restockTime: 35,
        },
        ...[
            ['모래맥 파검', 'dunebreaker_sword', 2_900],
            ['태양사 장궁', 'sunwire_bow', 2_850],
            ['신기루 독아', 'mirage_fang_dagger', 3_050],
            ['태양유리 지팡이', 'helioglass_staff', 3_150],
            ['태양거울 방패', 'sunmirror_shield', 3_000],
        ].map(([label, itemDataId, price]) => ({
            label: label as string,
            create: () => ({ itemDataId: itemDataId as string, count: 1 }),
            count: 1,
            price: price as number,
            stock: 1,
            restockTime: 900,
        })),
    ],
    sellList: [
        { label: '유리모래', filter: item => item.itemDataId === 'glass_sand', count: 99, price: 12 },
        { label: '황금갑 성충갑', filter: item => item.itemDataId === 'sunscarab_shell', count: 99, price: 28 },
        { label: '모래전갈 독수', filter: item => item.itemDataId === 'dune_scorpion_venom', count: 99, price: 42 },
        { label: '신기루 수정', filter: item => item.itemDataId === 'mirage_crystal', count: 99, price: 75 },
        { label: '태양 문양 파편', filter: item => item.itemDataId === 'sun_glyph_fragment', count: 99, price: 110 },
    ],
    tags: [GameTags.SHOP_CARAVAN],
});

defineShop({
    id: 'frostveil_outpost_store',
    buyList: [
        {
            label: '설원 행군식', create: () => ({ itemDataId: 'winter_trail_ration', count: 1 }),
            count: 1, price: 76, stock: 24, restockTime: 50,
        },
        {
            label: '상고막이 영약', create: () => ({ itemDataId: 'frostward_tonic', count: 1 }),
            count: 1, price: 125, stock: 14, restockTime: 100,
        },
        {
            label: '극광 회복약', create: () => ({ itemDataId: 'aurora_recovery_draught', count: 1 }),
            count: 1, price: 160, stock: 10, restockTime: 120,
        },
        {
            label: '화살 50개', create: () => ({ itemDataId: 'wooden_arrow', count: 50 }),
            count: 50, price: 95, stock: 20, restockTime: 40,
        },
        ...[
            ['빙맥 절단검', 'rimecleaver_sword', 5_500],
            ['빙실 연궁', 'icesilk_longbow', 5_350],
            ['경빙 송곳니', 'mirrorfang_dagger', 5_650],
            ['극광분광 지팡이', 'auroraprism_staff', 5_900],
            ['빙경 성벽방패', 'frostglass_bulwark', 5_700],
        ].map(([label, itemDataId, price]) => ({
            label: label as string,
            create: () => ({ itemDataId: itemDataId as string, count: 1 }),
            count: 1,
            price: price as number,
            stock: 1,
            restockTime: 1_200,
        })),
    ],
    sellList: [
        { label: '상고 수정', filter: item => item.itemDataId === 'rime_crystal', count: 99, price: 72 },
        { label: '서리늑대 가죽', filter: item => item.itemDataId === 'frostwolf_hide', count: 99, price: 44 },
        { label: '빙실 거미줄', filter: item => item.itemDataId === 'ice_silk', count: 99, price: 58 },
        { label: '경철 파편', filter: item => item.itemDataId === 'mirrorsteel_fragment', count: 99, price: 96 },
        { label: '극광 파편', filter: item => item.itemDataId === 'aurora_shard', count: 99, price: 145 },
        { label: '빙결 핵', filter: item => item.itemDataId === 'frozen_core', count: 99, price: 118 },
        { label: '눈솔이끼', filter: item => item.itemDataId === 'snowmoss', count: 99, price: 35 },
    ],
    tags: [GameTags.SHOP_FROST],
});

defineShop({
    id: 'misttide_harbor_store',
    buyList: [
        {
            label: '염풍 행군식', create: () => ({ itemDataId: 'brine_trail_ration', count: 1 }),
            count: 1, price: 115, stock: 24, restockTime: 50,
        },
        {
            label: '해포말 영약', create: () => ({ itemDataId: 'seafoam_tonic', count: 1 }),
            count: 1, price: 185, stock: 14, restockTime: 100,
        },
        {
            label: '조류심장 회복약', create: () => ({ itemDataId: 'tideheart_draught', count: 1 }),
            count: 1, price: 240, stock: 10, restockTime: 130,
        },
        {
            label: '화살 60개', create: () => ({ itemDataId: 'wooden_arrow', count: 60 }),
            count: 60, price: 130, stock: 20, restockTime: 40,
        },
        ...[
            ['파식 조류검', 'tidebreaker_sword', 8_100],
            ['해무 조류궁', 'mistcurrent_bow', 7_900],
            ['흑산호 침', 'blackcoral_sting', 8_250],
            ['심해진주 지팡이', 'deeppearl_staff', 8_500],
            ['침몰제독 방패', 'drowned_admiral_shield', 8_350],
        ].map(([label, itemDataId, price]) => ({
            label: label as string,
            create: () => ({ itemDataId: itemDataId as string, count: 1 }),
            count: 1,
            price: price as number,
            stock: 1,
            restockTime: 1_500,
        })),
    ],
    sellList: [
        { label: '해무 소금', filter: item => item.itemDataId === 'mist_salt', count: 99, price: 52 },
        { label: '흑산호', filter: item => item.itemDataId === 'black_coral', count: 99, price: 88 },
        { label: '해무비늘', filter: item => item.itemDataId === 'siren_scale', count: 99, price: 112 },
        { label: '조류진주', filter: item => item.itemDataId === 'tide_pearl', count: 99, price: 180 },
        { label: '침수 군단 휘장', filter: item => item.itemDataId === 'drowned_insignia', count: 99, price: 128 },
        { label: '심해철', filter: item => item.itemDataId === 'abyssal_iron', count: 99, price: 148 },
        { label: '청해초 수지', filter: item => item.itemDataId === 'kelp_resin', count: 99, price: 70 },
        { label: '해수룡 골편', filter: item => item.itemDataId === 'leviathan_bone', count: 99, price: 205 },
    ],
    tags: [GameTags.SHOP_TIDAL],
});

defineShop({
    id: 'paradox_relay_store',
    buyList: [
        {
            label: '태엽 작업식', create: () => ({ itemDataId: 'cogwork_ration', count: 1 }),
            count: 1, price: 165, stock: 24, restockTime: 50,
        },
        {
            label: '위상 촉진제', create: () => ({ itemDataId: 'phase_tonic', count: 1 }),
            count: 1, price: 260, stock: 12, restockTime: 110,
        },
        {
            label: '논리회로 영약', create: () => ({ itemDataId: 'logic_elixir', count: 1 }),
            count: 1, price: 275, stock: 12, restockTime: 110,
        },
        {
            label: '시간봉합 연고', create: () => ({ itemDataId: 'temporal_salve', count: 1 }),
            count: 1, price: 295, stock: 10, restockTime: 130,
        },
        {
            label: '화살 80개', create: () => ({ itemDataId: 'wooden_arrow', count: 80 }),
            count: 80, price: 185, stock: 20, restockTime: 40,
        },
        ...[
            ['역설절단검', 'paradox_edge', 12_600],
            ['광자연사궁', 'photon_repeater', 12_300],
            ['공허태엽 단검', 'voidspring_dagger', 12_750],
            ['논리핵 지팡이', 'logic_core_staff', 13_100],
            ['인과율 방패', 'causality_aegis', 12_900],
        ].map(([label, itemDataId, price]) => ({
            label: label as string,
            create: () => ({ itemDataId: itemDataId as string, count: 1 }),
            count: 1,
            price: price as number,
            stock: 1,
            restockTime: 1_800,
        })),
    ],
    sellList: [
        { label: '시간강 파편', filter: item => item.itemDataId === 'chronosteel_shard', count: 99, price: 175 },
        { label: '기억 톱니', filter: item => item.itemDataId === 'memory_gear', count: 99, price: 125 },
        { label: '광자 렌즈', filter: item => item.itemDataId === 'photon_lens', count: 99, price: 205 },
        { label: '공허 용수철', filter: item => item.itemDataId === 'void_spring', count: 99, price: 220 },
        { label: '논리핵', filter: item => item.itemDataId === 'logic_core', count: 99, price: 295 },
        { label: '역설 실', filter: item => item.itemDataId === 'paradox_thread', count: 99, price: 340 },
        { label: '자동인형 장갑판', filter: item => item.itemDataId === 'automaton_plate', count: 99, price: 155 },
        { label: '균열 수정', filter: item => item.itemDataId === 'fracture_crystal', count: 99, price: 275 },
        { label: '기록고 열쇠 파편', filter: item => item.itemDataId === 'archive_key_fragment', count: 99, price: 245 },
    ],
    tags: [GameTags.SHOP_CLOCKWORK],
});

defineShop({
    id: 'ashen_waystation_store',
    buyList: [
        {
            label: '재길 행군식', create: () => ({ itemDataId: 'ashmarch_ration', count: 1 }),
            count: 1, price: 220, stock: 24, restockTime: 50,
        },
        {
            label: '흑염막이 영약', create: () => ({ itemDataId: 'blackflame_ward', count: 1 }),
            count: 1, price: 350, stock: 12, restockTime: 110,
        },
        {
            label: '회혈 영약', create: () => ({ itemDataId: 'ashblood_elixir', count: 1 }),
            count: 1, price: 390, stock: 10, restockTime: 130,
        },
        {
            label: '화살 100개', create: () => ({ itemDataId: 'wooden_arrow', count: 100 }),
            count: 100, price: 260, stock: 20, restockTime: 40,
        },
        ...[
            ['재가름 장검', 'sootcleaver_sword', 18_300],
            ['공허뿔 장궁', 'hornstring_bow', 17_900],
            ['황혼송곳', 'gloamfang_dagger', 18_550],
            ['흑염각 지팡이', 'blackflame_staff', 19_100],
            ['재성벽 방패', 'ashguard_bulwark', 18_800],
        ].map(([label, itemDataId, price]) => ({
            label: label as string,
            create: () => ({ itemDataId: itemDataId as string, count: 1 }),
            count: 1,
            price: price as number,
            stock: 1,
            restockTime: 2_100,
        })),
    ],
    sellList: [
        { label: '잿빛 힘줄', filter: item => item.itemDataId === 'ashen_sinew', count: 99, price: 210 },
        { label: '흑염 잔재', filter: item => item.itemDataId === 'blackflame_residue', count: 99, price: 275 },
        { label: '공허뿔', filter: item => item.itemDataId === 'hollow_horn', count: 99, price: 330 },
        { label: '저주뼈 파편', filter: item => item.itemDataId === 'cursebone_fragment', count: 99, price: 245 },
        { label: '밤쇠', filter: item => item.itemDataId === 'night_iron', count: 99, price: 360 },
        { label: '재왕 인장 파편', filter: item => item.itemDataId === 'sovereign_seal_fragment', count: 99, price: 490 },
        { label: '심연가죽', filter: item => item.itemDataId === 'abyssal_hide', count: 99, price: 295 },
        { label: '애도의 눈', filter: item => item.itemDataId === 'mourning_eye', count: 99, price: 420 },
    ],
    tags: [GameTags.SHOP_ASHEN_ABYSS],
});

defineShop({
    id: 'voidcrown_waystation_store',
    buyList: [
        {
            label: '무광 행군식', create: () => ({ itemDataId: 'voidcrown_ration', count: 1 }),
            count: 1, price: 285, stock: 24, restockTime: 50,
        },
        {
            label: '공허맥 회복약', create: () => ({ itemDataId: 'voidcrown_draught', count: 1 }),
            count: 1, price: 480, stock: 12, restockTime: 120,
        },
        {
            label: '화살 120개', create: () => ({ itemDataId: 'wooden_arrow', count: 120 }),
            count: 120, price: 330, stock: 20, restockTime: 40,
        },
        ...[
            ['무광은 파성검', 'nullsilver_greatsword', 27_800],
            ['왕관현 장궁', 'crownstring_longbow', 27_200],
            ['공허비단 침', 'voidsilk_stiletto', 28_100],
            ['무성좌 지팡이', 'starless_scepter', 29_000],
            ['섭정의 무광방패', 'regent_aegis', 28_500],
        ].map(([label, itemDataId, price]) => ({
            label: label as string,
            create: () => ({ itemDataId: itemDataId as string, count: 1 }),
            count: 1,
            price: price as number,
            stock: 1,
            restockTime: 2_400,
        })),
    ],
    sellList: [
        { label: '무광은', filter: item => item.itemDataId === 'nullsilver', count: 99, price: 470 },
        { label: '왕관유리', filter: item => item.itemDataId === 'crown_glass', count: 99, price: 530 },
        { label: '공허비단', filter: item => item.itemDataId === 'void_silk', count: 99, price: 455 },
        { label: '기아덩굴', filter: item => item.itemDataId === 'starved_vine', count: 99, price: 390 },
        { label: '별먹', filter: item => item.itemDataId === 'astral_ink', count: 99, price: 560 },
        { label: '섭정 인장', filter: item => item.itemDataId === 'regent_insignia', count: 99, price: 680 },
    ],
    tags: [GameTags.SHOP_VOIDCROWN],
});

defineShop({
    id: 'eclipse_dock_store',
    buyList: [
        {
            label: '월식 해초말이', create: () => ({ itemDataId: 'eclipse_ration', count: 1 }),
            count: 1, price: 340, stock: 24, restockTime: 50,
        },
        {
            label: '조류심장 영약', create: () => ({ itemDataId: 'tideheart_tonic', count: 1 }),
            count: 1, price: 560, stock: 12, restockTime: 120,
        },
        {
            label: '화살 140개', create: () => ({ itemDataId: 'wooden_arrow', count: 140 }),
            count: 140, price: 410, stock: 20, restockTime: 40,
        },
        ...[
            ['침은 파도검', 'drowned_edge', 36_800],
            ['월조류 장궁', 'mooncurrent_bow', 36_100],
            ['밤진주 잠행도', 'nightpearl_knife', 37_200],
            ['월식 예언봉', 'eclipse_oracle_staff', 38_300],
            ['백야 조류방패', 'white_night_bulwark', 37_600],
        ].map(([label, itemDataId, price]) => ({
            label: label as string,
            create: () => ({ itemDataId: itemDataId as string, count: 1 }),
            count: 1,
            price: price as number,
            stock: 1,
            restockTime: 2_700,
        })),
    ],
    sellList: [
        { label: '월염수', filter: item => item.itemDataId === 'moon_brine', count: 99, price: 590 },
        { label: '월식비늘', filter: item => item.itemDataId === 'eclipse_scale', count: 99, price: 660 },
        { label: '침은', filter: item => item.itemDataId === 'drowned_silver', count: 99, price: 620 },
        { label: '밤진주', filter: item => item.itemDataId === 'night_pearl', count: 99, price: 730 },
        { label: '해구섬유', filter: item => item.itemDataId === 'abyss_fiber', count: 99, price: 540 },
        { label: '조류인장', filter: item => item.itemDataId === 'tide_sigil', count: 99, price: 850 },
    ],
    tags: [GameTags.SHOP_ECLIPSE_TRENCH],
});

defineShop({
    id: 'worldroot_waystation_store',
    buyList: [
        {
            label: '천근수피 빵', create: () => ({ itemDataId: 'worldroot_ration', count: 1 }),
            count: 1, price: 410, stock: 24, restockTime: 50,
        },
        {
            label: '태초맥 영약', create: () => ({ itemDataId: 'primordial_draught', count: 1 }),
            count: 1, price: 680, stock: 12, restockTime: 120,
        },
        {
            label: '화살 160개', create: () => ({ itemDataId: 'wooden_arrow', count: 160 }),
            count: 160, price: 500, stock: 20, restockTime: 40,
        },
        ...[
            ['근골철 수맥검', 'rootbone_cleaver', 47_500],
            ['심장현 대궁', 'heartstring_greatbow', 46_700],
            ['기억호박 송곳니', 'amber_memory_fang', 48_000],
            ['기원심장 지팡이', 'origin_heart_staff', 49_500],
            ['천개심 방패', 'canopy_heartshield', 48_700],
        ].map(([label, itemDataId, price]) => ({
            label: label as string,
            create: () => ({ itemDataId: itemDataId as string, count: 1 }),
            count: 1,
            price: price as number,
            stock: 1,
            restockTime: 3_000,
        })),
    ],
    sellList: [
        { label: '천근수피', filter: item => item.itemDataId === 'skyroot_bark', count: 99, price: 720 },
        { label: '태초수액', filter: item => item.itemDataId === 'primal_sap', count: 99, price: 810 },
        { label: '기억호박', filter: item => item.itemDataId === 'memory_amber', count: 99, price: 890 },
        { label: '망각포자', filter: item => item.itemDataId === 'rot_spore', count: 99, price: 670 },
        { label: '심장씨앗', filter: item => item.itemDataId === 'heart_seed', count: 99, price: 1_050 },
        { label: '근골철', filter: item => item.itemDataId === 'rootbone_iron', count: 99, price: 780 },
    ],
    tags: [GameTags.SHOP_WORLDROOT],
});
