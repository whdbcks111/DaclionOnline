import { FishRarity } from '../models/Fishing.js';

export interface FishCatalogEntry {
    readonly id: string
    readonly name: string
    readonly description: string
    readonly weight: number
    readonly rarity: FishRarity
}

/** 아이템 정의와 낚시 보상 registry가 함께 사용하는 물고기 단일 원본. */
const fishCatalog: readonly FishCatalogEntry[] = Object.freeze([
    { id: 'silver_minnow', name: '은빛 피라미', description: '연못에서 흔히 잡히는 작고 반짝이는 물고기.', weight: 0.3, rarity: FishRarity.COMMON },
    { id: 'pond_carp', name: '연못 잉어', description: '루미나르 연못 바닥을 느긋하게 헤엄치는 잉어.', weight: 1.2, rarity: FishRarity.COMMON },
    { id: 'reed_guppy', name: '갈대 구피', description: '갈대 뿌리 사이를 무리 지어 오가는 작은 물고기.', weight: 0.2, rarity: FishRarity.COMMON },
    { id: 'spotted_mudfish', name: '점박이 미꾸리', description: '진흙 바닥에 몸을 숨기는 점박이 민물고기.', weight: 0.5, rarity: FishRarity.COMMON },
    { id: 'glass_shrimp', name: '유리 새우', description: '몸이 맑아 물속 풍경이 비칠 듯한 작은 새우.', weight: 0.15, rarity: FishRarity.COMMON },
    { id: 'creek_perch', name: '개울 농어', description: '얕은 물살을 거슬러 오르는 튼튼한 농어.', weight: 0.9, rarity: FishRarity.COMMON },

    { id: 'bluefin_dace', name: '푸른지느러미 황어', description: '푸른 지느러미가 선명한 고급 어종.', weight: 0.8, rarity: FishRarity.UNCOMMON },
    { id: 'sunscale_bream', name: '햇비늘 도미', description: '햇빛을 받으면 황금빛 비늘이 번쩍인다.', weight: 1.0, rarity: FishRarity.UNCOMMON },
    { id: 'jade_tetra', name: '비취 테트라', description: '매끈한 비취색 비늘을 가진 민첩한 물고기.', weight: 0.35, rarity: FishRarity.UNCOMMON },
    { id: 'emberfin_smelt', name: '불씨빙어', description: '붉은 지느러미 끝이 불씨처럼 은은하게 빛난다.', weight: 0.45, rarity: FishRarity.UNCOMMON },
    { id: 'cloud_loach', name: '구름 미꾸리', description: '구름 같은 흰 무늬가 몸을 따라 흐르는 미꾸리.', weight: 0.7, rarity: FishRarity.UNCOMMON },
    { id: 'striped_pike', name: '줄무늬 창꼬치', description: '날렵한 몸과 선명한 세로줄을 지닌 사냥꾼.', weight: 1.4, rarity: FishRarity.UNCOMMON },

    { id: 'mist_eel', name: '안개 장어', description: '물안개 속에서 재빠르게 방향을 바꾸는 희귀 장어.', weight: 1.5, rarity: FishRarity.RARE },
    { id: 'thunder_catfish', name: '뇌광 메기', description: '수염 끝에서 푸른 전광을 튀기는 거대한 메기.', weight: 3.2, rarity: FishRarity.RARE },
    { id: 'frostscale_trout', name: '서리비늘 송어', description: '차가운 서리가 내려앉은 듯한 비늘을 가졌다.', weight: 1.8, rarity: FishRarity.RARE },
    { id: 'ruby_lionfish', name: '루비 쏠배감펭', description: '루비색 가시지느러미를 우아하게 펼치는 물고기.', weight: 1.1, rarity: FishRarity.RARE },
    { id: 'shadow_piranha', name: '그림자 피라냐', description: '어두운 물속에서 붉은 눈만 번뜩이는 포식자.', weight: 0.9, rarity: FishRarity.RARE },
    { id: 'lotus_ray', name: '연꽃 가오리', description: '연꽃잎을 닮은 지느러미로 수면 아래를 미끄러진다.', weight: 4.0, rarity: FishRarity.RARE },

    { id: 'crystal_salmon', name: '수정 연어', description: '수정처럼 맑은 비늘을 지닌 서사 등급 연어.', weight: 2.2, rarity: FishRarity.EPIC },
    { id: 'aurora_marlin', name: '오로라 청새치', description: '긴 주둥이와 오로라빛 등지느러미를 가진 청새치.', weight: 6.5, rarity: FishRarity.EPIC },
    { id: 'obsidian_tuna', name: '흑요 참치', description: '흑요석처럼 검고 단단한 비늘로 덮인 참치.', weight: 7.2, rarity: FishRarity.EPIC },
    { id: 'storm_manta', name: '폭풍 만타', description: '폭풍구름 무늬의 날개로 거친 물살을 가른다.', weight: 9.0, rarity: FishRarity.EPIC },
    { id: 'prism_seahorse', name: '프리즘 해마', description: '빛의 각도마다 일곱 색으로 변하는 작은 해마.', weight: 0.4, rarity: FishRarity.EPIC },
    { id: 'coral_seadragon', name: '산호 해룡', description: '화려한 산호 가지처럼 위장하는 신비한 해룡.', weight: 1.3, rarity: FishRarity.EPIC },

    { id: 'golden_koi', name: '황금 비단잉어', description: '행운을 부른다고 전해지는 전설의 황금 잉어.', weight: 2.8, rarity: FishRarity.LEGENDARY },
    { id: 'dawn_whale_shark', name: '여명 고래상어', description: '여명빛 반점이 밤하늘처럼 펼쳐진 온순한 거어.', weight: 18.0, rarity: FishRarity.LEGENDARY },
    { id: 'celestial_swordfish', name: '천공 황새치', description: '별빛 창 같은 주둥이로 물결을 꿰뚫는 황새치.', weight: 8.5, rarity: FishRarity.LEGENDARY },
    { id: 'void_angler', name: '심연 초롱아귀', description: '공허를 품은 등불로 먹잇감을 유혹하는 심해어.', weight: 5.5, rarity: FishRarity.LEGENDARY },
    { id: 'phoenix_fin', name: '불사조 지느러미어', description: '불꽃처럼 나부끼는 지느러미가 꺼지지 않는 물고기.', weight: 3.6, rarity: FishRarity.LEGENDARY },
    { id: 'royal_pearl_ray', name: '왕실 진주가오리', description: '왕관 같은 진주 무늬를 등에 두른 거대한 가오리.', weight: 12.0, rarity: FishRarity.LEGENDARY },

    { id: 'moonlight_sturgeon', name: '월광 철갑상어', description: '달빛을 머금은 비늘로 밤을 밝히는 신화의 물고기.', weight: 4.5, rarity: FishRarity.MYTHIC },
    { id: 'starfall_leviathan', name: '별내림 레비아탄', description: '유성우와 함께 수면에 나타난다는 어린 레비아탄.', weight: 24.0, rarity: FishRarity.MYTHIC },
    { id: 'timeglass_coelacanth', name: '시간유리 실러캔스', description: '비늘 사이로 오래된 시간의 모래가 흐르는 고대어.', weight: 6.8, rarity: FishRarity.MYTHIC },
    { id: 'eclipse_moonfish', name: '일식 월어', description: '검은 원반 둘레에 태양빛 테두리가 타오르는 월어.', weight: 5.0, rarity: FishRarity.MYTHIC },
    { id: 'worldroot_turtle', name: '세계수 거북', description: '등껍질 위에 작은 세계수의 뿌리가 자라는 신령한 거북.', weight: 30.0, rarity: FishRarity.MYTHIC },
    { id: 'dragon_tide_oarfish', name: '용조류 산갈치', description: '용의 갈기 같은 지느러미로 거대한 조류를 일으킨다.', weight: 14.0, rarity: FishRarity.MYTHIC },
]);

export function getFishCatalog(): readonly FishCatalogEntry[] {
    return fishCatalog;
}
