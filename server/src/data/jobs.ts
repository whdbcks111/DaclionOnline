import { defineEliteJobRecipe, defineJob, JobTier } from '../models/Job.js';

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
        // TODO: 대장장이 전용 직업 아트 제작 전까지 채굴 도구 카테고리 아이콘을 사용한다.
        id: 'career:blacksmith', name: '대장장이', icon: 'items/iron_pickaxe',
        description: '튼튼한 체력과 예리한 감각으로 적의 결을 파쇄하고, 광물 제련과 리듬 단조로 장비를 제작하는 생산·근접 혼합 직업.',
        skills: ['blacksmith_temper', 'precision_break', 'arcane_smelting', 'metal_forging'],
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
] as const;

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
        description: `${getFirstName(main)}의 전투 방식을 중심으로 ${getFirstName(sub)}의 장점을 융합한 엘리트 직업.`,
        parentJobIds: [mainId],
        grantedSkills: [
            { skillDataId: `${eliteId}_mastery` },
            { skillDataId: `${eliteId}_technique` },
            ...(eliteId === 'battle_smith' ? [{ skillDataId: 'weapon_reinforcement' }] : []),
            ...(eliteId === 'arcane_smith' ? [{ skillDataId: 'arcane_enchanting' }] : []),
        ],
        mainModifiers: [
            ...parent.main,
            { attribute: main === 'mage' ? 'magicForce' : 'atk', op: 'multiply', value: 1.15 },
            { attribute: main === 'warrior' ? 'maxLife' : 'speed', op: 'multiply', value: 1.12 },
            ...(offenseFactor === 1 ? [] : [
                { attribute: 'atk' as const, op: 'multiply' as const, value: offenseFactor },
                { attribute: 'magicForce' as const, op: 'multiply' as const, value: offenseFactor },
            ]),
        ],
        tags: ['career:elite'],
    });
    defineEliteJobRecipe(mainId, subId, id);
}

function getFirstName(id: string): string {
    return firstJobs.find(job => job.id === `career:${id}`)?.name ?? id;
}
