import {
    defineEliteJobRecipe,
    defineJob,
    defineThirdJobLineage,
    JobTier,
} from '../models/Job.js';
import { ALCHEMY_FEATURE_SKILL_ID } from '../models/Alchemy.js';

const firstJobs = [
    {
        id: 'career:warrior', name: '전사', icon: 'jobs/warrior',
        description: '검과 도끼를 다루며 공격력·생명력·민첩의 균형을 이루는 근접 전투 직업.',
        skills: ['warrior_combat_instinct', 'steel_slash', 'battle_rush', 'indomitable'],
        main: [{ attribute: 'maxLife', op: 'multiply', value: 1.15 }, { attribute: 'atk', op: 'multiply', value: 1.08 }, { attribute: 'speed', op: 'multiply', value: 1.04 }],
        sub: [{ attribute: 'maxLife', op: 'multiply', value: 1.06 }, { attribute: 'atk', op: 'multiply', value: 1.04 }],
    },
    {
        id: 'career:archer', name: '궁수', icon: 'jobs/archer',
        description: '투사체·속성 화살·제어기와 순간적인 확정 회피에 특화된 원거리 직업.',
        skills: ['archer_hawkeye', 'arcane_arrow', 'multishot', 'stunning_shot', 'wind_evasion'],
        main: [{ attribute: 'speed', op: 'multiply', value: 1.12 }, { attribute: 'projectileAcceleration', op: 'multiply', value: 1.15 }, { attribute: 'critRate', op: 'add', value: 0.05 }, { attribute: 'atk', op: 'multiply', value: 1.25 }],
        sub: [{ attribute: 'speed', op: 'multiply', value: 1.06 }, { attribute: 'projectileAcceleration', op: 'multiply', value: 1.07 }, { attribute: 'critRate', op: 'add', value: 0.02 }],
    },
    {
        id: 'career:assassin', name: '암살자', icon: 'jobs/assassin',
        description: '은신과 맹독, 빠른 움직임으로 짧은 순간에 폭발적인 피해를 입히는 직업.',
        skills: ['assassin_lethal_instinct', 'stealth', 'ambush', 'venom_blade'],
        main: [{ attribute: 'speed', op: 'multiply', value: 1.16 }, { attribute: 'critDmg', op: 'add', value: 0.25 }, { attribute: 'armorPen', op: 'add', value: 5 }, { attribute: 'atk', op: 'multiply', value: 1.2 }],
        sub: [{ attribute: 'speed', op: 'multiply', value: 1.08 }, { attribute: 'critDmg', op: 'add', value: 0.1 }],
    },
    {
        id: 'career:mage', name: '마법사', icon: 'jobs/mage',
        description: '지팡이와 정신력을 사용해 원거리 속성 마법·보호 마법·제어기를 다루는 직업.',
        skills: ['mage_mana_cycle', 'magic_bolt', 'mana_barrier', 'elemental_bind', 'elemental_insight'],
        main: [{ attribute: 'maxMentality', op: 'multiply', value: 1.2 }, { attribute: 'projectileAcceleration', op: 'multiply', value: 1.12 }, { attribute: 'maxLife', op: 'multiply', value: 0.9 }],
        sub: [{ attribute: 'maxMentality', op: 'multiply', value: 1.1 }, { attribute: 'magicForce', op: 'multiply', value: 1.06 }, { attribute: 'projectileAcceleration', op: 'multiply', value: 1.06 }],
    },
    {
        id: 'career:cleric', name: '성직자', icon: 'jobs/cleric',
        description: '빛의 권능과 굳은 신앙으로 적을 심판하고 자신과 동료를 지키는 교단 전투 직업.',
        skills: ['cleric_devotion', 'radiant_bolt', 'sanctuary_aegis'],
        main: [{ attribute: 'maxMentality', op: 'multiply', value: 1.18 }, { attribute: 'magicForce', op: 'multiply', value: 1.1 }, { attribute: 'magicDef', op: 'multiply', value: 1.08 }],
        sub: [{ attribute: 'maxMentality', op: 'multiply', value: 1.08 }, { attribute: 'magicForce', op: 'multiply', value: 1.05 }, { attribute: 'magicDef', op: 'multiply', value: 1.04 }],
    },
    {
        // TODO: 대장장이 전용 직업 아트 제작 전까지 채굴 도구 카테고리 아이콘을 사용한다.
        id: 'career:blacksmith', name: '대장장이', icon: 'items/iron_pickaxe',
        description: '튼튼한 체력과 예리한 감각으로 적의 결을 파쇄하고, 광물 제련과 리듬 단조로 장비를 제작하는 생산·근접 혼합 직업.',
        skills: ['blacksmith_temper', 'precision_break', 'arcane_smelting', 'metal_forging', 'equipment_repair'],
        main: [{ attribute: 'maxWeight', op: 'add', value: 20 }, { attribute: 'def', op: 'multiply', value: 1.1 }, { attribute: 'maxLife', op: 'multiply', value: 1.15 }, { attribute: 'critRate', op: 'add', value: 0.04 }],
        sub: [{ attribute: 'maxWeight', op: 'add', value: 10 }, { attribute: 'def', op: 'multiply', value: 1.05 }, { attribute: 'maxLife', op: 'multiply', value: 1.08 }],
    },
] as const;

