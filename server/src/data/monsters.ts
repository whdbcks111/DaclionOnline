// 공격 부가효과 ID를 등록 시점에 검증하므로 레지스트리를 먼저 초기화한다.
import './statusEffects.js';
import { defineMonster } from '../models/Monster.js';
import type { MonsterData } from '../models/Monster.js';
import { GameTags } from '../../../shared/tags.js';
import { MonsterAiDisposition } from '../models/Threat.js';

type WorldMonsterData = Omit<MonsterData, 'exp' | 'expReward' | 'equipments'>
    & Partial<Pick<MonsterData, 'expReward' | 'equipments'>>;

/** 동급 몬스터 한 마리의 기준 보상은 level * 20 EXP다. */
function defineWorldMonster(data: WorldMonsterData): void {
    defineMonster({
        ...data,
        ai: data.ai ?? (data.tags.includes(GameTags.ENTITY_SLIME) ? {
            intelligence: 5,
            disposition: MonsterAiDisposition.LAST_ATTACKER,
            weights: { attack: 1, damage: 1, healing: 0, shielding: 0, control: 0.1, taunt: 1 },
            tauntResistance: 0,
            switchThreshold: 0,
        } : undefined),
        exp: 0,
        expReward: data.expReward ?? data.level * 20,
        equipments: data.equipments ?? [],
    });
}

defineWorldMonster({
    id: 'slime',
    name: '슬라임',
    description: '물기와 독성을 함께 머금은 가장 기초적인 슬라임.',
    level: 1,
    baseAttribute: { maxLife: 30, atk: 8, def: 1, speed: 0.7 },
    drops: [{ itemDataId: 'health_potion', minCount: 1, maxCount: 1, chance: 0.18 }],
    goldReward: { min: 1, max: 4 },
    tags: [GameTags.ENTITY_SLIME, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_WATER, GameTags.PROPERTY_POISON],
});

defineWorldMonster({
    id: 'grass_slime',
    name: '풀잎 슬라임',
    description: '초원의 식생을 흡수해 자연의 기운을 띠는 슬라임.',
    level: 4,
    baseAttribute: { maxLife: 70, atk: 15, def: 3, magicDef: 2, speed: 0.9 },
    drops: [{ itemDataId: 'health_potion', minCount: 1, maxCount: 1, chance: 0.22 }],
    goldReward: { min: 4, max: 10 },
    tags: [GameTags.ENTITY_SLIME, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_NATURAL, GameTags.PROPERTY_POISON],
});

defineWorldMonster({
    id: 'cave_slime',
    name: '동굴 슬라임',
    description: '어두운 갱도에 적응해 단단한 표면을 가진 슬라임.',
    level: 6,
    baseAttribute: { maxLife: 105, atk: 20, def: 7, speed: 0.75 },
    drops: [
        { itemDataId: 'coal', minCount: 1, maxCount: 2, chance: 0.2 },
        { itemDataId: 'mana_potion', minCount: 1, maxCount: 1, chance: 0.12 },
    ],
    goldReward: { min: 6, max: 14 },
    tags: [GameTags.ENTITY_SLIME, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_WATER, GameTags.PROPERTY_POISON],
});

defineWorldMonster({
    id: 'purple_slime',
    name: '퍼플 슬라임',
    description: '맹독을 농축해 마법 공격에 실어 보내는 보랏빛 슬라임.',
    level: 8,
    baseAttribute: { maxLife: 135, atk: 24, magicForce: 22, def: 6, magicDef: 8, speed: 1 },
    drops: [{ itemDataId: 'mana_potion', minCount: 1, maxCount: 1, chance: 0.25 }],
    goldReward: { min: 8, max: 18 },
    attack: {
        damageType: 'magic',
        effect: { statusEffectId: 'deadly_poison', chance: 0.18, duration: 6, level: 1 },
    },
    tags: [GameTags.ENTITY_SLIME, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_POISON],
});

defineWorldMonster({
    id: 'spring_slime',
    name: '샘물 슬라임',
    description: '맑은 샘물을 머금어 마법 저항이 높은 슬라임.',
    level: 11,
    baseAttribute: { maxLife: 180, atk: 29, magicForce: 30, def: 9, magicDef: 14, speed: 1.2 },
    drops: [
        { itemDataId: 'health_potion', minCount: 1, maxCount: 2, chance: 0.2 },
        { itemDataId: 'mana_potion', minCount: 1, maxCount: 2, chance: 0.2 },
    ],
    goldReward: { min: 12, max: 24 },
    attack: { damageType: 'magic' },
    tags: [GameTags.ENTITY_SLIME, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_WATER, GameTags.PROPERTY_POISON],
});

defineWorldMonster({
    id: 'stone_golem',
    name: '갱도 암석지기',
    description: '갱도의 암석이 뭉쳐 움직이는 느리고 단단한 수호체.',
    level: 12,
    baseAttribute: { maxLife: 260, atk: 38, def: 22, magicDef: 6, speed: 0.55 },
    drops: [
        { itemDataId: 'stone', minCount: 2, maxCount: 4, chance: 0.7 },
        { itemDataId: 'old_shield', minCount: 1, maxCount: 1, chance: 0.05 },
    ],
    goldReward: { min: 14, max: 28 },
    tags: [GameTags.ENTITY_ELEMENTAL, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_NATURAL, GameTags.MATERIAL_STONE],
});

defineWorldMonster({
    id: 'silverweb_briar_wolf',
    name: '가시털 늑대',
    description: '은빛그물 숲의 얕은 가시덩굴 사이를 무리 지어 달리는 사냥짐승.',
    level: 7,
    baseAttribute: { maxLife: 120, atk: 24, def: 7, magicDef: 4, speed: 1.55, attackSpeed: 1.08 },
    drops: [{ itemDataId: 'wolf_pelt', minCount: 1, maxCount: 1, chance: 0.42 }],
    goldReward: { min: 8, max: 17 },
    tags: [GameTags.ENTITY_BEAST, GameTags.PROPERTY_NATURAL],
});

defineWorldMonster({
    id: 'silverweb_spider',
    name: '은실 숲거미',
    description: '은은한 실을 사이에 늘어뜨려 행인의 발을 묶는 숲거미.',
    level: 10,
    baseAttribute: { maxLife: 175, atk: 31, def: 10, magicDef: 12, speed: 1.7, attackSpeed: 1.12 },
    drops: [
        { itemDataId: 'silverweb_silk', minCount: 1, maxCount: 2, chance: 0.48 },
        { itemDataId: 'venom_gland', minCount: 1, maxCount: 1, chance: 0.12 },
    ],
    goldReward: { min: 12, max: 23 },
    attack: { effect: { statusEffectId: 'poison', chance: 0.12, duration: 6, level: 1 } },
    tags: [GameTags.ENTITY_BEAST, GameTags.PROPERTY_INSECT, GameTags.PROPERTY_NATURAL],
});

defineWorldMonster({
    id: 'red_mane_wolf',
    name: '적갈기 늑대',
    description: '숨을 죽인 후 옆구리를 파고드는 붉은 갈기의 숲 포식자.',
    level: 12,
    baseAttribute: { maxLife: 235, atk: 39, def: 13, magicDef: 9, speed: 1.95, attackSpeed: 1.18, critRate: 0.07 },
    drops: [{ itemDataId: 'wolf_pelt', minCount: 1, maxCount: 2, chance: 0.58 }],
    goldReward: { min: 17, max: 31 },
    attack: { effect: { statusEffectId: 'bleeding', chance: 0.16, duration: 7, level: 1 } },
    tags: [GameTags.ENTITY_BEAST, GameTags.PROPERTY_NATURAL],
});

defineWorldMonster({
    id: 'red_mane_wolf_king',
    name: '적갈기 늑대왕',
    description: '상처 날 일이 많은 앞발과 짧은 포효로 무리의 사냥을 지휘하는 은빛그물 숲의 필드 보스.',
    level: 15,
    baseAttribute: {
        maxLife: 1_650, atk: 58, def: 24, magicDef: 18, armorPen: 5,
        speed: 2.15, attackSpeed: 0.78, critRate: 0.1, critDmg: 1.65,
    },
    expReward: 15 * 20 * 5,
    drops: [
        { itemDataId: 'wolf_pelt', minCount: 2, maxCount: 4, chance: 0.85 },
        { itemDataId: 'silverweb_hunter_bow', minCount: 1, maxCount: 1, chance: 0.04 },
        { itemDataId: 'predator_pounce_skillbook', minCount: 1, maxCount: 1, chance: 0.035 },
    ],
    goldReward: { min: 65, max: 105 },
    attack: { effect: { statusEffectId: 'bleeding', chance: 0.25, duration: 8, level: 2 } },
    skills: [{ skillDataId: 'red_mane_pounce', level: 2 }],
    skillPattern: { sequence: ['red_mane_pounce'], initialDelay: 4, interval: { min: 8, max: 11 } },
    ai: {
        intelligence: 28, disposition: MonsterAiDisposition.THREAT,
        weights: { attack: 0.8, damage: 1, healing: 0.2, shielding: 0.2, control: 0.5, taunt: 0.8 },
        tauntResistance: 0.12, switchThreshold: 0.06,
    },
    tags: [GameTags.ENTITY_BOSS, GameTags.ENTITY_BEAST, GameTags.PROPERTY_NATURAL],
});

