import type { AttributeKey, AttributeRecord } from './Attribute.js';

export type MonsterStatWeightMap = Partial<Record<MonsterCombatStatKey, number>>;

export type MonsterCombatStatKey =
    | 'maxLife'
    | 'atk'
    | 'magicForce'
    | 'def'
    | 'magicDef'
    | 'armorPen'
    | 'magicPen'
    | 'speed'
    | 'attackSpeed'
    | 'critRate'
    | 'critDmg';

type MonsterStatCoefficients = Readonly<Record<MonsterCombatStatKey, number>>;

const COMBAT_STAT_KEYS: readonly MonsterCombatStatKey[] = Object.freeze([
    'maxLife',
    'atk',
    'magicForce',
    'def',
    'magicDef',
    'armorPen',
    'magicPen',
    'speed',
    'attackSpeed',
    'critRate',
    'critDmg',
]);

/**
 * 몬스터 역할별 능력치 배분 비율.
 * 마스터 데이터는 raw 수치 대신 이 프로필과 소수의 weight/override를 우선 사용한다.
 */
export class MonsterStatProfile {
    private static readonly all: MonsterStatProfile[] = [];

    static readonly BALANCED = new MonsterStatProfile('balanced', '균형형', {
        maxLife: 1,
        atk: 1,
        magicForce: 0,
        def: 1,
        magicDef: 1,
        armorPen: 0.75,
        magicPen: 0,
        speed: 1,
        attackSpeed: 1,
        critRate: 1,
        critDmg: 1,
    });
    static readonly BRUISER = new MonsterStatProfile('bruiser', '근접 전투형', {
        maxLife: 1.2,
        atk: 1.15,
        magicForce: 0,
        def: 1.1,
        magicDef: 0.8,
        armorPen: 1,
        magicPen: 0,
        speed: 0.9,
        attackSpeed: 0.95,
        critRate: 0.9,
        critDmg: 1,
    });
    static readonly TANK = new MonsterStatProfile('tank', '수호형', {
        maxLife: 1.5,
        atk: 0.82,
        magicForce: 0,
        def: 1.45,
        magicDef: 1.25,
        armorPen: 0.65,
        magicPen: 0,
        speed: 0.68,
        attackSpeed: 0.76,
        critRate: 0.55,
        critDmg: 0.9,
    });
    static readonly SKIRMISHER = new MonsterStatProfile('skirmisher', '기동형', {
        maxLife: 0.78,
        atk: 1.08,
        magicForce: 0,
        def: 0.72,
        magicDef: 0.76,
        armorPen: 1.12,
        magicPen: 0,
        speed: 1.35,
        attackSpeed: 1.25,
        critRate: 1.25,
        critDmg: 1.08,
    });
    static readonly CASTER = new MonsterStatProfile('caster', '마법형', {
        maxLife: 0.84,
        atk: 0.62,
        magicForce: 1.25,
        def: 0.7,
        magicDef: 1.18,
        armorPen: 0,
        magicPen: 1.12,
        speed: 0.96,
        attackSpeed: 0.94,
        critRate: 1,
        critDmg: 1.04,
    });
    static readonly HYBRID = new MonsterStatProfile('hybrid', '복합형', {
        maxLife: 0.95,
        atk: 1,
        magicForce: 1.05,
        def: 0.9,
        magicDef: 1.05,
        armorPen: 0.82,
        magicPen: 0.82,
        speed: 1.04,
        attackSpeed: 1,
        critRate: 1.05,
        critDmg: 1.03,
    });

    private constructor(
        readonly key: string,
        readonly label: string,
        readonly coefficients: MonsterStatCoefficients,
    ) {
        MonsterStatProfile.all.push(this);
    }

    static values(): readonly MonsterStatProfile[] {
        return MonsterStatProfile.all;
    }

