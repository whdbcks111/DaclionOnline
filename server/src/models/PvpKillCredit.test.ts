import assert from 'node:assert/strict';
import test from 'node:test';
import { PlayerProgress } from './Progress.js';
import {
    evaluatePvpKillCredit,
    PvpKillCreditRules,
    recordPvpRespawn,
    type PvpKillCreditParticipant,
} from './PvpKillCredit.js';

function participant(
    userId: number,
    level = 30,
    playTime = PvpKillCreditRules.MIN_PLAY_TIME_SECONDS,
): PvpKillCreditParticipant {
    return {
        userId,
        level,
        cumulativePlayTimeSeconds: playTime,
        progress: PlayerProgress.createEmpty(userId),
    };
}

test('1시간 미만 계정과 30레벨 초과 격차는 유효 PVP 처치로 인정하지 않는다', () => {
    const eligible = participant(1);
    const newcomer = participant(2, 30, PvpKillCreditRules.MIN_PLAY_TIME_SECONDS - 1);
    const lowLevel = participant(3, 1);
    const highLevel = participant(4, 32);

    assert.equal(evaluatePvpKillCredit(eligible, newcomer, 1_000).credited, false);
    assert.equal(evaluatePvpKillCredit(newcomer, eligible, 1_000).credited, false);
    assert.equal(evaluatePvpKillCredit(lowLevel, highLevel, 1_000).credited, false);
});

test('동일 공격자와 피해자의 유효 처치는 24시간에 한 번만 인정된다', () => {
    const killer = participant(10);
    const victim = participant(11);
    const now = 100_000;

    assert.equal(evaluatePvpKillCredit(killer, victim, now).credited, true);
    assert.equal(evaluatePvpKillCredit(killer, victim, now + 1).credited, false);
    assert.equal(evaluatePvpKillCredit(
        killer,
        victim,
        now + PvpKillCreditRules.SAME_VICTIM_COOLDOWN_MS,
    ).credited, true);
});

test('부활한 피해자는 60초 동안 유효 PVP 처치 대상에서 보호된다', () => {
    const killer = participant(20);
    const victim = participant(21);
    const now = 200_000;
    recordPvpRespawn(victim, now);

    assert.equal(evaluatePvpKillCredit(
        killer,
        victim,
        now + PvpKillCreditRules.RESPAWN_GRACE_MS - 1,
    ).credited, false);
    assert.equal(evaluatePvpKillCredit(
        killer,
        victim,
        now + PvpKillCreditRules.RESPAWN_GRACE_MS,
    ).credited, true);
});