defineWorldMonster({
    id: 'venom_web_spinner',
    name: '독그물 짜기',
    description: '자빛 독액을 실에 발라 먼저 움직임을 둔화시키는 성체 숲거미.',
    level: 17,
    baseAttribute: { maxLife: 315, atk: 49, magicForce: 45, def: 18, magicDef: 24, speed: 1.65 },
    drops: [
        { itemDataId: 'silverweb_silk', minCount: 1, maxCount: 3, chance: 0.55 },
        { itemDataId: 'venom_gland', minCount: 1, maxCount: 2, chance: 0.28 },
    ],
    goldReward: { min: 24, max: 43 },
    attack: {
        damageType: 'magic',
        effect: { statusEffectId: 'paralytic_poison', chance: 0.16, duration: 4, level: 1 },
    },
    tags: [GameTags.ENTITY_BEAST, GameTags.PROPERTY_INSECT, GameTags.PROPERTY_POISON],
});

defineWorldMonster({
    id: 'silverweb_matriarch',
    name: '은백 어미거미',
    description: '유충을 지키며 두터운 거미줄과 맹독을 함께 쏟아내는 어미거미.',
    level: 21,
    baseAttribute: { maxLife: 455, atk: 61, magicForce: 63, def: 28, magicDef: 34, speed: 1.45 },
    drops: [
        { itemDataId: 'silverweb_silk', minCount: 2, maxCount: 4, chance: 0.62 },
        { itemDataId: 'venom_gland', minCount: 1, maxCount: 2, chance: 0.4 },
    ],
    goldReward: { min: 32, max: 57 },
    attack: {
        damageType: 'magic',
        effect: { statusEffectId: 'deadly_poison', chance: 0.2, duration: 7, level: 2 },
    },
    tags: [GameTags.ENTITY_BEAST, GameTags.PROPERTY_INSECT, GameTags.PROPERTY_POISON],
});

defineWorldMonster({
    id: 'silverweb_spider_queen',
    name: '은빛그물 거미여왕',
    description: '숲 아래 독그물을 확장해 온 지배자. 알주머니가 남아 있는 동안 거미실이 피해를 흡수한다.',
    level: 24,
    baseAttribute: {
        maxLife: 3_450, atk: 76, magicForce: 82, def: 40, magicDef: 48,
        magicPen: 7, speed: 1.7, attackSpeed: 0.72, critRate: 0.08, critDmg: 1.6,
    },
    expReward: 24 * 20 * 5,
    drops: [
        { itemDataId: 'silverweb_silk', minCount: 4, maxCount: 7, chance: 0.9 },
        { itemDataId: 'venom_gland', minCount: 2, maxCount: 4, chance: 0.7 },
        { itemDataId: 'venom_dagger', minCount: 1, maxCount: 1, chance: 0.035 },
        { itemDataId: 'silverweb_snare_skillbook', minCount: 1, maxCount: 1, chance: 0.03 },
    ],
    goldReward: { min: 95, max: 155 },
    attack: {
        damageType: 'magic',
        effect: { statusEffectId: 'deadly_poison', chance: 0.3, duration: 9, level: 3 },
    },
    skills: [
        { skillDataId: 'silverweb_bind', level: 2 },
        { skillDataId: 'brood_venom', level: 2 },
    ],
    skillPattern: {
        sequence: ['silverweb_bind', 'brood_venom'], randomOrder: true,
        initialDelay: 4, interval: { min: 7, max: 10 },
    },
    ai: {
        intelligence: 72, disposition: MonsterAiDisposition.THREAT,
        weights: { attack: 0.35, damage: 1, healing: 1.2, shielding: 0.9, control: 1.3, taunt: 1.7 },
        tauntResistance: 0.52, switchThreshold: 0.16,
    },
    tags: [
        GameTags.ENTITY_BOSS, GameTags.ENTITY_BEAST,
        GameTags.PROPERTY_INSECT, GameTags.PROPERTY_POISON, GameTags.PROPERTY_NATURAL,
    ],
});

defineWorldMonster({
    id: 'bog_slime',
    name: '수렁 슬라임',
    description: '늪의 오염된 물과 맹독이 뒤섞여 태어난 슬라임.',
    level: 14,
    baseAttribute: { maxLife: 235, atk: 38, magicForce: 40, def: 13, magicDef: 18, speed: 1.15 },
    drops: [{ itemDataId: 'mana_potion', minCount: 1, maxCount: 2, chance: 0.28 }],
    goldReward: { min: 16, max: 32 },
    attack: {
        damageType: 'magic',
        effect: { statusEffectId: 'deadly_poison', chance: 0.25, duration: 8, level: 2 },
    },
    tags: [GameTags.ENTITY_SLIME, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_WATER, GameTags.PROPERTY_POISON],
});

defineWorldMonster({
    id: 'sporeling',
    name: '몽롱 포자체',
    description: '마비 성분을 품은 포자를 흩뿌리는 늪지 원소 생물.',
    level: 18,
    baseAttribute: { maxLife: 285, atk: 46, magicForce: 52, def: 17, magicDef: 24, speed: 1.35 },
    drops: [{ itemDataId: 'health_potion', minCount: 1, maxCount: 2, chance: 0.3 }],
    goldReward: { min: 22, max: 42 },
    attack: {
        damageType: 'magic',
        effect: { statusEffectId: 'paralytic_poison', chance: 0.2, duration: 5, level: 2 },
    },
    tags: [GameTags.ENTITY_ELEMENTAL, GameTags.PROPERTY_NATURAL, GameTags.PROPERTY_POISON],
});

defineWorldMonster({
    id: 'mire_lurker',
    name: '수렁 포식자',
    description: '늪 아래 숨어 빠르게 덮치는 독성 포식자.',
    level: 22,
    baseAttribute: { maxLife: 410, atk: 66, def: 26, magicDef: 20, speed: 1.65, attackSpeed: 1.08 },
    drops: [{ itemDataId: 'venom_dagger', minCount: 1, maxCount: 1, chance: 0.04 }],
    goldReward: { min: 28, max: 54 },
    attack: {
        effect: { statusEffectId: 'deadly_poison', chance: 0.22, duration: 10, level: 3 },
    },
    tags: [GameTags.ENTITY_BEAST, GameTags.PROPERTY_NATURAL, GameTags.PROPERTY_POISON],
});

defineWorldMonster({
    id: 'swamp_core',
    name: '늪의 응집핵',
    description: '늪의 물과 독기가 응축되어 만들어진 비생명 핵.',
    level: 27,
    baseAttribute: { maxLife: 620, atk: 76, magicForce: 82, def: 35, magicDef: 38, speed: 1.1 },
    drops: [
        { itemDataId: 'emerald', minCount: 1, maxCount: 1, chance: 0.08 },
        { itemDataId: 'mana_potion', minCount: 1, maxCount: 3, chance: 0.35 },
    ],
    goldReward: { min: 38, max: 72 },
    attack: {
        damageType: 'magic',
        effect: { statusEffectId: 'paralytic_poison', chance: 0.3, duration: 6, level: 4 },
    },
    tags: [GameTags.ENTITY_ELEMENTAL, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_WATER, GameTags.PROPERTY_POISON],
});

defineWorldMonster({
    id: 'crystal_guardian',
    name: '수정 파수체',
    description: '얼어붙은 수정으로 이루어진 갱도 수호체.',
    level: 28,
    baseAttribute: { maxLife: 680, atk: 86, magicForce: 76, def: 42, magicDef: 44, speed: 1.05 },
    drops: [
        { itemDataId: 'ruby', minCount: 1, maxCount: 1, chance: 0.08 },
        { itemDataId: 'emerald', minCount: 1, maxCount: 1, chance: 0.08 },
    ],
    goldReward: { min: 40, max: 78 },
    attack: { damageType: 'magic' },
    tags: [GameTags.ENTITY_ELEMENTAL, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_ICE, GameTags.MATERIAL_DIAMOND],
});

defineWorldMonster({
    id: 'deep_guardian',
    name: '심층 맥동체',
    description: '금속성 광맥의 맥동으로 움직이는 심층 수호체.',
    level: 30,
    baseAttribute: { maxLife: 760, atk: 92, magicForce: 90, def: 48, magicDef: 45, speed: 1.2 },
    drops: [{ itemDataId: 'diamond', minCount: 1, maxCount: 1, chance: 0.06 }],
    goldReward: { min: 46, max: 88 },
    attack: { damageType: 'magic' },
    tags: [GameTags.ENTITY_ELEMENTAL, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_NATURAL, GameTags.MATERIAL_IRON],
});

