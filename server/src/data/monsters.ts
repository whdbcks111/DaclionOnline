// 공격 부가효과 ID를 등록 시점에 검증하므로 레지스트리를 먼저 초기화한다.
import './statusEffects.js';
import { defineMonster } from '../models/Monster.js';
import type { MonsterData } from '../models/Monster.js';
import Entity from '../models/Entity.js';
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
        expReward: data.expReward ?? Entity.getStandardMonsterExpOfLevel(data.level),
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
    tags: [GameTags.ENTITY_BEAST, GameTags.ENTITY_WOLF, GameTags.PROPERTY_NATURAL],
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
    tags: [GameTags.ENTITY_BEAST, GameTags.ENTITY_WOLF, GameTags.PROPERTY_NATURAL],
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
    tags: [GameTags.ENTITY_BOSS, GameTags.ENTITY_BEAST, GameTags.ENTITY_WOLF, GameTags.PROPERTY_NATURAL],
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
        tags: [GameTags.ENTITY_BEAST, GameTags.ENTITY_WOLF, GameTags.PROPERTY_NATURAL, GameTags.PROPERTY_ICE],
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

const misttideMonsters: readonly WorldMonsterData[] = [
    {
        id: 'saltplate_crab', name: '염갑 바위게',
        description: '해무 소금과 검은 산호가 등껍질에 굳어 작은 성벽처럼 된 해안 갑각류.', level: 156,
        baseAttribute: { maxLife: 18_600, atk: 515, def: 388, magicDef: 275, armorPen: 32, speed: 1.05, attackSpeed: 0.72 },
        drops: [
            { itemDataId: 'mist_salt', minCount: 2, maxCount: 5, chance: 0.64 },
            { itemDataId: 'black_coral', minCount: 1, maxCount: 2, chance: 0.28 },
        ],
        goldReward: { min: 490, max: 810 },
        tags: [GameTags.ENTITY_BEAST, GameTags.PROPERTY_WATER, GameTags.PROPERTY_STONE],
    },
    {
        id: 'fogwing_ray', name: '해무날개 가오리',
        description: '젖은 안개 사이를 날아다니며 그림자처럼 내려앉는 바다 마력체.', level: 159,
        baseAttribute: { maxLife: 15_800, atk: 468, magicForce: 525, def: 270, magicDef: 345, magicPen: 38, speed: 3.1, attackSpeed: 1.25 },
        drops: [
            { itemDataId: 'mist_salt', minCount: 1, maxCount: 3, chance: 0.45 },
            { itemDataId: 'tide_pearl', minCount: 1, maxCount: 1, chance: 0.13 },
        ],
        goldReward: { min: 505, max: 835 },
        attack: { damageType: 'magic', effect: { statusEffectId: 'blindness', chance: 0.2, duration: 4, level: 7 } },
        tags: [GameTags.ENTITY_ELEMENTAL, GameTags.PROPERTY_WATER, GameTags.PROPERTY_DARK],
    },
    {
        id: 'kelp_stalker', name: '청해초 추적자',
        description: '떠다니는 해초처럼 위장했다가 수지 덩굴로 발목을 묶는 연안 포식자.', level: 162,
        baseAttribute: { maxLife: 17_900, atk: 530, magicForce: 498, def: 315, magicDef: 330, speed: 2.2, attackSpeed: 1.02 },
        drops: [
            { itemDataId: 'kelp_resin', minCount: 1, maxCount: 4, chance: 0.62 },
            { itemDataId: 'siren_scale', minCount: 1, maxCount: 1, chance: 0.12 },
        ],
        goldReward: { min: 520, max: 860 },
        attack: { effect: { statusEffectId: 'bind', chance: 0.22, duration: 3, level: 7 } },
        tags: [GameTags.ENTITY_BEAST, GameTags.PROPERTY_WATER, GameTags.PROPERTY_NATURAL],
    },
    {
        id: 'wreck_diver_revenant', name: '난파 잠수망자',
        description: '부서진 항구에서 마지막 인양 명령을 반복하는 녹슨 잠수복의 망자.', level: 165,
        baseAttribute: { maxLife: 20_400, atk: 558, def: 382, magicDef: 325, armorPen: 40, speed: 1.45, attackSpeed: 0.82 },
        drops: [
            { itemDataId: 'drowned_insignia', minCount: 1, maxCount: 3, chance: 0.5 },
            { itemDataId: 'abyssal_iron', minCount: 1, maxCount: 2, chance: 0.3 },
        ],
        goldReward: { min: 540, max: 895 },
        attack: { effect: { statusEffectId: 'decay', chance: 0.26, duration: 10, level: 8 } },
        tags: [GameTags.ENTITY_HUMANOID, GameTags.PROPERTY_UNDEAD, GameTags.PROPERTY_METAL, GameTags.PROPERTY_WATER],
    },
    {
        id: 'blackcoral_golem', name: '흑산호 수호체',
        description: '침몰왕도의 벽을 덮은 흑산호가 수압과 명령 마력에 뭉쳐진 수호체.', level: 168,
        baseAttribute: { maxLife: 25_800, atk: 585, def: 465, magicDef: 340, armorPen: 44, speed: 0.9, attackSpeed: 0.58 },
        drops: [
            { itemDataId: 'black_coral', minCount: 2, maxCount: 5, chance: 0.68 },
            { itemDataId: 'leviathan_bone', minCount: 1, maxCount: 2, chance: 0.2 },
        ],
        goldReward: { min: 560, max: 925 },
        attack: { effect: { statusEffectId: 'slowness', chance: 0.28, duration: 8, level: 8 } },
        tags: [GameTags.ENTITY_ELEMENTAL, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_WATER, GameTags.PROPERTY_STONE],
    },
    {
        id: 'mist_siren_cantor', name: '해무 세이렌 창가',
        description: '안개 속에서 여러 방향으로 노래를 반사해 사냥감의 판단을 흐리는 세이렌.', level: 169,
        baseAttribute: { maxLife: 18_500, atk: 475, magicForce: 590, def: 295, magicDef: 390, magicPen: 44, speed: 2.45, attackSpeed: 1 },
        drops: [
            { itemDataId: 'siren_scale', minCount: 1, maxCount: 3, chance: 0.58 },
            { itemDataId: 'tide_pearl', minCount: 1, maxCount: 2, chance: 0.2 },
        ],
        goldReward: { min: 570, max: 945 },
        attack: { damageType: 'magic', effect: { statusEffectId: 'charm', chance: 0.22, duration: 3, level: 8 } },
        tags: [GameTags.ENTITY_HUMANOID, GameTags.PROPERTY_WATER, GameTags.PROPERTY_LIGHT],
    },
    {
        id: 'mist_siren_matriarch', name: '해무 세이렌 군주',
        description: '노래와 역조로 암초만 전체를 사냥터로 바꾼 필드 보스. 치유와 제어를 사용하는 대상을 합창의 중심으로 삼는다.', level: 171,
        baseAttribute: {
            maxLife: 93_000, atk: 525, magicForce: 655, def: 365, magicDef: 425,
            magicPen: 52, speed: 2.4, attackSpeed: 0.76, critRate: 0.14, critDmg: 1.8,
        },
        expReward: 171 * 20 * 6,
        drops: [
            { itemDataId: 'siren_scale', minCount: 5, maxCount: 9, chance: 0.92 },
            { itemDataId: 'tide_pearl', minCount: 2, maxCount: 5, chance: 0.64 },
            { itemDataId: 'mistcurrent_bow', minCount: 1, maxCount: 1, chance: 0.035 },
            { itemDataId: 'siren_wave_skillbook', minCount: 1, maxCount: 1, chance: 0.025 },
        ],
        goldReward: { min: 880, max: 1_420 },
        attack: { damageType: 'magic', effect: { statusEffectId: 'charm', chance: 0.3, duration: 3.5, level: 9 } },
        skills: [
            { skillDataId: 'siren_fog_chorus', level: 5 },
            { skillDataId: 'undertow_silence', level: 5 },
        ],
        skillPattern: {
            sequence: ['siren_fog_chorus', 'undertow_silence'], randomOrder: true,
            initialDelay: 4, interval: { min: 7, max: 10 },
        },
        ai: {
            intelligence: 88, disposition: MonsterAiDisposition.THREAT,
            weights: { attack: 0.18, damage: 1.05, healing: 1.55, shielding: 1.15, control: 1.5, taunt: 2.45 },
            tauntResistance: 0.76, switchThreshold: 0.23,
        },
        tags: [GameTags.ENTITY_BOSS, GameTags.ENTITY_HUMANOID, GameTags.PROPERTY_WATER, GameTags.PROPERTY_LIGHT, 'monster:mist-siren-matriarch'],
    },
    {
        id: 'deepwater_sentinel', name: '심수 성문수호자',
        description: '침수된 성문의 수압을 방패처럼 끌어와 통로를 막는 고대 수호병.', level: 174,
        baseAttribute: { maxLife: 23_800, atk: 610, magicForce: 540, def: 420, magicDef: 380, armorPen: 48, speed: 1.25, attackSpeed: 0.72 },
        drops: [
            { itemDataId: 'abyssal_iron', minCount: 1, maxCount: 4, chance: 0.58 },
            { itemDataId: 'drowned_insignia', minCount: 1, maxCount: 3, chance: 0.42 },
        ],
        goldReward: { min: 595, max: 985 },
        attack: { effect: { statusEffectId: 'defense_reduction', chance: 0.25, duration: 9, level: 8 } },
        tags: [GameTags.ENTITY_HUMANOID, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_METAL, GameTags.PROPERTY_WATER],
    },
    {
        id: 'drowned_archivist', name: '침수 기록술사',
        description: '젖어 지워진 왕국 기록을 망자의 기억으로 다시 쓰는 침몰왕도의 술사.', level: 178,
        baseAttribute: { maxLife: 20_700, atk: 505, magicForce: 645, def: 325, magicDef: 430, magicPen: 50, speed: 1.9, attackSpeed: 0.9 },
        drops: [
            { itemDataId: 'drowned_insignia', minCount: 2, maxCount: 4, chance: 0.55 },
            { itemDataId: 'tide_pearl', minCount: 1, maxCount: 3, chance: 0.34 },
        ],
        goldReward: { min: 620, max: 1_025 },
        attack: { damageType: 'magic', effect: { statusEffectId: 'silence', chance: 0.25, duration: 4, level: 8 } },
        tags: [GameTags.ENTITY_HUMANOID, GameTags.PROPERTY_UNDEAD, GameTags.PROPERTY_WATER, GameTags.PROPERTY_DARK],
    },
    {
        id: 'abyssal_knight', name: '심연 닻기사',
        description: '심해철 닻을 끌며 도망치는 침입자를 바닥에 고정하는 침수 군단의 기사.', level: 182,
        baseAttribute: { maxLife: 25_400, atk: 675, def: 438, magicDef: 392, armorPen: 56, speed: 1.55, attackSpeed: 0.76, critRate: 0.11 },
        drops: [
            { itemDataId: 'abyssal_iron', minCount: 2, maxCount: 5, chance: 0.62 },
            { itemDataId: 'leviathan_bone', minCount: 1, maxCount: 3, chance: 0.35 },
        ],
        goldReward: { min: 650, max: 1_075 },
        attack: { effect: { statusEffectId: 'bind', chance: 0.28, duration: 3.5, level: 9 } },
        tags: [GameTags.ENTITY_HUMANOID, GameTags.PROPERTY_UNDEAD, GameTags.PROPERTY_METAL, GameTags.PROPERTY_WATER],
    },
    {
        id: 'drowned_admiral', name: '침몰제독 아르켄',
        description: '왕도가 가라앉은 뒤에도 함대 명령을 끝내지 않은 군주. 도발에 거의 흔들리지 않고 치유·보호·제어의 중심을 노린다.', level: 186,
        baseAttribute: {
            maxLife: 128_000, atk: 720, magicForce: 655, def: 455, magicDef: 445,
            armorPen: 62, magicPen: 54, speed: 1.55, attackSpeed: 0.64, critRate: 0.15, critDmg: 1.85,
        },
        expReward: 186 * 20 * 7,
        drops: [
            { itemDataId: 'drowned_insignia', minCount: 6, maxCount: 10, chance: 0.95 },
            { itemDataId: 'abyssal_iron', minCount: 5, maxCount: 9, chance: 0.82 },
            { itemDataId: 'leviathan_bone', minCount: 3, maxCount: 6, chance: 0.62 },
            { itemDataId: 'tidebreaker_sword', minCount: 1, maxCount: 1, chance: 0.035 },
            { itemDataId: 'drowned_admiral_shield', minCount: 1, maxCount: 1, chance: 0.03 },
            { itemDataId: 'abyss_anchor_skillbook', minCount: 1, maxCount: 1, chance: 0.022 },
        ],
        goldReward: { min: 1_050, max: 1_700 },
        attack: { effect: { statusEffectId: 'decay', chance: 0.34, duration: 12, level: 10 } },
        skills: [
            { skillDataId: 'admiral_abyss_anchor', level: 5 },
            { skillDataId: 'drowned_fleet_command', level: 5 },
            { skillDataId: 'undertow_silence', level: 5 },
        ],
        skillPattern: {
            sequence: ['admiral_abyss_anchor', 'drowned_fleet_command', 'undertow_silence'], randomOrder: true,
            initialDelay: 4, interval: { min: 6, max: 9 },
        },
        ai: {
            intelligence: 97, disposition: MonsterAiDisposition.THREAT,
            weights: { attack: 0.1, damage: 1, healing: 1.75, shielding: 1.5, control: 1.65, taunt: 3.2 },
            tauntResistance: 0.9, switchThreshold: 0.3, decayPerSecond: 0.006,
        },
        tags: [GameTags.ENTITY_BOSS, GameTags.ENTITY_HUMANOID, GameTags.PROPERTY_UNDEAD, GameTags.PROPERTY_METAL, GameTags.PROPERTY_WATER, 'monster:drowned-admiral'],
    },
];

