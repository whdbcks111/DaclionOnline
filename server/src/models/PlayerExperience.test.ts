import assert from 'node:assert/strict';
import test from 'node:test';
import Player, { calculateDeathPenaltyEligibleExperience } from './Player.js';

function createExperienceShell(exp = 0): Player {
    const player = Object.create(Player.prototype) as Player;
    const shell = player as unknown as Record<string, unknown>;
    shell._level = 20;
    shell._exp = exp;
    shell._life = 100;
    shell._dirty = false;
    shell._pendingDeathPenaltyProtectedExp = 0;
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

test('사망 패널티가 현재 경험치보다 커도 보호된 처치 경험치는 남긴다', () => {
    assert.equal(calculateDeathPenaltyEligibleExperience(120, 20), 100);
    assert.equal(calculateDeathPenaltyEligibleExperience(20, 20), 0);
    assert.equal(calculateDeathPenaltyEligibleExperience(20, 50), 0);
});
