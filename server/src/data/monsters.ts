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
    description: '칼데라의 불길을 두른 최상위 화염수.',
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
        id: 'thunder_colossus', name: '뇌정 거상', description: '낙뢰를 동력으로 삼는 고대 금속 거상.', level: 68,
        baseAttribute: { maxLife: 3600, atk: 218, magicForce: 225, def: 138, magicDef: 122, speed: 1.15, attackSpeed: 0.75 },
        drops: [{ itemDataId: 'windsteel_sword', minCount: 1, maxCount: 1, chance: 0.03 }, { itemDataId: 'gold_ore', minCount: 2, maxCount: 5, chance: 0.3 }],
        goldReward: { min: 180, max: 320 }, attack: { damageType: 'magic' },
        tags: [GameTags.ENTITY_ELEMENTAL, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_ELECTRIC, GameTags.PROPERTY_METAL],
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
        id: 'nightwood_core', name: '밤숲의 검은 심재', description: '어둠과 뿌리가 엉겨 스스로 걷기 시작한 숲의 핵.', level: 95,
        baseAttribute: { maxLife: 6500, atk: 290, magicForce: 315, def: 165, magicDef: 175, speed: 1.4 },
        drops: [{ itemDataId: 'diamond', minCount: 1, maxCount: 2, chance: 0.15 }], goldReward: { min: 260, max: 445 },
        attack: { damageType: 'magic', effect: { statusEffectId: 'decay', chance: 0.3, duration: 10, level: 5 } },
        tags: [GameTags.ENTITY_ELEMENTAL, GameTags.TRAIT_INANIMATE, GameTags.PROPERTY_DARK, GameTags.PROPERTY_NATURAL],
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
        id: 'halo_beast', name: '광륜수', description: '성역 중심의 빛을 수호하는 거대한 신성 짐승.', level: 125,
        baseAttribute: { maxLife: 11000, atk: 385, magicForce: 405, def: 235, magicDef: 255, speed: 2.8, critRate: 0.13 },
        drops: [{ itemDataId: 'diamond', minCount: 2, maxCount: 3, chance: 0.22 }], goldReward: { min: 360, max: 600 },
        attack: { damageType: 'magic' }, tags: [GameTags.ENTITY_BEAST, GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_HOLY],
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
        id: 'deathless_colossus', name: '불멸의 묘상', description: '수많은 유해와 묘석이 하나로 엉겨 붙은 거대한 불사체.', level: 155,
        baseAttribute: { maxLife: 18500, atk: 505, magicForce: 430, def: 330, magicDef: 295, speed: 1.05, attackSpeed: 0.7 },
        drops: [{ itemDataId: 'diamond', minCount: 2, maxCount: 5, chance: 0.28 }], goldReward: { min: 480, max: 790 },
        attack: { effect: { statusEffectId: 'decay', chance: 0.35, duration: 12, level: 8 } },
        tags: [GameTags.ENTITY_ELEMENTAL, GameTags.PROPERTY_UNDEAD, GameTags.PROPERTY_STONE],
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
        description: '세 공명 수정의 진동으로 몸을 보호하는 철근미궁의 수호자. 수정이 남아 있으면 받는 피해가 85% 감소하고 공명 폭주가 강화된다.',
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
        skills: [{ skillDataId: 'seismic_crush', level: 5 }],
        skillPattern: { sequence: ['seismic_crush'], initialDelay: 5, interval: { min: 10, max: 14 } },
        challengePattern: { handler: 'ironroot:resonance-storm', initialDelay: 8, interval: { min: 18, max: 24 } },
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