defineWorldMonster({
    id: 'crystal_vein_overlord',
    name: '수정맥의 군주',
    description: '피버릭 갱도 깊은 곳의 수정맥을 지배하는 거대 군주.',
    level: 32,
    baseAttribute: {
        // 인접 Lv.30 심층 맥동체(760)의 6배 이상인 보스 체력.
        maxLife: 4800,
        atk: 122,
        magicForce: 118,
        def: 58,
        magicDef: 64,
        speed: 0.7,
        attackSpeed: 0.22,
        critRate: 0.06,
        critDmg: 1.6,
    },
    expReward: 32 * 20 * 6,
    drops: [
        { itemDataId: 'diamond', minCount: 1, maxCount: 2, chance: 0.35 },
        { itemDataId: 'ruby', minCount: 1, maxCount: 2, chance: 0.25 },
        { itemDataId: 'emerald', minCount: 1, maxCount: 2, chance: 0.25 },
        { itemDataId: 'seismic_crush_skillbook', minCount: 1, maxCount: 1, chance: 0.03 },
    ],
    goldReward: { min: 180, max: 280 },
    attack: { damageType: 'physical' },
    skills: [{ skillDataId: 'seismic_crush', level: 3 }],
    skillPattern: {
        sequence: ['seismic_crush'],
        initialDelay: 5,
        interval: { min: 10, max: 13 },
    },
    challengePattern: {
        handler: 'crystal:cave-in',
        initialDelay: 8,
        interval: { min: 17, max: 22 },
    },
    ai: {
        intelligence: 92,
        disposition: MonsterAiDisposition.THREAT,
        weights: { attack: 0.2, damage: 1, healing: 1.4, shielding: 0.8, control: 1.1, taunt: 2.5 },
        tauntResistance: 0.78,
        switchThreshold: 0.24,
        decayPerSecond: 0.008,
    },
    tags: [
        GameTags.ENTITY_BOSS,
        GameTags.ENTITY_ELEMENTAL,
        GameTags.TRAIT_INANIMATE,
        GameTags.PROPERTY_NATURAL,
        GameTags.PROPERTY_ICE,
        GameTags.MATERIAL_DIAMOND,
    ],
});

defineWorldMonster({
    id: 'ember_slime',
    name: '불씨 슬라임',
    description: '불씨를 삼켜 몸속에서 화염을 끓이는 슬라임.',
    level: 30,
    baseAttribute: { maxLife: 580, atk: 82, magicForce: 94, def: 30, magicDef: 42, speed: 1.55 },
    drops: [{ itemDataId: 'ruby', minCount: 1, maxCount: 1, chance: 0.07 }],
    goldReward: { min: 45, max: 86 },
    attack: {
        damageType: 'magic',
        effect: { statusEffectId: 'fire', chance: 0.22, duration: 8, level: 2 },
    },
    tags: [GameTags.ENTITY_SLIME, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_FIRE, GameTags.PROPERTY_POISON],
});

defineWorldMonster({
    id: 'ash_wraith',
    name: '잿바람 망령',
    description: '뜨거운 재와 바람이 뒤엉켜 태어난 고속 망령.',
    level: 34,
    baseAttribute: { maxLife: 650, atk: 88, magicForce: 108, def: 27, magicDef: 52, speed: 2.15, attackSpeed: 1.12 },
    drops: [{ itemDataId: 'mana_potion', minCount: 2, maxCount: 3, chance: 0.35 }],
    goldReward: { min: 52, max: 98 },
    attack: {
        damageType: 'magic',
        effect: { statusEffectId: 'fire', chance: 0.28, duration: 10, level: 3 },
    },
    tags: [GameTags.ENTITY_ELEMENTAL, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_FIRE],
});

defineWorldMonster({
    id: 'lava_armor',
    name: '용암 갑주',
    description: '용암이 식어 굳은 갑주 속에 불꽃이 깃든 수호체.',
    level: 38,
    baseAttribute: { maxLife: 980, atk: 118, magicForce: 100, def: 62, magicDef: 48, speed: 0.85 },
    drops: [
        { itemDataId: 'gold_ore', minCount: 2, maxCount: 4, chance: 0.3 },
        { itemDataId: 'ruby', minCount: 1, maxCount: 2, chance: 0.12 },
    ],
    goldReward: { min: 62, max: 116 },
    attack: {
        effect: { statusEffectId: 'fire', chance: 0.32, duration: 12, level: 4 },
    },
    tags: [GameTags.ENTITY_ELEMENTAL, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_FIRE, GameTags.MATERIAL_STONE],
});

defineWorldMonster({
    id: 'flame_salamander',
    name: '홍염 도롱뇽',
    description: '홍염산지의 열기를 먹고 자란 민첩한 화염 도롱뇽.',
    level: 42,
    baseAttribute: { maxLife: 920, atk: 126, magicForce: 122, def: 48, magicDef: 58, speed: 2.45, attackSpeed: 1.18 },
    drops: [{ itemDataId: 'ruby', minCount: 1, maxCount: 2, chance: 0.18 }],
    goldReward: { min: 72, max: 132 },
    attack: {
        damageType: 'magic',
        effect: { statusEffectId: 'fire', chance: 0.35, duration: 12, level: 4 },
    },
    tags: [GameTags.ENTITY_BEAST, GameTags.PROPERTY_FIRE, GameTags.PROPERTY_NATURAL],
});

defineWorldMonster({
    id: 'crater_heart',
    name: '분화구의 심장',
    description: '분화구의 열과 마력이 심장처럼 맥동하는 원소 핵.',
    level: 46,
    baseAttribute: { maxLife: 1350, atk: 132, magicForce: 144, def: 68, magicDef: 72, speed: 1.25 },
    drops: [
        { itemDataId: 'ruby', minCount: 2, maxCount: 3, chance: 0.22 },
        { itemDataId: 'diamond', minCount: 1, maxCount: 1, chance: 0.08 },
    ],
    goldReward: { min: 88, max: 160 },
    attack: {
        damageType: 'magic',
        effect: { statusEffectId: 'fire', chance: 0.4, duration: 14, level: 5 },
    },
    tags: [GameTags.ENTITY_ELEMENTAL, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_FIRE],
});

defineWorldMonster({
    id: 'caldera_beast',
    name: '칼데라 화염수',
    description: '칼데라의 불길을 두른 홍염산지의 구간 보스. 느린 분출을 예고한 뒤 화염과 화상을 누적한다.',
    level: 50,
    baseAttribute: {
        maxLife: 8200,
        atk: 155,
        magicForce: 168,
        def: 76,
        magicDef: 82,
        armorPen: 18,
        magicPen: 18,
        speed: 2.8,
        attackSpeed: 1.25,
        critRate: 0.12,
        critDmg: 1.7,
    },
    expReward: 50 * 20 * 5,
    drops: [
        { itemDataId: 'ruby', minCount: 2, maxCount: 4, chance: 0.35 },
        { itemDataId: 'diamond', minCount: 1, maxCount: 2, chance: 0.15 },
    ],
    goldReward: { min: 120, max: 220 },
    attack: {
        damageType: 'magic',
        effect: { statusEffectId: 'fire', chance: 0.48, duration: 16, level: 6 },
    },
    skills: [{ skillDataId: 'caldera_eruption', level: 3 }],
    skillPattern: { sequence: ['caldera_eruption'], initialDelay: 5, interval: { min: 9, max: 13 } },
    ai: {
        intelligence: 62, disposition: MonsterAiDisposition.THREAT,
        weights: { attack: 0.5, damage: 1, healing: 0.8, shielding: 0.6, control: 0.8, taunt: 1.3 },
        tauntResistance: 0.35, switchThreshold: 0.12,
    },
    tags: [GameTags.ENTITY_BOSS, GameTags.ENTITY_BEAST, GameTags.PROPERTY_FIRE, GameTags.PROPERTY_NATURAL],
});

