import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import type { ForgeRhythmConfig } from '../../../shared/minigames.js';
import {
    cancelMiniGame,
    failMiniGameOnDisconnect,
    FISHING_RESULT_SETTLE_MS,
    getMiniGameValidationSnapshot,
    hasActiveMiniGame,
    isFishingCaptureResultAccepted,
    readyMiniGame,
    recordMiniGameAction,
    recordMiniGameInput,
    startMiniGame,
    submitMiniGameResult,
} from './minigame.js';
import { updateGameScheduler } from './scheduler.js';
import { getIO, initSocket } from './socket.js';

const httpServer = createServer();
initSocket(httpServer, 'http://localhost');
test.after(() => { getIO().close(); });

const config: ForgeRhythmConfig = {
    durationMs: 3_000,
    label: '서버 권위 단조 시험',
    difficulty: 5,
    qualityBonus: 0,
    beatTimesMs: [500, 1_000, 1_500, 2_000],
    hitWindowMs: 200,
    perfectWindowMs: 60,
    requiredAccuracy: 0.75,
};

test('미니게임은 서버 수신 입력만 기록하고 조기·사후 조작 결과를 거부한다', () => {
    const userId = 71_001;
    const socketId = 'authoritative-socket';
    const started = startMiniGame({
        userId,
        type: 'forge_rhythm',
        config,
        expiresInMs: 6_000,
        validate: () => ({ success: true }),
        onResolved: () => undefined,
    });
    assert.ok(started);

    const proof = { sessionId: started.sessionId, token: started.token };
    const readyAt = Date.now();
    assert.equal(readyMiniGame(userId, socketId, proof, readyAt), true);
    assert.equal(readyMiniGame(userId, 'foreign-socket', proof, readyAt), false);
    assert.equal(recordMiniGameInput(userId, socketId, { ...proof, x: 4, y: -4 }, readyAt + 100), true);
    assert.equal(recordMiniGameAction(userId, socketId, { ...proof, action: 'strike' }, readyAt + 500), true);

    const forgedRequest = {
        ...proof,
        elapsedMs: config.durationMs,
        actions: config.beatTimesMs.map(at => ({ at, action: 'strike' })),
    };
    assert.equal(
        getMiniGameValidationSnapshot(userId, socketId, forgedRequest, readyAt + config.durationMs - 300),
        undefined,
    );

    const toleratedSnapshot = getMiniGameValidationSnapshot(
        userId,
        socketId,
        forgedRequest,
        readyAt + config.durationMs - 50,
    );
    assert.ok(toleratedSnapshot);
    assert.equal(toleratedSnapshot.elapsedMs, config.durationMs);

    const snapshot = getMiniGameValidationSnapshot(
        userId,
        socketId,
        forgedRequest,
        readyAt + config.durationMs,
    );
    assert.ok(snapshot);
    assert.deepEqual(snapshot.actions, [{ at: 500, action: 'strike' }]);
    assert.deepEqual(snapshot.inputs.at(-1), { at: 100, x: 1, y: -1 });
    assert.equal(hasActiveMiniGame(userId), true);
    assert.equal(cancelMiniGame(userId, '테스트 정리'), true);
});

test('다중 접속에서는 focused 화면 하나에만 미니게임을 시작한다', () => {
    const userId = 71_005;
    const emitted: string[] = [];
    const sockets = getIO().sockets.sockets as unknown as Map<string, {
        id: string
        data: Record<string, unknown>
        emit: (event: string) => void
    }>;
    sockets.set('hidden-client', {
        id: 'hidden-client',
        data: { onlineUserId: userId, clientPresence: 'hidden', clientPresenceUpdatedAt: 200 },
        emit: event => { emitted.push(`hidden:${event}`); },
    });
    sockets.set('focused-client', {
        id: 'focused-client',
        data: { onlineUserId: userId, clientPresence: 'focused', clientPresenceUpdatedAt: 100 },
        emit: event => { emitted.push(`focused:${event}`); },
    });

    try {
        const started = startMiniGame({
            userId,
            type: 'forge_rhythm',
            config,
            expiresInMs: 6_000,
            validate: () => ({ success: true }),
            onResolved: () => undefined,
        });
        assert.ok(started);
        assert.deepEqual(emitted, ['focused:miniGameStart']);
        assert.equal(readyMiniGame(userId, 'hidden-client', started), false);
        assert.equal(readyMiniGame(userId, 'focused-client', started), true);
        assert.equal(cancelMiniGame(userId, '테스트 정리'), true);
    } finally {
        sockets.delete('hidden-client');
        sockets.delete('focused-client');
    }
});