for (const monster of misttideMonsters) defineWorldMonster(monster);

const paradoxClockworkMonsters: readonly WorldMonsterData[] = [
    {
        id: 'gearmite_scavenger', name: '톱니진드기',
        description: '버려진 장치 사이를 돌아다니며 닳은 톱니를 몸에 덧붙이는 작은 기계충.', level: 196,
        baseAttribute: { maxLife: 35_500, atk: 682, def: 438, magicDef: 370, armorPen: 38, speed: 3.35, attackSpeed: 1.42 },
        drops: [
            { itemDataId: 'memory_gear', minCount: 1, maxCount: 3, chance: 0.58 },
            { itemDataId: 'chronosteel_shard', minCount: 1, maxCount: 2, chance: 0.26 },
        ],
        goldReward: { min: 720, max: 1_160 },
        tags: [GameTags.ENTITY_BEAST, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_INSECT, GameTags.PROPERTY_METAL],
    },
    {
        id: 'clockwork_hound', name: '태엽 추적견',
        description: '마지막으로 감지한 침입자의 보폭을 기억하고 같은 속도로 추격하는 자동 사냥개.', level: 199,
        baseAttribute: { maxLife: 38_200, atk: 714, def: 420, magicDef: 382, armorPen: 44, speed: 3.8, attackSpeed: 1.34 },
        drops: [
            { itemDataId: 'automaton_plate', minCount: 1, maxCount: 3, chance: 0.5 },
            { itemDataId: 'void_spring', minCount: 1, maxCount: 2, chance: 0.24 },
        ],
        goldReward: { min: 745, max: 1_195 },
        attack: { effect: { statusEffectId: 'bleeding', chance: 0.22, duration: 8, level: 9 } },
        tags: [GameTags.ENTITY_BEAST, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_METAL, GameTags.PROPERTY_ELECTRIC],
    },
    {
        id: 'lens_sentinel', name: '광학 파수기',
        description: '광자 렌즈로 침입자의 다음 위치를 예측해 빛줄기를 먼저 쏘는 부유 파수기.', level: 202,
        baseAttribute: { maxLife: 37_600, atk: 650, magicForce: 760, def: 390, magicDef: 480, magicPen: 48, speed: 3.15, attackSpeed: 1.18 },
        drops: [
            { itemDataId: 'photon_lens', minCount: 1, maxCount: 2, chance: 0.48 },
            { itemDataId: 'logic_core', minCount: 1, maxCount: 1, chance: 0.17 },
        ],
        goldReward: { min: 770, max: 1_230 },
        attack: { damageType: 'magic', effect: { statusEffectId: 'blindness', chance: 0.2, duration: 5, level: 9 } },
        tags: [GameTags.ENTITY_ELEMENTAL, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_METAL],
    },
    {
        id: 'scrap_centurion', name: '폐철 백인대장',
        description: '부서진 병사들의 장갑을 모아 덧댄 뒤 낡은 대형을 홀로 반복하는 지휘 자동인형.', level: 205,
        baseAttribute: { maxLife: 44_800, atk: 754, def: 502, magicDef: 415, armorPen: 46, speed: 1.8, attackSpeed: 0.82 },
        drops: [
            { itemDataId: 'automaton_plate', minCount: 2, maxCount: 4, chance: 0.64 },
            { itemDataId: 'archive_key_fragment', minCount: 1, maxCount: 1, chance: 0.15 },
        ],
        goldReward: { min: 795, max: 1_275 },
        attack: { effect: { statusEffectId: 'defense_reduction', chance: 0.24, duration: 8, level: 9 } },
        tags: [GameTags.ENTITY_HUMANOID, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_METAL],
    },
    {
        id: 'phase_crow', name: '위상 까마귀',
        description: '한 박자 뒤의 자기 위치와 번갈아 나타나며 공허 용수철을 훔치는 검은 기계조.', level: 208,
        baseAttribute: { maxLife: 39_400, atk: 705, magicForce: 782, def: 405, magicDef: 468, magicPen: 52, speed: 4.2, attackSpeed: 1.45 },
        drops: [
            { itemDataId: 'void_spring', minCount: 1, maxCount: 3, chance: 0.56 },
            { itemDataId: 'paradox_thread', minCount: 1, maxCount: 1, chance: 0.12 },
        ],
        goldReward: { min: 820, max: 1_315 },
        attack: { damageType: 'magic', effect: { statusEffectId: 'slowness', chance: 0.22, duration: 6, level: 10 } },
        tags: [GameTags.ENTITY_BEAST, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_DARK, GameTags.PROPERTY_ELECTRIC],
    },
    {
        id: 'logic_golem', name: '논리식 골렘',
        description: '같은 공격을 반복해서 받을수록 방어 식을 고쳐 쓰는 다면체 기계 골렘.', level: 211,
        baseAttribute: { maxLife: 51_500, atk: 752, magicForce: 805, def: 545, magicDef: 535, speed: 1.25, attackSpeed: 0.68 },
        drops: [
            { itemDataId: 'logic_core', minCount: 1, maxCount: 2, chance: 0.46 },
            { itemDataId: 'chronosteel_shard', minCount: 2, maxCount: 4, chance: 0.52 },
        ],
        goldReward: { min: 850, max: 1_360 },
        attack: { damageType: 'magic' },
        tags: [GameTags.ENTITY_ELEMENTAL, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_METAL],
    },
    {
        id: 'archive_mimic', name: '기록고 의태함',
        description: '열쇠를 찾는 손길을 기다렸다가 기억과 마력을 함께 물어뜯는 보관함 모양 자동인형.', level: 214,
        baseAttribute: { maxLife: 47_600, atk: 805, magicForce: 742, def: 518, magicDef: 460, armorPen: 52, speed: 1.55, attackSpeed: 0.9 },
        drops: [
            { itemDataId: 'archive_key_fragment', minCount: 1, maxCount: 3, chance: 0.62 },
            { itemDataId: 'paradox_thread', minCount: 1, maxCount: 2, chance: 0.18 },
        ],
        goldReward: { min: 880, max: 1_410 },
        attack: { damageType: 'magic', effect: { statusEffectId: 'silence', chance: 0.18, duration: 4, level: 10 } },
        tags: [GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_DARK, GameTags.PROPERTY_METAL],
    },
    {
        id: 'photon_executioner', name: '광자 처형기',
        description: '유죄로 분류한 목표의 회피 경로를 지운 뒤 광자 도끼를 내리치는 고등 자동병기.', level: 218,
        baseAttribute: { maxLife: 56_800, atk: 842, magicForce: 835, def: 565, magicDef: 548, armorPen: 58, magicPen: 56, speed: 2.05, attackSpeed: 0.76 },
        drops: [
            { itemDataId: 'photon_lens', minCount: 1, maxCount: 3, chance: 0.55 },
            { itemDataId: 'fracture_crystal', minCount: 1, maxCount: 2, chance: 0.22 },
        ],
        goldReward: { min: 920, max: 1_470 },
        attack: { damageType: 'magic', effect: { statusEffectId: 'magic_defense_reduction', chance: 0.24, duration: 8, level: 10 } },
        tags: [GameTags.ENTITY_HUMANOID, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_METAL],
    },
    {
        id: 'chronosteel_colossus', name: '시간강 거신',
        description: '폐쇄된 주조로를 지키는 거대 자동인형. 느린 태엽 과주행과 회피할 수 없는 시간강 정지추를 번갈아 사용한다.', level: 220,
        baseAttribute: { maxLife: 340_000, atk: 940, magicForce: 925, def: 650, magicDef: 625, armorPen: 62, magicPen: 60, speed: 1.2, attackSpeed: 0.34, critRate: 0.16, critDmg: 1.9 },
        expReward: 220 * 20 * 7,
        drops: [
            { itemDataId: 'chronosteel_shard', minCount: 8, maxCount: 14, chance: 0.9 },
            { itemDataId: 'automaton_plate', minCount: 6, maxCount: 10, chance: 0.75 },
            { itemDataId: 'gearstorm_skillbook', minCount: 1, maxCount: 1, chance: 0.035 },
            { itemDataId: 'causality_lock_skillbook', minCount: 1, maxCount: 1, chance: 0.025 },
        ],
        goldReward: { min: 2_100, max: 3_250 },
        skills: [
            { skillDataId: 'clockwork_overrun', level: 5 },
            { skillDataId: 'chronosteel_time_lock', level: 5 },
        ],
        skillPattern: { sequence: ['clockwork_overrun', 'chronosteel_time_lock'], initialDelay: 4, interval: { min: 7, max: 10 } },
        ai: {
            intelligence: 88, disposition: MonsterAiDisposition.THREAT,
            weights: { attack: 0.2, damage: 1, healing: 1.35, shielding: 1.15, control: 1.4, taunt: 2.5 },
            tauntResistance: 0.78, switchThreshold: 0.24, decayPerSecond: 0.007,
        },
        tags: [GameTags.ENTITY_BOSS, GameTags.ENTITY_ELEMENTAL, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_METAL, GameTags.PROPERTY_ELECTRIC, 'monster:chronosteel-colossus'],
    },
    {
        id: 'fracture_shade', name: '균열 잔영',
        description: '파괴된 시간대에서 흘러나와 현재의 공격보다 반 박자 늦게 상처를 남기는 마력 잔상.', level: 224,
        baseAttribute: { maxLife: 52_500, atk: 770, magicForce: 892, def: 455, magicDef: 595, magicPen: 66, speed: 4.35, attackSpeed: 1.38 },
        drops: [
            { itemDataId: 'fracture_crystal', minCount: 1, maxCount: 3, chance: 0.58 },
            { itemDataId: 'paradox_thread', minCount: 1, maxCount: 2, chance: 0.25 },
        ],
        goldReward: { min: 970, max: 1_560 },
        attack: { damageType: 'magic', effect: { statusEffectId: 'decay', chance: 0.24, duration: 9, level: 11 } },
        tags: [GameTags.ENTITY_ELEMENTAL, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_DARK, GameTags.PROPERTY_LIGHT],
    },
    {
        id: 'paradox_doll', name: '역설 꼭두각시',
        description: '쓰러진 기록과 아직 싸우지 않은 기록을 번갈아 불러내는 인간형 전투 인형.', level: 228,
        baseAttribute: { maxLife: 61_500, atk: 892, magicForce: 905, def: 592, magicDef: 610, armorPen: 64, magicPen: 68, speed: 3.1, attackSpeed: 1.08, critRate: 0.18, critDmg: 1.95 },
        drops: [
            { itemDataId: 'memory_gear', minCount: 2, maxCount: 5, chance: 0.62 },
            { itemDataId: 'archive_key_fragment', minCount: 1, maxCount: 3, chance: 0.38 },
            { itemDataId: 'paradox_thread', minCount: 1, maxCount: 2, chance: 0.27 },
        ],
        goldReward: { min: 1_020, max: 1_640 },
        attack: { damageType: 'magic', effect: { statusEffectId: 'bind', chance: 0.2, duration: 4, level: 11 } },
        tags: [GameTags.ENTITY_HUMANOID, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_DARK],
    },
    {
        id: 'paradox_architect', name: '역설설계자 오르도',
        description: '역설기계고의 모든 인과 연산을 다시 쓰려는 최종 설계자. 세 역설 고정자가 남아 있는 동안 받는 피해가 75% 감소한다.', level: 235,
        baseAttribute: { maxLife: 480_000, atk: 1_010, magicForce: 1_085, def: 690, magicDef: 720, armorPen: 72, magicPen: 78, speed: 2.55, attackSpeed: 0.48, critRate: 0.2, critDmg: 2 },
        expReward: 235 * 20 * 8,
        drops: [
            { itemDataId: 'logic_core', minCount: 6, maxCount: 10, chance: 0.9 },
            { itemDataId: 'fracture_crystal', minCount: 5, maxCount: 9, chance: 0.82 },
            { itemDataId: 'photon_lance_skillbook', minCount: 1, maxCount: 1, chance: 0.04 },
            { itemDataId: 'paradox_reversal_skillbook', minCount: 1, maxCount: 1, chance: 0.025 },
        ],
        goldReward: { min: 2_850, max: 4_300 },
        skills: [
            { skillDataId: 'architect_causality_sever', level: 5 },
            { skillDataId: 'architect_photon_verdict', level: 5 },
            { skillDataId: 'chronosteel_time_lock', level: 5 },
        ],
        skillPattern: {
            sequence: ['architect_causality_sever', 'architect_photon_verdict', 'chronosteel_time_lock'],
            randomOrder: true, initialDelay: 3.5, interval: { min: 6, max: 8.5 },
        },
        ai: {
            intelligence: 100, disposition: MonsterAiDisposition.THREAT,
            weights: { attack: 0.08, damage: 1, healing: 1.95, shielding: 1.75, control: 1.8, taunt: 3.4 },
            tauntResistance: 0.94, switchThreshold: 0.32, decayPerSecond: 0.004,
        },
        tags: [GameTags.ENTITY_BOSS, GameTags.ENTITY_HUMANOID, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_DARK, GameTags.PROPERTY_METAL, 'monster:paradox-architect'],
    },
];

