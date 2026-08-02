import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import {
    createFishingCaptureProof,
    MAX_MINIGAME_INPUT_SAMPLES,
    simulateFishingCapture,
    type FishingCaptureConfig,
    type FishingCaptureProof,
    type ForgeRhythmConfig,
    type MiniGameValidationRequest,
} from '../../../shared/minigames.js';
import {
    cancelMiniGame,
    failMiniGameOnDisconnect,
    getMiniGameValidationSnapshot,
    hasActiveMiniGame,
    isFishingCaptureResultAccepted,
    readyMiniGame,
    recordMiniGameAction,
    recordMiniGameInput,
    startMiniGame,
    submitMiniGameResult,
    validateFishingCaptureProof,
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

const fishingConfig: FishingCaptureConfig = {
    seed: 1,
    durationMs: 3_000,
    rarityLabel: '일반',
    rarityColor: '#fff',
    fishIcon: 'items/silver_minnow',
    difficulty: 1,
    netShape: 'square',
    netWidth: 60,
    netHeight: 60,
    netSpeed: 30,
    initialGauge: 0.5,
    fillPerSecond: 0.5,
    drainPerSecond: 0.2,
};

function createSuccessfulFishingProof(): FishingCaptureProof {
    const proof = createFishingCaptureProof(fishingConfig, [
        { at: 0, x: 0, y: 0 },
        { at: 400, x: 0, y: 0 },
    ], 1_000);
    assert.equal(proof.success, true);
    return proof;
}

function copyProof(proof: FishingCaptureProof): FishingCaptureProof {
    return JSON.parse(JSON.stringify(proof)) as FishingCaptureProof;
}

function validateFishingRequest(request: MiniGameValidationRequest) {
    const state = simulateFishingCapture(fishingConfig, request.inputs, request.elapsedMs);
    return isFishingCaptureResultAccepted(state, request.fishingProof)
        ? { success: true }
        : { success: false, message: '포획 검증 실패' };
}

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

test('낚시 proof는 클라이언트 성공과 서버 재생 게이지 92%를 모두 요구한다', () => {
    const base = {
        netX: 50,
        netY: 50,
        fishX: 50,
        fishY: 50,
        caught: true,
        finished: true,
        success: true,
    };
    assert.equal(isFishingCaptureResultAccepted({ ...base, gauge: 0.92 }, { success: true }), true);
    assert.equal(isFishingCaptureResultAccepted({ ...base, gauge: 0.919 }, { success: true }), false);
    assert.equal(isFishingCaptureResultAccepted({ ...base, gauge: 1 }, { success: false }), false);
    const validation = validateFishingCaptureProof(fishingConfig, createSuccessfulFishingProof(), 1_000);
    assert.equal(validation.valid, true);
    assert.equal(validation.accepted, true);
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

test('정상 낚시 proof는 지연된 서버 live trace와 무관하게 즉시 성공한다', async () => {
    const userId = 71_004;
    const socketId = 'fishing-proof-socket';
    let resolvedSuccess: boolean | undefined;
    const started = startMiniGame({
        userId,
        type: 'fishing_capture',
        config: fishingConfig,
        expiresInMs: 6_000,
        validate: validateFishingRequest,
        onResolved: result => { resolvedSuccess = result.success; },
    });
    assert.ok(started);
    const proof = createSuccessfulFishingProof();
    const readyAt = Date.now() - proof.elapsedMs;
    assert.equal(readyMiniGame(userId, socketId, started, readyAt), true);
    assert.equal(recordMiniGameInput(userId, socketId, { ...started, x: -1, y: 0 }, readyAt + 900), true);
    assert.equal(submitMiniGameResult(userId, socketId, { ...started, fishingProof: proof }), true);
    await new Promise<void>(resolve => setImmediate(resolve));

    assert.equal(resolvedSuccess, true);
    assert.equal(hasActiveMiniGame(userId), false);
});

test('낚시 proof의 입력·그물·물고기·게이지 변조는 결정론 궤적 재생에서 실패한다', () => {
    const proof = createSuccessfulFishingProof();
    const cases: Array<[string, (candidate: FishingCaptureProof) => void]> = [
        ['input', candidate => { candidate.inputs[0].x = 1; }],
        ['net', candidate => { candidate.trajectory.at(-1)!.netX += 10; }],
        ['fish', candidate => { candidate.trajectory.at(-1)!.fishX -= 10; }],
        ['gauge', candidate => { candidate.trajectory.at(-1)!.gauge = 0.5; }],
    ];
    for (const [label, mutate] of cases) {
        const candidate = copyProof(proof);
        mutate(candidate);
        assert.equal(validateFishingCaptureProof(fishingConfig, candidate, proof.elapsedMs).valid, false, label);
    }
});

test('낚시 proof는 비정상 수치·범위·시각 순서·개수·성긴 궤적을 거부한다', () => {
    const proof = createSuccessfulFishingProof();
    const cases: Array<[string, (candidate: FishingCaptureProof) => void]> = [
        ['NaN', candidate => { candidate.inputs[0].x = Number.NaN; }],
        ['axis range', candidate => { candidate.inputs[0].x = 1.1; }],
        ['axis magnitude', candidate => { candidate.inputs[0].x = 1; candidate.inputs[0].y = 1; }],
        ['input reverse', candidate => { candidate.inputs.reverse(); }],
        ['input bucket duplicate', candidate => { candidate.inputs[1].at = 10; }],
        ['too many inputs', candidate => {
            candidate.inputs = Array.from({ length: MAX_MINIGAME_INPUT_SAMPLES + 1 }, () => ({ at: 0, x: 0, y: 0 }));
        }],
        ['trajectory NaN', candidate => { candidate.trajectory[0].fishX = Number.NaN; }],
        ['trajectory range', candidate => { candidate.trajectory[0].netY = 101; }],
        ['trajectory reverse', candidate => {
            [candidate.trajectory[1], candidate.trajectory[2]] = [candidate.trajectory[2], candidate.trajectory[1]];
        }],
        ['sparse trajectory', candidate => { candidate.trajectory.splice(1, 2); }],
        ['late first trajectory', candidate => { candidate.trajectory.shift(); }],
        ['early last trajectory', candidate => { candidate.trajectory.splice(-2); }],
        ['too many trajectory', candidate => {
            candidate.trajectory = Array.from({ length: 321 }, () => ({ ...candidate.trajectory[0] }));
        }],
    ];
    for (const [label, mutate] of cases) {
        const candidate = copyProof(proof);
        mutate(candidate);
        assert.equal(validateFishingCaptureProof(fishingConfig, candidate, proof.elapsedMs).valid, false, label);
    }
    assert.equal(validateFishingCaptureProof(fishingConfig, proof, proof.elapsedMs + 5_001).valid, false);
    assert.equal(validateFishingCaptureProof(fishingConfig, {
        ...proof,
        padding: 'x'.repeat(160 * 1024),
    }, proof.elapsedMs).valid, false);
});

test('5108ms 낚시 proof는 최종 checkpoint가 같은 20ms bucket에 중복되지 않는다', () => {
    const config = { ...fishingConfig, durationMs: 8_000, fillPerSecond: 0.01, drainPerSecond: 0.01 };
    const proof = createFishingCaptureProof(config, [{ at: 0, x: 0, y: 0 }], 5_108);
    assert.equal(proof.trajectory.at(-1)?.at, 5_108);
    assert.equal(proof.trajectory.at(-2)?.at, 5_000);
    assert.equal(validateFishingCaptureProof(config, proof, 5_108).valid, true);
});

test('다른 socket·token은 낚시 세션을 소비하지 않고 올바른 결과 재전송은 보상을 한 번만 확정한다', async () => {
    const userId = 71_006;
    const socketId = 'fishing-owner-socket';
    let resolvedCount = 0;
    const started = startMiniGame({
        userId,
        type: 'fishing_capture',
        config: fishingConfig,
        expiresInMs: 6_000,
        validate: validateFishingRequest,
        onResolved: () => { resolvedCount++; },
    });
    assert.ok(started);
    const proof = createSuccessfulFishingProof();
    const request = { ...started, fishingProof: proof };
    assert.equal(readyMiniGame(userId, socketId, started, Date.now() - proof.elapsedMs), true);
    assert.equal(submitMiniGameResult(userId, 'foreign-socket', request), false);
    assert.equal(submitMiniGameResult(userId, socketId, { ...request, token: 'wrong-token' }), false);
    assert.equal(hasActiveMiniGame(userId), true);
    assert.equal(submitMiniGameResult(userId, socketId, request), true);
    assert.equal(submitMiniGameResult(userId, socketId, request), false);
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(resolvedCount, 1);
    assert.equal(hasActiveMiniGame(userId), false);
});

test('matching 세션의 잘못된 낚시 proof도 세션을 소비해 tolerance probing을 막는다', async () => {
    const userId = 71_007;
    const socketId = 'fishing-invalid-proof-socket';
    let resolvedCount = 0;
    let resolvedSuccess: boolean | undefined;
    const started = startMiniGame({
        userId,
        type: 'fishing_capture',
        config: fishingConfig,
        expiresInMs: 6_000,
        validate: validateFishingRequest,
        onResolved: result => { resolvedCount++; resolvedSuccess = result.success; },
    });
    assert.ok(started);
    const proof = createSuccessfulFishingProof();
    proof.trajectory.at(-1)!.gauge = 0;
    assert.equal(readyMiniGame(userId, socketId, started, Date.now() - proof.elapsedMs), true);
    assert.equal(submitMiniGameResult(userId, socketId, { ...started, fishingProof: proof }), true);
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(resolvedSuccess, false);
    assert.equal(resolvedCount, 1);
    assert.equal(hasActiveMiniGame(userId), false);
    assert.equal(submitMiniGameResult(userId, socketId, { ...started, fishingProof: proof }), false);
});

test('낚시 proof 성공도 이동·사망·장비 상태를 검사하는 타입 validator를 우회하지 않는다', async () => {
    const states = ['location', 'alive', 'equipment'] as const;
    for (const [index, failedState] of states.entries()) {
        const userId = 71_010 + index;
        const socketId = `fishing-context-${failedState}`;
        const context = { location: true, alive: true, equipment: true };
        let resolvedSuccess: boolean | undefined;
        const started = startMiniGame({
            userId,
            type: 'fishing_capture',
            config: fishingConfig,
            expiresInMs: 6_000,
            validate: request => context.location && context.alive && context.equipment
                ? validateFishingRequest(request)
                : { success: false, message: '낚시 상태 변경' },
            onResolved: result => { resolvedSuccess = result.success; },
        });
        assert.ok(started);
        const proof = createSuccessfulFishingProof();
        assert.equal(readyMiniGame(userId, socketId, started, Date.now() - proof.elapsedMs), true);
        context[failedState] = false;
        assert.equal(submitMiniGameResult(userId, socketId, { ...started, fishingProof: proof }), true);
        await new Promise<void>(resolve => setImmediate(resolve));
        assert.equal(resolvedSuccess, false, failedState);
        assert.equal(hasActiveMiniGame(userId), false);
    }
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