for (const job of firstJobs) defineJob({
    id: job.id,
    name: job.name,
    icon: job.icon,
    tier: JobTier.FIRST,
    description: job.description,
    grantedSkills: job.skills.map(skillDataId => ({ skillDataId })),
    mainModifiers: job.main,
    subModifiers: job.sub,
    tags: ['career:first'],
});

const eliteRecipes = [
    ['warrior', 'archer', 'blade_ranger', '검의 추적자', 1.12],
    ['warrior', 'assassin', 'shadow_blade', '그림자 검객', 1.08],
    ['warrior', 'mage', 'spellblade', '마검사', 1.35],
    ['archer', 'warrior', 'siege_bow', '철벽 사수', 0.9],
    ['archer', 'assassin', 'night_hunter', '밤사냥꾼', 0.97],
    ['archer', 'mage', 'elemental_marksman', '원소 사수', 1.15],
    ['assassin', 'warrior', 'executioner', '처형자'],
    ['assassin', 'archer', 'phantom_shooter', '환영 사수'],
    ['assassin', 'mage', 'arcane_reaper', '비전 사신', 1.3],
    ['mage', 'warrior', 'battle_magus', '전투 마도사'],
    ['mage', 'archer', 'star_weaver', '별의 직조사', 0.95],
    ['mage', 'assassin', 'hexblade', '주술 단검사', 0.92],
    ['warrior', 'blacksmith', 'weapon_master', '무기대가'],
    ['archer', 'blacksmith', 'machinist_archer', '기공 사수', 0.9],
    ['assassin', 'blacksmith', 'steel_shadow', '강철 그림자'],
    ['mage', 'blacksmith', 'runeforger', '룬 제련사', 0.9],
    ['blacksmith', 'warrior', 'battle_smith', '전투 대장장이', 0.9],
    ['blacksmith', 'archer', 'artificer', '기계 장인'],
    ['blacksmith', 'assassin', 'venom_smith', '독금 장인'],
    ['blacksmith', 'mage', 'arcane_smith', '마도 대장장이', 0.93],
    // 성직자를 서브로 택한 조합은 원래 메인 직업의 전투 정체성을 유지한다.
    ['warrior', 'cleric', 'vanguard', '선봉장', 1.25],
    ['archer', 'cleric', 'pathfinder', '길잡이'],
    ['assassin', 'cleric', 'blade_dancer', '검무사', 1.15],
    ['mage', 'cleric', 'alchemist', '연금술사'],
    ['blacksmith', 'cleric', 'master_craftsman', '명장'],
    // 성직자를 메인으로 택한 조합은 빛과 교단의 역할을 다른 직업 방식과 융합한다.
    ['cleric', 'warrior', 'saint_knight', '세인트 나이트'],
    // 장거리 유도 전용기와 성직자 장기 버프가 함께 증폭되므로 계보 공격 보정을 낮춰 30조합 상한을 지킨다.
    ['cleric', 'archer', 'dawn_ranger', '여명 순찰자', 0.94],
    ['cleric', 'assassin', 'light_judicator', '빛의 심판자', 0.9],
    ['cleric', 'mage', 'priest_of_light', '빛의 사제', 0.8],
    ['cleric', 'blacksmith', 'relic_keeper', '성물지기'],
] as const;

const eliteDescriptions: Readonly<Record<string, string>> = Object.freeze({
    vanguard: '전사의 선두 돌파를 중심으로 성직자의 보호 서약을 더해 아군의 진형을 여는 엘리트 전위.',
    pathfinder: '궁수의 궤적 감각과 성직자의 인도를 결합해 안전한 사로와 진군로를 찾아내는 원거리 길잡이.',
    blade_dancer: '암살자의 기동과 성직자의 절제된 의식을 검무로 다듬어 빈틈을 연속해서 베는 근접 엘리트.',
    alchemist: '마법 이론과 성직자의 정제 의식을 결합해 지역 재료의 성질을 회복약·강화약·투척약으로 변성하는 연성가.',
    master_craftsman: '대장장이의 제작 기술을 성직자의 엄격한 규율로 완성해 장비와 전열을 함께 받치는 최고 장인.',
    saint_knight: '성직자의 빛과 전사의 강인함으로 최전선에서 동료를 지키고 적을 심판하는 교단 기사.',
    dawn_ranger: '성직자의 광휘를 궁수의 시야와 화살에 실어 먼 위협을 밝히고 아군의 길을 여는 여명 사수.',
    light_judicator: '성직자의 심판을 암살자의 은밀한 기동으로 집행해 지정한 죄인을 단숨에 끊는 교단 집행자.',
    priest_of_light: '성직자의 신앙을 마법사의 정교한 술식으로 증폭해 광휘 공격과 파티 보호를 함께 펼치는 빛의 사제.',
    relic_keeper: '성직자의 성역과 대장장이의 금속 지식을 결합해 성물의 힘으로 아군을 보호하는 교단 수호 장인.',
});

