import { defineMonster } from '../models/Monster.js';
import type { MonsterData } from '../models/Monster.js';
import { GameTags } from '../../../shared/tags.js';

type WorldMonsterData = Omit<MonsterData, 'exp' | 'expReward' | 'equipments'>
    & Partial<Pick<MonsterData, 'expReward' | 'equipments'>>;

/** 동급 몬스터 한 마리의 기준 보상은 level * 20 EXP다. */
function defineWorldMonster(data: WorldMonsterData): void {
    defineMonster({
        ...data,
        exp: 0,
        expReward: data.expReward ?? data.level * 20,
        equipments: data.equipments ?? [],
    });
}

defineWorldMonster({
    id: 'slime',
    name: '슬라임',
    level: 1,
    baseAttribute: { maxLife: 30, atk: 8, def: 1, speed: 0.7 },
    drops: [{ itemDataId: 'health_potion', minCount: 1, maxCount: 1, chance: 0.18 }],
    goldReward: { min: 1, max: 4 },
    tags: [GameTags.ENTITY_SLIME, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_WATER, GameTags.PROPERTY_POISON],
});

defineWorldMonster({
    id: 'grass_slime',
    name: '풀잎 슬라임',
    level: 4,
    baseAttribute: { maxLife: 70, atk: 15, def: 3, magicDef: 2, speed: 0.9 },
    drops: [{ itemDataId: 'health_potion', minCount: 1, maxCount: 1, chance: 0.22 }],
    goldReward: { min: 4, max: 10 },
    tags: [GameTags.ENTITY_SLIME, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_NATURAL, GameTags.PROPERTY_POISON],
});

defineWorldMonster({
    id: 'cave_slime',
    name: '동굴 슬라임',
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
    id: 'bog_slime',
    name: '수렁 슬라임',
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
    level: 50,
    baseAttribute: {
        maxLife: 1800,
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
    drops: [
        { itemDataId: 'ruby', minCount: 2, maxCount: 4, chance: 0.35 },
        { itemDataId: 'diamond', minCount: 1, maxCount: 2, chance: 0.15 },
    ],
    goldReward: { min: 120, max: 220 },
    attack: {
        damageType: 'magic',
        effect: { statusEffectId: 'fire', chance: 0.48, duration: 16, level: 6 },
    },
    tags: [GameTags.ENTITY_BEAST, GameTags.PROPERTY_FIRE, GameTags.PROPERTY_NATURAL],
});
