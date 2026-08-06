export interface CriticalResult {
    rawAmount: number;
    critical: boolean;
}

/** 레벨 차이 300에서 도달하는 전투 피해 배율 상·하한. 두 값은 서로 역수다. */
export const LEVEL_GAP_DAMAGE_MIN_MULTIPLIER = 0.5;
export const LEVEL_GAP_DAMAGE_MAX_MULTIPLIER = 2;
export const LEVEL_GAP_DAMAGE_DOUBLING_INTERVAL = 300;

/** PvP에서 이 비율보다 낮은 레벨의 공격자부터 상대 레벨 비례 감쇠를 적용한다. */
export const PVP_UNDERLEVEL_DAMAGE_THRESHOLD_RATIO = 0.75;
export const PVP_UNDERLEVEL_DAMAGE_MIN_MULTIPLIER = 0.1;
export const PVP_UNDERLEVEL_DAMAGE_EXPONENT = 1.5;

/**
 * 공격자와 방어자의 레벨 차이를 양방향 전투 배율로 바꾼다.
 * 동레벨은 정확히 1이며, 상·하한에 닿기 전까지 반대 방향 배율은 정확한 역수다.
 */
export function calculateLevelGapDamageMultiplier(
    attackerLevel: number,
    defenderLevel: number,
): number {
    assertFiniteNonNegative('attackerLevel', attackerLevel);
    assertFiniteNonNegative('defenderLevel', defenderLevel);
    const boundedGap = Math.max(
        -LEVEL_GAP_DAMAGE_DOUBLING_INTERVAL,
        Math.min(LEVEL_GAP_DAMAGE_DOUBLING_INTERVAL, attackerLevel - defenderLevel),
    );
    const multiplier = 2 ** (boundedGap / LEVEL_GAP_DAMAGE_DOUBLING_INTERVAL);
    return Math.max(
        LEVEL_GAP_DAMAGE_MIN_MULTIPLIER,
        Math.min(LEVEL_GAP_DAMAGE_MAX_MULTIPLIER, multiplier),
    );
}

/**
 * 저레벨 플레이어가 고레벨 플레이어를 공격할 때만 쓰는 PvP 전용 배율.
 * 방어·관통 계산 뒤 적용해 높은 스킬 계수나 관통력으로 레벨 격차를 우회하지 못하게 한다.
 */
export function calculatePvpUnderlevelDamageMultiplier(
    attackerLevel: number,
    defenderLevel: number,
): number {
    assertFiniteNonNegative('attackerLevel', attackerLevel);
    assertFiniteNonNegative('defenderLevel', defenderLevel);
    if (defenderLevel <= 0 || attackerLevel >= defenderLevel * PVP_UNDERLEVEL_DAMAGE_THRESHOLD_RATIO) {
        return 1;
    }
    const normalizedRatio = attackerLevel
        / (defenderLevel * PVP_UNDERLEVEL_DAMAGE_THRESHOLD_RATIO);
    return Math.max(
        PVP_UNDERLEVEL_DAMAGE_MIN_MULTIPLIER,
        Math.min(1, normalizedRatio ** PVP_UNDERLEVEL_DAMAGE_EXPONENT),
    );
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

/** 관통 후 방어를 위협 레벨 척도로 나눈 최종 damage 계산. */
export function calculateFinalDamage(
    rawAmount: number,
    defense: number,
    penetration: number,
    referenceLevel: number,
): number {
    assertFiniteNonNegative('rawAmount', rawAmount);
    assertFiniteNonNegative('defense', defense);
    assertFiniteNonNegative('penetration', penetration);
    const defenseScale = calculateDefenseScale(referenceLevel);
    const effectiveDefense = Math.max(0, defense - penetration);
    if (rawAmount === 0 || effectiveDefense === 0) return rawAmount;
    return rawAmount * defenseScale / (defenseScale + effectiveDefense);
}

function assertFiniteNonNegative(label: string, value: number): void {
    if (!Number.isFinite(value) || value < 0) {
        throw new RangeError(`${label} must be finite and non-negative: ${value}`);
    }
}
