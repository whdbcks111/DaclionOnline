import assert from 'node:assert/strict';
import test from 'node:test';
import Player, { calculateDeathPenaltyEligibleExperience } from './Player.js';
import { PlayerProgress } from '../progression/Progress.js';
import { ASCENSION_RANK_COUNTER } from '../progression/Ascension.js';

function createExperienceShell(exp = 0): Player {
    const player = Object.create(Player.prototype) as Player;
    const shell = player as unknown as Record<string, unknown>;
    shell._level = 20;
    shell._exp = exp;
    shell._life = 100;
    shell._dirty = false;
    shell._pendingDeathPenaltyProtectedExp = 0;
    shell.progress = PlayerProgress.createEmpty(98_001);
    player.isDead = false;
    Object.defineProperty(player, 'getExperienceGainModifier', { value: () => 1 });
    return player;
}

test('처치 직후 지급된 경험치는 다음 사망 판정에서만 차감 대상에서 제외된다', () => {
    const player = createExperienceShell(80);
    player.gainExp(20, { protectFromPendingDeathPenalty: true });
    const shell = player as unknown as Record<string, number>;

    assert.equal(shell._pendingDeathPenaltyProtectedExp, 20);
    assert.equal(calculateDeathPenaltyEligibleExperience(player.exp, shell._pendingDeathPenaltyProtectedExp), 80);

    player.lateUpdate(0.05);
    assert.equal(shell._pendingDeathPenaltyProtectedExp, 0);
    assert.equal(calculateDeathPenaltyEligibleExperience(player.exp, shell._pendingDeathPenaltyProtectedExp), 100);
});

test('초월자는 Lv.1000 전 경험치를 10배로 받고 이후에는 정상 배율로 돌아온다', () => {
    const early = createExperienceShell();
    early.progress.increment(ASCENSION_RANK_COUNTER);
    early.gainExp(10);
    assert.equal(early.exp, 100);

    const late = createExperienceShell();
    (late as unknown as Record<string, unknown>)._level = 1_000;
    late.progress.increment(ASCENSION_RANK_COUNTER);
    late.gainExp(10);
    assert.equal(late.exp, 10);
});

test('미초월자는 Lv.1000부터 경험치가 20%로 감소하고 Lv.1500에서 더 성장하지 않는다', () => {
    const slowed = createExperienceShell();
    (slowed as unknown as Record<string, unknown>)._level = 1_000;
    slowed.gainExp(100);
    assert.equal(slowed.exp, 20);

    const capped = createExperienceShell(123);
    (capped as unknown as Record<string, unknown>)._level = 1_500;
    capped.gainExp(1_000_000);
    assert.equal(capped.level, 1_500);
    assert.equal(capped.exp, 0);
});

test('사망 패널티가 현재 경험치보다 커도 보호된 처치 경험치는 남긴다', () => {
    assert.equal(calculateDeathPenaltyEligibleExperience(120, 20), 100);
    assert.equal(calculateDeathPenaltyEligibleExperience(20, 20), 0);
    assert.equal(calculateDeathPenaltyEligibleExperience(20, 50), 0);
});
