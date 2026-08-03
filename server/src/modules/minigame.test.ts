import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import {
    appendAlchemyTrackingPointerSample,
    createAlchemyTrackingProof,
    createFishingCaptureProof,
    getAlchemyTrackingPathPoints,
    getAlchemyTrackingTargetPosition,
    MAX_MINIGAME_INPUT_SAMPLES,
    simulateAlchemyTracking,
    simulateFishingCapture,
    type AlchemyTrackingConfig,
    type AlchemyTrackingProof,
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
    isAlchemyTrackingResultAccepted,
    isFishingCaptureResultAccepted,
    readyMiniGame,
    recordMiniGameAction,
    recordMiniGameInput,
    startMiniGame,
    submitMiniGameResult,
    validateAlchemyTrackingProof,
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

const alchemyConfig: AlchemyTrackingConfig = {
    seed: 2_026,
    durationMs: 3_000,
    label: '별빛 촉매 조율',
    liquidRadius: 30,
    targetRadius: 5,
    patternKey: 'figure_eight',
    speedProfileKey: 'surge',
    lapDurationMs: 5_000,
    reverseAtMs: [1_200],
    initialGauge: 0.4,
    fillPerSecond: 0.4,
    drainPerSecond: 0.25,
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

function createAlchemyTrackingInputs(elapsedMs: number, offsetX = 0) {
    return Array.from({ length: elapsedMs / 20 + 1 }, (_, index) => {
        const at = index * 20;
        const target = getAlchemyTrackingTargetPosition(alchemyConfig, Math.min(elapsedMs, at + 20));
        return { at, x: target.x + offsetX, y: target.y, dragging: true };
    });
}

function createSuccessfulAlchemyProof(): AlchemyTrackingProof {
    const elapsedMs = 1_600;
    const inputs = createAlchemyTrackingInputs(elapsedMs);
    const proof = createAlchemyTrackingProof(alchemyConfig, inputs, elapsedMs);
    assert.equal(proof.success, true);
    return proof;
}

function copyAlchemyProof(proof: AlchemyTrackingProof): AlchemyTrackingProof {
    return JSON.parse(JSON.stringify(proof)) as AlchemyTrackingProof;
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

test('최초 ready hook은 비용을 한 번만 확정하고 실패하면 시작 전 세션을 취소한다', () => {
    const successUserId = 71_006;
    let readyCount = 0;
    const success = startMiniGame({
        userId: successUserId,
        type: 'alchemy_tracking',
        config: alchemyConfig,
        expiresInMs: 8_000,
        onReady: () => {
            readyCount++;
            return { success: true };
        },
        validate: () => ({ success: true }),
        onResolved: () => undefined,
    });
    assert.ok(success);
    assert.equal(readyMiniGame(successUserId, 'ready-hook-socket', success), true);
    assert.equal(readyMiniGame(successUserId, 'ready-hook-socket', success), true);
    assert.equal(readyCount, 1);
    assert.equal(cancelMiniGame(successUserId, '테스트 정리'), true);

    const failedUserId = 71_007;
    let cancelledReason: string | undefined;
    const failed = startMiniGame({
        userId: failedUserId,
        type: 'alchemy_tracking',
        config: alchemyConfig,
        expiresInMs: 8_000,
        onReady: () => ({ success: false, message: '재료 구성이 바뀌었습니다.' }),
        validate: () => ({ success: true }),
        onResolved: () => undefined,
        onCancelled: reason => { cancelledReason = reason; },
    });
    assert.ok(failed);
    assert.equal(readyMiniGame(failedUserId, 'ready-hook-failed-socket', failed), false);
    assert.equal(hasActiveMiniGame(failedUserId), false);
    assert.equal(cancelledReason, '재료 구성이 바뀌었습니다.');
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

test('연금술 경로 패턴은 액체 안에 머물고 proof는 서버 재생 정확도를 반환한다', () => {
    const patterns: AlchemyTrackingConfig['patternKey'][] = [
        'orbit', 'figure_eight', 'clover', 'spiral', 'zigzag',
    ];
    for (const patternKey of patterns) {
        const points = getAlchemyTrackingPathPoints({ ...alchemyConfig, patternKey });
        assert.equal(points.length, 121);
        assert.equal(points.every(point => Math.hypot(point.x - 50, point.y - 50)
            <= alchemyConfig.liquidRadius - alchemyConfig.targetRadius + 0.001), true, patternKey);
    }

    const proof = createSuccessfulAlchemyProof();
    const validation = validateAlchemyTrackingProof(alchemyConfig, proof, proof.elapsedMs);
    assert.equal(validation.valid, true);
    assert.equal(validation.accepted, true);
    assert.ok(validation.score > 0.98);
    const replay = simulateAlchemyTracking(alchemyConfig, proof.inputs, proof.elapsedMs);
    assert.equal(isAlchemyTrackingResultAccepted(replay, proof), true);

    const edgeReplay = simulateAlchemyTracking(
        alchemyConfig,
        createAlchemyTrackingInputs(proof.elapsedMs, alchemyConfig.targetRadius * 0.8),
        proof.elapsedMs,
    );
    assert.equal(edgeReplay.success, true);
    assert.ok(replay.accuracy > edgeReplay.accuracy + 0.15);
});

test('같은 첫 20ms 안의 pointermove·pointerup도 최초 목표 pointerdown 표본을 보존한다', () => {
    const target = getAlchemyTrackingTargetPosition(alchemyConfig, 0);
    const movedInputs = [{ at: 0, ...target, dragging: true }];
    appendAlchemyTrackingPointerSample(movedInputs, { at: 8, x: 0, y: 0, dragging: true });
    assert.deepEqual(movedInputs.map(input => ({ at: input.at, x: input.x, dragging: input.dragging })), [
        { at: 0, x: target.x, dragging: true },
        { at: 20, x: 0, dragging: true },
    ]);
    const movedProof = createAlchemyTrackingProof(alchemyConfig, movedInputs, 100);
    assert.equal(validateAlchemyTrackingProof(alchemyConfig, movedProof, 100).valid, true);

    const inputs = [{ at: 0, ...target, dragging: true }];
    appendAlchemyTrackingPointerSample(inputs, { at: 8, ...target, dragging: false });
    assert.deepEqual(inputs.map(input => ({ at: input.at, dragging: input.dragging })), [
        { at: 0, dragging: true },
        { at: 20, dragging: false },
    ]);
    const proof = createAlchemyTrackingProof(alchemyConfig, inputs, 100);
    assert.equal(validateAlchemyTrackingProof(alchemyConfig, proof, 100).valid, true);
});

test('연금술 proof는 pointer·목표·게이지 변조와 잘못된 시각을 거부한다', () => {
    const proof = createSuccessfulAlchemyProof();
    const cases: Array<[string, (candidate: AlchemyTrackingProof) => void]> = [
        ['pointer NaN', candidate => { candidate.inputs[0].x = Number.NaN; }],
        ['pointer input', candidate => { candidate.inputs[0].x = 101; }],
        ['input boundary', candidate => { candidate.inputs[0].at = 40; }],
        ['drag boundary', candidate => { candidate.inputs[0].dragging = false; }],
        ['start outside target', candidate => { candidate.inputs[0].x = 0; candidate.inputs[0].y = 0; }],
        ['target trajectory', candidate => { candidate.trajectory.at(-1)!.targetX -= 10; }],
        ['pointer trajectory', candidate => { candidate.trajectory.at(-1)!.pointerY += 10; }],
        ['gauge trajectory', candidate => { candidate.trajectory.at(-1)!.gauge = 0; }],
        ['input reverse', candidate => { candidate.inputs.reverse(); }],
        ['input bucket duplicate', candidate => { candidate.inputs[1].at = 10; }],
        ['trajectory sparse', candidate => { candidate.trajectory.splice(1, 2); }],
        ['trajectory late start', candidate => { candidate.trajectory.shift(); }],
        ['too many inputs', candidate => {
            candidate.inputs = Array.from({ length: MAX_MINIGAME_INPUT_SAMPLES + 1 }, () => ({
                at: 0, x: 50, y: 50, dragging: true,
            }));
        }],
        ['too many trajectory', candidate => {
            candidate.trajectory = Array.from({ length: 321 }, () => ({ ...candidate.trajectory[0] }));
        }],
    ];
    for (const [label, mutate] of cases) {
        const candidate = copyAlchemyProof(proof);
        mutate(candidate);
        assert.equal(validateAlchemyTrackingProof(alchemyConfig, candidate, proof.elapsedMs).valid, false, label);
    }
    assert.equal(validateAlchemyTrackingProof(alchemyConfig, proof, proof.elapsedMs - 500).valid, true);
    assert.equal(validateAlchemyTrackingProof(alchemyConfig, proof, proof.elapsedMs - 501).valid, false);
    assert.equal(validateAlchemyTrackingProof(alchemyConfig, proof, proof.elapsedMs + 5_000).valid, true);
    assert.equal(validateAlchemyTrackingProof(alchemyConfig, proof, proof.elapsedMs + 5_001).valid, false);
    assert.equal(validateAlchemyTrackingProof(alchemyConfig, {
        ...proof,
        padding: 'x'.repeat(160 * 1024),
    }, proof.elapsedMs).valid, false);
    assert.equal(validateAlchemyTrackingProof({
        ...alchemyConfig,
        reverseAtMs: [1_200, 1_100],
    }, proof, proof.elapsedMs).valid, false);
});

test('5108ms 연금술 proof는 최종 checkpoint가 같은 20ms bucket에 중복되지 않는다', () => {
    const config = {
        ...alchemyConfig,
        durationMs: 8_000,
        reverseAtMs: [1_200, 4_200],
        fillPerSecond: 0.01,
        drainPerSecond: 0.01,
    };
    const target = getAlchemyTrackingTargetPosition(config, 0);
    const proof = createAlchemyTrackingProof(config, [{ at: 0, ...target, dragging: true }], 5_108);
    assert.equal(proof.trajectory.at(-1)?.at, 5_108);
    assert.equal(proof.trajectory.at(-2)?.at, 5_000);
    assert.equal(validateAlchemyTrackingProof(config, proof, 5_108).valid, true);
});

test('연금술 세션은 최초 pointer ready부터 재고 proof 점수와 성공을 한 번만 전달한다', async () => {
    const userId = 71_020;
    const socketId = 'alchemy-proof-socket';
    let resolvedCount = 0;
    let resolvedScore: number | undefined;
    let resolvedSuccess: boolean | undefined;
    const started = startMiniGame({
        userId,
        type: 'alchemy_tracking',
        config: alchemyConfig,
        expiresInMs: 8_000,
        validate: request => ({ success: true, score: request.score }),
        onResolved: result => {
            resolvedCount++;
            resolvedScore = result.score;
            resolvedSuccess = result.success;
        },
    });
    assert.ok(started);
    const proof = createSuccessfulAlchemyProof();
    const readyAt = Date.now() - proof.elapsedMs;
    assert.equal(readyMiniGame(userId, socketId, started, readyAt), true);
    assert.equal(submitMiniGameResult(userId, socketId, {
        ...started,
        alchemyTrackingProof: proof,
    }), true);
    await new Promise<void>(resolve => setImmediate(resolve));

    assert.equal(resolvedCount, 1);
    assert.equal(resolvedSuccess, true);
    assert.ok((resolvedScore ?? 0) > 0.98);
    assert.equal(hasActiveMiniGame(userId), false);
    assert.equal(submitMiniGameResult(userId, socketId, {
        ...started,
        alchemyTrackingProof: proof,
    }), false);
});

test('연금술 세션은 서버 시계보다 500ms 넘게 앞선 미래 proof를 조기 제출하지 못한다', () => {
    const userId = 71_021;
    const socketId = 'alchemy-early-proof-socket';
    const started = startMiniGame({
        userId,
        type: 'alchemy_tracking',
        config: alchemyConfig,
        expiresInMs: 8_000,
        validate: () => ({ success: true }),
        onResolved: () => undefined,
    });
    assert.ok(started);
    const proof = createSuccessfulAlchemyProof();
    const readyAt = Date.now();
    assert.equal(readyMiniGame(userId, socketId, started, readyAt), true);
    assert.equal(getMiniGameValidationSnapshot(userId, socketId, {
        ...started,
        alchemyTrackingProof: proof,
    }, readyAt + proof.elapsedMs - 501), undefined);
    assert.ok(getMiniGameValidationSnapshot(userId, socketId, {
        ...started,
        alchemyTrackingProof: proof,
    }, readyAt + proof.elapsedMs - 500));
    assert.equal(cancelMiniGame(userId, '테스트 정리'), true);
});

test('연금술은 시작 화면 idle 만료와 최초 pointerdown 이후 실행 만료를 분리한다', () => {
    const userId = 71_022;
    const socketId = 'alchemy-delayed-pointer-socket';
    const issuedAt = Date.now();
    const started = startMiniGame({
        userId,
        type: 'alchemy_tracking',
        config: alchemyConfig,
        expiresInMs: 8_000,
        validate: () => ({ success: true }),
        onResolved: () => undefined,
    });
    assert.ok(started);
    assert.ok(started.expiresAt - issuedAt >= 29_000);
    const proof = createSuccessfulAlchemyProof();
    const pointerDownAt = issuedAt + 29_000;
    assert.equal(readyMiniGame(userId, socketId, started, pointerDownAt), true);
    assert.ok(getMiniGameValidationSnapshot(userId, socketId, {
        ...started,
        alchemyTrackingProof: proof,
    }, pointerDownAt + proof.elapsedMs));
    assert.equal(cancelMiniGame(userId, '테스트 정리'), true);
});

test('연금술 idle 만료는 취소하고 목표 원 pointerdown 이후 만료만 실패로 확정한다', async () => {
    const idleUserId = 71_023;
    let idleResolved = false;
    let idleCancelled = false;
    const idle = startMiniGame({
        userId: idleUserId,
        type: 'alchemy_tracking',
        config: alchemyConfig,
        expiresInMs: 1_000,
        validate: () => ({ success: true }),
        onResolved: () => { idleResolved = true; },
        onCancelled: () => { idleCancelled = true; },
    });
    assert.ok(idle);
    updateGameScheduler(31);
    assert.equal(idleResolved, false);
    assert.equal(idleCancelled, true);
    assert.equal(hasActiveMiniGame(idleUserId), false);

    const runningUserId = 71_024;
    let runningResolved: boolean | undefined;
    let runningCancelled = false;
    const running = startMiniGame({
        userId: runningUserId,
        type: 'alchemy_tracking',
        config: alchemyConfig,
        expiresInMs: 1_000,
        validate: () => ({ success: true }),
        onResolved: result => { runningResolved = result.success; },
        onCancelled: () => { runningCancelled = true; },
    });
    assert.ok(running);
    assert.equal(readyMiniGame(runningUserId, 'alchemy-running-timeout', running), true);
    updateGameScheduler(9);
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(runningResolved, false);
    assert.equal(runningCancelled, false);
    assert.equal(hasActiveMiniGame(runningUserId), false);
});

test('시작 전 연금술 입력 소켓 종료도 실패 보상 없이 취소한다', async () => {
    const userId = 71_025;
    const socketId = 'alchemy-idle-disconnect';
    let resolved = false;
    let cancelled = false;
    const started = startMiniGame({
        userId,
        type: 'alchemy_tracking',
        config: alchemyConfig,
        expiresInMs: 1_000,
        validate: () => ({ success: true }),
        onResolved: () => { resolved = true; },
        onCancelled: () => { cancelled = true; },
    });
    assert.ok(started);
    assert.equal(await failMiniGameOnDisconnect(userId, socketId), true);
    assert.equal(resolved, false);
    assert.equal(cancelled, true);
    assert.equal(hasActiveMiniGame(userId), false);
});

test('matching 연금술 세션의 잘못된 proof도 소비하고 실패 callback을 실행한다', async () => {
    const userId = 71_021;
    const socketId = 'alchemy-invalid-proof-socket';
    let resolvedCount = 0;
    let resolvedSuccess: boolean | undefined;
    const started = startMiniGame({
        userId,
        type: 'alchemy_tracking',
        config: alchemyConfig,
        expiresInMs: 8_000,
        validate: () => ({ success: true }),
        onResolved: result => {
            resolvedCount++;
            resolvedSuccess = result.success;
        },
    });
    assert.ok(started);
    const proof = createSuccessfulAlchemyProof();
    proof.trajectory.at(-1)!.gauge = 0;
    assert.equal(readyMiniGame(userId, socketId, started, Date.now() - proof.elapsedMs), true);
    assert.equal(submitMiniGameResult(userId, socketId, {
        ...started,
        alchemyTrackingProof: proof,
    }), true);
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(resolvedCount, 1);
    assert.equal(resolvedSuccess, false);
    assert.equal(hasActiveMiniGame(userId), false);
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
