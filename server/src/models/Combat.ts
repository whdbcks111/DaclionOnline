export interface CriticalResult {
    rawAmount: number;
    critical: boolean;
}

/** 공격 전 치명타 판정과 raw damage 계산 */
export function applyCritical(baseAmount: number, critRate: number, critDmg: number): CriticalResult {
    const critical = Math.random() < Math.max(0, Math.min(1, critRate));
    return {
        rawAmount: critical ? baseAmount * Math.max(0, critDmg) : baseAmount,
        critical,
    };
}

/** 방어와 관통을 반영한 최종 damage 계산 */
export function calculateFinalDamage(rawAmount: number, defense: number, penetration: number): number {
    const effectiveDefense = Math.max(0, defense - penetration);
    return Math.max(0, rawAmount - effectiveDefense);
}