    static fromKey(key: string): MonsterStatProfile | undefined {
        const normalized = key.trim().toLowerCase();
        return MonsterStatProfile.all.find(profile => profile.key === normalized);
    }

    static fromInput(input: string): MonsterStatProfile | undefined {
        const normalized = input.trim().toLocaleLowerCase('ko-KR');
        return MonsterStatProfile.all.find(profile =>
            profile.key === normalized || profile.label.toLocaleLowerCase('ko-KR') === normalized);
    }
}

interface MonsterRankMultipliers {
    readonly life: (level: number) => number;
    readonly offense: number;
    readonly defense: number;
    readonly penetration: number;
    readonly speed: number;
    readonly attackSpeed: number;
    readonly critical: number;
}

/** 일반·정예·필드 보스·보스의 공통 체급 배율. */
export class MonsterRank {
    private static readonly all: MonsterRank[] = [];

    static readonly NORMAL = new MonsterRank('normal', '일반', {
        life: () => 1,
        offense: 1,
        defense: 1,
        penetration: 1,
        speed: 1,
        attackSpeed: 1,
        critical: 1,
    });
    static readonly ELITE = new MonsterRank('elite', '정예', {
        life: () => 1.8,
        offense: 1.12,
        defense: 1.1,
        penetration: 1.08,
        speed: 1.02,
        attackSpeed: 0.95,
        critical: 1.06,
    });
    static readonly FIELD_BOSS = new MonsterRank('field-boss', '필드 보스', {
        life: level => 4 + level / 90,
        offense: 1.16,
        defense: 1.12,
        penetration: 1.12,
        speed: 0.96,
        attackSpeed: 0.78,
        critical: 1.08,
    });
    static readonly BOSS = new MonsterRank('boss', '보스', {
        life: level => 5 + level / 35,
        offense: 1.2,
        defense: 1.16,
        penetration: 1.15,
        speed: 0.92,
        attackSpeed: 0.68,
        critical: 1.1,
    });

    private constructor(
        readonly key: string,
        readonly label: string,
        readonly multipliers: MonsterRankMultipliers,
    ) {
        MonsterRank.all.push(this);
    }

    static values(): readonly MonsterRank[] {
        return MonsterRank.all;
    }

    static fromKey(key: string): MonsterRank | undefined {
        const normalized = key.trim().toLowerCase();
        return MonsterRank.all.find(rank => rank.key === normalized);
    }

    static fromInput(input: string): MonsterRank | undefined {
        const normalized = input.trim().toLocaleLowerCase('ko-KR');
        return MonsterRank.all.find(rank =>
            rank.key === normalized || rank.label.toLocaleLowerCase('ko-KR') === normalized);
    }
}

export interface MonsterStatCalculation {
    readonly level: number;
    readonly profile: MonsterStatProfile;
    readonly rank?: MonsterRank;
    /** 프로필 결과에 추가로 곱하는 몬스터 고유 성향. 1이 기준값이다. */
    readonly weights?: MonsterStatWeightMap;
    /** 패턴상 반드시 고정되어야 하는 값만 최종값으로 교체한다. */
    readonly overrides?: Partial<AttributeRecord>;
}

/**
 * 레벨 성장 예산을 역할과 체급에 배분해 몬스터 baseAttribute를 만든다.
 * 같은 입력은 항상 같은 결과를 반환하며 런타임 상태나 난수를 사용하지 않는다.
 */
export function calculateMonsterBaseAttributes(input: MonsterStatCalculation): Partial<AttributeRecord> {
    const level = normalizeMonsterLevel(input.level);
    const rank = input.rank ?? MonsterRank.NORMAL;
    const weights = validateWeights(input.weights);
    const base = getLevelStatBudget(level);
    const result: Partial<AttributeRecord> = {};

    for (const key of COMBAT_STAT_KEYS) {
        const profileRatio = input.profile.coefficients[key];
        const weight = weights[key] ?? 1;
        const rankRatio = getRankMultiplier(rank, key, level);
        result[key] = roundMonsterStat(key, base[key] * profileRatio * weight * rankRatio);
    }

    for (const [rawKey, value] of Object.entries(input.overrides ?? {})) {
        const key = rawKey as AttributeKey;
        if (!Number.isFinite(value) || value! < 0) {
            throw new Error(`Invalid monster stat override: ${rawKey}=${value}`);
        }
        result[key] = value;
    }
    return result;
}

