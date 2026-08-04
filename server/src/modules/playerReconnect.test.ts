import assert from 'node:assert/strict';
import test from 'node:test';
import '../data/skills.js';
import Entity from '../models/Entity.js';
import Equipment from '../models/Equipment.js';
import type Player from '../models/Player.js';
import { ShieldType } from '../models/Shield.js';
import { StatusEffectRemovalReason, StatusEffectType } from '../models/StatusEffect.js';
import {
    beginPlayerReconnectGrace,
    getPlayerByUserId,
    isPlayerInReconnectGrace,
    resumePlayerFromReconnectGrace,
    unloadPlayerByUserId,
} from './player.js';
import {
    getOnlinePlayer,
    getOnlinePlayerUserIdsAtLocation,
    registerOnlinePlayer,
    unregisterOnlinePlayer,
} from './playerRegistry.js';
import { setUserOffline } from './login.js';

class ReconnectPlayer extends Entity {
    override readonly name = '재접속 시험 플레이어';
    readonly skills = { finishAll: () => { this.finishedCasts++; } };
    worldActive = true;
    finishedCasts = 0;
    removedNonPersistent = 0;
    elapsedWallClockSeconds = 0;
    persistenceFlushes = 0;
    saves = 0;

    constructor(readonly userId: number) {
        super(1, 0, 'reconnect-test', { maxLife: 100 }, Equipment.createEmpty());
    }

    override get isPlayer(): boolean { return true; }
    override get playerUserId(): number { return this.userId; }
    override get isWorldActive(): boolean { return this.worldActive; }
    suspendWorldActivity(): void { this.worldActive = false; this.currentTarget = null; }
    resumeWorldActivity(): void { this.worldActive = true; }
    override removeNonPersistentStatusEffects(
        reason = StatusEffectRemovalReason.DISCONNECTED,
    ): number {
        this.removedNonPersistent++;
        return super.removeNonPersistentStatusEffects(reason);
    }
    override elapseWallClockStatusEffects(seconds: number): number {
        this.elapsedWallClockSeconds += seconds;
        return 0;
    }
    markStatusEffectPersistenceDirty(): void { this.persistenceFlushes++; }
    async save(): Promise<void> { this.saves++; }
}

function cleanup(player: ReconnectPlayer): void {
    setUserOffline(player.userId, `reconnect-test-${player.userId}`);
    unregisterOnlinePlayer(player.userId);
}

test('마지막 연결 종료는 Player를 월드에서 즉시 빼고 10초 내 복귀에 같은 객체를 재사용한다', () => {
    const player = new ReconnectPlayer(98_301);
    const manaBarrier = StatusEffectType.fromKey('mana_barrier')!;
    assert.ok(manaBarrier);
    player.applyStatusEffect(manaBarrier, 20, 1);
    player.setShield('test:composite', 50, ShieldType.GENERAL, 20, player);
    registerOnlinePlayer(player as unknown as Player);
    try {
        assert.equal(beginPlayerReconnectGrace(player.userId, 1_000), true);
        assert.equal(player.worldActive, false);
        assert.equal(player.finishedCasts, 1);
        assert.equal(player.removedNonPersistent, 1);
        assert.equal(player.getTotalShield(), 0);
        assert.equal(player.hasStatusEffect(manaBarrier), false);
        assert.equal(getOnlinePlayer(player.userId), undefined);
        assert.equal(getPlayerByUserId(player.userId), undefined);
        assert.deepEqual(getOnlinePlayerUserIdsAtLocation(player.locationId), []);
        assert.equal(isPlayerInReconnectGrace(player.userId), true);

        const resumed = resumePlayerFromReconnectGrace(player.userId, 5_500);
        assert.equal(resumed, player);
        assert.equal(getOnlinePlayer(player.userId), player);
        assert.equal(player.worldActive, true);
        assert.equal(player.elapsedWallClockSeconds, 4.5);
        assert.equal(isPlayerInReconnectGrace(player.userId), false);
    } finally {
        cleanup(player);
    }
});

test('명시적 unload는 남은 재접속 유예를 기다리지 않고 저장·제거한다', async () => {
    const player = new ReconnectPlayer(98_302);
    registerOnlinePlayer(player as unknown as Player);
    try {
        const disconnectedAtMs = Date.now() - 4_500;
        assert.equal(beginPlayerReconnectGrace(player.userId, disconnectedAtMs), true);
        await unloadPlayerByUserId(player.userId, false);

        assert.equal(player.saves, 1);
        assert.ok(player.elapsedWallClockSeconds >= 4.5);
        assert.ok(player.elapsedWallClockSeconds < 5.5);
        assert.equal(isPlayerInReconnectGrace(player.userId), false);
        assert.equal(getOnlinePlayer(player.userId), undefined);
    } finally {
        cleanup(player);
    }
});

test('재접속 유예 만료 unload도 보존 효과에서 유예 경과를 한 번 차감한다', async () => {
    const player = new ReconnectPlayer(98_303);
    registerOnlinePlayer(player as unknown as Player);
    try {
        const disconnectedAtMs = Date.now() - 10_000;
        assert.equal(beginPlayerReconnectGrace(player.userId, disconnectedAtMs), true);
        await unloadPlayerByUserId(player.userId, true);

        assert.ok(player.elapsedWallClockSeconds >= 10);
        assert.ok(player.elapsedWallClockSeconds < 11);
        assert.equal(player.saves, 1);
        assert.equal(isPlayerInReconnectGrace(player.userId), false);
    } finally {
        cleanup(player);
    }
});