for (const monster of paradoxClockworkMonsters) defineWorldMonster(monster);

const ashenAbyssMonsters: WorldMonsterData[] = [
    {
        id: 'ashen_hound', name: '재길 사냥개',
        description: '꺼지지 않는 재를 털가죽 사이에 품고 마지막으로 자신을 친 자를 끝까지 추적하는 심연의 사냥개.', level: 238,
        baseAttribute: {
            maxLife: 65_500, atk: 925, def: 585, magicDef: 520, armorPen: 62,
            speed: 4.35, attackSpeed: 1.42, critRate: 0.18, critDmg: 1.9,
        },
        drops: [
            { itemDataId: 'ashen_sinew', minCount: 1, maxCount: 3, chance: 0.62 },
            { itemDataId: 'abyssal_hide', minCount: 1, maxCount: 2, chance: 0.28 },
        ],
        goldReward: { min: 1_080, max: 1_720 },
        attack: { effect: { statusEffectId: 'bleeding', chance: 0.24, duration: 9, level: 11 } },
        tags: [GameTags.ENTITY_BEAST, GameTags.PROPERTY_FIRE, GameTags.PROPERTY_DARK],
    },
    {
        id: 'mourning_wraith', name: '곡성 망령',
        description: '망자의 골짜기에 남은 이름을 울음으로 되풀이하며 정신을 갉아먹는 검은 망령.', level: 241,
        baseAttribute: {
            maxLife: 62_800, atk: 810, magicForce: 985, def: 475, magicDef: 650, magicPen: 74,
            speed: 3.75, attackSpeed: 1.18,
        },
        drops: [
            { itemDataId: 'mourning_eye', minCount: 1, maxCount: 2, chance: 0.5 },
            { itemDataId: 'blackflame_residue', minCount: 1, maxCount: 2, chance: 0.25 },
        ],
        goldReward: { min: 1_120, max: 1_790 },
        attack: { damageType: 'magic', effect: { statusEffectId: 'fear', chance: 0.2, duration: 4, level: 11 } },
        tags: [GameTags.ENTITY_ELEMENTAL, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_UNDEAD, GameTags.PROPERTY_DARK],
    },
    {
        id: 'horned_reaver', name: '공허뿔 약탈자',
        description: '빈 뿔에서 울리는 전장의 메아리를 따라 가장 크게 상처 입힌 적에게 돌진하는 마수.', level: 244,
        baseAttribute: {
            maxLife: 74_500, atk: 1_015, def: 640, magicDef: 555, armorPen: 72,
            speed: 3.2, attackSpeed: 0.92, critRate: 0.2, critDmg: 2,
        },
        drops: [
            { itemDataId: 'hollow_horn', minCount: 1, maxCount: 2, chance: 0.52 },
            { itemDataId: 'ashen_sinew', minCount: 1, maxCount: 2, chance: 0.34 },
        ],
        goldReward: { min: 1_160, max: 1_860 },
        attack: { effect: { statusEffectId: 'defense_reduction', chance: 0.23, duration: 9, level: 12 } },
        tags: [GameTags.ENTITY_BEAST, GameTags.PROPERTY_DARK, GameTags.PROPERTY_EARTH],
    },
    {
        id: 'three_maw_gatekeeper', name: '세 아귀 문지기',
        description: '세 개의 목이 서로 다른 침입자를 기억하는 잿빛성흔 심연의 첫 관문 보스. 흑염포와 회피할 수 없는 물어뜯기를 번갈아 사용한다.', level: 248,
        baseAttribute: {
            maxLife: 585_000, atk: 1_090, magicForce: 1_105, def: 710, magicDef: 690,
            armorPen: 78, magicPen: 76, speed: 2.55, attackSpeed: 0.44, critRate: 0.2, critDmg: 2.05,
        },
        expReward: 248 * 20 * 7,
        drops: [
            { itemDataId: 'hollow_horn', minCount: 5, maxCount: 9, chance: 0.9 },
            { itemDataId: 'blackflame_residue', minCount: 4, maxCount: 7, chance: 0.78 },
            { itemDataId: 'hellhound_charge_skillbook', minCount: 1, maxCount: 1, chance: 0.035 },
        ],
        goldReward: { min: 3_250, max: 4_900 },
        skills: [
            { skillDataId: 'gatekeeper_cinder_breath', level: 5 },
            { skillDataId: 'gatekeeper_triple_maul', level: 5 },
        ],
        skillPattern: {
            sequence: ['gatekeeper_cinder_breath', 'gatekeeper_triple_maul'],
            initialDelay: 3.5, interval: { min: 6.5, max: 9 },
        },
        ai: {
            intelligence: 36, disposition: MonsterAiDisposition.LAST_ATTACKER,
            weights: { attack: 1, damage: 1, healing: 0.25, shielding: 0.2, control: 0.45, taunt: 1.2 },
            tauntResistance: 0.18, switchThreshold: 0.05,
        },
        tags: [GameTags.ENTITY_BOSS, GameTags.ENTITY_BEAST, GameTags.PROPERTY_FIRE, GameTags.PROPERTY_DARK, 'monster:three-maw-gatekeeper'],
    },
    {
        id: 'cursebone_archer', name: '저주뼈 궁병',
        description: '활시위를 놓는 순간 자신의 뼈를 화살촉으로 부러뜨리는 잿왕성의 불사 궁병.', level: 249,
        baseAttribute: {
            maxLife: 70_200, atk: 1_035, def: 565, magicDef: 605, armorPen: 80,
            projectileAcceleration: 2.35, speed: 3.4, attackSpeed: 1.24, critRate: 0.22, critDmg: 2.05,
        },
        drops: [
            { itemDataId: 'cursebone_fragment', minCount: 1, maxCount: 3, chance: 0.62 },
            { itemDataId: 'wooden_arrow', minCount: 12, maxCount: 24, chance: 0.45 },
        ],
        goldReward: { min: 1_220, max: 1_950 },
        attack: { effect: { statusEffectId: 'curse', chance: 0.2, duration: 9, level: 12 } },
        tags: [GameTags.ENTITY_HUMANOID, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_UNDEAD, GameTags.PROPERTY_DARK],
    },
    {
        id: 'blackflame_priest', name: '흑염 사제',
        description: '불꽃의 빛을 버리고 열과 저주만 남기는 제례를 반복하는 잿왕성의 사제.', level: 252,
        baseAttribute: {
            maxLife: 72_800, atk: 850, magicForce: 1_075, def: 535, magicDef: 715, magicPen: 84,
            speed: 2.65, attackSpeed: 0.96,
        },
        drops: [
            { itemDataId: 'blackflame_residue', minCount: 1, maxCount: 4, chance: 0.67 },
            { itemDataId: 'mourning_eye', minCount: 1, maxCount: 1, chance: 0.18 },
        ],
        goldReward: { min: 1_260, max: 2_020 },
        attack: { damageType: 'magic', effect: { statusEffectId: 'fire', chance: 0.26, duration: 10, level: 12 } },
        tags: [GameTags.ENTITY_HUMANOID, GameTags.PROPERTY_FIRE, GameTags.PROPERTY_DARK],
    },
    {
        id: 'abyssal_gargoyle', name: '심연 석익수',
        description: '밤쇠와 저주뼈가 성벽의 그림자를 먹고 깨어난 비행 수호상.', level: 255,
        baseAttribute: {
            maxLife: 86_500, atk: 1_060, magicForce: 935, def: 760, magicDef: 625, armorPen: 76,
            speed: 3.15, attackSpeed: 0.78,
        },
        drops: [
            { itemDataId: 'night_iron', minCount: 1, maxCount: 3, chance: 0.55 },
            { itemDataId: 'cursebone_fragment', minCount: 1, maxCount: 2, chance: 0.38 },
        ],
        goldReward: { min: 1_300, max: 2_090 },
        attack: { effect: { statusEffectId: 'slowness', chance: 0.24, duration: 8, level: 12 } },
        tags: [GameTags.ENTITY_ELEMENTAL, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_STONE, GameTags.PROPERTY_DARK],
    },
    {
        id: 'night_iron_knight', name: '밤쇠 근위기사',
        description: '갑옷의 빈 틈까지 검은 철판으로 봉한 채 치료와 보호 행동을 먼저 끊는 잿왕성의 근위병.', level: 258,
        baseAttribute: {
            maxLife: 91_500, atk: 1_145, def: 805, magicDef: 690, armorPen: 86,
            speed: 2.25, attackSpeed: 0.72, critRate: 0.18, critDmg: 2,
        },
        drops: [
            { itemDataId: 'night_iron', minCount: 2, maxCount: 4, chance: 0.64 },
            { itemDataId: 'sovereign_seal_fragment', minCount: 1, maxCount: 1, chance: 0.14 },
        ],
        goldReward: { min: 1_350, max: 2_170 },
        attack: { effect: { statusEffectId: 'bleeding', chance: 0.24, duration: 10, level: 13 } },
        ai: {
            intelligence: 82, disposition: MonsterAiDisposition.THREAT,
            weights: { attack: 0.15, damage: 1, healing: 1.55, shielding: 1.3, control: 1.35, taunt: 2.4 },
            tauntResistance: 0.78, switchThreshold: 0.24, decayPerSecond: 0.008,
        },
        tags: [GameTags.ENTITY_HUMANOID, GameTags.PROPERTY_METAL, GameTags.PROPERTY_DARK],
    },
    {
        id: 'blackflame_general', name: '흑염대장 모르칸',
        description: '흩어진 성군을 한 번의 진군 명령으로 다시 세우는 잿왕성 외성의 지휘관. 도발보다 치유와 제어 행위를 높게 평가한다.', level: 260,
        baseAttribute: {
            maxLife: 735_000, atk: 1_245, magicForce: 1_135, def: 825, magicDef: 755,
            armorPen: 92, magicPen: 80, speed: 2.8, attackSpeed: 0.5, critRate: 0.22, critDmg: 2.1,
        },
        expReward: 260 * 20 * 8,
        drops: [
            { itemDataId: 'night_iron', minCount: 7, maxCount: 12, chance: 0.9 },
            { itemDataId: 'sovereign_seal_fragment', minCount: 3, maxCount: 6, chance: 0.72 },
            { itemDataId: 'blackflame_brand_skillbook', minCount: 1, maxCount: 1, chance: 0.035 },
        ],
        goldReward: { min: 4_050, max: 6_200 },
        skills: [
            { skillDataId: 'blackflame_general_march', level: 5 },
            { skillDataId: 'gatekeeper_cinder_breath', level: 5 },
        ],
        skillPattern: {
            sequence: ['blackflame_general_march', 'gatekeeper_cinder_breath'],
            randomOrder: true, initialDelay: 3, interval: { min: 6, max: 8.5 },
        },
        ai: {
            intelligence: 94, disposition: MonsterAiDisposition.THREAT,
            weights: { attack: 0.1, damage: 1, healing: 1.85, shielding: 1.55, control: 1.7, taunt: 3 },
            tauntResistance: 0.9, switchThreshold: 0.3, decayPerSecond: 0.005,
        },
        tags: [GameTags.ENTITY_BOSS, GameTags.ENTITY_HUMANOID, GameTags.PROPERTY_FIRE, GameTags.PROPERTY_METAL, GameTags.PROPERTY_DARK, 'monster:blackflame-general'],
    },
    {
        id: 'throne_mourner', name: '왕좌의 애도자',
        description: '비어 있는 왕좌 앞에서 끝나지 않는 장송곡을 읊어 생명력과 회복 의지를 함께 시들게 하는 시종.', level: 263,
        baseAttribute: {
            maxLife: 84_600, atk: 910, magicForce: 1_180, def: 605, magicDef: 790, magicPen: 94,
            speed: 2.9, attackSpeed: 1.04,
        },
        drops: [
            { itemDataId: 'mourning_eye', minCount: 1, maxCount: 3, chance: 0.58 },
            { itemDataId: 'sovereign_seal_fragment', minCount: 1, maxCount: 2, chance: 0.24 },
        ],
        goldReward: { min: 1_420, max: 2_280 },
        attack: { damageType: 'magic', effect: { statusEffectId: 'decay', chance: 0.26, duration: 10, level: 13 } },
        tags: [GameTags.ENTITY_HUMANOID, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_UNDEAD, GameTags.PROPERTY_DARK],
    },
    {
        id: 'abyssal_executioner', name: '심연 처형관',
        description: '재왕의 명령이 사라진 뒤에도 가장 약해진 침입자를 골라 형을 집행하는 거대한 밤쇠 집행자.', level: 268,
        baseAttribute: {
            maxLife: 108_000, atk: 1_285, def: 865, magicDef: 735, armorPen: 102,
            speed: 2.1, attackSpeed: 0.6, critRate: 0.24, critDmg: 2.15,
        },
        drops: [
            { itemDataId: 'night_iron', minCount: 2, maxCount: 5, chance: 0.7 },
            { itemDataId: 'abyssal_hide', minCount: 1, maxCount: 3, chance: 0.42 },
        ],
        goldReward: { min: 1_520, max: 2_450 },
        attack: { effect: { statusEffectId: 'defense_reduction', chance: 0.28, duration: 10, level: 14 } },
        ai: {
            intelligence: 88, disposition: MonsterAiDisposition.THREAT,
            weights: { attack: 0.1, damage: 1.2, healing: 1.4, shielding: 1.2, control: 1.55, taunt: 2.7 },
            tauntResistance: 0.84, switchThreshold: 0.27, decayPerSecond: 0.006,
        },
        tags: [GameTags.ENTITY_HUMANOID, GameTags.PROPERTY_METAL, GameTags.PROPERTY_DARK],
    },
    {
        id: 'ashen_sovereign', name: '재왕 벨카르',
        description: '무너진 왕국의 죽음과 흑염을 한 몸에 묶은 잿빛성흔 심연의 군주. 치유·방벽·제어를 읽어 가장 전투를 오래 끌 적부터 심판한다.', level: 275,
        baseAttribute: {
            maxLife: 1_080_000, atk: 1_410, magicForce: 1_465, def: 940, magicDef: 965,
            armorPen: 112, magicPen: 116, speed: 2.7, attackSpeed: 0.46, critRate: 0.25, critDmg: 2.2,
        },
        expReward: 275 * 20 * 9,
        drops: [
            { itemDataId: 'sovereign_seal_fragment', minCount: 8, maxCount: 14, chance: 0.95 },
            { itemDataId: 'mourning_eye', minCount: 6, maxCount: 10, chance: 0.85 },
            { itemDataId: 'sovereign_decree_skillbook', minCount: 1, maxCount: 1, chance: 0.03 },
            { itemDataId: 'ashguard_bulwark', minCount: 1, maxCount: 1, chance: 0.02 },
        ],
        goldReward: { min: 6_200, max: 9_400 },
        skills: [
            { skillDataId: 'sovereign_crownfall', level: 5 },
            { skillDataId: 'sovereign_ash_sentence', level: 5 },
            { skillDataId: 'blackflame_general_march', level: 5 },
        ],
        skillPattern: {
            sequence: ['sovereign_crownfall', 'sovereign_ash_sentence', 'blackflame_general_march'],
            randomOrder: true, initialDelay: 2.8, interval: { min: 5.5, max: 7.5 },
        },
        ai: {
            intelligence: 100, disposition: MonsterAiDisposition.THREAT,
            weights: { attack: 0.04, damage: 1, healing: 2.15, shielding: 1.9, control: 2, taunt: 3.8 },
            tauntResistance: 0.97, switchThreshold: 0.35, decayPerSecond: 0.003,
        },
        tags: [GameTags.ENTITY_BOSS, GameTags.ENTITY_HUMANOID, GameTags.PROPERTY_FIRE, GameTags.PROPERTY_DARK, GameTags.PROPERTY_UNDEAD, 'monster:ashen-sovereign'],
    },
];

