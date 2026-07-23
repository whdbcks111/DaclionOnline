import {
    defineProgress,
    getProgressDefinition,
    PlayerProgress,
    ProgressType,
} from './Progress.js';

export const PvpKillCreditRules = Object.freeze({
    MIN_PLAY_TIME_SECONDS: 60 * 60,
    MAX_LEVEL_GAP: 30,
    SAME_VICTIM_COOLDOWN_MS: 24 * 60 * 60 * 1_000,
    RESPAWN_GRACE_MS: 60 * 1_000,
});

const LAST_RESPAWN_AT_ID = 'combat:pvp_credit/last_respawn_at';
const LAST_VICTIM_CREDIT_PREFIX = 'combat:pvp_credit/last_victim';

defineProgress({
    id: LAST_RESPAWN_AT_ID,
    type: ProgressType.COUNTER,
    label: '마지막 부활 시각',
    description: '부활 직후 반복 PVP 처치를 칭호 진행도에서 제외하기 위한 내부 시각입니다.',
    visible: false,
});

export interface PvpKillCreditParticipant {
    readonly userId: number;
    readonly level: number;
    readonly cumulativePlayTimeSeconds: number;
    readonly progress: PlayerProgress;
}

export interface PvpKillCreditResult {
    readonly credited: boolean;
    readonly reason?: string;
    readonly nextEligibleAt?: number;
}

function lastVictimCreditId(victimUserId: number): string {
    const id = `${LAST_VICTIM_CREDIT_PREFIX}/${Math.max(0, Math.floor(victimUserId))}`;
    if (!getProgressDefinition(id)) {
        defineProgress({
            id,
            type: ProgressType.COUNTER,
            label: '동일 PVP 대상 마지막 인정 시각',
            description: '동일한 피해자를 반복 처치한 기록을 제한하기 위한 내부 시각입니다.',
            visible: false,
        });
    }
    return id;
}

function normalizedNow(now: number): number {
    return Number.isSafeInteger(now) && now >= 0 ? now : Date.now();
}

/** 일반 부활과 관리자 즉시 부활을 포함해 PVP 진행도 보호 시각을 기록한다. */
export function recordPvpRespawn(
    player: PvpKillCreditParticipant,
    now = Date.now(),
): void {
    player.progress.setCounter(LAST_RESPAWN_AT_ID, normalizedNow(now));
}

/**
 * 긍정적 PVP 보상에만 사용할 처치 인정 판정.
 * 실패해도 실제 처치 이벤트·카르마·피해자의 사망 패널티는 취소하지 않는다.
 */
export function evaluatePvpKillCredit(
    killer: PvpKillCreditParticipant,
    victim: PvpKillCreditParticipant,
    now = Date.now(),
): PvpKillCreditResult {
    const occurredAt = normalizedNow(now);
    if (killer.userId === victim.userId) {
        return { credited: false, reason: '자기 자신을 처치한 기록은 인정되지 않습니다.' };
    }
    if (killer.cumulativePlayTimeSeconds < PvpKillCreditRules.MIN_PLAY_TIME_SECONDS) {
        return { credited: false, reason: '공격자의 누적 플레이 시간이 1시간 미만입니다.' };
    }
    if (victim.cumulativePlayTimeSeconds < PvpKillCreditRules.MIN_PLAY_TIME_SECONDS) {
        return { credited: false, reason: '상대의 누적 플레이 시간이 1시간 미만입니다.' };
    }
    if (Math.abs(killer.level - victim.level) > PvpKillCreditRules.MAX_LEVEL_GAP) {
        return { credited: false, reason: '서로의 레벨 차이가 30을 초과합니다.' };
    }

    const lastRespawnAt = victim.progress.getCounterNumber(LAST_RESPAWN_AT_ID);
    if (lastRespawnAt > 0 && occurredAt - lastRespawnAt < PvpKillCreditRules.RESPAWN_GRACE_MS) {
        return {
            credited: false,
            reason: '상대가 부활한 지 60초가 지나지 않았습니다.',
            nextEligibleAt: lastRespawnAt + PvpKillCreditRules.RESPAWN_GRACE_MS,
        };
    }

    const pairProgressId = lastVictimCreditId(victim.userId);
    const lastCreditedAt = killer.progress.getCounterNumber(pairProgressId);
    if (lastCreditedAt > 0
        && occurredAt - lastCreditedAt < PvpKillCreditRules.SAME_VICTIM_COOLDOWN_MS) {
        return {
            credited: false,
            reason: '같은 상대의 처치는 24시간에 한 번만 인정됩니다.',
            nextEligibleAt: lastCreditedAt + PvpKillCreditRules.SAME_VICTIM_COOLDOWN_MS,
        };
    }

    killer.progress.setCounter(pairProgressId, occurredAt);
    return { credited: true };
}