/** 기존 마스터를 점진 이전할 때 공격 방식과 명시 능력치로 가장 가까운 역할을 선택한다. */
export function inferMonsterStatProfile(
    attributes: Partial<AttributeRecord>,
    damageType?: 'physical' | 'magic' | 'absolute',
): MonsterStatProfile {
    const atk = attributes.atk ?? 0;
    const magicForce = attributes.magicForce ?? 0;
    if (damageType === 'magic') return MonsterStatProfile.CASTER;
    if (magicForce > 0) return MonsterStatProfile.HYBRID;
    if ((attributes.speed ?? 1) >= 1.8 || (attributes.attackSpeed ?? 1) >= 1.15) {
        return MonsterStatProfile.SKIRMISHER;
    }
    if ((attributes.def ?? 0) >= Math.max(20, atk * 0.65)) return MonsterStatProfile.TANK;
    return MonsterStatProfile.BRUISER;
}

function normalizeMonsterLevel(level: number): number {
    if (!Number.isFinite(level) || level < 1) throw new Error(`Invalid monster level: ${level}`);
    return Math.floor(level);
}

function validateWeights(weights?: MonsterStatWeightMap): MonsterStatWeightMap {
    const result: MonsterStatWeightMap = {};
    for (const [rawKey, value] of Object.entries(weights ?? {})) {
        if (!COMBAT_STAT_KEYS.includes(rawKey as MonsterCombatStatKey)
            || !Number.isFinite(value) || value! < 0) {
            throw new Error(`Invalid monster stat weight: ${rawKey}=${value}`);
        }
        result[rawKey as MonsterCombatStatKey] = value;
    }
    return result;
}

function getLevelStatBudget(level: number): Record<MonsterCombatStatKey, number> {
    const offense = 5 + 2 * level + 0.01 * level ** 2;
    const defense = 0.9 * level + 0.007 * level ** 2;
    const penetration = Math.max(0, (level - 25) * 0.55);
    return {
        maxLife: 8 + 17 * level + 0.005 * level ** 3,
        atk: offense,
        magicForce: offense,
        def: defense,
        magicDef: defense,
        armorPen: penetration,
        magicPen: penetration,
        speed: 1 + Math.min(2.2, level / 160),
        attackSpeed: 1,
        critRate: Math.min(0.28, 0.05 + level * 0.00065),
        critDmg: 1.5 + Math.min(0.95, level * 0.0027),
    };
}

function getRankMultiplier(rank: MonsterRank, key: MonsterCombatStatKey, level: number): number {
    if (key === 'maxLife') return rank.multipliers.life(level);
    if (key === 'atk' || key === 'magicForce') return rank.multipliers.offense;
    if (key === 'def' || key === 'magicDef') return rank.multipliers.defense;
    if (key === 'armorPen' || key === 'magicPen') return rank.multipliers.penetration;
    if (key === 'speed') return rank.multipliers.speed;
    if (key === 'attackSpeed') return rank.multipliers.attackSpeed;
    return rank.multipliers.critical;
}

function roundMonsterStat(key: MonsterCombatStatKey, value: number): number {
    if (key === 'maxLife' || key === 'atk' || key === 'magicForce' || key === 'def' || key === 'magicDef') {
        return Math.max(0, Math.round(value));
    }
    if (key === 'critRate') return Math.max(0, Number(value.toFixed(4)));
    return Math.max(0, Number(value.toFixed(2)));
}
