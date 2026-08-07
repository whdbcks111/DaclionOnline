import { GameTags } from '../../../../shared/tags.js';
import type { TagId } from '../../../../shared/tags.js';

export interface FishingEquipmentTier {
    readonly level: number;
    readonly locationId: string;
    readonly shopId: string;
    readonly cacheResourceId: string;
    readonly rod: {
        readonly id: string;
        readonly name: string;
        readonly description: string;
        readonly price: number;
        readonly durability: number;
        readonly luck: number;
        readonly biteSpeed: number;
        readonly netSize: number;
        readonly netSpeed: number;
        readonly gaugeStart: number;
        readonly tags: readonly TagId[];
    };
    readonly bait: {
        readonly id: string;
        readonly name: string;
        readonly description: string;
        readonly price: number;
        readonly luck: number;
        readonly biteSpeed: number;
        readonly gaugeStart: number;
        readonly tags: readonly TagId[];
    };
}

/**
 * 단계별 낚시터·장비·상점·보급상자가 함께 사용하는 단일 원본.
 * price는 낚싯대 1개와 미끼 20개 묶음의 상점 가격이다.
 */
export const FISHING_EQUIPMENT_TIERS: readonly FishingEquipmentTier[] = Object.freeze([
    {
        level: 70, locationId: 'glassdune_hidden_oasis',
        shopId: 'glassdune_fishing_store', cacheResourceId: 'glassdune_angler_supply_cache',
        rod: {
            id: 'mirage_reed_fishing_rod', name: '신기루갈대 낚싯대',
            description: '유리모래 오아시스의 단단한 갈대를 엮은 입문용 사막 낚싯대.',
            price: 3_000, durability: 520, luck: 5, biteSpeed: 0.35,
            netSize: 12, netSpeed: 20, gaugeStart: 0.11,
            tags: [GameTags.MATERIAL_WOOD, GameTags.PROPERTY_NATURAL],
        },
        bait: {
            id: 'sun_date_dough_bait', name: '태양대추 반죽미끼',
            description: '향이 짙은 오아시스 대추야자를 반죽한 Lv.70 낚시터용 미끼.',
            price: 80, luck: 5, biteSpeed: 0.45, gaugeStart: 0.01,
            tags: [GameTags.PROPERTY_NATURAL, GameTags.PROPERTY_LIGHT],
        },
    },
    {
        level: 150, locationId: 'misttide_kelp_inlet',
        shopId: 'misttide_fishing_store', cacheResourceId: 'misttide_angler_supply_cache',
        rod: {
            id: 'kelp_braid_fishing_rod', name: '청해초 합사 낚싯대',
            description: '질긴 청해초 섬유를 여러 겹 꼬아 거친 해안 물살에 맞춘 낚싯대.',
            price: 8_000, durability: 680, luck: 7, biteSpeed: 0.45,
            netSize: 14, netSpeed: 24, gaugeStart: 0.12,
            tags: [GameTags.MATERIAL_WOOD, GameTags.PROPERTY_WATER],
        },
        bait: {
            id: 'kelp_shrimp_bait', name: '청해초 새우미끼',
            description: '해초 향을 밴 작은 새우를 염장한 Lv.150 낚시터용 미끼.',
            price: 200, luck: 7, biteSpeed: 0.55, gaugeStart: 0.02,
            tags: [GameTags.PROPERTY_NATURAL, GameTags.PROPERTY_WATER],
        },
    },
    {
        level: 200, locationId: 'paradox_scrap_reservoir',
        shopId: 'paradox_fishing_store', cacheResourceId: 'paradox_angler_supply_cache',
        rod: {
            id: 'kairos_reel_fishing_rod', name: '카이로스 자동릴 낚싯대',
            description: '톱니 릴이 장력을 자동 조절하는 공방도시식 정밀 낚싯대.',
            price: 15_000, durability: 850, luck: 9, biteSpeed: 0.55,
            netSize: 16, netSpeed: 28, gaugeStart: 0.13,
            tags: [GameTags.MATERIAL_IRON, GameTags.PROPERTY_ELECTRIC],
        },
        bait: {
            id: 'clockwork_glimmer_bait', name: '태엽 반짝미끼',
            description: '미세한 태엽 진동과 반사광으로 잔해호 물고기를 유인하는 Lv.200 미끼.',
            price: 400, luck: 9, biteSpeed: 0.7, gaugeStart: 0.025,
            tags: [GameTags.PROPERTY_METAL, GameTags.PROPERTY_ELECTRIC],
        },
    },
    {
        level: 310, locationId: 'eclipse_luminous_reef',
        shopId: 'eclipse_fishing_store', cacheResourceId: 'eclipse_angler_supply_cache',
        rod: {
            id: 'mooncurrent_coral_fishing_rod', name: '월조류 산호 낚싯대',
            description: '달빛 산호가 조류의 방향을 감지해 손끝에 전하는 해구 낚싯대.',
            price: 40_000, durability: 1_050, luck: 12, biteSpeed: 0.7,
            netSize: 18, netSpeed: 32, gaugeStart: 0.14,
            tags: [GameTags.MATERIAL_CORAL, GameTags.PROPERTY_WATER],
        },
        bait: {
            id: 'moonbrine_pearl_bait', name: '월염수 진주미끼',
            description: '해구 진주가루와 월염수를 굳힌 Lv.310 낚시터용 미끼.',
            price: 900, luck: 12, biteSpeed: 0.85, gaugeStart: 0.03,
            tags: [GameTags.MATERIAL_CORAL, GameTags.PROPERTY_WATER],
        },
    },
    {
        level: 460, locationId: 'endstar_silent_sun',
        shopId: 'endstar_fishing_store', cacheResourceId: 'endstar_angler_supply_cache',
        rod: {
            id: 'duskenstar_fishing_rod', name: '저문별 성사 낚싯대',
            description: '사라지는 별의 실을 감아 성단 호수의 무거운 물결을 견디는 낚싯대.',
            price: 100_000, durability: 1_300, luck: 15, biteSpeed: 0.85,
            netSize: 20, netSpeed: 36, gaugeStart: 0.15,
            tags: [GameTags.MATERIAL_IRON, GameTags.PROPERTY_LIGHT],
        },
        bait: {
            id: 'ashstar_crumb_bait', name: '잿별 부스러기미끼',
            description: '저문 별빛의 잔재를 잘게 뭉친 Lv.460 낚시터용 미끼.',
            price: 2_000, luck: 15, biteSpeed: 1, gaugeStart: 0.035,
            tags: [GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_DARK],
        },
    },
    {
        level: 575, locationId: 'abyssglass_pressure_lagoon',
        shopId: 'abyssglass_fishing_store', cacheResourceId: 'abyssglass_angler_supply_cache',
        rod: {
            id: 'abyssglass_pressure_fishing_rod', name: '심해유리 압력 낚싯대',
            description: '심해유리 관절이 수압에 맞춰 휘어지는 네레이아식 낚싯대.',
            price: 220_000, durability: 1_600, luck: 18, biteSpeed: 1,
            netSize: 20, netSpeed: 38, gaugeStart: 0.16,
            tags: [GameTags.MATERIAL_GLASS, GameTags.PROPERTY_WATER],
        },
        bait: {
            id: 'pressure_pearl_bait', name: '압해 진주미끼',
            description: '깊은 수압에서만 퍼지는 진주 향을 봉인한 Lv.575 미끼.',
            price: 4_000, luck: 18, biteSpeed: 1.15, gaugeStart: 0.04,
            tags: [GameTags.MATERIAL_GLASS, GameTags.PROPERTY_WATER],
        },
    },
    {
        level: 625, locationId: 'dreamarchive_inkwater_pool',
        shopId: 'dreamarchive_fishing_store', cacheResourceId: 'dreamarchive_angler_supply_cache',
        rod: {
            id: 'dreamscript_fishing_rod', name: '몽각 잉크 낚싯대',
            description: '꿈의 문장을 새긴 몽각지가 물고기의 기억을 따라 휘어지는 낚싯대.',
            price: 350_000, durability: 1_850, luck: 21, biteSpeed: 1.15,
            netSize: 20, netSpeed: 40, gaugeStart: 0.17,
            tags: [GameTags.MATERIAL_WOOD, GameTags.PROPERTY_DARK],
        },
        bait: {
            id: 'dream_ink_bait', name: '꿈먹물 미끼',
            description: '먹빛 꿈을 천천히 흘려 잉크연못 어종을 부르는 Lv.625 미끼.',
            price: 6_000, luck: 21, biteSpeed: 1.3, gaugeStart: 0.045,
            tags: [GameTags.PROPERTY_DARK, GameTags.PROPERTY_NATURAL],
        },
    },
    {
        level: 725, locationId: 'rustworld_mercury_reservoir',
        shopId: 'rustworld_fishing_store', cacheResourceId: 'rustworld_angler_supply_cache',
        rod: {
            id: 'rediron_mercury_fishing_rod', name: '적철 수은 낚싯대',
            description: '적철 골격과 액체금속 릴이 거대한 저수지 어종의 몸부림을 흡수한다.',
            price: 600_000, durability: 2_100, luck: 24, biteSpeed: 1.3,
            netSize: 20, netSpeed: 42, gaugeStart: 0.18,
            tags: [GameTags.MATERIAL_IRON, GameTags.PROPERTY_METAL],
        },
        bait: {
            id: 'mercury_cricket_bait', name: '수은빛 귀뚜라미미끼',
            description: '금속성 파문을 내는 Lv.725 낚시터용 인조 귀뚜라미.',
            price: 9_000, luck: 24, biteSpeed: 1.45, gaugeStart: 0.05,
            tags: [GameTags.PROPERTY_METAL, GameTags.PROPERTY_ELECTRIC],
        },
    },
    {
        level: 875, locationId: 'silentdivine_prayer_spring',
        shopId: 'silentdivine_fishing_store', cacheResourceId: 'silentdivine_angler_supply_cache',
        rod: {
            id: 'silentprayer_fishing_rod', name: '무언성목 기도 낚싯대',
            description: '고요한 성목이 물결 아래의 기척을 기도처럼 전하는 낚싯대.',
            price: 1_100_000, durability: 2_400, luck: 27, biteSpeed: 1.45,
            netSize: 20, netSpeed: 44, gaugeStart: 0.2,
            tags: [GameTags.MATERIAL_WOOD, GameTags.PROPERTY_HOLY],
        },
        bait: {
            id: 'prayer_lotus_bait', name: '기도연꽃 미끼',
            description: '성수에서 피어난 연꽃 향을 농축한 Lv.875 낚시터용 미끼.',
            price: 15_000, luck: 27, biteSpeed: 1.6, gaugeStart: 0.06,
            tags: [GameTags.PROPERTY_NATURAL, GameTags.PROPERTY_HOLY],
        },
    },
    {
        level: 975, locationId: 'originboundary_genesis_tide',
        shopId: 'originboundary_fishing_store', cacheResourceId: 'originboundary_angler_supply_cache',
        rod: {
            id: 'genesis_crystal_fishing_rod', name: '기원결정 낚싯대',
            description: '최초의 물결을 기억하는 결정으로 빚어 창세 어종을 붙드는 낚싯대.',
            price: 1_800_000, durability: 2_800, luck: 30, biteSpeed: 1.7,
            netSize: 20, netSpeed: 46, gaugeStart: 0.22,
            tags: [GameTags.MATERIAL_GLASS, GameTags.PROPERTY_LIGHT],
        },
        bait: {
            id: 'genesis_light_bait', name: '창세빛 미끼',
            description: '빛과 어둠이 갈리기 전의 잔광을 품은 Lv.975 낚시터용 미끼.',
            price: 25_000, luck: 30, biteSpeed: 1.8, gaugeStart: 0.08,
            tags: [GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_DARK],
        },
    },
]);

export function getFishingEquipmentTierByLocation(locationId: string): FishingEquipmentTier | undefined {
    return FISHING_EQUIPMENT_TIERS.find(tier => tier.locationId === locationId);
}

export function getFishingEquipmentTierByCache(resourceDataId: string): FishingEquipmentTier | undefined {
    return FISHING_EQUIPMENT_TIERS.find(tier => tier.cacheResourceId === resourceDataId);
}
