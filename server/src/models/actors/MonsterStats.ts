import type { AttributeKey, AttributeRecord } from '../core/Attribute.js';
import { calculateRequiredRawDamageForExpectedDamage } from '../combat/Combat.js';
import { calculateDefensiveStatGrowthUnits, calculateVitalityDefenseBonus } from '../core/Stat.js';

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
        // 혼합 방어식에서는 지나친 저항 편중이 마법 직업의 고정·비율 피해를 동시에
        // 이중으로 누르므로, 물리 방어보다 높되 단일 직업군을 봉쇄하지 않는 범위로 둔다.
        magicDef: 0.9,
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
    { level: 1, offense: 4 },
    { level: 20, offense: 16 },
    { level: 50, offense: 50 },
    { level: 100, offense: 90 },
    { level: 200, offense: 175 },
    { level: 350, offense: 175 },
    { level: 500, offense: 200 },
    { level: 750, offense: 500 },
    { level: 1000, offense: 650 },
] as const);
/** 자동 성장선과 추천 체력 배분 사이에서 몬스터 공방을 맞추는 기준 투자량. */
const MONSTER_BASELINE_VITALITY_POINTS_PER_LEVEL = 1.15;
/** 공격 성장이 보강된 플레이어와 일반·정예의 교전 시간을 맞추는 기대 피해 최대 보정. */
const GENERAL_MONSTER_PRESSURE_PEAK_MULTIPLIER = 1.15;
/** 공용 몬스터 곡선의 치명타 한 방 분산 상한. 명시 최종 override는 예외다. */
const MONSTER_CRITICAL_DAMAGE_CAP = 2;
/**
 * 몬스터 한 번의 공격이 동레벨 기준 방어와 실제 치명타를 거친 뒤 남길 기대 피해.
 * 일반·정예는 기존 앵커에 플레이어 최대 생명력 증가율을 한 번만 반영하고,
 * 필드 보스·보스는 기존 이차 공격 예산을 체급 공격 배율과 함께 사용한다.
 */
export function getMonsterTargetDamageBudget(rank: MonsterRank, level: number): number {
    const normalizedLevel = normalizeMonsterLevel(level);
    const baseDamageBudget = rank === MonsterRank.FIELD_BOSS || rank === MonsterRank.BOSS
        ? getRawMonsterOffenseBudget(normalizedLevel)
        : getGeneralMonsterDamageBudget(normalizedLevel);
    const pressureMultiplier = rank === MonsterRank.FIELD_BOSS || rank === MonsterRank.BOSS
        ? 1
        : getGeneralMonsterPressureMultiplier(normalizedLevel);
    return baseDamageBudget * rank.multipliers.offense * pressureMultiplier;
}

/**
 * 이미 압력이 높은 입문·후반 이정표는 원래 예산을 유지하고, 공격 기술이 빠르게
 * 늘어나는 Lv.50~500 구간만 기대 피해를 보강한다. 경계는 선형 보간해 급변을 막는다.
 */
function getGeneralMonsterPressureMultiplier(level: number): number {
    if (level <= 20 || level >= 750) return 1;
    if (level < 50) {
        return 1 + (GENERAL_MONSTER_PRESSURE_PEAK_MULTIPLIER - 1) * (level - 20) / 30;
    }
    if (level <= 500) return GENERAL_MONSTER_PRESSURE_PEAK_MULTIPLIER;
    return GENERAL_MONSTER_PRESSURE_PEAK_MULTIPLIER
        - (GENERAL_MONSTER_PRESSURE_PEAK_MULTIPLIER - 1) * (level - 500) / 250;
}

function getGeneralMonsterDamageBudget(level: number): number {
    const upperIndex = GENERAL_MONSTER_OFFENSE_BUDGET_ANCHORS.findIndex(anchor => anchor.level >= level);
    if (upperIndex < 0) {
        const last = GENERAL_MONSTER_OFFENSE_BUDGET_ANCHORS.at(-1)!;
        const previous = GENERAL_MONSTER_OFFENSE_BUDGET_ANCHORS.at(-2)!;
        const slope = (last.offense - previous.offense) / (last.level - previous.level);
        return applyDefensiveGrowthPressure(level, last.offense + (level - last.level) * slope);
    }
    if (upperIndex === 0) return GENERAL_MONSTER_OFFENSE_BUDGET_ANCHORS[0].offense;
    const lower = GENERAL_MONSTER_OFFENSE_BUDGET_ANCHORS[upperIndex - 1];
    const upper = GENERAL_MONSTER_OFFENSE_BUDGET_ANCHORS[upperIndex];
    const progress = (level - lower.level) / (upper.level - lower.level);
    return applyDefensiveGrowthPressure(
        level,
        lower.offense + (upper.offense - lower.offense) * progress,
    );
}

/** 플레이어 최대 생명력의 새/기존 스탯 기여 비율만큼 목표 피해도 함께 높인다. */
function applyDefensiveGrowthPressure(level: number, offense: number): number {
    const baselinePoints = Math.max(1, level - 1);
    const growthRatio = calculateDefensiveStatGrowthUnits(baselinePoints) / baselinePoints;
    return offense * growthRatio;
}

/** 몬스터 공방 예산이 상대하는 동레벨 기본 체력 투자의 방어력. */
export function getMonsterBaselineDefense(level: number): number {
    const earnedLevels = Math.max(0, normalizeMonsterLevel(level) - 1);
    return calculateVitalityDefenseBonus(earnedLevels * MONSTER_BASELINE_VITALITY_POINTS_PER_LEVEL);
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
        if (key === 'atk' || key === 'magicForce') continue;
        const profileRatio = input.profile.coefficients[key];
        const weight = weights[key] ?? 1;
        const rankRatio = getRankMultiplier(rank, key, level);
        result[key] = roundMonsterStat(key, base[key] * profileRatio * weight * rankRatio);
    }

    // 관통·치명타 override가 있으면 공격력 역산 전에 먼저 반영한다.
    for (const key of ['armorPen', 'magicPen', 'critRate', 'critDmg'] as const) {
        const value = input.overrides?.[key];
        if (value === undefined) continue;
        if (!Number.isFinite(value) || value < 0) {
            throw new Error(`Invalid monster stat override: ${key}=${value}`);
        }
        result[key] = value;
    }

    const baselineDefense = getMonsterBaselineDefense(level);
    const criticalRate = result.critRate ?? 0;
    const criticalDamage = Math.max(1, result.critDmg ?? 1);
    for (const key of ['atk', 'magicForce'] as const) {
        const profileRatio = input.profile.coefficients[key];
        const targetExpectedDamage = getMonsterTargetDamageBudget(rank, level)
            * profileRatio
            * (weights[key] ?? 1);
        const penetration = key === 'atk' ? result.armorPen ?? 0 : result.magicPen ?? 0;
        result[key] = roundMonsterStat(key, calculateRequiredRawDamageForExpectedDamage(
            targetExpectedDamage,
            baselineDefense,
            penetration,
            level,
            criticalRate,
            criticalDamage,
        ));
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
    const offense = getRawMonsterOffenseBudget(level);
    const defense = getMonsterBaselineDefense(level);
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
    if (key === 'critDmg') return Math.max(0, Math.min(MONSTER_CRITICAL_DAMAGE_CAP, Number(value.toFixed(2))));
    return Math.max(0, Number(value.toFixed(2)));
}
