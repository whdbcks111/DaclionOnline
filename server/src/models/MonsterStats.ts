import type { AttributeKey, AttributeRecord } from './Attribute.js';
import { calculateDefenseScale } from './Combat.js';

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
        life: level => 4 + 2 / (1 + level / 150),
        offense: 1.16,
        defense: 1.12,
        penetration: 1.12,
        speed: 0.96,
        attackSpeed: 0.78,
        critical: 1.08,
    });
    static readonly BOSS = new MonsterRank('boss', '보스', {
        life: level => 4.8 + 4.2 / (1 + (level / 100) ** 2),
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

const GENERAL_MONSTER_OFFENSE_BUDGET_ANCHORS = Object.freeze([
    { level: 1, offense: 5 },
    { level: 50, offense: 38 },
    { level: 100, offense: 90 },
    { level: 200, offense: 175 },
    { level: 350, offense: 185 },
    { level: 1000, offense: 400 },
] as const);

/**
 * 일반·정예 몬스터의 동레벨 전투 압력을 플레이어 성장선에 맞추는 공용 배율.
 * 보스 계열은 별도 패턴과 파티 압력을 보존하기 위해 기존 공격 예산을 그대로 쓴다.
 */
export function getMonsterOffensePressureScale(rank: MonsterRank, level: number): number {
    const normalizedLevel = normalizeMonsterLevel(level);
    if (rank === MonsterRank.FIELD_BOSS || rank === MonsterRank.BOSS) return 1;
    return getGeneralMonsterOffenseBudget(normalizedLevel) / getRawMonsterOffenseBudget(normalizedLevel);
}

function getGeneralMonsterOffenseBudget(level: number): number {
    const upperIndex = GENERAL_MONSTER_OFFENSE_BUDGET_ANCHORS.findIndex(anchor => anchor.level >= level);
    if (upperIndex < 0) {
        const last = GENERAL_MONSTER_OFFENSE_BUDGET_ANCHORS.at(-1)!;
        const previous = GENERAL_MONSTER_OFFENSE_BUDGET_ANCHORS.at(-2)!;
        const slope = (last.offense - previous.offense) / (last.level - previous.level);
        return last.offense + (level - last.level) * slope;
    }
    if (upperIndex === 0) return GENERAL_MONSTER_OFFENSE_BUDGET_ANCHORS[0].offense;
    const lower = GENERAL_MONSTER_OFFENSE_BUDGET_ANCHORS[upperIndex - 1];
    const upper = GENERAL_MONSTER_OFFENSE_BUDGET_ANCHORS[upperIndex];
    const progress = (level - lower.level) / (upper.level - lower.level);
    return lower.offense + (upper.offense - lower.offense) * progress;
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
    const offensePressureScale = getMonsterOffensePressureScale(rank, level);
    const result: Partial<AttributeRecord> = {};

    for (const key of COMBAT_STAT_KEYS) {
        const profileRatio = input.profile.coefficients[key];
        const weight = weights[key] ?? 1;
        const rankRatio = getRankMultiplier(rank, key, level);
        const pressureScale = key === 'atk' || key === 'magicForce' ? offensePressureScale : 1;
        result[key] = roundMonsterStat(key, base[key] * profileRatio * weight * rankRatio * pressureScale);
    }

    for (const [rawKey, value] of Object.entries(input.overrides ?? {})) {
        const key = rawKey as AttributeKey;
        if (!Number.isFinite(value) || value! < 0) {
            throw new Error(`Invalid monster stat override: ${rawKey}=${value}`);
        }
        result[key] = key === 'def' || key === 'magicDef'
            ? normalizeMonsterDefenseForScale(level, value!)
            : value;
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
    const offense = getRawMonsterOffenseBudget(level);
    const defense = normalizeMonsterDefenseForScale(level, 0.9 * level + 0.007 * level ** 2);
    const penetration = Math.max(0, (level - 25) * 0.55);
    return {
        maxLife: 300 + 75 * level + 4 * level ** 2 + 0.002 * level ** 3,
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

/** 방어 척도 개편 전후에도 동레벨 몬스터의 무관통 피해 감소율을 보존한다. */
export function normalizeMonsterDefenseForScale(level: number, defense: number): number {
    const normalizedLevel = normalizeMonsterLevel(level);
    if (!Number.isFinite(defense) || defense < 0) throw new Error(`Invalid monster defense: ${defense}`);
    const legacyScale = 100 + 2 * normalizedLevel + 0.005 * normalizedLevel ** 2;
    return defense * calculateDefenseScale(normalizedLevel) / legacyScale;
}

function getRawMonsterOffenseBudget(level: number): number {
    return 5 + 2 * level + 0.01 * level ** 2;
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