for (const [main, sub, eliteId, name, offenseFactor = 1] of eliteRecipes) {
    const mainId = `career:${main}`;
    const subId = `career:${sub}`;
    const id = `career:${eliteId}`;
    const parent = firstJobs.find(job => job.id === mainId)!;
    defineJob({
        id,
        name,
        icon: parent.icon,
        tier: JobTier.ELITE,
        description: eliteDescriptions[eliteId]
            ?? `${getFirstName(main)}의 전투 방식을 중심으로 ${getFirstName(sub)}의 장점을 융합한 엘리트 직업.`,
        parentJobIds: [mainId],
        grantedSkills: [
            { skillDataId: `${eliteId}_mastery` },
            { skillDataId: `${eliteId}_technique` },
            ...(eliteId === 'battle_smith' ? [{ skillDataId: 'weapon_reinforcement' }] : []),
            ...(eliteId === 'artificer' ? [{ skillDataId: 'artificer_manufacturing' }] : []),
            ...(eliteId === 'arcane_smith' ? [
                { skillDataId: 'arcane_enchanting' },
                { skillDataId: 'staff_infusing' },
            ] : []),
            ...(eliteId === 'alchemist' ? [{ skillDataId: ALCHEMY_FEATURE_SKILL_ID }] : []),
        ],
        mainModifiers: [
            ...parent.main,
            { attribute: main === 'mage' || main === 'cleric' ? 'magicForce' : 'atk', op: 'multiply', value: 1.15 },
            { attribute: main === 'warrior' || main === 'cleric' ? 'maxLife' : 'speed', op: 'multiply', value: 1.12 },
            ...(offenseFactor === 1 ? [] : [
                { attribute: 'atk' as const, op: 'multiply' as const, value: offenseFactor },
                { attribute: 'magicForce' as const, op: 'multiply' as const, value: offenseFactor },
            ]),
        ],
        tags: ['career:elite'],
    });
    defineEliteJobRecipe(mainId, subId, id);
}

export const THIRD_JOB_IDS = Object.freeze({
    warrior: 'career:ironblood_lord',
    archer: 'career:starseal_tracker',
    assassin: 'career:moonshadow_executor',
    mage: 'career:astral_sage',
    blacksmith: 'career:mythic_artisan',
} as const);

const thirdJobs = [
    {
        main: 'warrior', id: THIRD_JOB_IDS.warrior, name: '철혈군주', skill: 'ironblood_sovereignty',
        description: '수많은 전장을 버텨낸 육체와 지휘로 전열의 중심을 지키는 전사의 3차 계보.',
    },
    {
        main: 'archer', id: THIRD_JOB_IDS.archer, name: '성흔추적자', skill: 'starseal_focus',
        description: '별빛이 남긴 흔적을 읽어 가장 단단한 표적의 틈을 찾아내는 궁수의 3차 계보.',
    },
    {
        main: 'assassin', id: THIRD_JOB_IDS.assassin, name: '월영집행자', skill: 'moonshadow_sentence',
        description: '달빛 아래 무너지는 순간을 판결해 전투의 종결을 앞당기는 암살자의 3차 계보.',
    },
    {
        main: 'mage', id: THIRD_JOB_IDS.mage, name: '성계현자', skill: 'astral_wisdom',
        description: '별과 마력 방벽의 흐름을 하나의 성계처럼 해석하는 마법사의 3차 계보.',
    },
    {
        main: 'blacksmith', id: THIRD_JOB_IDS.blacksmith, name: '신화장인', skill: 'mythic_craft',
        description: '물질과 마력의 하중을 함께 벼려 전설을 실물로 만드는 대장장이의 3차 계보.',
    },
] as const;

// TODO(art): 3차 직업 전용 아트 제작 전까지 원래 메인 계보의 128×128 직업 아이콘을 재사용한다.
for (const third of thirdJobs) {
    const mainId = `career:${third.main}`;
    const parent = firstJobs.find(job => job.id === mainId)!;
    defineJob({
        id: third.id,
        name: third.name,
        icon: parent.icon,
        tier: JobTier.THIRD,
        description: third.description,
        parentJobIds: [mainId],
        grantedSkills: [{ skillDataId: third.skill }],
        mainModifiers: [],
        tags: ['career:third'],
    });
    defineThirdJobLineage(mainId, third.id);
}

function getFirstName(id: string): string {
    return firstJobs.find(job => job.id === `career:${id}`)?.name ?? id;
}