test('낚시 서버 판정은 성공 게이지 경계의 작은 시각 오차를 허용한다', () => {
    const base = {
        netX: 50,
        netY: 50,
        fishX: 50,
        fishY: 50,
        caught: true,
        finished: false,
        success: false,
    };
    assert.equal(isFishingCaptureResultAccepted({ ...base, gauge: 0.97 }), true);
    assert.equal(isFishingCaptureResultAccepted({ ...base, gauge: 0.94 }), false);
});

test('입력 소켓 연결 종료는 미니게임 취소가 아니라 실패로 확정한다', async () => {
    const userId = 71_002;
    const socketId = 'refreshing-socket';
    let resolvedSuccess: boolean | undefined;
    const started = startMiniGame({
        userId,
        type: 'forge_rhythm',
        config,
        expiresInMs: 6_000,
        validate: () => ({ success: true }),
        onResolved: result => { resolvedSuccess = result.success; },
    });
    assert.ok(started);
    assert.equal(readyMiniGame(userId, socketId, started), true);

    assert.equal(await failMiniGameOnDisconnect(userId, socketId), true);
    assert.equal(resolvedSuccess, false);
    assert.equal(hasActiveMiniGame(userId), false);
});

test('낚시 결과는 짧게 정산한 뒤 그 사이 도착한 서버 입력까지 포함해 확정한다', async () => {
    const userId = 71_004;
    const socketId = 'fishing-settle-socket';
    let resolvedSuccess: boolean | undefined;
    const started = startMiniGame({
        userId,
        type: 'fishing_capture',
        config: {
            seed: 1,
            durationMs: 3_000,
            rarityLabel: '일반',
            rarityColor: '#fff',
            fishIcon: 'items/silver_minnow',
            difficulty: 1,
            netShape: 'circle',
            netWidth: 20,
            netHeight: 20,
            netSpeed: 30,
            initialGauge: 0.5,
            fillPerSecond: 0.1,
            drainPerSecond: 0.1,
        },
        expiresInMs: 6_000,
        validate: request => ({ success: request.inputs.at(-1)?.x === 1 }),
        onResolved: result => { resolvedSuccess = result.success; },
    });
    assert.ok(started);
    const readyAt = Date.now();
    assert.equal(readyMiniGame(userId, socketId, started, readyAt), true);
    assert.equal(submitMiniGameResult(userId, socketId, started), true);
    assert.equal(resolvedSuccess, undefined);
    assert.equal(hasActiveMiniGame(userId), true);

    assert.equal(recordMiniGameInput(userId, socketId, { ...started, x: 1, y: 0 }, readyAt + 50), true);
    updateGameScheduler(FISHING_RESULT_SETTLE_MS / 1_000);
    await new Promise<void>(resolve => setImmediate(resolve));

    assert.equal(resolvedSuccess, true);
    assert.equal(hasActiveMiniGame(userId), false);
});

test('제한 시간 만료도 취소 콜백 대신 실패 결과를 확정한다', async () => {
    const userId = 71_003;
    let resolvedSuccess: boolean | undefined;
    let cancelled = false;
    const started = startMiniGame({
        userId,
        type: 'forge_rhythm',
        config,
        expiresInMs: 1_000,
        validate: () => ({ success: true }),
        onResolved: result => { resolvedSuccess = result.success; },
        onCancelled: () => { cancelled = true; },
    });
    assert.ok(started);

    updateGameScheduler(3);
    await new Promise<void>(resolve => setImmediate(resolve));

    assert.equal(resolvedSuccess, false);
    assert.equal(cancelled, false);
    assert.equal(hasActiveMiniGame(userId), false);
});