const twilightTombMonsters: readonly WorldMonsterData[] = [
    {
        id: 'dusk_grave_moth', name: '황혼 무덤나방',
        description: '묘지기 천과 애도의 꽃가루를 갉아 먹으며 자란 잿빛 나방.', level: 31,
        baseAttribute: { maxLife: 610, atk: 76, magicForce: 88, def: 28, magicDef: 46, speed: 2.2, attackSpeed: 1.18 },
        drops: [
            { itemDataId: 'gravecloth', minCount: 1, maxCount: 2, chance: 0.48 },
            { itemDataId: 'mourning_lily', minCount: 1, maxCount: 1, chance: 0.16 },
        ],
        goldReward: { min: 44, max: 82 },
        attack: { damageType: 'magic', effect: { statusEffectId: 'slowness', chance: 0.16, duration: 5, level: 2 } },
        tags: [GameTags.ENTITY_BEAST, GameTags.PROPERTY_INSECT, GameTags.PROPERTY_DARK],
    },
    {
        id: 'bone_hound', name: '백골 사냥개',
        description: '왕릉을 벗어나는 혼을 쫓도록 뼈와 어둠으로 다시 엮은 사냥개.', level: 35,
        baseAttribute: { maxLife: 760, atk: 102, def: 41, magicDef: 30, speed: 2.65, attackSpeed: 1.28 },
        drops: [{ itemDataId: 'weathered_bone', minCount: 1, maxCount: 3, chance: 0.62 }],
        goldReward: { min: 52, max: 96 },
        attack: { effect: { statusEffectId: 'bleeding', chance: 0.2, duration: 7, level: 2 } },
        tags: [GameTags.ENTITY_BEAST, GameTags.PROPERTY_UNDEAD, GameTags.PROPERTY_DARK],
    },
    {
        id: 'hollow_sentry', name: '빈 갑주의 보초',
        description: '몸은 사라졌지만 순찰 명령만 남아 묘문 앞을 걷는 왕릉 보초.', level: 39,
        baseAttribute: { maxLife: 1_080, atk: 116, def: 66, magicDef: 50, armorPen: 8, speed: 1.25, attackSpeed: 0.88 },
        drops: [
            { itemDataId: 'broken_oath_badge', minCount: 1, maxCount: 2, chance: 0.34 },
            { itemDataId: 'weathered_bone', minCount: 1, maxCount: 2, chance: 0.28 },
        ],
        goldReward: { min: 61, max: 112 },
        tags: [GameTags.ENTITY_HUMANOID, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_UNDEAD, GameTags.PROPERTY_METAL],
    },
    {
        id: 'crypt_whisperer', name: '묘실의 속삭임',
        description: '벽화에 남은 장송문이 검은 형체를 이루어 침입자의 기억을 갉아먹는다.', level: 42,
        baseAttribute: { maxLife: 940, atk: 98, magicForce: 134, def: 42, magicDef: 72, magicPen: 10, speed: 1.85 },
        drops: [
            { itemDataId: 'soul_ember', minCount: 1, maxCount: 2, chance: 0.44 },
            { itemDataId: 'mourning_lily', minCount: 1, maxCount: 2, chance: 0.2 },
        ],
        goldReward: { min: 70, max: 128 },
        attack: { damageType: 'magic', effect: { statusEffectId: 'decay', chance: 0.24, duration: 8, level: 3 } },
        tags: [GameTags.ENTITY_ELEMENTAL, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_UNDEAD, GameTags.PROPERTY_DARK],
    },
    {
        id: 'hollow_skeleton_king', name: '공허한 해골왕',
        description: '왕관의 명령만 기억하는 황혼왕릉의 첫 군주. 공격보다 치유와 보호를 행한 침입자를 먼저 꺾으려 한다.', level: 45,
        baseAttribute: {
            maxLife: 7_600, atk: 132, magicForce: 152, def: 78, magicDef: 91,
            magicPen: 16, speed: 1.35, attackSpeed: 0.72, critRate: 0.1, critDmg: 1.65,
        },
        expReward: 45 * 20 * 6,
        drops: [
            { itemDataId: 'weathered_bone', minCount: 5, maxCount: 9, chance: 0.9 },
            { itemDataId: 'soul_ember', minCount: 2, maxCount: 4, chance: 0.7 },
            { itemDataId: 'mourning_staff', minCount: 1, maxCount: 1, chance: 0.035 },
            { itemDataId: 'gravekeeper_shield', minCount: 1, maxCount: 1, chance: 0.03 },
        ],
        goldReward: { min: 165, max: 290 },
        attack: { damageType: 'magic', effect: { statusEffectId: 'fear', chance: 0.28, duration: 4, level: 4 } },
        skills: [{ skillDataId: 'bone_crown_decree', level: 3 }],
        skillPattern: { sequence: ['bone_crown_decree'], initialDelay: 4, interval: { min: 8, max: 11 } },
        ai: {
            intelligence: 82, disposition: MonsterAiDisposition.THREAT,
            weights: { attack: 0.25, damage: 1, healing: 1.45, shielding: 1.2, control: 1.1, taunt: 2 },
            tauntResistance: 0.62, switchThreshold: 0.19,
        },
        tags: [GameTags.ENTITY_BOSS, GameTags.ENTITY_HUMANOID, GameTags.PROPERTY_UNDEAD, GameTags.PROPERTY_DARK],
    },
    {
        id: 'ossuary_armor', name: '납골 갑주',
        description: '수많은 뼛조각을 철판 사이에 채워 충격을 흘려보내는 무거운 수호체.', level: 46,
        baseAttribute: { maxLife: 1_480, atk: 142, def: 88, magicDef: 64, speed: 0.82, attackSpeed: 0.72 },
        drops: [
            { itemDataId: 'weathered_bone', minCount: 2, maxCount: 4, chance: 0.58 },
            { itemDataId: 'broken_oath_badge', minCount: 1, maxCount: 2, chance: 0.3 },
        ],
        goldReward: { min: 84, max: 150 },
        tags: [GameTags.ENTITY_ELEMENTAL, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_UNDEAD, GameTags.PROPERTY_METAL],
    },
    {
        id: 'oathbreaker_knight', name: '배신한 왕릉기사',
        description: '왕을 지키겠다는 맹세와 왕을 베었다는 기억 사이에서 끝없이 검을 휘두르는 기사.', level: 51,
        baseAttribute: { maxLife: 1_780, atk: 168, def: 92, magicDef: 71, armorPen: 15, speed: 1.85, attackSpeed: 1.02, critRate: 0.08 },
        drops: [
            { itemDataId: 'broken_oath_badge', minCount: 1, maxCount: 3, chance: 0.5 },
            { itemDataId: 'gravecloth', minCount: 1, maxCount: 2, chance: 0.28 },
        ],
        goldReward: { min: 103, max: 184 },
        attack: { effect: { statusEffectId: 'defense_reduction', chance: 0.22, duration: 8, level: 4 } },
        tags: [GameTags.ENTITY_HUMANOID, GameTags.PROPERTY_UNDEAD, GameTags.PROPERTY_METAL, GameTags.PROPERTY_DARK],
    },
    {
        id: 'fallen_knight_king', name: '타락한 기사왕',
        description: '죽은 왕을 지키려다 스스로 왕좌를 차지한 두 번째 군주. 도발보다 치유와 제어를 더 큰 위협으로 판단한다.', level: 58,
        baseAttribute: {
            maxLife: 14_600, atk: 202, magicForce: 156, def: 126, magicDef: 98,
            armorPen: 28, speed: 1.75, attackSpeed: 0.68, critRate: 0.12, critDmg: 1.75,
        },
        expReward: 58 * 20 * 6,
        drops: [
            { itemDataId: 'broken_oath_badge', minCount: 5, maxCount: 8, chance: 0.9 },
            { itemDataId: 'soul_ember', minCount: 3, maxCount: 5, chance: 0.65 },
            { itemDataId: 'oathiron_sword', minCount: 1, maxCount: 1, chance: 0.04 },
            { itemDataId: 'requiem_bow', minCount: 1, maxCount: 1, chance: 0.03 },
        ],
        goldReward: { min: 225, max: 390 },
        attack: { effect: { statusEffectId: 'bleeding', chance: 0.34, duration: 9, level: 5 } },
        skills: [
            { skillDataId: 'fallen_oath_execution', level: 3 },
            { skillDataId: 'bone_crown_decree', level: 3 },
        ],
        skillPattern: {
            sequence: ['fallen_oath_execution', 'bone_crown_decree'], randomOrder: true,
            initialDelay: 4, interval: { min: 7, max: 10 },
        },
        ai: {
            intelligence: 93, disposition: MonsterAiDisposition.THREAT,
            weights: { attack: 0.18, damage: 1, healing: 1.6, shielding: 1.15, control: 1.35, taunt: 2.8 },
            tauntResistance: 0.84, switchThreshold: 0.26, decayPerSecond: 0.007,
        },
        tags: [GameTags.ENTITY_BOSS, GameTags.ENTITY_HUMANOID, GameTags.PROPERTY_UNDEAD, GameTags.PROPERTY_METAL, GameTags.PROPERTY_DARK],
    },
];

for (const monster of twilightTombMonsters) defineWorldMonster(monster);