for (const monster of ashenAbyssMonsters) defineWorldMonster(monster);

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
        drops: [{ itemDataId: 'helioglass_staff', minCount: 1, maxCount: 1, chance: 0.025 }], goldReward: { min: 320, max: 530 },
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

const voidcrownMonsters: WorldMonsterData[] = [
    {
        id: 'nullsilver_sentinel', name: '무광은 파수병',
        description: '얼굴과 관절을 모두 무광은으로 봉하고 침입자의 마지막 공격만 기계적으로 되갚는 성채 수비병.', level: 278,
        baseAttribute: {
            maxLife: 116_000, atk: 1_330, def: 930, magicDef: 815, armorPen: 108,
            speed: 2.25, attackSpeed: 0.78, critRate: 0.19, critDmg: 2.05,
        },
        drops: [
            { itemDataId: 'nullsilver', minCount: 1, maxCount: 3, chance: 0.64 },
            { itemDataId: 'regent_insignia', minCount: 1, maxCount: 1, chance: 0.12 },
        ],
        goldReward: { min: 1_650, max: 2_650 },
        attack: { effect: { statusEffectId: 'defense_reduction', chance: 0.24, duration: 10, level: 14 } },
        tags: [GameTags.ENTITY_HUMANOID, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_METAL, GameTags.PROPERTY_DARK],
    },
    {
        id: 'voidsilk_moth', name: '공허비단 나방',
        description: '성채의 벽 사이를 접어 이동하며 날갯가루로 시야와 공격 감각을 지우는 거대 나방.', level: 281,
        baseAttribute: {
            maxLife: 109_000, atk: 1_120, magicForce: 1_390, def: 705, magicDef: 900, magicPen: 104,
            speed: 4.6, attackSpeed: 1.36, critRate: 0.22, critDmg: 2.05,
        },
        drops: [
            { itemDataId: 'void_silk', minCount: 1, maxCount: 3, chance: 0.66 },
            { itemDataId: 'crown_glass', minCount: 1, maxCount: 1, chance: 0.16 },
        ],
        goldReward: { min: 1_690, max: 2_710 },
        attack: { damageType: 'magic', effect: { statusEffectId: 'blindness', chance: 0.24, duration: 4, level: 14 } },
        tags: [GameTags.ENTITY_BEAST, GameTags.PROPERTY_INSECT, GameTags.PROPERTY_DARK],
    },
    {
        id: 'starved_gardener', name: '굶주린 정원사',
        description: '기아덩굴에 생명력과 마력을 먹이며 가장 회복을 많이 만든 침입자를 가지치기하는 왕실 정원사.', level: 284,
        baseAttribute: {
            maxLife: 128_000, atk: 1_270, magicForce: 1_360, def: 850, magicDef: 880,
            armorPen: 106, magicPen: 104, speed: 2.65, attackSpeed: 0.9,
        },
        drops: [
            { itemDataId: 'starved_vine', minCount: 1, maxCount: 4, chance: 0.7 },
            { itemDataId: 'astral_ink', minCount: 1, maxCount: 2, chance: 0.22 },
        ],
        goldReward: { min: 1_720, max: 2_780 },
        attack: { damageType: 'magic', effect: { statusEffectId: 'decay', chance: 0.26, duration: 10, level: 14 } },
        ai: {
            intelligence: 86, disposition: MonsterAiDisposition.THREAT,
            weights: { attack: 0.1, damage: 0.9, healing: 1.75, shielding: 1.35, control: 1.15, taunt: 2.4 },
            tauntResistance: 0.78, switchThreshold: 0.25, decayPerSecond: 0.008,
        },
        tags: [GameTags.ENTITY_HUMANOID, GameTags.PROPERTY_NATURAL, GameTags.PROPERTY_DARK],
    },
    {
        id: 'crown_archivist', name: '왕관 서기관',
        description: '별먹으로 침입자의 기술을 기록한 뒤 그 주문의 흐름부터 끊어내는 무표정한 기록관.', level: 287,
        baseAttribute: {
            maxLife: 121_500, atk: 1_155, magicForce: 1_470, def: 770, magicDef: 980, magicPen: 118,
            speed: 2.8, attackSpeed: 1.02,
        },
        drops: [
            { itemDataId: 'astral_ink', minCount: 1, maxCount: 3, chance: 0.65 },
            { itemDataId: 'crown_glass', minCount: 1, maxCount: 2, chance: 0.3 },
        ],
        goldReward: { min: 1_760, max: 2_850 },
        attack: { damageType: 'magic', effect: { statusEffectId: 'silence', chance: 0.22, duration: 4.5, level: 14 } },
        tags: [GameTags.ENTITY_HUMANOID, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_DARK, GameTags.PROPERTY_LIGHT],
    },
    {
        id: 'crownless_castellan', name: '무관성주 테오른',
        description: '왕이 사라진 뒤에도 성벽을 자신의 몸처럼 다루는 공허왕관 외성주. 피해와 치유 위협을 읽되 정해진 공허창과 성벽 파단을 교대로 집행한다.', level: 290,
        baseAttribute: {
            maxLife: 1_320_000, atk: 1_560, magicForce: 1_590, def: 1_070, magicDef: 1_040,
            armorPen: 126, magicPen: 128, speed: 2.4, attackSpeed: 0.44, critRate: 0.23, critDmg: 2.15,
        },
        expReward: 290 * 20 * 8,
        drops: [
            { itemDataId: 'nullsilver', minCount: 7, maxCount: 12, chance: 0.92 },
            { itemDataId: 'regent_insignia', minCount: 3, maxCount: 6, chance: 0.72 },
            { itemDataId: 'voidstep_skillbook', minCount: 1, maxCount: 1, chance: 0.035 },
        ],
        goldReward: { min: 7_200, max: 10_800 },
        skills: [
            { skillDataId: 'castellan_void_lance', level: 5 },
            { skillDataId: 'castellan_rampart_break', level: 5 },
        ],
        skillPattern: {
            sequence: ['castellan_void_lance', 'castellan_rampart_break'],
            initialDelay: 3.2, interval: { min: 6, max: 8 },
        },
        ai: {
            intelligence: 92, disposition: MonsterAiDisposition.THREAT,
            weights: { attack: 0.08, damage: 1.15, healing: 1.7, shielding: 1.5, control: 1.45, taunt: 2.8 },
            tauntResistance: 0.88, switchThreshold: 0.3, decayPerSecond: 0.006,
        },
        tags: [GameTags.ENTITY_BOSS, GameTags.ENTITY_HUMANOID, GameTags.PROPERTY_METAL, GameTags.PROPERTY_DARK, 'monster:crownless-castellan'],
    },
    {
        id: 'mirror_crown_knight', name: '경관 근위기사',
        description: '왕관유리 갑주로 첫 충격을 흘리고 가장 강한 피해를 되돌려 주는 상층 근위기사.', level: 294,
        baseAttribute: {
            maxLife: 146_000, atk: 1_515, def: 1_045, magicDef: 965, armorPen: 122,
            speed: 2.5, attackSpeed: 0.74, critRate: 0.21, critDmg: 2.15,
        },
        drops: [
            { itemDataId: 'nullsilver', minCount: 2, maxCount: 4, chance: 0.68 },
            { itemDataId: 'crown_glass', minCount: 1, maxCount: 3, chance: 0.48 },
        ],
        goldReward: { min: 1_850, max: 3_000 },
        attack: { effect: { statusEffectId: 'bleeding', chance: 0.25, duration: 10, level: 15 } },
        tags: [GameTags.ENTITY_HUMANOID, GameTags.PROPERTY_METAL, GameTags.PROPERTY_LIGHT],
    },
    {
        id: 'hollow_astrologer', name: '빈별 점성술사',
        description: '지워진 별자리의 빈칸을 마력탄으로 바꿔 회피 경로를 미리 봉쇄하는 왕실 마도사.', level: 298,
        baseAttribute: {
            maxLife: 137_000, atk: 1_205, magicForce: 1_620, def: 820, magicDef: 1_060, magicPen: 132,
            projectileAcceleration: 2.8, speed: 3.2, attackSpeed: 1.08, critRate: 0.23, critDmg: 2.2,
        },
        drops: [
            { itemDataId: 'astral_ink', minCount: 2, maxCount: 4, chance: 0.7 },
            { itemDataId: 'crown_glass', minCount: 1, maxCount: 2, chance: 0.36 },
        ],
        goldReward: { min: 1_900, max: 3_080 },
        attack: { damageType: 'magic', effect: { statusEffectId: 'curse', chance: 0.25, duration: 10, level: 15 } },
        tags: [GameTags.ENTITY_HUMANOID, GameTags.PROPERTY_DARK, GameTags.PROPERTY_LIGHT],
    },
    {
        id: 'crown_chimera', name: '왕관 키메라',
        description: '정원 짐승과 석익수의 몸을 이어 붙여 빛과 어둠의 공격을 번갈아 내뿜는 성채의 실험체.', level: 302,
        baseAttribute: {
            maxLife: 162_000, atk: 1_580, magicForce: 1_470, def: 1_020, magicDef: 985,
            armorPen: 128, magicPen: 120, speed: 3.1, attackSpeed: 0.86, critRate: 0.24, critDmg: 2.2,
        },
        drops: [
            { itemDataId: 'starved_vine', minCount: 2, maxCount: 5, chance: 0.62 },
            { itemDataId: 'void_silk', minCount: 1, maxCount: 3, chance: 0.48 },
            { itemDataId: 'regent_insignia', minCount: 1, maxCount: 2, chance: 0.22 },
        ],
        goldReward: { min: 1_980, max: 3_200 },
        attack: { effect: { statusEffectId: 'overmaster', chance: 0.18, duration: 3, level: 15 } },
        tags: [GameTags.ENTITY_BEAST, GameTags.PROPERTY_STONE, GameTags.PROPERTY_DARK, GameTags.PROPERTY_LIGHT],
    },
    {
        id: 'null_adjudicator', name: '무효 판결관',
        description: '침입자의 치유·보호·제어 기록을 비교해 가장 전투를 오래 끌 대상을 우선 판결하는 최상층 집행관.', level: 306,
        baseAttribute: {
            maxLife: 171_000, atk: 1_530, magicForce: 1_690, def: 1_010, magicDef: 1_095,
            armorPen: 126, magicPen: 138, speed: 2.7, attackSpeed: 0.7, critRate: 0.24, critDmg: 2.2,
        },
        drops: [
            { itemDataId: 'regent_insignia', minCount: 1, maxCount: 4, chance: 0.65 },
            { itemDataId: 'nullsilver', minCount: 2, maxCount: 5, chance: 0.6 },
        ],
        goldReward: { min: 2_050, max: 3_320 },
        attack: { damageType: 'magic', effect: { statusEffectId: 'silence', chance: 0.28, duration: 5, level: 15 } },
        ai: {
            intelligence: 96, disposition: MonsterAiDisposition.THREAT,
            weights: { attack: 0.05, damage: 1, healing: 2, shielding: 1.75, control: 1.85, taunt: 3.3 },
            tauntResistance: 0.94, switchThreshold: 0.32, decayPerSecond: 0.004,
        },
        tags: [GameTags.ENTITY_HUMANOID, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_DARK, GameTags.PROPERTY_LIGHT],
    },
    {
        id: 'voidcrown_regent', name: '공허섭정 라시엘',
        description: '왕이 없는 왕관에 스스로 법을 새긴 공허왕관의 지배자. 남은 왕관 기둥으로 피해를 흘리고 전투 기여를 계산해 치유자와 제어자를 우선 무효화한다.', level: 310,
        baseAttribute: {
            maxLife: 1_920_000, atk: 1_720, magicForce: 1_830, def: 1_180, magicDef: 1_210,
            armorPen: 145, magicPen: 152, speed: 2.9, attackSpeed: 0.43, critRate: 0.26, critDmg: 2.3,
        },
        expReward: 310 * 20 * 10,
        drops: [
            { itemDataId: 'regent_insignia', minCount: 9, maxCount: 15, chance: 0.96 },
            { itemDataId: 'crown_glass', minCount: 7, maxCount: 12, chance: 0.88 },
            { itemDataId: 'crown_nullification_skillbook', minCount: 1, maxCount: 1, chance: 0.03 },
            { itemDataId: 'regent_aegis', minCount: 1, maxCount: 1, chance: 0.018 },
        ],
        goldReward: { min: 10_000, max: 15_000 },
        skills: [
            { skillDataId: 'regent_crown_eclipse', level: 5 },
            { skillDataId: 'regent_null_sentence', level: 5 },
            { skillDataId: 'castellan_void_lance', level: 5 },
        ],
        skillPattern: {
            sequence: ['regent_crown_eclipse', 'regent_null_sentence', 'castellan_void_lance'],
            randomOrder: true, initialDelay: 2.7, interval: { min: 5.2, max: 7.2 },
        },
        ai: {
            intelligence: 100, disposition: MonsterAiDisposition.THREAT,
            weights: { attack: 0.03, damage: 1, healing: 2.3, shielding: 2.05, control: 2.15, taunt: 4 },
            tauntResistance: 0.98, switchThreshold: 0.37, decayPerSecond: 0.002,
        },
        tags: [GameTags.ENTITY_BOSS, GameTags.ENTITY_HUMANOID, GameTags.PROPERTY_DARK, GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_METAL, 'monster:voidcrown-regent'],
    },
];

