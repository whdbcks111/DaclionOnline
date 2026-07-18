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
        main: [{ attribute: 'speed', op: 'multiply', value: 1.12 }, { attribute: 'critRate', op: 'add', value: 0.05 }, { attribute: 'atk', op: 'multiply', value: 1.05 }],
        sub: [{ attribute: 'speed', op: 'multiply', value: 1.06 }, { attribute: 'critRate', op: 'add', value: 0.02 }],
    },
    {
        id: 'career:assassin', name: '암살자', icon: 'jobs/assassin',
        description: '은신과 맹독, 빠른 움직임으로 짧은 순간에 폭발적인 피해를 입히는 직업.',
        skills: ['assassin_lethal_instinct', 'stealth', 'ambush', 'venom_blade'],
        main: [{ attribute: 'speed', op: 'multiply', value: 1.16 }, { attribute: 'critDmg', op: 'add', value: 0.25 }, { attribute: 'armorPen', op: 'add', value: 5 }],
        sub: [{ attribute: 'speed', op: 'multiply', value: 1.08 }, { attribute: 'critDmg', op: 'add', value: 0.1 }],
    },
    {
        id: 'career:mage', name: '마법사', icon: 'jobs/mage',
        description: '지팡이와 정신력을 사용해 원거리 속성 마법·보호 마법·제어기를 다루는 직업.',
        skills: ['mage_mana_cycle', 'magic_bolt', 'mana_barrier', 'elemental_bind', 'elemental_insight'],
        main: [{ attribute: 'maxMentality', op: 'multiply', value: 1.2 }, { attribute: 'magicForce', op: 'multiply', value: 1.15 }, { attribute: 'maxLife', op: 'multiply', value: 0.9 }],
        sub: [{ attribute: 'maxMentality', op: 'multiply', value: 1.1 }, { attribute: 'magicForce', op: 'multiply', value: 1.06 }],
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
    ['warrior', 'archer', 'blade_ranger', '검의 추적자'],
    ['warrior', 'assassin', 'shadow_blade', '그림자 검객'],
    ['warrior', 'mage', 'spellblade', '마검사'],
    ['archer', 'warrior', 'siege_bow', '철벽 사수'],
    ['archer', 'assassin', 'night_hunter', '밤사냥꾼'],
    ['archer', 'mage', 'elemental_marksman', '원소 사수'],
    ['assassin', 'warrior', 'executioner', '처형자'],
    ['assassin', 'archer', 'phantom_shooter', '환영 사수'],
    ['assassin', 'mage', 'arcane_reaper', '비전 사신'],
    ['mage', 'warrior', 'battle_magus', '전투 마도사'],
    ['mage', 'archer', 'star_weaver', '별의 직조사'],
    ['mage', 'assassin', 'hexblade', '주술 단검사'],
] as const;

for (const [main, sub, eliteId, name] of eliteRecipes) {
    const mainId = `career:${main}`;
    const subId = `career:${sub}`;
    const id = `career:${eliteId}`;
    const parent = firstJobs.find(job => job.id === mainId)!;
    defineJob({
        id,
        name,
        icon: `jobs/${main}`,
        tier: JobTier.ELITE,
        description: `${getFirstName(main)}의 전투 방식을 중심으로 ${getFirstName(sub)}의 장점을 융합한 엘리트 직업.`,
        parentJobIds: [mainId],
        grantedSkills: [
            { skillDataId: `${eliteId}_mastery` },
            { skillDataId: `${eliteId}_technique` },
        ],
        mainModifiers: [
            ...parent.main,
            { attribute: main === 'mage' ? 'magicForce' : 'atk', op: 'multiply', value: 1.22 },
            { attribute: main === 'warrior' ? 'maxLife' : 'speed', op: 'multiply', value: 1.12 },
        ],
        tags: ['career:elite'],
    });
    defineEliteJobRecipe(mainId, subId, id);
}

function getFirstName(id: string): string {
    return firstJobs.find(job => job.id === `career:${id}`)?.name ?? id;
}
