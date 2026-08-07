export interface CriticalResult {
    rawAmount: number;
    critical: boolean;
}

export interface DefenseBreakdown {
    readonly effectiveDefense: number;
    readonly fixedReduction: number;
    readonly proportionalReduction: number;
}

/**
 * 피격자가 공격자보다 빠를 때의 회피율을 계산한다.
 * 같은 속도 이하는 0%, 2배 빠르면 50%, 3배 이상 빠르면 최대 90%다.
 */
export function calculateEvasionChance(attackerSpeed: number, targetSpeed: number): number {
    const safeAttackerSpeed = Math.max(0.01, Number.isFinite(attackerSpeed) ? attackerSpeed : 0);
    const safeTargetSpeed = Math.max(0, Number.isFinite(targetSpeed) ? targetSpeed : 0);
    const speedRatio = safeTargetSpeed / safeAttackerSpeed;
    return Math.min(0.9, Math.max(0, speedRatio - 1) * 0.5);
}

export function rollEvasion(chance: number, random = Math.random): boolean {
    // 속도 기반 회피의 90% 상한은 calculateEvasionChance에서 적용한다.
    // 확정 회피처럼 명시적으로 전달된 100% 확률까지 다시 90%로 낮추지 않는다.
    const clampedChance = Math.max(0, Math.min(1, chance));
    return clampedChance > 0 && random() < clampedChance;
}

/** 공격 전 치명타 판정과 raw damage 계산 */
export function applyCritical(baseAmount: number, critRate: number, critDmg: number): CriticalResult {
    const critical = Math.random() < Math.max(0, Math.min(1, critRate));
    return {
        rawAmount: critical ? baseAmount * Math.max(0, critDmg) : baseAmount,
        critical,
    };
}

/**
 * 위협 레벨에 따라 방어 효율을 정규화하는 척도.
 * Lv.200까지는 기존 곡선을 유지하고, 이후는 그 지점의 접선으로 연장해 이차 성장을 막는다.
 */
export function calculateDefenseScale(referenceLevel: number): number {
    assertFiniteNonNegative('referenceLevel', referenceLevel);
    const scale = referenceLevel <= 200
        ? 100 + 2 * referenceLevel + 0.005 * referenceLevel * referenceLevel
        : 4 * referenceLevel - 100;
    if (!Number.isFinite(scale)) throw new RangeError(`defense scale must be finite: ${scale}`);
    return scale;
}

/**
 * 한 방어 수치에서 관통 후 고정 감산량과 비율 완화율을 함께 계산한다.
 * 유효 방어가 낮을 때는 대부분 고정 방어로 작동하고, 높아질수록 고정 방어는 K에
 * 점근하는 대신 비율 방어가 강해져 동레벨의 큰 공격까지 전부 0으로 만들지 않는다.
 */
export function calculateDefenseBreakdown(
    defense: number,
    penetration: number,
    referenceLevel: number,
): DefenseBreakdown {
    assertFiniteNonNegative('defense', defense);
    assertFiniteNonNegative('penetration', penetration);
    const effectiveDefense = Math.max(0, defense - penetration);
    const defenseScale = calculateDefenseScale(referenceLevel);
    const remainingDamageRatio = defenseScale / (defenseScale + effectiveDefense);
    return {
        effectiveDefense,
        fixedReduction: effectiveDefense * remainingDamageRatio,
        proportionalReduction: 1 - remainingDamageRatio,
    };
}

/** 관통 후 고정 방어로 먼저 감산하고 남은 피해에 비율 방어를 적용한다. */
export function calculateFinalDamage(
    rawAmount: number,
    defense: number,
    penetration: number,
    referenceLevel: number,
): number {
    assertFiniteNonNegative('rawAmount', rawAmount);
    const breakdown = calculateDefenseBreakdown(defense, penetration, referenceLevel);
    if (rawAmount === 0 || breakdown.effectiveDefense === 0) return rawAmount;
    const afterFixedReduction = Math.max(0, rawAmount - breakdown.fixedReduction);
    return afterFixedReduction * (1 - breakdown.proportionalReduction);
}

/** 방어 후 목표 피해를 정확히 남기는 데 필요한 비치명 raw damage를 역산한다. */
export function calculateRequiredRawDamage(
    targetFinalDamage: number,
    defense: number,
    penetration: number,
    referenceLevel: number,
): number {
    assertFiniteNonNegative('targetFinalDamage', targetFinalDamage);
    if (targetFinalDamage === 0) return 0;
    const breakdown = calculateDefenseBreakdown(defense, penetration, referenceLevel);
    const remainingDamageRatio = 1 - breakdown.proportionalReduction;
    return breakdown.fixedReduction + targetFinalDamage / remainingDamageRatio;
}

/** 치명타가 방어 전에 적용되는 실제 순서로 한 번의 기대 피해를 계산한다. */
export function calculateExpectedFinalDamage(
    rawAmount: number,
    defense: number,
    penetration: number,
    referenceLevel: number,
    criticalRate: number,
    criticalDamage: number,
): number {
    assertFiniteProbability('criticalRate', criticalRate);
    assertFiniteAtLeastOne('criticalDamage', criticalDamage);
    const normal = calculateFinalDamage(rawAmount, defense, penetration, referenceLevel);
    const critical = calculateFinalDamage(
        rawAmount * criticalDamage,
        defense,
        penetration,
        referenceLevel,
    );
    return normal * (1 - criticalRate) + critical * criticalRate;
}

/** 방어·치명타를 모두 거친 목표 기대 피해에서 기본 raw damage를 역산한다. */
export function calculateRequiredRawDamageForExpectedDamage(
    targetExpectedDamage: number,
    defense: number,
    penetration: number,
    referenceLevel: number,
    criticalRate: number,
    criticalDamage: number,
): number {
    assertFiniteNonNegative('targetExpectedDamage', targetExpectedDamage);
    assertFiniteProbability('criticalRate', criticalRate);
    assertFiniteAtLeastOne('criticalDamage', criticalDamage);
    if (targetExpectedDamage === 0) return 0;

    const breakdown = calculateDefenseBreakdown(defense, penetration, referenceLevel);
    const remainingDamageRatio = 1 - breakdown.proportionalReduction;
    const expectedCriticalMultiplier = 1 + criticalRate * (criticalDamage - 1);
    const bothHitCandidate = (
        breakdown.fixedReduction + targetExpectedDamage / remainingDamageRatio
    ) / expectedCriticalMultiplier;
    if (bothHitCandidate >= breakdown.fixedReduction || criticalRate === 0 || criticalDamage === 1) {
        return bothHitCandidate;
    }

    // 일반타는 고정 방어에 막히고 치명타만 통과하는 낮은 목표 피해 구간.
    return (
        breakdown.fixedReduction
        + targetExpectedDamage / (criticalRate * remainingDamageRatio)
    ) / criticalDamage;
}

function assertFiniteNonNegative(label: string, value: number): void {
    if (!Number.isFinite(value) || value < 0) {
        throw new RangeError(`${label} must be finite and non-negative: ${value}`);
    }
}

function assertFiniteProbability(label: string, value: number): void {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new RangeError(`${label} must be between 0 and 1: ${value}`);
    }
}

function assertFiniteAtLeastOne(label: string, value: number): void {
    if (!Number.isFinite(value) || value < 1) {
        throw new RangeError(`${label} must be finite and at least 1: ${value}`);
    }
}