for (const monster of voidcrownMonsters) defineWorldMonster(monster);

const eclipseTrenchMonsters: WorldMonsterData[] = [
    {
        id: 'moonbrine_crawler', name: '월염수 게',
        description: '월염수가 결정화된 갑각으로 해구 입구를 기어 다니며 마지막 공격자의 발목을 집요하게 붙드는 심해 갑각류.', level: 313,
        baseAttribute: {
            maxLife: 181_000, atk: 1_720, def: 1_160, magicDef: 1_020, armorPen: 142,
            speed: 2.2, attackSpeed: 0.76, critRate: 0.22, critDmg: 2.2,
        },
        drops: [
            { itemDataId: 'moon_brine', minCount: 1, maxCount: 4, chance: 0.7 },
            { itemDataId: 'eclipse_scale', minCount: 1, maxCount: 2, chance: 0.3 },
        ],
        goldReward: { min: 2_150, max: 3_450 },
        attack: { effect: { statusEffectId: 'slowness', chance: 0.24, duration: 7, level: 16 } },
        tags: [GameTags.ENTITY_BEAST, GameTags.PROPERTY_WATER, GameTags.PROPERTY_STONE],
    },
    {
        id: 'nightpearl_jelly', name: '밤진주 해파리',
        description: '몸속 밤진주에 빛을 모았다가 어둠과 함께 방출해 공격자의 감각을 지우는 해파리.', level: 316,
        baseAttribute: {
            maxLife: 173_000, atk: 1_410, magicForce: 1_850, def: 930, magicDef: 1_210, magicPen: 148,
            speed: 3.8, attackSpeed: 1.12, critRate: 0.23, critDmg: 2.25,
        },
        drops: [
            { itemDataId: 'night_pearl', minCount: 1, maxCount: 3, chance: 0.58 },
            { itemDataId: 'moon_brine', minCount: 1, maxCount: 3, chance: 0.5 },
        ],
        goldReward: { min: 2_190, max: 3_520 },
        attack: { damageType: 'magic', effect: { statusEffectId: 'blindness', chance: 0.26, duration: 5, level: 16 } },
        tags: [GameTags.ENTITY_ELEMENTAL, GameTags.PROPERTY_WATER, GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_DARK],
    },
    {
        id: 'drowned_lancer', name: '침은 창병',
        description: '백야성소로 향하던 순례선을 지키다 해구에 가라앉은 창병. 높은 피해를 준 침입자를 조류인장으로 추적한다.', level: 319,
        baseAttribute: {
            maxLife: 196_000, atk: 1_880, def: 1_210, magicDef: 1_100, armorPen: 154,
            speed: 2.75, attackSpeed: 0.84, critRate: 0.24, critDmg: 2.28,
        },
        drops: [
            { itemDataId: 'drowned_silver', minCount: 1, maxCount: 4, chance: 0.68 },
            { itemDataId: 'tide_sigil', minCount: 1, maxCount: 1, chance: 0.15 },
        ],
        goldReward: { min: 2_240, max: 3_600 },
        attack: { effect: { statusEffectId: 'bleeding', chance: 0.26, duration: 11, level: 16 } },
        ai: {
            intelligence: 78, disposition: MonsterAiDisposition.THREAT,
            weights: { attack: 0.15, damage: 1.35, healing: 1.15, shielding: 1.05, control: 1.1, taunt: 2.2 },
            tauntResistance: 0.7, switchThreshold: 0.22, decayPerSecond: 0.009,
        },
        tags: [GameTags.ENTITY_HUMANOID, GameTags.PROPERTY_WATER, GameTags.PROPERTY_METAL, GameTags.PROPERTY_UNDEAD],
    },
    {
        id: 'abyss_kelp_witch', name: '해구 다시마마녀',
        description: '해구섬유를 머리카락처럼 펼쳐 파티의 회복 흐름을 감지하고 가장 오래 버틸 대상을 먼저 묶는 심해 마녀.', level: 322,
        baseAttribute: {
            maxLife: 188_000, atk: 1_490, magicForce: 1_980, def: 980, magicDef: 1_290, magicPen: 162,
            speed: 3.1, attackSpeed: 0.93,
        },
        drops: [
            { itemDataId: 'abyss_fiber', minCount: 2, maxCount: 5, chance: 0.72 },
            { itemDataId: 'moon_brine', minCount: 1, maxCount: 3, chance: 0.42 },
        ],
        goldReward: { min: 2_290, max: 3_680 },
        attack: { damageType: 'magic', effect: { statusEffectId: 'bind', chance: 0.24, duration: 4.5, level: 16 } },
        ai: {
            intelligence: 90, disposition: MonsterAiDisposition.THREAT,
            weights: { attack: 0.06, damage: 0.95, healing: 1.95, shielding: 1.55, control: 1.65, taunt: 2.9 },
            tauntResistance: 0.86, switchThreshold: 0.3, decayPerSecond: 0.006,
        },
        tags: [GameTags.ENTITY_HUMANOID, GameTags.PROPERTY_WATER, GameTags.PROPERTY_NATURAL, GameTags.PROPERTY_DARK],
    },
    {
        id: 'moon_tide_leviathan', name: '월조 리바이어던',
        description: '월식해구의 두 조류가 합쳐지는 곳에서 자란 거대한 포식자. 해일과 수압 분쇄를 번갈아 사용해 느린 대상부터 삼킨다.', level: 325,
        baseAttribute: {
            maxLife: 2_260_000, atk: 2_040, magicForce: 2_110, def: 1_340, magicDef: 1_360,
            armorPen: 168, magicPen: 172, speed: 2.5, attackSpeed: 0.4, critRate: 0.25, critDmg: 2.35,
        },
        expReward: 325 * 20 * 8,
        drops: [
            { itemDataId: 'eclipse_scale', minCount: 8, maxCount: 14, chance: 0.94 },
            { itemDataId: 'night_pearl', minCount: 4, maxCount: 8, chance: 0.7 },
            { itemDataId: 'undertow_step_skillbook', minCount: 1, maxCount: 1, chance: 0.035 },
        ],
        goldReward: { min: 11_500, max: 16_500 },
        skills: [
            { skillDataId: 'leviathan_moon_tide', level: 5 },
            { skillDataId: 'leviathan_depth_crush', level: 5 },
        ],
        skillPattern: {
            sequence: ['leviathan_moon_tide', 'leviathan_depth_crush'],
            initialDelay: 3, interval: { min: 5.8, max: 7.8 },
        },
        ai: {
            intelligence: 72, disposition: MonsterAiDisposition.THREAT,
            weights: { attack: 0.12, damage: 1.3, healing: 1.25, shielding: 1.1, control: 1.35, taunt: 2.5 },
            tauntResistance: 0.76, switchThreshold: 0.24, decayPerSecond: 0.007,
        },
        tags: [GameTags.ENTITY_BOSS, GameTags.ENTITY_BEAST, GameTags.PROPERTY_WATER, GameTags.PROPERTY_DARK, 'monster:moon-tide-leviathan'],
    },
    {
        id: 'white_night_acolyte', name: '백야 수문사제',
        description: '빛이 사라지지 않는 성소의 수문을 조율하며 회복과 보호막을 가장 많이 만든 침입자의 호흡부터 끊는 사제.', level: 329,
        baseAttribute: {
            maxLife: 208_000, atk: 1_580, magicForce: 2_130, def: 1_080, magicDef: 1_400, magicPen: 174,
            speed: 3.05, attackSpeed: 0.88, critRate: 0.24, critDmg: 2.3,
        },
        drops: [
            { itemDataId: 'tide_sigil', minCount: 1, maxCount: 3, chance: 0.58 },
            { itemDataId: 'night_pearl', minCount: 1, maxCount: 3, chance: 0.48 },
        ],
        goldReward: { min: 2_420, max: 3_880 },
        attack: { damageType: 'magic', effect: { statusEffectId: 'silence', chance: 0.27, duration: 5, level: 17 } },
        ai: {
            intelligence: 95, disposition: MonsterAiDisposition.THREAT,
            weights: { attack: 0.04, damage: 0.9, healing: 2.2, shielding: 2, control: 1.8, taunt: 3.5 },
            tauntResistance: 0.95, switchThreshold: 0.34, decayPerSecond: 0.003,
        },
        tags: [GameTags.ENTITY_HUMANOID, GameTags.PROPERTY_WATER, GameTags.PROPERTY_LIGHT],
    },
    {
        id: 'eclipse_ray', name: '월식 가오리',
        description: '등의 밝은 면과 배의 어두운 면을 뒤집으며 공격 속성을 바꾸는 성소의 거대 가오리.', level: 333,
        baseAttribute: {
            maxLife: 214_000, atk: 1_750, magicForce: 2_070, def: 1_120, magicDef: 1_350,
            armorPen: 158, magicPen: 168, speed: 4.7, attackSpeed: 1.15, critRate: 0.26, critDmg: 2.35,
        },
        drops: [
            { itemDataId: 'eclipse_scale', minCount: 2, maxCount: 5, chance: 0.7 },
            { itemDataId: 'abyss_fiber', minCount: 1, maxCount: 4, chance: 0.44 },
        ],
        goldReward: { min: 2_480, max: 3_980 },
        attack: { damageType: 'magic', effect: { statusEffectId: 'blindness', chance: 0.23, duration: 5, level: 17 } },
        tags: [GameTags.ENTITY_BEAST, GameTags.PROPERTY_WATER, GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_DARK],
    },
    {
        id: 'sunken_choir_guard', name: '침수성가 근위',
        description: '성가의 박자에 맞춰 침은 갑주를 울리고 제어를 시도한 침입자에게 파동을 되돌리는 백야성소 근위.', level: 337,
        baseAttribute: {
            maxLife: 232_000, atk: 2_080, def: 1_420, magicDef: 1_310, armorPen: 176,
            speed: 2.7, attackSpeed: 0.72, critRate: 0.25, critDmg: 2.38,
        },
        drops: [
            { itemDataId: 'drowned_silver', minCount: 2, maxCount: 5, chance: 0.7 },
            { itemDataId: 'tide_sigil', minCount: 1, maxCount: 3, chance: 0.4 },
        ],
        goldReward: { min: 2_550, max: 4_080 },
        attack: { effect: { statusEffectId: 'overmaster', chance: 0.2, duration: 3.5, level: 17 } },
        ai: {
            intelligence: 92, disposition: MonsterAiDisposition.THREAT,
            weights: { attack: 0.06, damage: 1.05, healing: 1.55, shielding: 1.6, control: 2.1, taunt: 3.1 },
            tauntResistance: 0.91, switchThreshold: 0.31, decayPerSecond: 0.004,
        },
        tags: [GameTags.ENTITY_HUMANOID, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_METAL, GameTags.PROPERTY_WATER, GameTags.PROPERTY_LIGHT],
    },
    {
        id: 'twilight_oracle', name: '황혼 조류예언자',
        description: '월식이 끝나는 순간을 계산해 다음 공격의 경로를 먼저 봉쇄하는 백야성소의 예언자.', level: 341,
        baseAttribute: {
            maxLife: 224_000, atk: 1_660, magicForce: 2_260, def: 1_180, magicDef: 1_470, magicPen: 184,
            projectileAcceleration: 3.1, speed: 3.4, attackSpeed: 0.96, critRate: 0.27, critDmg: 2.4,
        },
        drops: [
            { itemDataId: 'night_pearl', minCount: 2, maxCount: 5, chance: 0.68 },
            { itemDataId: 'tide_sigil', minCount: 1, maxCount: 4, chance: 0.54 },
        ],
        goldReward: { min: 2_620, max: 4_200 },
        attack: { damageType: 'magic', effect: { statusEffectId: 'curse', chance: 0.27, duration: 11, level: 17 } },
        tags: [GameTags.ENTITY_HUMANOID, GameTags.PROPERTY_WATER, GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_DARK],
    },
    {
        id: 'white_night_hierophant', name: '백야대사제 세르미아',
        description: '백야와 월식을 한 몸에 겹쳐 성소의 시간을 고정한 대사제. 남은 조류거울로 피해를 분산하고 치유자·보호자를 우선 심판한다.', level: 345,
        baseAttribute: {
            maxLife: 2_980_000, atk: 2_250, magicForce: 2_460, def: 1_520, magicDef: 1_590,
            armorPen: 184, magicPen: 198, speed: 3.15, attackSpeed: 0.42, critRate: 0.28, critDmg: 2.45,
        },
        expReward: 345 * 20 * 10,
        drops: [
            { itemDataId: 'tide_sigil', minCount: 10, maxCount: 16, chance: 0.96 },
            { itemDataId: 'night_pearl', minCount: 8, maxCount: 13, chance: 0.9 },
            { itemDataId: 'eclipse_verdict_skillbook', minCount: 1, maxCount: 1, chance: 0.03 },
            { itemDataId: 'white_night_bulwark', minCount: 1, maxCount: 1, chance: 0.018 },
        ],
        goldReward: { min: 14_000, max: 20_000 },
        skills: [
            { skillDataId: 'hierophant_white_night', level: 5 },
            { skillDataId: 'hierophant_eclipse_dirge', level: 5 },
            { skillDataId: 'leviathan_moon_tide', level: 5 },
        ],
        skillPattern: {
            sequence: ['hierophant_white_night', 'hierophant_eclipse_dirge', 'leviathan_moon_tide'],
            randomOrder: true, initialDelay: 2.5, interval: { min: 4.8, max: 6.8 },
        },
        ai: {
            intelligence: 100, disposition: MonsterAiDisposition.THREAT,
            weights: { attack: 0.02, damage: 0.95, healing: 2.45, shielding: 2.3, control: 2.15, taunt: 4.2 },
            tauntResistance: 0.99, switchThreshold: 0.4, decayPerSecond: 0.002,
        },
        tags: [GameTags.ENTITY_BOSS, GameTags.ENTITY_HUMANOID, GameTags.PROPERTY_WATER, GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_DARK, 'monster:white-night-hierophant'],
    },
];

