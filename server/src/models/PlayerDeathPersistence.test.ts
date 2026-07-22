import assert from 'node:assert/strict';
import test from 'node:test';
import Entity from './Entity.js';
import Player, { PlayerRuntimeProgressIds } from './Player.js';
import { PlayerProgress } from './Progress.js';

function createDeathShell(storedRemaining = ''): Player {
    const player = Object.create(Player.prototype) as Player;
    const shell = player as unknown as Record<string, unknown>;
    shell._level = 20;
    shell._locationId = 'missing:test-location';
    shell._life = 0;
    player.isDead = false;
    player.deathTimer = 0;
    shell._deathNotifTimer = 99;
    shell.progress = PlayerProgress.createEmpty(9_901);
    if (storedRemaining) {
        player.progress.setState(PlayerRuntimeProgressIds.DEATH_REMAINING, storedRemaining);
    }
    return player;
}

test('저장된 사망 상태는 남은 시간 그대로 복원하고 onDeath를 반복하지 않는다', () => {
    const player = createDeathShell('17.250');
    let repeatedDeaths = 0;
    Object.defineProperty(player, 'onDeath', { value: () => { repeatedDeaths++; } });

    assert.equal(player.restorePersistedDeathState(), true);
    assert.equal(player.isDead, true);
    assert.equal(player.deathTimer, 17.25);

    Entity.prototype.lateUpdate.call(player, 0.05);
    assert.equal(repeatedDeaths, 0);
});

test('구버전의 life=0 저장도 이미 처리된 사망으로 간주해 패널티 중복 경로를 막는다', () => {
    const player = createDeathShell();

    assert.equal(player.restorePersistedDeathState(), true);
    assert.equal(player.isDead, true);
    assert.equal(player.deathTimer, 30);
    assert.equal(player.progress.getState(PlayerRuntimeProgressIds.DEATH_REMAINING), '30.000');
});

test('살아 있는 플레이어에 남은 오래된 사망 상태는 제거한다', () => {
    const player = createDeathShell('12.000');
    (player as unknown as { _life: number })._life = 50;

    assert.equal(player.restorePersistedDeathState(), false);
    assert.equal(player.isDead, false);
    assert.equal(player.progress.getState(PlayerRuntimeProgressIds.DEATH_REMAINING), '');
});