const glassduneMonsters: readonly WorldMonsterData[] = [
    {
        id: 'glassdune_skitterer', name: '유리모래 종종걸이',
        description: '뜨거운 모래 아래를 수영하듯 달리다 유리 파편으로 발목을 베는 사막 벌레.', level: 70,
        baseAttribute: { maxLife: 2_850, atk: 212, def: 118, magicDef: 82, speed: 3.15, attackSpeed: 1.38 },
        drops: [
            { itemDataId: 'glass_sand', minCount: 1, maxCount: 3, chance: 0.62 },
            { itemDataId: 'sunscarab_shell', minCount: 1, maxCount: 1, chance: 0.14 },
        ],
        goldReward: { min: 168, max: 295 },
        attack: { effect: { statusEffectId: 'bleeding', chance: 0.18, duration: 7, level: 4 } },
        tags: [GameTags.ENTITY_BEAST, GameTags.PROPERTY_INSECT, GameTags.PROPERTY_EARTH, GameTags.PROPERTY_STONE],
    },
    {
        id: 'sunscarab', name: '황금갑 태양충',
        description: '태양빛을 등껑질에 모았다 한번에 터뜨리는 금빛 성충.', level: 74,
        baseAttribute: { maxLife: 3_450, atk: 218, magicForce: 232, def: 152, magicDef: 125, speed: 2.15 },
        drops: [
            { itemDataId: 'sunscarab_shell', minCount: 1, maxCount: 3, chance: 0.58 },
            { itemDataId: 'glass_sand', minCount: 1, maxCount: 2, chance: 0.34 },
        ],
        goldReward: { min: 182, max: 318 },
        attack: { damageType: 'magic', effect: { statusEffectId: 'sun_fever', chance: 0.2, duration: 8, level: 3 } },
        tags: [GameTags.ENTITY_BEAST, GameTags.PROPERTY_INSECT, GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_FIRE],
    },
    {
        id: 'mirage_jackal', name: '신기루 자칼',
        description: '열기에 비친 잔상을 실제 몸처럼 바꾸며 약해진 대상의 사각을 파고든다.', level: 78,
        baseAttribute: { maxLife: 3_720, atk: 248, magicForce: 220, def: 112, magicDef: 138, armorPen: 18, speed: 3.85, attackSpeed: 1.42, critRate: 0.13 },
        drops: [{ itemDataId: 'mirage_crystal', minCount: 1, maxCount: 2, chance: 0.22 }],
        goldReward: { min: 198, max: 342 },
        attack: { effect: { statusEffectId: 'curse', chance: 0.22, duration: 9, level: 4 } },
        tags: [GameTags.ENTITY_BEAST, GameTags.PROPERTY_DARK, GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_NATURAL],
    },
    {
        id: 'dune_scorpion_queen', name: '황사 전갈여왕',
        description: '유리모래 아래 독수 호수를 지키는 필드 보스. 끝없이 독침을 쏟아내며 치유와 제어를 사용한 적을 먼저 노린다.', level: 82,
        baseAttribute: {
            maxLife: 23_500, atk: 265, magicForce: 248, def: 168, magicDef: 146,
            armorPen: 24, speed: 2.35, attackSpeed: 0.82, critRate: 0.11, critDmg: 1.7,
        },
        expReward: 82 * 20 * 6,
        drops: [
            { itemDataId: 'dune_scorpion_venom', minCount: 3, maxCount: 6, chance: 0.9 },
            { itemDataId: 'mirage_crystal', minCount: 1, maxCount: 3, chance: 0.55 },
            { itemDataId: 'mirage_fang_dagger', minCount: 1, maxCount: 1, chance: 0.035 },
            { itemDataId: 'sunwire_bow', minCount: 1, maxCount: 1, chance: 0.025 },
        ],
        goldReward: { min: 330, max: 560 },
        attack: { effect: { statusEffectId: 'deadly_poison', chance: 0.34, duration: 10, level: 5 } },
        skills: [
            { skillDataId: 'dune_venom_barrage', level: 3 },
            { skillDataId: 'seismic_crush', level: 3 },
        ],
        skillPattern: {
            sequence: ['dune_venom_barrage', 'seismic_crush'], randomOrder: true,
            initialDelay: 4, interval: { min: 7, max: 10 },
        },
        ai: {
            intelligence: 79, disposition: MonsterAiDisposition.THREAT,
            weights: { attack: 0.3, damage: 1, healing: 1.35, shielding: 0.9, control: 1.25, taunt: 2 },
            tauntResistance: 0.6, switchThreshold: 0.2,
        },
        tags: [GameTags.ENTITY_BOSS, GameTags.ENTITY_BEAST, GameTags.PROPERTY_INSECT, GameTags.PROPERTY_POISON, GameTags.PROPERTY_EARTH],
    },
    {
        id: 'salt_husk', name: '소금바람 건시',
        description: '오래전 사막을 건너던 순례자가 소금과 모래에 굳어 남은 것.', level: 86,
        baseAttribute: { maxLife: 4_850, atk: 272, magicForce: 258, def: 166, magicDef: 155, speed: 1.45, attackSpeed: 0.88 },
        drops: [
            { itemDataId: 'glass_sand', minCount: 2, maxCount: 4, chance: 0.46 },
            { itemDataId: 'sun_glyph_fragment', minCount: 1, maxCount: 1, chance: 0.12 },
        ],
        goldReward: { min: 218, max: 375 },
        attack: { damageType: 'magic', effect: { statusEffectId: 'curse', chance: 0.24, duration: 9, level: 5 } },
        tags: [GameTags.ENTITY_HUMANOID, GameTags.PROPERTY_UNDEAD, GameTags.PROPERTY_EARTH, GameTags.PROPERTY_DARK],
    },
    {
        id: 'sun_shard_elemental', name: '태양파편 정령',
        description: '태양 문양의 파편에 낮의 열기가 깃들어 떠다니는 마력체.', level: 91,
        baseAttribute: { maxLife: 5_150, atk: 260, magicForce: 305, def: 142, magicDef: 184, magicPen: 20, speed: 2.75, attackSpeed: 1.14 },
        drops: [
            { itemDataId: 'sun_glyph_fragment', minCount: 1, maxCount: 2, chance: 0.38 },
            { itemDataId: 'mirage_crystal', minCount: 1, maxCount: 1, chance: 0.18 },
        ],
        goldReward: { min: 242, max: 410 },
        attack: { damageType: 'magic', effect: { statusEffectId: 'sun_fever', chance: 0.28, duration: 10, level: 5 } },
        tags: [GameTags.ENTITY_ELEMENTAL, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_FIRE, GameTags.PROPERTY_LIGHT],
    },
    {
        id: 'glass_canyon_basilisk', name: '유리골 바실리스크',
        description: '눈을 마주친 생명체의 피부를 유리질 갑피로 굳히는 협곡의 포식자.', level: 97,
        baseAttribute: { maxLife: 6_150, atk: 318, magicForce: 292, def: 198, magicDef: 158, armorPen: 25, speed: 2.45, attackSpeed: 1.02 },
        drops: [
            { itemDataId: 'glass_sand', minCount: 3, maxCount: 5, chance: 0.65 },
            { itemDataId: 'mirage_crystal', minCount: 1, maxCount: 2, chance: 0.26 },
        ],
        goldReward: { min: 268, max: 452 },
        attack: { effect: { statusEffectId: 'petrification', chance: 0.14, duration: 2.5, level: 4 } },
        tags: [GameTags.ENTITY_BEAST, GameTags.PROPERTY_STONE, GameTags.PROPERTY_EARTH],
    },
    {
        id: 'solar_vault_sentinel', name: '태양고 금면수호자',
        description: '반사경에 새긴 태양 문양만을 따라 침입자를 재단하는 고대 금속 인형.', level: 103,
        baseAttribute: { maxLife: 7_250, atk: 335, magicForce: 328, def: 225, magicDef: 214, armorPen: 28, magicPen: 24, speed: 1.65, attackSpeed: 0.92 },
        drops: [
            { itemDataId: 'sun_glyph_fragment', minCount: 1, maxCount: 3, chance: 0.54 },
            { itemDataId: 'sunscarab_shell', minCount: 1, maxCount: 2, chance: 0.24 },
        ],
        goldReward: { min: 292, max: 495 },
        attack: { damageType: 'magic', effect: { statusEffectId: 'sun_fever', chance: 0.25, duration: 11, level: 6 } },
        tags: [GameTags.ENTITY_HUMANOID, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_METAL, GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_FIRE],
    },
    {
        id: 'sun_vault_colossus', name: '태양고의 유리거상',
        description: '태양거울 기둥에서 빛을 공급받는 사막의 관문 보스. 기둥이 남아 있으면 받는 피해가 70% 감소하며 석화와 열병을 무작위로 겹친다.', level: 110,
        baseAttribute: {
            maxLife: 43_000, atk: 352, magicForce: 388, def: 238, magicDef: 248,
            armorPen: 30, magicPen: 34, speed: 1.25, attackSpeed: 0.58, critRate: 0.12, critDmg: 1.75,
        },
        expReward: 110 * 20 * 6,
        drops: [
            { itemDataId: 'sun_glyph_fragment', minCount: 4, maxCount: 7, chance: 0.92 },
            { itemDataId: 'mirage_crystal', minCount: 2, maxCount: 4, chance: 0.68 },
            { itemDataId: 'helioglass_staff', minCount: 1, maxCount: 1, chance: 0.035 },
            { itemDataId: 'sunmirror_shield', minCount: 1, maxCount: 1, chance: 0.035 },
            { itemDataId: 'dunebreaker_sword', minCount: 1, maxCount: 1, chance: 0.025 },
        ],
        goldReward: { min: 470, max: 790 },
        attack: { damageType: 'magic', effect: { statusEffectId: 'sun_fever', chance: 0.36, duration: 13, level: 7 } },
        skills: [
            { skillDataId: 'petrifying_sun_gaze', level: 4 },
            { skillDataId: 'sun_vault_flare', level: 4 },
        ],
        skillPattern: {
            sequence: ['petrifying_sun_gaze', 'sun_vault_flare'], randomOrder: true,
            initialDelay: 4, interval: { min: 7, max: 10 },
        },
        ai: {
            intelligence: 91, disposition: MonsterAiDisposition.THREAT,
            weights: { attack: 0.2, damage: 1, healing: 1.45, shielding: 1.15, control: 1.4, taunt: 2.6 },
            tauntResistance: 0.82, switchThreshold: 0.25, decayPerSecond: 0.007,
        },
        tags: [GameTags.ENTITY_BOSS, GameTags.ENTITY_ELEMENTAL, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_STONE, GameTags.PROPERTY_FIRE, GameTags.PROPERTY_LIGHT],
    },
];

for (const monster of glassduneMonsters) defineWorldMonster(monster);