for (const monster of eclipseTrenchMonsters) defineWorldMonster(monster);

const worldrootMonsters: WorldMonsterData[] = [
    {
        id: 'skyroot_husk', name: '천근수피 허물',
        description: '역근에서 떨어진 수피가 주변 생명의 움직임을 흉내 내며 마지막 공격자를 따라붙는 빈 껍질.', level: 348,
        baseAttribute: {
            maxLife: 244_000, atk: 2_180, def: 1_500, magicDef: 1_330, armorPen: 184,
            speed: 2.45, attackSpeed: 0.74, critRate: 0.25, critDmg: 2.4,
        },
        drops: [
            { itemDataId: 'skyroot_bark', minCount: 1, maxCount: 4, chance: 0.72 },
            { itemDataId: 'rootbone_iron', minCount: 1, maxCount: 2, chance: 0.28 },
        ],
        goldReward: { min: 2_720, max: 4_350 },
        attack: { effect: { statusEffectId: 'defense_reduction', chance: 0.25, duration: 10, level: 18 } },
        tags: [GameTags.ENTITY_ELEMENTAL, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_NATURAL, GameTags.PROPERTY_EARTH],
    },
    {
        id: 'memory_amber_moth', name: '기억호박 나방',
        description: '기억호박 안에 남은 사냥 장면을 날갯짓마다 재생해 다음 회피 방향을 미리 읽는 빛나방.', level: 351,
        baseAttribute: {
            maxLife: 232_000, atk: 1_780, magicForce: 2_390, def: 1_210, magicDef: 1_520, magicPen: 190,
            speed: 4.9, attackSpeed: 1.18, critRate: 0.28, critDmg: 2.45,
        },
        drops: [
            { itemDataId: 'memory_amber', minCount: 1, maxCount: 4, chance: 0.68 },
            { itemDataId: 'primal_sap', minCount: 1, maxCount: 2, chance: 0.34 },
        ],
        goldReward: { min: 2_780, max: 4_450 },
        attack: { damageType: 'magic', effect: { statusEffectId: 'blindness', chance: 0.25, duration: 5, level: 18 } },
        tags: [GameTags.ENTITY_BEAST, GameTags.PROPERTY_INSECT, GameTags.PROPERTY_NATURAL, GameTags.PROPERTY_LIGHT],
    },
    {
        id: 'forgetting_spore_shaman', name: '망각포자 주술사',
        description: '죽은 기억을 포자로 분해하며 파티의 치유 흐름을 가장 먼저 썩히는 역근수해의 주술사.', level: 354,
        baseAttribute: {
            maxLife: 250_000, atk: 1_840, magicForce: 2_520, def: 1_280, magicDef: 1_590, magicPen: 202,
            speed: 3.15, attackSpeed: 0.9,
        },
        drops: [
            { itemDataId: 'rot_spore', minCount: 2, maxCount: 5, chance: 0.72 },
            { itemDataId: 'primal_sap', minCount: 1, maxCount: 3, chance: 0.4 },
        ],
        goldReward: { min: 2_840, max: 4_560 },
        attack: { damageType: 'magic', effect: { statusEffectId: 'decay', chance: 0.29, duration: 12, level: 18 } },
        ai: {
            intelligence: 94, disposition: MonsterAiDisposition.THREAT,
            weights: { attack: 0.04, damage: 0.9, healing: 2.25, shielding: 1.8, control: 1.75, taunt: 3.5 },
            tauntResistance: 0.94, switchThreshold: 0.34, decayPerSecond: 0.003,
        },
        tags: [GameTags.ENTITY_HUMANOID, GameTags.PROPERTY_NATURAL, GameTags.PROPERTY_POISON, GameTags.PROPERTY_DARK],
    },
    {
        id: 'rootbone_sentinel', name: '근골철 파수자',
        description: '뿌리뼈와 금속 광맥이 함께 자란 갑주를 두르고 제어를 가장 많이 시도한 침입자를 짓누르는 파수자.', level: 357,
        baseAttribute: {
            maxLife: 276_000, atk: 2_470, def: 1_650, magicDef: 1_460, armorPen: 204,
            speed: 2.6, attackSpeed: 0.7, critRate: 0.27, critDmg: 2.46,
        },
        drops: [
            { itemDataId: 'rootbone_iron', minCount: 2, maxCount: 5, chance: 0.72 },
            { itemDataId: 'skyroot_bark', minCount: 1, maxCount: 3, chance: 0.44 },
        ],
        goldReward: { min: 2_900, max: 4_660 },
        attack: { effect: { statusEffectId: 'overmaster', chance: 0.2, duration: 3.5, level: 18 } },
        ai: {
            intelligence: 89, disposition: MonsterAiDisposition.THREAT,
            weights: { attack: 0.06, damage: 1.05, healing: 1.4, shielding: 1.5, control: 2.2, taunt: 3.2 },
            tauntResistance: 0.9, switchThreshold: 0.3, decayPerSecond: 0.004,
        },
        tags: [GameTags.ENTITY_HUMANOID, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_METAL, GameTags.PROPERTY_EARTH],
    },
    {
        id: 'inverse_root_devourer', name: '역근 포식수',
        description: '하늘에서 내려온 뿌리를 먹고 몸집을 불린 거대 식충수. 역근 낙하와 망각포자 숨결을 번갈아 사용한다.', level: 360,
        baseAttribute: {
            maxLife: 3_420_000, atk: 2_650, magicForce: 2_570, def: 1_760, magicDef: 1_720,
            armorPen: 216, magicPen: 210, speed: 2.55, attackSpeed: 0.39, critRate: 0.28, critDmg: 2.5,
        },
        expReward: 360 * 20 * 8,
        drops: [
            { itemDataId: 'rootbone_iron', minCount: 8, maxCount: 14, chance: 0.94 },
            { itemDataId: 'heart_seed', minCount: 3, maxCount: 6, chance: 0.62 },
            { itemDataId: 'rootbreaker_descent_skillbook', minCount: 1, maxCount: 1, chance: 0.035 },
        ],
        goldReward: { min: 16_000, max: 22_000 },
        skills: [
            { skillDataId: 'root_devourer_downfall', level: 5 },
            { skillDataId: 'root_devourer_rot_breath', level: 5 },
        ],
        skillPattern: {
            sequence: ['root_devourer_downfall', 'root_devourer_rot_breath'],
            initialDelay: 2.8, interval: { min: 5.5, max: 7.5 },
        },
        ai: {
            intelligence: 68, disposition: MonsterAiDisposition.THREAT,
            weights: { attack: 0.15, damage: 1.35, healing: 1.2, shielding: 1.05, control: 1.25, taunt: 2.4 },
            tauntResistance: 0.72, switchThreshold: 0.23, decayPerSecond: 0.008,
        },
        tags: [GameTags.ENTITY_BOSS, GameTags.ENTITY_BEAST, GameTags.PROPERTY_NATURAL, GameTags.PROPERTY_EARTH, GameTags.PROPERTY_POISON, 'monster:inverse-root-devourer'],
    },
    {
        id: 'origin_sap_acolyte', name: '기원수액 사제',
        description: '태초수액의 흐름을 지키며 회복과 보호막 위협을 읽고 생명맥을 먼저 끊는 심장 성역의 사제.', level: 364,
        baseAttribute: {
            maxLife: 288_000, atk: 1_940, magicForce: 2_720, def: 1_460, magicDef: 1_720, magicPen: 222,
            speed: 3.2, attackSpeed: 0.86, critRate: 0.27, critDmg: 2.5,
        },
        drops: [
            { itemDataId: 'primal_sap', minCount: 2, maxCount: 5, chance: 0.7 },
            { itemDataId: 'heart_seed', minCount: 1, maxCount: 2, chance: 0.22 },
        ],
        goldReward: { min: 3_080, max: 4_940 },
        attack: { damageType: 'magic', effect: { statusEffectId: 'silence', chance: 0.28, duration: 5, level: 19 } },
        ai: {
            intelligence: 96, disposition: MonsterAiDisposition.THREAT,
            weights: { attack: 0.03, damage: 0.9, healing: 2.35, shielding: 2.15, control: 1.8, taunt: 3.8 },
            tauntResistance: 0.96, switchThreshold: 0.36, decayPerSecond: 0.003,
        },
        tags: [GameTags.ENTITY_HUMANOID, GameTags.PROPERTY_NATURAL, GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_HOLY],
    },
    {
        id: 'amber_memory_keeper', name: '기억호박 수호자',
        description: '수해의 과거 전투를 호박 속에서 꺼내 가장 큰 피해를 만든 움직임을 그대로 되돌리는 수호자.', level: 368,
        baseAttribute: {
            maxLife: 302_000, atk: 2_510, magicForce: 2_460, def: 1_610, magicDef: 1_650,
            armorPen: 216, magicPen: 212, speed: 3, attackSpeed: 0.8, critRate: 0.29, critDmg: 2.55,
        },
        drops: [
            { itemDataId: 'memory_amber', minCount: 2, maxCount: 5, chance: 0.72 },
            { itemDataId: 'rootbone_iron', minCount: 1, maxCount: 4, chance: 0.45 },
        ],
        goldReward: { min: 3_160, max: 5_060 },
        attack: { effect: { statusEffectId: 'bleeding', chance: 0.27, duration: 12, level: 19 } },
        tags: [GameTags.ENTITY_HUMANOID, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_NATURAL, GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_METAL],
    },
    {
        id: 'canopy_seraph', name: '천개 세라프',
        description: '역근수해 위의 빛을 여섯 잎 날개에 모아 회피 경로를 먼저 태우는 심장 성역의 수호 생명체.', level: 372,
        baseAttribute: {
            maxLife: 294_000, atk: 2_020, magicForce: 2_850, def: 1_480, magicDef: 1_790, magicPen: 232,
            projectileAcceleration: 3.35, speed: 4.2, attackSpeed: 1.02, critRate: 0.3, critDmg: 2.58,
        },
        drops: [
            { itemDataId: 'heart_seed', minCount: 1, maxCount: 4, chance: 0.55 },
            { itemDataId: 'primal_sap', minCount: 2, maxCount: 5, chance: 0.64 },
        ],
        goldReward: { min: 3_240, max: 5_190 },
        attack: { damageType: 'magic', effect: { statusEffectId: 'blindness', chance: 0.28, duration: 6, level: 19 } },
        tags: [GameTags.ENTITY_ELEMENTAL, GameTags.PROPERTY_NATURAL, GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_HOLY],
    },
    {
        id: 'heart_gardener', name: '심장정원사',
        description: '태초심장의 가지를 다듬으며 치유·방벽·제어 기여도를 비교해 가장 오래 전투를 끌 대상을 가지치기하는 정원사.', level: 376,
        baseAttribute: {
            maxLife: 324_000, atk: 2_410, magicForce: 2_880, def: 1_670, magicDef: 1_820,
            armorPen: 220, magicPen: 236, speed: 2.9, attackSpeed: 0.72, critRate: 0.29, critDmg: 2.6,
        },
        drops: [
            { itemDataId: 'skyroot_bark', minCount: 2, maxCount: 5, chance: 0.66 },
            { itemDataId: 'heart_seed', minCount: 1, maxCount: 4, chance: 0.5 },
            { itemDataId: 'memory_amber', minCount: 1, maxCount: 3, chance: 0.4 },
        ],
        goldReward: { min: 3_320, max: 5_320 },
        attack: { damageType: 'magic', effect: { statusEffectId: 'curse', chance: 0.28, duration: 12, level: 19 } },
        ai: {
            intelligence: 98, disposition: MonsterAiDisposition.THREAT,
            weights: { attack: 0.02, damage: 0.95, healing: 2.45, shielding: 2.25, control: 2.2, taunt: 4 },
            tauntResistance: 0.98, switchThreshold: 0.38, decayPerSecond: 0.002,
        },
        tags: [GameTags.ENTITY_HUMANOID, GameTags.PROPERTY_NATURAL, GameTags.PROPERTY_HOLY, GameTags.PROPERTY_DARK],
    },
    {
        id: 'primordial_heart_arbor', name: '태초심장 아르보르',
        description: '세계수의 첫 박동과 마지막 망각을 동시에 품은 역근수해의 의지. 남은 심장씨앗으로 피해를 흘리고 파티 기여도를 계산해 심판 대상을 바꾼다.', level: 380,
        baseAttribute: {
            maxLife: 4_350_000, atk: 2_920, magicForce: 3_160, def: 1_940, magicDef: 2_020,
            armorPen: 238, magicPen: 252, speed: 3.25, attackSpeed: 0.4, critRate: 0.31, critDmg: 2.68,
        },
        expReward: 380 * 20 * 10,
        drops: [
            { itemDataId: 'heart_seed', minCount: 11, maxCount: 18, chance: 0.97 },
            { itemDataId: 'memory_amber', minCount: 8, maxCount: 14, chance: 0.9 },
            { itemDataId: 'primordial_sanctuary_skillbook', minCount: 1, maxCount: 1, chance: 0.03 },
            { itemDataId: 'canopy_heartshield', minCount: 1, maxCount: 1, chance: 0.018 },
        ],
        goldReward: { min: 19_000, max: 27_000 },
        skills: [
            { skillDataId: 'primordial_heart_pulse', level: 5 },
            { skillDataId: 'primordial_forgetting_bloom', level: 5 },
            { skillDataId: 'root_devourer_downfall', level: 5 },
        ],
        skillPattern: {
            sequence: ['primordial_heart_pulse', 'primordial_forgetting_bloom', 'root_devourer_downfall'],
            randomOrder: true, initialDelay: 2.4, interval: { min: 4.6, max: 6.5 },
        },
        ai: {
            intelligence: 100, disposition: MonsterAiDisposition.THREAT,
            weights: { attack: 0.01, damage: 0.95, healing: 2.55, shielding: 2.45, control: 2.35, taunt: 4.4 },
            tauntResistance: 0.995, switchThreshold: 0.42, decayPerSecond: 0.0015,
        },
        tags: [GameTags.ENTITY_BOSS, GameTags.ENTITY_ELEMENTAL, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_NATURAL, GameTags.PROPERTY_HOLY, GameTags.PROPERTY_DARK, 'monster:primordial-heart-arbor'],
    },
];

for (const monster of worldrootMonsters) defineWorldMonster(monster);
