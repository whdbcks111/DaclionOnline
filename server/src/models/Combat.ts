export interface CriticalResult {
    rawAmount: number;
    critical: boolean;
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

/** 레벨에 따라 방어 효율을 정규화하는 척도. */
export function calculateDefenseScale(defenderLevel: number): number {
    assertFiniteNonNegative('defenderLevel', defenderLevel);
    const scale = 100 + 2 * defenderLevel + 0.005 * defenderLevel * defenderLevel;
    if (!Number.isFinite(scale)) throw new RangeError(`defense scale must be finite: ${scale}`);
    return scale;
}

/** 방어와 관통을 비례 감산·나눗셈 혼합 방식으로 반영한 최종 damage 계산. */
export function calculateFinalDamage(
    rawAmount: number,
    defense: number,
    penetration: number,
    defenderLevel: number,
): number {
    assertFiniteNonNegative('rawAmount', rawAmount);
    assertFiniteNonNegative('defense', defense);
    assertFiniteNonNegative('penetration', penetration);
    const defenseScale = calculateDefenseScale(defenderLevel);
    const effectiveDefense = Math.max(0, defense - penetration);
    if (rawAmount === 0 || effectiveDefense === 0) return rawAmount;
    const proportionalReduction = effectiveDefense / (defenseScale + effectiveDefense);
    const afterSubtraction = rawAmount - rawAmount * proportionalReduction * 0.25;
    return afterSubtraction / (1 + 0.75 * effectiveDefense / defenseScale);
}

function assertFiniteNonNegative(label: string, value: number): void {
    if (!Number.isFinite(value) || value < 0) {
        throw new RangeError(`${label} must be finite and non-negative: ${value}`);
    }
}