const frostveilMonsters: readonly WorldMonsterData[] = [
    {
        id: 'snowfield_hare', name: '눈밭 칼귀토끼',
        description: '눈 아래 진동을 먼저 듣고 얼음처럼 날카로운 뒷발로 차는 설원 짐승.', level: 118,
        baseAttribute: { maxLife: 8_250, atk: 348, def: 178, magicDef: 192, speed: 3.2, attackSpeed: 1.42, critRate: 0.12 },
        drops: [
            { itemDataId: 'frostwolf_hide', minCount: 1, maxCount: 1, chance: 0.15 },
            { itemDataId: 'snowmoss', minCount: 1, maxCount: 2, chance: 0.32 },
        ],
        goldReward: { min: 335, max: 555 },
        tags: [GameTags.ENTITY_BEAST, GameTags.PROPERTY_NATURAL, GameTags.PROPERTY_ICE],
    },
    {
        id: 'rimeclaw_wolf', name: '상고발톱 늑대',
        description: '빙결된 발톱으로 상처를 벌리고 무리의 다음 공격을 부르는 설원 포식자.', level: 122,
        baseAttribute: { maxLife: 9_450, atk: 382, def: 205, magicDef: 184, armorPen: 25, speed: 2.75, attackSpeed: 1.22, critRate: 0.11 },
        drops: [
            { itemDataId: 'frostwolf_hide', minCount: 1, maxCount: 3, chance: 0.58 },
            { itemDataId: 'rime_crystal', minCount: 1, maxCount: 1, chance: 0.15 },
        ],
        goldReward: { min: 350, max: 580 },
        attack: { effect: { statusEffectId: 'bleeding', chance: 0.24, duration: 8, level: 6 } },
        tags: [GameTags.ENTITY_BEAST, GameTags.PROPERTY_NATURAL, GameTags.PROPERTY_ICE],
    },
    {
        id: 'icesilk_spider', name: '빙실 발톱거미',
        description: '눈 위에 거의 보이지 않는 빙실을 깔아 사냥감의 발을 얼리는 거미.', level: 126,
        baseAttribute: { maxLife: 10_100, atk: 350, magicForce: 392, def: 196, magicDef: 235, speed: 2.25, attackSpeed: 1.08 },
        drops: [
            { itemDataId: 'ice_silk', minCount: 1, maxCount: 3, chance: 0.62 },
            { itemDataId: 'rime_crystal', minCount: 1, maxCount: 2, chance: 0.2 },
        ],
        goldReward: { min: 365, max: 610 },
        attack: { damageType: 'magic', effect: { statusEffectId: 'slowness', chance: 0.3, duration: 7, level: 6 } },
        tags: [GameTags.ENTITY_BEAST, GameTags.PROPERTY_INSECT, GameTags.PROPERTY_ICE],
    },
    {
        id: 'frozen_revenant', name: '동결 순례망자',
        description: '설원을 건너지 못한 순례자의 의지가 갑옷과 함께 얼어붙은 망자.', level: 130,
        baseAttribute: { maxLife: 11_350, atk: 408, magicForce: 365, def: 248, magicDef: 228, speed: 1.55, attackSpeed: 0.88 },
        drops: [
            { itemDataId: 'mirrorsteel_fragment', minCount: 1, maxCount: 2, chance: 0.38 },
            { itemDataId: 'aurora_shard', minCount: 1, maxCount: 1, chance: 0.12 },
        ],
        goldReward: { min: 380, max: 635 },
        attack: { damageType: 'magic', effect: { statusEffectId: 'curse', chance: 0.24, duration: 10, level: 6 } },
        tags: [GameTags.ENTITY_HUMANOID, GameTags.PROPERTY_UNDEAD, GameTags.PROPERTY_ICE, GameTags.PROPERTY_METAL],
    },
    {
        id: 'glacier_golem', name: '빙하심 골렘',
        description: '오래된 빙하의 중심핵을 따라 돌과 얼음이 뭉쳐 움직이는 둔중한 수호체.', level: 133,
        baseAttribute: { maxLife: 14_800, atk: 438, def: 310, magicDef: 235, armorPen: 34, speed: 0.95, attackSpeed: 0.62 },
        drops: [
            { itemDataId: 'frozen_core', minCount: 1, maxCount: 2, chance: 0.46 },
            { itemDataId: 'rime_crystal', minCount: 2, maxCount: 4, chance: 0.5 },
        ],
        goldReward: { min: 395, max: 660 },
        attack: { effect: { statusEffectId: 'slowness', chance: 0.26, duration: 8, level: 7 } },
        tags: [GameTags.ENTITY_ELEMENTAL, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_STONE, GameTags.PROPERTY_ICE],
    },
    {
        id: 'hoarfrost_spider_queen', name: '상고발톱 거미여왕',
        description: '빙하 협곡을 거대한 사냥망으로 바꾼 필드 보스. 피해와 제어를 가한 대상을 빠르게 바꿔 노린다.', level: 136,
        baseAttribute: {
            maxLife: 60_500, atk: 424, magicForce: 458, def: 270, magicDef: 292,
            magicPen: 34, speed: 2.15, attackSpeed: 0.76, critRate: 0.13, critDmg: 1.75,
        },
        expReward: 136 * 20 * 6,
        drops: [
            { itemDataId: 'ice_silk', minCount: 4, maxCount: 8, chance: 0.92 },
            { itemDataId: 'frozen_core', minCount: 1, maxCount: 3, chance: 0.58 },
            { itemDataId: 'icesilk_longbow', minCount: 1, maxCount: 1, chance: 0.035 },
            { itemDataId: 'hoarfrost_snare_skillbook', minCount: 1, maxCount: 1, chance: 0.025 },
        ],
        goldReward: { min: 610, max: 980 },
        attack: { damageType: 'magic', effect: { statusEffectId: 'frozen', chance: 0.3, duration: 3, level: 7 } },
        skills: [
            { skillDataId: 'hoarfrost_web_barrage', level: 4 },
            { skillDataId: 'seismic_crush', level: 4 },
        ],
        skillPattern: {
            sequence: ['hoarfrost_web_barrage', 'seismic_crush'], randomOrder: true,
            initialDelay: 4, interval: { min: 7, max: 10 },
        },
        ai: {
            intelligence: 74, disposition: MonsterAiDisposition.THREAT,
            weights: { attack: 0.3, damage: 1.2, healing: 1.25, shielding: 0.8, control: 1.45, taunt: 1.8 },
            tauntResistance: 0.58, switchThreshold: 0.16,
        },
        tags: [GameTags.ENTITY_BOSS, GameTags.ENTITY_BEAST, GameTags.PROPERTY_INSECT, GameTags.PROPERTY_ICE],
    },
    {
        id: 'mirror_wraith', name: '거울서리 망령',
        description: '침입자의 모습과 마력을 비춘 뒤 뒤틀어 되쏘는 빙경궁의 잔영.', level: 140,
        baseAttribute: { maxLife: 12_650, atk: 405, magicForce: 465, def: 224, magicDef: 315, magicPen: 35, speed: 2.5, attackSpeed: 1.02 },
        drops: [
            { itemDataId: 'aurora_shard', minCount: 1, maxCount: 3, chance: 0.44 },
            { itemDataId: 'mirrorsteel_fragment', minCount: 1, maxCount: 2, chance: 0.35 },
        ],
        goldReward: { min: 420, max: 700 },
        attack: { damageType: 'magic', effect: { statusEffectId: 'silence', chance: 0.2, duration: 3, level: 6 } },
        tags: [GameTags.ENTITY_ELEMENTAL, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_ICE, GameTags.PROPERTY_LIGHT],
    },
    {
        id: 'frostguard_knight', name: '빙경 근위기사',
        description: '왕좌를 비추는 경철 갑주가 명령만을 따라 검을 휘두르는 궁정 수호자.', level: 144,
        baseAttribute: { maxLife: 14_900, atk: 488, def: 325, magicDef: 272, armorPen: 38, speed: 1.7, attackSpeed: 0.9, critRate: 0.1 },
        drops: [
            { itemDataId: 'mirrorsteel_fragment', minCount: 2, maxCount: 4, chance: 0.62 },
            { itemDataId: 'rime_crystal', minCount: 1, maxCount: 3, chance: 0.38 },
        ],
        goldReward: { min: 440, max: 735 },
        attack: { effect: { statusEffectId: 'defense_reduction', chance: 0.24, duration: 9, level: 7 } },
        tags: [GameTags.ENTITY_HUMANOID, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_METAL, GameTags.PROPERTY_ICE],
    },
    {
        id: 'aurora_seer', name: '극광 예지자',
        description: '극광의 갈라진 색을 읽어 다음 주문의 궤적을 미리 고르는 궁정 술사.', level: 148,
        baseAttribute: { maxLife: 13_750, atk: 430, magicForce: 525, def: 245, magicDef: 338, magicPen: 42, speed: 2.1, attackSpeed: 0.94 },
        drops: [
            { itemDataId: 'aurora_shard', minCount: 2, maxCount: 4, chance: 0.6 },
            { itemDataId: 'snowmoss', minCount: 1, maxCount: 3, chance: 0.3 },
        ],
        goldReward: { min: 465, max: 770 },
        attack: { damageType: 'magic', effect: { statusEffectId: 'silence', chance: 0.25, duration: 3.5, level: 7 } },
        tags: [GameTags.ENTITY_HUMANOID, GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_ICE],
    },
    {
        id: 'frostglass_queen', name: '빙경 여왕 에르시나',
        description: '얼어붙은 왕좌와 하나가 된 빙경궁의 군주. 회피 불가 관통창과 침묵의 극광을 불규칙하게 교차한다.', level: 152,
        baseAttribute: {
            maxLife: 82_000, atk: 470, magicForce: 565, def: 318, magicDef: 350,
            armorPen: 36, magicPen: 50, speed: 1.8, attackSpeed: 0.7, critRate: 0.14, critDmg: 1.8,
        },
        expReward: 152 * 20 * 7,
        drops: [
            { itemDataId: 'aurora_shard', minCount: 5, maxCount: 9, chance: 0.94 },
            { itemDataId: 'mirrorsteel_fragment', minCount: 4, maxCount: 7, chance: 0.78 },
            { itemDataId: 'auroraprism_staff', minCount: 1, maxCount: 1, chance: 0.035 },
            { itemDataId: 'frostglass_bulwark', minCount: 1, maxCount: 1, chance: 0.03 },
            { itemDataId: 'aurora_lance_skillbook', minCount: 1, maxCount: 1, chance: 0.022 },
        ],
        goldReward: { min: 760, max: 1_240 },
        attack: { damageType: 'magic', effect: { statusEffectId: 'frozen', chance: 0.32, duration: 3.5, level: 8 } },
        skills: [
            { skillDataId: 'mirror_frost_lance', level: 5 },
            { skillDataId: 'aurora_silence', level: 5 },
            { skillDataId: 'hoarfrost_web_barrage', level: 5 },
        ],
        skillPattern: {
            sequence: ['mirror_frost_lance', 'aurora_silence', 'hoarfrost_web_barrage'], randomOrder: true,
            initialDelay: 4, interval: { min: 6, max: 9 },
        },
        ai: {
            intelligence: 96, disposition: MonsterAiDisposition.THREAT,
            weights: { attack: 0.12, damage: 1, healing: 1.65, shielding: 1.4, control: 1.55, taunt: 3 },
            tauntResistance: 0.88, switchThreshold: 0.28, decayPerSecond: 0.006,
        },
        tags: [GameTags.ENTITY_BOSS, GameTags.ENTITY_HUMANOID, GameTags.PROPERTY_ICE, GameTags.PROPERTY_LIGHT],
    },
];

for (const monster of frostveilMonsters) defineWorldMonster(monster);

const advancedWorldMonsters: WorldMonsterData[] = [
    {
        id: 'spark_moth', name: '섬광나방', description: '폭풍 전류를 날개에 모아 번쩍이며 달려드는 거대 곤충.', level: 52,
        baseAttribute: { maxLife: 1950, atk: 158, magicForce: 176, def: 72, magicDef: 88, speed: 3, attackSpeed: 1.3 },
        drops: [{ itemDataId: 'mana_potion', minCount: 2, maxCount: 4, chance: 0.35 }], goldReward: { min: 125, max: 230 },
        attack: { damageType: 'magic', effect: { statusEffectId: 'paralytic_poison', chance: 0.18, duration: 4, level: 3 } },
        tags: [GameTags.ENTITY_BEAST, GameTags.PROPERTY_ELECTRIC, GameTags.PROPERTY_INSECT],
    },
    {
        id: 'ironwing_raptor', name: '철익 사냥새', description: '금속 깃털로 상승기류를 가르며 급강하하는 절벽의 포식자.', level: 60,
        baseAttribute: { maxLife: 2450, atk: 190, def: 105, magicDef: 76, armorPen: 14, speed: 3.25, attackSpeed: 1.35 },
        drops: [{ itemDataId: 'stormstring_bow', minCount: 1, maxCount: 1, chance: 0.03 }], goldReward: { min: 150, max: 270 },
        tags: [GameTags.ENTITY_BEAST, GameTags.PROPERTY_METAL, GameTags.PROPERTY_ELECTRIC],
    },
    {
        id: 'thunder_colossus', name: '뇌정 거상', description: '낙뢰를 동력으로 삼는 천둥마루의 구간 보스. 지각 충격과 회피 불가 뇌정 과부하를 무작위로 사용한다.', level: 68,
        baseAttribute: { maxLife: 16800, atk: 218, magicForce: 225, def: 138, magicDef: 122, speed: 1.15, attackSpeed: 0.62 },
        expReward: 68 * 20 * 5,
        drops: [{ itemDataId: 'windsteel_sword', minCount: 1, maxCount: 1, chance: 0.03 }, { itemDataId: 'gold_ore', minCount: 2, maxCount: 5, chance: 0.3 }],
        goldReward: { min: 180, max: 320 }, attack: { damageType: 'magic' },
        skills: [{ skillDataId: 'tempest_overload', level: 3 }, { skillDataId: 'seismic_crush', level: 3 }],
        skillPattern: {
            sequence: ['tempest_overload', 'seismic_crush'], randomOrder: true,
            initialDelay: 4, interval: { min: 7, max: 11 },
        },
        ai: {
            intelligence: 76, disposition: MonsterAiDisposition.THREAT,
            weights: { attack: 0.35, damage: 1, healing: 1.15, shielding: 0.8, control: 1.1, taunt: 1.8 },
            tauntResistance: 0.58, switchThreshold: 0.18,
        },
        tags: [GameTags.ENTITY_BOSS, GameTags.ENTITY_ELEMENTAL, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_ELECTRIC, GameTags.PROPERTY_METAL],
    },
    {
        id: 'gloom_beetle', name: '암영 딱정벌레', description: '밤숲의 빛을 등껍질 아래 빨아들인 대형 벌레.', level: 75,
        baseAttribute: { maxLife: 3900, atk: 230, def: 145, magicDef: 118, speed: 2.35 },
        drops: [{ itemDataId: 'emerald', minCount: 1, maxCount: 2, chance: 0.18 }], goldReward: { min: 195, max: 345 },
        attack: { effect: { statusEffectId: 'fear', chance: 0.15, duration: 4, level: 3 } },
        tags: [GameTags.ENTITY_BEAST, GameTags.PROPERTY_DARK, GameTags.PROPERTY_INSECT],
    },
    {
        id: 'shade_mantis', name: '그늘사마귀', description: '미로 같은 밤숲에서 그림자 사이를 뛰어넘는 칼날 벌레.', level: 85,
        baseAttribute: { maxLife: 4700, atk: 275, def: 125, magicDef: 135, armorPen: 22, speed: 3.7, attackSpeed: 1.5, critRate: 0.16 },
        drops: [{ itemDataId: 'nightglass_dagger', minCount: 1, maxCount: 1, chance: 0.025 }], goldReward: { min: 225, max: 390 },
        attack: { effect: { statusEffectId: 'bleeding', chance: 0.28, duration: 8, level: 4 } },
        tags: [GameTags.ENTITY_BEAST, GameTags.PROPERTY_DARK, GameTags.PROPERTY_INSECT],
    },
    {
        id: 'nightwood_core', name: '밤숲의 검은 심재', description: '어둠과 뿌리가 엉겨 움직이는 월영밤숲의 구간 보스. 공격 사이에 주변 뿌리에서 생명력을 다시 끌어온다.', level: 95,
        baseAttribute: { maxLife: 29000, atk: 290, magicForce: 315, def: 165, magicDef: 175, speed: 1.4 },
        expReward: 95 * 20 * 5,
        drops: [{ itemDataId: 'diamond', minCount: 1, maxCount: 2, chance: 0.15 }], goldReward: { min: 260, max: 445 },
        attack: { damageType: 'magic', effect: { statusEffectId: 'decay', chance: 0.3, duration: 10, level: 5 } },
        skills: [{ skillDataId: 'nightwood_lash', level: 3 }, { skillDataId: 'nightwood_regrowth', level: 3 }],
        skillPattern: {
            sequence: ['nightwood_lash', 'nightwood_regrowth'], randomOrder: true,
            initialDelay: 5, interval: { min: 8, max: 12 },
        },
        ai: {
            intelligence: 84, disposition: MonsterAiDisposition.THREAT,
            weights: { attack: 0.25, damage: 1, healing: 1.35, shielding: 0.9, control: 1.2, taunt: 2.1 },
            tauntResistance: 0.66, switchThreshold: 0.2,
        },
        tags: [GameTags.ENTITY_BOSS, GameTags.ENTITY_ELEMENTAL, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_DARK, GameTags.PROPERTY_NATURAL],
    },
    {
        id: 'dawn_wisp', name: '새벽빛 정령', description: '성역 외곽에 흩어진 부드러운 빛이 의지를 얻은 정령.', level: 105,
        baseAttribute: { maxLife: 7200, atk: 285, magicForce: 345, def: 150, magicDef: 205, speed: 3.2 },
        drops: [{ itemDataId: 'mana_potion', minCount: 3, maxCount: 6, chance: 0.45 }], goldReward: { min: 285, max: 480 },
        attack: { damageType: 'magic' }, tags: [GameTags.ENTITY_ELEMENTAL, GameTags.PROPERTY_LIGHT],
    },
    {
        id: 'sanctum_keeper', name: '성역 수문장', description: '침입자를 가려내는 신성 금속 갑주.', level: 115,
        baseAttribute: { maxLife: 8800, atk: 360, magicForce: 330, def: 225, magicDef: 220, speed: 1.65 },
        drops: [{ itemDataId: 'starwood_staff', minCount: 1, maxCount: 1, chance: 0.025 }], goldReward: { min: 320, max: 530 },
        tags: [GameTags.ENTITY_ELEMENTAL, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_HOLY, GameTags.PROPERTY_METAL],
    },
    {
        id: 'halo_beast', name: '광륜수', description: '성역 중심의 빛을 수호하는 구간 보스. 회피할 수 없는 광륜 심판으로 한 명의 시야를 봉쇄한다.', level: 125,
        baseAttribute: { maxLife: 55000, atk: 385, magicForce: 405, def: 235, magicDef: 255, speed: 2.8, critRate: 0.13 },
        expReward: 125 * 20 * 5,
        drops: [{ itemDataId: 'diamond', minCount: 2, maxCount: 3, chance: 0.22 }], goldReward: { min: 360, max: 600 },
        attack: { damageType: 'magic' },
        skills: [{ skillDataId: 'sanctum_judgment', level: 4 }],
        skillPattern: { sequence: ['sanctum_judgment'], initialDelay: 4, interval: { min: 8, max: 12 } },
        ai: {
            intelligence: 90, disposition: MonsterAiDisposition.THREAT,
            weights: { attack: 0.2, damage: 1, healing: 1.45, shielding: 1.05, control: 1.25, taunt: 2.3 },
            tauntResistance: 0.74, switchThreshold: 0.22,
        },
        tags: [GameTags.ENTITY_BOSS, GameTags.ENTITY_BEAST, GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_HOLY],
    },
    {
        id: 'grave_sentinel', name: '묘문 파수병', description: '사령묘의 명령만 남아 갑옷 속에서 움직이는 언데드.', level: 135,
        baseAttribute: { maxLife: 12500, atk: 430, def: 270, magicDef: 215, speed: 1.9 },
        drops: [{ itemDataId: 'gold_ore', minCount: 3, maxCount: 6, chance: 0.3 }], goldReward: { min: 395, max: 650 },
        attack: { effect: { statusEffectId: 'decay', chance: 0.25, duration: 9, level: 6 } },
        tags: [GameTags.ENTITY_HUMANOID, GameTags.PROPERTY_UNDEAD, GameTags.PROPERTY_METAL],
    },
    {
        id: 'bone_oracle', name: '백골 예언자', description: '갈림길마다 거짓 속삭임을 흘리는 사령묘의 술사.', level: 145,
        baseAttribute: { maxLife: 13800, atk: 390, magicForce: 475, def: 220, magicDef: 285, speed: 2.25 },
        drops: [{ itemDataId: 'ruby', minCount: 2, maxCount: 4, chance: 0.22 }], goldReward: { min: 430, max: 710 },
        attack: { damageType: 'magic', effect: { statusEffectId: 'fear', chance: 0.28, duration: 5, level: 6 } },
        tags: [GameTags.ENTITY_HUMANOID, GameTags.PROPERTY_UNDEAD, GameTags.PROPERTY_DARK],
    },
    {
        id: 'deathless_colossus', name: '불멸의 묘상', description: '수많은 유해와 묘석이 하나로 엉겨 붙은 사령묘의 구간 보스. 지각 붕괴와 공포를 부르는 진혼을 불규칙하게 반복한다.', level: 155,
        baseAttribute: { maxLife: 86000, atk: 505, magicForce: 430, def: 330, magicDef: 295, speed: 1.05, attackSpeed: 0.58 },
        expReward: 155 * 20 * 5,
        drops: [{ itemDataId: 'diamond', minCount: 2, maxCount: 5, chance: 0.28 }], goldReward: { min: 480, max: 790 },
        attack: { effect: { statusEffectId: 'decay', chance: 0.35, duration: 12, level: 8 } },
        skills: [{ skillDataId: 'deathless_requiem', level: 4 }, { skillDataId: 'seismic_crush', level: 4 }],
        skillPattern: {
            sequence: ['deathless_requiem', 'seismic_crush'], randomOrder: true,
            initialDelay: 5, interval: { min: 8, max: 13 },
        },
        ai: {
            intelligence: 91, disposition: MonsterAiDisposition.THREAT,
            weights: { attack: 0.2, damage: 1, healing: 1.5, shielding: 1, control: 1.3, taunt: 2.5 },
            tauntResistance: 0.8, switchThreshold: 0.24,
        },
        tags: [GameTags.ENTITY_BOSS, GameTags.ENTITY_ELEMENTAL, GameTags.PROPERTY_UNDEAD, GameTags.PROPERTY_STONE],
    },
    {
        id: 'ironroot_beast', name: '철근수', description: '금속 뿌리와 흙덩이가 짐승의 형태로 굳은 황무지 생물.', level: 165,
        baseAttribute: { maxLife: 21000, atk: 535, def: 345, magicDef: 265, speed: 2.4 },
        drops: [{ itemDataId: 'iron_ore', minCount: 5, maxCount: 10, chance: 0.5 }], goldReward: { min: 520, max: 850 },
        tags: [GameTags.ENTITY_BEAST, GameTags.PROPERTY_EARTH, GameTags.PROPERTY_METAL],
    },
    {
        id: 'buried_titan', name: '매몰 거인', description: '오래된 대지층을 어깨에 이고 일어선 석질 거인.', level: 175,
        baseAttribute: { maxLife: 25500, atk: 590, magicForce: 510, def: 405, magicDef: 330, speed: 0.95, attackSpeed: 0.65 },
        drops: [{ itemDataId: 'stone', minCount: 8, maxCount: 15, chance: 0.7 }], goldReward: { min: 570, max: 920 },
        tags: [GameTags.ENTITY_ELEMENTAL, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_EARTH, GameTags.PROPERTY_STONE],
    },
    {
        id: 'corebreaker', name: '지핵 파쇄자', description: '땅속 금속맥을 찢으며 전진하는 황무지의 최상위 포식체.', level: 185,
        baseAttribute: { maxLife: 31000, atk: 650, magicForce: 560, def: 430, magicDef: 365, armorPen: 35, speed: 2.1 },
        drops: [{ itemDataId: 'diamond', minCount: 3, maxCount: 6, chance: 0.35 }], goldReward: { min: 630, max: 1020 },
        tags: [GameTags.ENTITY_BEAST, GameTags.PROPERTY_EARTH, GameTags.PROPERTY_METAL, GameTags.PROPERTY_STONE],
    },
    {
        id: 'ironroot_heartwarden', name: '철근 심장수호자',
        description: '세 공명 수정의 진동으로 몸을 보호하는 철근미궁의 수호자. 수정이 남아 있으면 받는 피해가 85% 감소하고 공명 폭주가 강화된다. 가장 위협적인 한 명을 철근으로 고정해 방어를 무시하고 압살한다.',
        level: 180,
        baseAttribute: {
            maxLife: 185000, atk: 680, magicForce: 710, def: 455, magicDef: 470,
            speed: 1.35, attackSpeed: 0.38, critRate: 0.12, critDmg: 1.75,
        },
        expReward: 180 * 20 * 7,
        drops: [
            { itemDataId: 'diamond', minCount: 6, maxCount: 10, chance: 0.5 },
            { itemDataId: 'ruby', minCount: 5, maxCount: 8, chance: 0.4 },
            { itemDataId: 'emerald', minCount: 5, maxCount: 8, chance: 0.4 },
        ],
        goldReward: { min: 1450, max: 2300 },
        attack: { damageType: 'magic' },
        skills: [
            { skillDataId: 'ironroot_lockdown', level: 5 },
            { skillDataId: 'seismic_crush', level: 5 },
        ],
        skillPattern: {
            sequence: ['ironroot_lockdown', 'seismic_crush'],
            initialDelay: 4,
            interval: { min: 7, max: 10 },
        },
        challengePattern: { handler: 'ironroot:resonance-storm', initialDelay: 7, interval: { min: 15, max: 20 } },
        ai: {
            intelligence: 96, disposition: MonsterAiDisposition.THREAT,
            weights: { attack: 0.15, damage: 1, healing: 1.55, shielding: 1.25, control: 1.2, taunt: 2.8 },
            tauntResistance: 0.88, switchThreshold: 0.28, decayPerSecond: 0.006,
        },
        tags: [
            GameTags.ENTITY_BOSS, GameTags.ENTITY_ELEMENTAL, GameTags.TRAIT_INANIMATE,
            GameTags.PROPERTY_EARTH, GameTags.PROPERTY_METAL, GameTags.PROPERTY_STONE,
        ],
    },
    {
        id: 'rift_spark', name: '균열 섬광체', description: '빛과 어둠 사이에서 불안정하게 번쩍이는 차원 생명.', level: 190,
        baseAttribute: { maxLife: 33000, atk: 625, magicForce: 690, def: 380, magicDef: 445, speed: 3.8, attackSpeed: 1.35 },
        drops: [{ itemDataId: 'mana_potion', minCount: 5, maxCount: 9, chance: 0.55 }], goldReward: { min: 670, max: 1080 },
        attack: { damageType: 'magic' }, tags: [GameTags.ENTITY_ELEMENTAL, GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_DARK, GameTags.PROPERTY_ELECTRIC],
    },
    {
        id: 'eclipse_watcher', name: '일식의 감시자', description: '균열의 길목에서 빛과 그림자의 균형을 감시하는 인형.', level: 200,
        baseAttribute: { maxLife: 39000, atk: 690, magicForce: 735, def: 455, magicDef: 485, speed: 2.5, critRate: 0.15, critDmg: 1.8 },
        drops: [{ itemDataId: 'diamond', minCount: 4, maxCount: 8, chance: 0.4 }], goldReward: { min: 730, max: 1180 },
        tags: [GameTags.ENTITY_HUMANOID, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_DARK],
    },
    {
        id: 'astral_gatekeeper', name: '성계 문지기', description: '서로 반대되는 속성을 안정시켜 성계 관문을 붙드는 초월 거상.', level: 210,
        baseAttribute: { maxLife: 240000, atk: 880, magicForce: 920, def: 560, magicDef: 590, speed: 1.4, attackSpeed: 0.32, critRate: 0.18, critDmg: 1.9 },
        expReward: 210 * 20 * 7,
        drops: [{ itemDataId: 'diamond', minCount: 8, maxCount: 14, chance: 0.55 }], goldReward: { min: 1800, max: 2800 },
        skills: [{ skillDataId: 'seismic_crush', level: 5 }],
        skillPattern: { sequence: ['seismic_crush'], initialDelay: 4, interval: { min: 9, max: 12 } },
        challengePattern: { handler: 'astral:crossfire', initialDelay: 7, interval: { min: 16, max: 21 } },
        ai: {
            intelligence: 98, disposition: MonsterAiDisposition.THREAT,
            weights: { attack: 0.15, damage: 1, healing: 1.6, shielding: 1.2, control: 1.3, taunt: 3 },
            tauntResistance: 0.9, switchThreshold: 0.3, decayPerSecond: 0.005,
        },
        tags: [GameTags.ENTITY_BOSS, GameTags.ENTITY_ELEMENTAL, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_DARK],
    },
];

for (const monster of advancedWorldMonsters) defineWorldMonster(monster);
