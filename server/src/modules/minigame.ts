import {
    ALCHEMY_TRACKING_PROOF_VERSION,
    appendMiniGameInputSample,
    FISHING_CAPTURE_PROOF_VERSION,
    MAX_ALCHEMY_LIQUID_RADIUS,
    MAX_ALCHEMY_TARGET_RADIUS,
    MAX_ALCHEMY_TRACKING_PROOF_BYTES,
    MAX_ALCHEMY_TRACKING_TRAJECTORY_SAMPLES,
    MAX_FISHING_CAPTURE_PROOF_BYTES,
    MAX_FISHING_CAPTURE_TRAJECTORY_SAMPLES,
    MAX_MINIGAME_INPUT_SAMPLES,
    MIN_ALCHEMY_TARGET_RADIUS,
    MINIGAME_INPUT_SAMPLE_INTERVAL_MS,
    getAlchemyTrackingTargetPosition,
    simulateAlchemyTracking,
    simulateFishingCapture,
    type AlchemyTrackingConfig,
    type AlchemyTrackingProof,
    AlchemyTrackingPattern,
    AlchemyTrackingSpeedProfile,
    type FishingCaptureConfig,
    type FishingCaptureProof,
    type MiniGameActionRequest,
    type MiniGameInputRequest,
    type MiniGameSessionRequest,
} from '../../../shared/minigames.js';
import type {
    AlchemyTrackingSimulationState,
    FishingSimulationState,
    MiniGameConfigMap,
    MiniGameActionSample,
    MiniGameCancelledData,
    MiniGameInputSample,
    MiniGameResolvedData,
    MiniGameResultRequest,
    MiniGameStartData,
    MiniGameType,
    MiniGameValidationRequest,
} from '../../../shared/minigames.js';
import { randomHex } from '../utils/random.js';
import logger from '../utils/logger.js';
import { getSession } from './login.js';
import { getIO, getPreferredUserSocket } from './socket.js';
import { cancelGameTask, scheduleGameTask } from './scheduler.js';

export interface MiniGameValidationResult {
    success: boolean
    message?: string
    /** 타입 소유 기능이 보상 계산에 사용하는 0~1 정규화 점수. 클라이언트에는 권위값만 결과로 전달된다. */
    score?: number
}

export interface StartMiniGameOptions<T extends MiniGameType = MiniGameType> {
    userId: number
    type: T
    config: MiniGameConfigMap[T]
    expiresInMs: number
    /** 최초 ready 직전에 소유 기능이 비용을 원자적으로 확정하는 동기 경계. 실패하면 세션을 시작 전 취소한다. */
    onReady?: () => Pick<MiniGameValidationResult, 'success' | 'message'>
    validate: (request: MiniGameValidationRequest) => MiniGameValidationResult
    onResolved: (result: MiniGameValidationResult) => void | Promise<void>
    onCancelled?: (reason: string) => void
}

export interface MiniGameStartedEvent {
    readonly userId: number
    readonly type: MiniGameType
}

export type MiniGameStartedHandler = (event: MiniGameStartedEvent) => void

interface ActiveMiniGame extends StartMiniGameOptions {
    sessionId: string
    token: string
    startedAt: number
    expiresAt: number
    timeoutKey: string
    inputSocketId?: string
    readyAt?: number
    inputs: MiniGameInputSample[]
    actions: MiniGameActionSample[]
    resultRequested?: boolean
}

const activeByUser = new Map<number, ActiveMiniGame>();
const miniGameStartedHandlers = new Set<MiniGameStartedHandler>();
/** 전송·브라우저 frame 순서의 작은 흔들림을 흡수하되 비정상 조기 완료는 막는다. */
export const MINIGAME_RESULT_EARLY_TOLERANCE_MS = 250;
/** 클라이언트 성공 frame을 서버 결정론 재생으로 인정하는 최소 최종 게이지. */
export const FISHING_CAPTURE_REPLAY_GAUGE_MINIMUM = 0.92;
export const FISHING_CAPTURE_PROOF_ELAPSED_TOLERANCE_MS = 5_000;
export const FISHING_CAPTURE_PROOF_MAX_CHECKPOINT_GAP_MS = 220;
export const FISHING_CAPTURE_PROOF_LAST_CHECKPOINT_TOLERANCE_MS = 120;
export const FISHING_CAPTURE_PROOF_POSITION_TOLERANCE = 2.5;
export const FISHING_CAPTURE_PROOF_GAUGE_TOLERANCE = 0.06;
export const FISHING_CAPTURE_PROOF_LAST_POSITION_TOLERANCE = 3;
export const FISHING_CAPTURE_PROOF_LAST_GAUGE_TOLERANCE = 0.08;
export const FISHING_CAPTURE_PROOF_MATCH_RATIO = 0.9;
/** ready 왕복 지연을 흡수하되 공개 simulator로 미래 궤적을 조기 제출하지 못하게 하는 상한. */
export const ALCHEMY_TRACKING_PROOF_CLIENT_AHEAD_TOLERANCE_MS = 500;
/** 정상 완료 proof가 느린 네트워크를 거쳐 늦게 도착할 때 허용하는 전달 지연 상한. */
export const ALCHEMY_TRACKING_PROOF_DELIVERY_DELAY_TOLERANCE_MS = 5_000;
export const ALCHEMY_TRACKING_PROOF_MAX_CHECKPOINT_GAP_MS = 220;
export const ALCHEMY_TRACKING_PROOF_LAST_CHECKPOINT_TOLERANCE_MS = 120;
export const ALCHEMY_TRACKING_PROOF_POSITION_TOLERANCE = 3.5;
export const ALCHEMY_TRACKING_PROOF_GAUGE_TOLERANCE = 0.08;
export const ALCHEMY_TRACKING_PROOF_LAST_POSITION_TOLERANCE = 4;
export const ALCHEMY_TRACKING_PROOF_LAST_GAUGE_TOLERANCE = 0.1;
export const ALCHEMY_TRACKING_PROOF_MATCH_RATIO = 0.9;
export const ALCHEMY_TRACKING_START_POSITION_TOLERANCE = 0.75;
export const ALCHEMY_TRACKING_IDLE_TIMEOUT_MS = 30_000;
export const ALCHEMY_TRACKING_EXECUTION_GRACE_MS = 5_000;

/** 미니게임 소유 기능이 다른 준비 세션을 raw 상태 접근 없이 정리할 수 있는 시작 구독 경계. */
export function subscribeMiniGameStarted(handler: MiniGameStartedHandler): () => void {
    miniGameStartedHandlers.add(handler);
    return () => { miniGameStartedHandlers.delete(handler); };
}

export function isFishingCaptureResultAccepted(
    state: FishingSimulationState,
    proof: Pick<FishingCaptureProof, 'success'> | undefined,
): boolean {
    return proof?.success === true && state.gauge >= FISHING_CAPTURE_REPLAY_GAUGE_MINIMUM;
}

export function isAlchemyTrackingResultAccepted(
    state: AlchemyTrackingSimulationState,
    proof: Pick<AlchemyTrackingProof, 'success'> | undefined,
): boolean {
    return proof?.success === true && state.success && state.gauge >= 1;
}

function cancelActiveMiniGameTasks(active: ActiveMiniGame): void {
    cancelGameTask(active.timeoutKey);
}

export interface FishingCaptureProofValidationResult {
    valid: boolean
    accepted: boolean
    proof?: FishingCaptureProof
    reason?: string
}

export interface AlchemyTrackingProofValidationResult {
    valid: boolean
    accepted: boolean
    score: number
    proof?: AlchemyTrackingProof
    reason?: string
}

function invalidFishingProof(reason: string): FishingCaptureProofValidationResult {
    return { valid: false, accepted: false, reason };
}

function invalidAlchemyTrackingProof(reason: string): AlchemyTrackingProofValidationResult {
    return { valid: false, accepted: false, score: 0, reason };
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function isBoardCoordinate(value: unknown): value is number {
    return isFiniteNumber(value) && value >= 0 && value <= 100;
}

/** 서버 발급 config와 client elapsed 입력만 사용해 낚시 proof의 구조와 궤적을 재생 검증한다. */
export function validateFishingCaptureProof(
    config: FishingCaptureConfig,
    value: unknown,
    serverElapsedMs: number,
): FishingCaptureProofValidationResult {
    if (!value || typeof value !== 'object' || !Number.isFinite(serverElapsedMs) || serverElapsedMs < 0) {
        return invalidFishingProof('structure');
    }
    let encoded: string;
    try {
        encoded = JSON.stringify(value);
    } catch {
        return invalidFishingProof('encoding');
    }
    if (Buffer.byteLength(encoded, 'utf8') > MAX_FISHING_CAPTURE_PROOF_BYTES) {
        return invalidFishingProof('size');
    }

    const candidate = value as Partial<FishingCaptureProof>;
    if (candidate.version !== FISHING_CAPTURE_PROOF_VERSION
        || typeof candidate.success !== 'boolean'
        || !isFiniteNumber(candidate.elapsedMs)
        || candidate.elapsedMs < 0
        || candidate.elapsedMs > config.durationMs
        || Math.abs(serverElapsedMs - candidate.elapsedMs) > FISHING_CAPTURE_PROOF_ELAPSED_TOLERANCE_MS
        || !Array.isArray(candidate.inputs)
        || !Array.isArray(candidate.trajectory)) {
        return invalidFishingProof('header');
    }

    const maximumInputs = Math.min(
        MAX_MINIGAME_INPUT_SAMPLES,
        Math.ceil(config.durationMs / MINIGAME_INPUT_SAMPLE_INTERVAL_MS) + 2,
    );
    if (candidate.inputs.length === 0 || candidate.inputs.length > maximumInputs
        || candidate.trajectory.length === 0
        || candidate.trajectory.length > MAX_FISHING_CAPTURE_TRAJECTORY_SAMPLES) {
        return invalidFishingProof('count');
    }

    let previousAt = -1;
    let previousBucket = -1;
    for (const input of candidate.inputs) {
        if (!input || typeof input !== 'object'
            || !isFiniteNumber(input.at) || input.at < 0 || input.at > candidate.elapsedMs
            || input.at <= previousAt
            || Math.floor(input.at / MINIGAME_INPUT_SAMPLE_INTERVAL_MS) === previousBucket
            || !isFiniteNumber(input.x) || input.x < -1 || input.x > 1
            || !isFiniteNumber(input.y) || input.y < -1 || input.y > 1
            || Math.hypot(input.x, input.y) > 1.001) {
            return invalidFishingProof('input');
        }
        previousAt = input.at;
        previousBucket = Math.floor(input.at / MINIGAME_INPUT_SAMPLE_INTERVAL_MS);
    }

    previousAt = -1;
    previousBucket = -1;
    for (const checkpoint of candidate.trajectory) {
        if (!checkpoint || typeof checkpoint !== 'object'
            || !isFiniteNumber(checkpoint.at) || checkpoint.at < 0 || checkpoint.at > candidate.elapsedMs
            || checkpoint.at <= previousAt
            || Math.floor(checkpoint.at / MINIGAME_INPUT_SAMPLE_INTERVAL_MS) === previousBucket
            || (previousAt >= 0 && checkpoint.at - previousAt > FISHING_CAPTURE_PROOF_MAX_CHECKPOINT_GAP_MS)
            || !isBoardCoordinate(checkpoint.netX) || !isBoardCoordinate(checkpoint.netY)
            || !isBoardCoordinate(checkpoint.fishX) || !isBoardCoordinate(checkpoint.fishY)
            || !isFiniteNumber(checkpoint.gauge) || checkpoint.gauge < 0 || checkpoint.gauge > 1) {
            return invalidFishingProof('trajectory');
        }
        previousAt = checkpoint.at;
        previousBucket = Math.floor(checkpoint.at / MINIGAME_INPUT_SAMPLE_INTERVAL_MS);
    }
    const firstCheckpoint = candidate.trajectory[0];
    const lastCheckpoint = candidate.trajectory.at(-1)!;
    if (firstCheckpoint.at > MINIGAME_INPUT_SAMPLE_INTERVAL_MS
        || Math.abs(lastCheckpoint.at - candidate.elapsedMs)
        > FISHING_CAPTURE_PROOF_LAST_CHECKPOINT_TOLERANCE_MS) {
        return invalidFishingProof('checkpoint-boundary');
    }

    const inputs = candidate.inputs.map(input => ({ at: input.at, x: input.x, y: input.y }));
    const trajectory = candidate.trajectory.map(checkpoint => ({ ...checkpoint }));
    let matchingCheckpoints = 0;
    for (const checkpoint of trajectory) {
        const replay = simulateFishingCapture(config, inputs, checkpoint.at);
        const matches = Math.hypot(checkpoint.netX - replay.netX, checkpoint.netY - replay.netY)
            <= FISHING_CAPTURE_PROOF_POSITION_TOLERANCE
            && Math.hypot(checkpoint.fishX - replay.fishX, checkpoint.fishY - replay.fishY)
            <= FISHING_CAPTURE_PROOF_POSITION_TOLERANCE
            && Math.abs(checkpoint.gauge - replay.gauge) <= FISHING_CAPTURE_PROOF_GAUGE_TOLERANCE;
        if (matches) matchingCheckpoints++;
    }
    if (matchingCheckpoints / trajectory.length < FISHING_CAPTURE_PROOF_MATCH_RATIO) {
        return invalidFishingProof('trajectory-replay');
    }

    const lastReplay = simulateFishingCapture(config, inputs, lastCheckpoint.at);
    if (Math.hypot(lastCheckpoint.netX - lastReplay.netX, lastCheckpoint.netY - lastReplay.netY)
        > FISHING_CAPTURE_PROOF_LAST_POSITION_TOLERANCE
        || Math.hypot(lastCheckpoint.fishX - lastReplay.fishX, lastCheckpoint.fishY - lastReplay.fishY)
        > FISHING_CAPTURE_PROOF_LAST_POSITION_TOLERANCE
        || Math.abs(lastCheckpoint.gauge - lastReplay.gauge)
        > FISHING_CAPTURE_PROOF_LAST_GAUGE_TOLERANCE) {
        return invalidFishingProof('last-checkpoint');
    }

    const proof: FishingCaptureProof = {
        version: FISHING_CAPTURE_PROOF_VERSION,
        elapsedMs: candidate.elapsedMs,
        success: candidate.success,
        inputs,
        trajectory,
    };
    const finalReplay = simulateFishingCapture(config, inputs, proof.elapsedMs);
    return {
        valid: true,
        accepted: isFishingCaptureResultAccepted(finalReplay, proof),
        proof,
    };
}

/** 서버 발급 seed/config로 pointer 입력과 목표·pointer·게이지 궤적을 느슨하게 재생 검증한다. */
export function validateAlchemyTrackingProof(
    config: AlchemyTrackingConfig,
    value: unknown,
    serverElapsedMs: number,
): AlchemyTrackingProofValidationResult {
    if (!value || typeof value !== 'object' || !Number.isFinite(serverElapsedMs) || serverElapsedMs < 0) {
        return invalidAlchemyTrackingProof('structure');
    }
    if (!isFiniteNumber(config.seed)
        || !isFiniteNumber(config.durationMs) || config.durationMs <= 0 || config.durationMs > 30_000
        || !isFiniteNumber(config.liquidRadius) || config.liquidRadius <= MAX_ALCHEMY_TARGET_RADIUS
        || config.liquidRadius > MAX_ALCHEMY_LIQUID_RADIUS
        || !isFiniteNumber(config.targetRadius) || config.targetRadius < MIN_ALCHEMY_TARGET_RADIUS
        || config.targetRadius > MAX_ALCHEMY_TARGET_RADIUS
        || !AlchemyTrackingPattern.fromKey(config.patternKey)
        || !AlchemyTrackingSpeedProfile.fromKey(config.speedProfileKey)
        || !isFiniteNumber(config.lapDurationMs) || config.lapDurationMs < 700
        || config.lapDurationMs > 12_000
        || !Array.isArray(config.reverseAtMs) || config.reverseAtMs.length > 16
        || !isFiniteNumber(config.initialGauge) || config.initialGauge <= 0 || config.initialGauge >= 1
        || !isFiniteNumber(config.fillPerSecond) || config.fillPerSecond <= 0
        || !isFiniteNumber(config.drainPerSecond) || config.drainPerSecond <= 0) {
        return invalidAlchemyTrackingProof('config');
    }
    let previousReversal = 0;
    for (const reversalAt of config.reverseAtMs) {
        if (!isFiniteNumber(reversalAt) || reversalAt <= previousReversal || reversalAt >= config.durationMs) {
            return invalidAlchemyTrackingProof('config-reversal');
        }
        previousReversal = reversalAt;
    }

    let encoded: string;
    try {
        encoded = JSON.stringify(value);
    } catch {
        return invalidAlchemyTrackingProof('encoding');
    }
    if (Buffer.byteLength(encoded, 'utf8') > MAX_ALCHEMY_TRACKING_PROOF_BYTES) {
        return invalidAlchemyTrackingProof('size');
    }

    const candidate = value as Partial<AlchemyTrackingProof>;
    if (candidate.version !== ALCHEMY_TRACKING_PROOF_VERSION
        || typeof candidate.success !== 'boolean'
        || !isFiniteNumber(candidate.elapsedMs)
        || candidate.elapsedMs < 0
        || candidate.elapsedMs > config.durationMs
        || candidate.elapsedMs - serverElapsedMs > ALCHEMY_TRACKING_PROOF_CLIENT_AHEAD_TOLERANCE_MS
        || serverElapsedMs - candidate.elapsedMs > ALCHEMY_TRACKING_PROOF_DELIVERY_DELAY_TOLERANCE_MS
        || !Array.isArray(candidate.inputs)
        || !Array.isArray(candidate.trajectory)) {
        return invalidAlchemyTrackingProof('header');
    }

    const maximumInputs = Math.min(
        MAX_MINIGAME_INPUT_SAMPLES,
        Math.ceil(config.durationMs / MINIGAME_INPUT_SAMPLE_INTERVAL_MS) + 2,
    );
    if (candidate.inputs.length === 0 || candidate.inputs.length > maximumInputs
        || candidate.trajectory.length === 0
        || candidate.trajectory.length > MAX_ALCHEMY_TRACKING_TRAJECTORY_SAMPLES) {
        return invalidAlchemyTrackingProof('count');
    }

    let previousAt = -1;
    let previousBucket = -1;
    for (const input of candidate.inputs) {
        if (!input || typeof input !== 'object'
            || !isFiniteNumber(input.at) || input.at < 0 || input.at > candidate.elapsedMs
            || input.at <= previousAt
            || Math.floor(input.at / MINIGAME_INPUT_SAMPLE_INTERVAL_MS) === previousBucket
            || !isBoardCoordinate(input.x) || !isBoardCoordinate(input.y)
            || typeof input.dragging !== 'boolean') {
            return invalidAlchemyTrackingProof('input');
        }
        previousAt = input.at;
        previousBucket = Math.floor(input.at / MINIGAME_INPUT_SAMPLE_INTERVAL_MS);
    }
    if (candidate.inputs[0].at > MINIGAME_INPUT_SAMPLE_INTERVAL_MS
        || candidate.inputs[0].dragging !== true) {
        return invalidAlchemyTrackingProof('input-boundary');
    }
    const initialTarget = getAlchemyTrackingTargetPosition(config, 0);
    if (Math.hypot(candidate.inputs[0].x - initialTarget.x, candidate.inputs[0].y - initialTarget.y)
        > config.targetRadius + ALCHEMY_TRACKING_START_POSITION_TOLERANCE) {
        return invalidAlchemyTrackingProof('input-start-position');
    }

    previousAt = -1;
    previousBucket = -1;
    for (const checkpoint of candidate.trajectory) {
        if (!checkpoint || typeof checkpoint !== 'object'
            || !isFiniteNumber(checkpoint.at) || checkpoint.at < 0 || checkpoint.at > candidate.elapsedMs
            || checkpoint.at <= previousAt
            || Math.floor(checkpoint.at / MINIGAME_INPUT_SAMPLE_INTERVAL_MS) === previousBucket
            || (previousAt >= 0 && checkpoint.at - previousAt > ALCHEMY_TRACKING_PROOF_MAX_CHECKPOINT_GAP_MS)
            || !isBoardCoordinate(checkpoint.targetX) || !isBoardCoordinate(checkpoint.targetY)
            || !isBoardCoordinate(checkpoint.pointerX) || !isBoardCoordinate(checkpoint.pointerY)
            || !isFiniteNumber(checkpoint.gauge) || checkpoint.gauge < 0 || checkpoint.gauge > 1) {
            return invalidAlchemyTrackingProof('trajectory');
        }
        previousAt = checkpoint.at;
        previousBucket = Math.floor(checkpoint.at / MINIGAME_INPUT_SAMPLE_INTERVAL_MS);
    }
    const firstCheckpoint = candidate.trajectory[0];
    const lastCheckpoint = candidate.trajectory.at(-1)!;
    if (firstCheckpoint.at > MINIGAME_INPUT_SAMPLE_INTERVAL_MS
        || Math.abs(lastCheckpoint.at - candidate.elapsedMs)
        > ALCHEMY_TRACKING_PROOF_LAST_CHECKPOINT_TOLERANCE_MS) {
        return invalidAlchemyTrackingProof('checkpoint-boundary');
    }

    const inputs = candidate.inputs.map(input => ({
        at: input.at,
        x: input.x,
        y: input.y,
        dragging: input.dragging,
    }));
    const trajectory = candidate.trajectory.map(checkpoint => ({ ...checkpoint }));
    let matchingCheckpoints = 0;
    for (const checkpoint of trajectory) {
        const replay = simulateAlchemyTracking(config, inputs, checkpoint.at);
        const matches = Math.hypot(checkpoint.targetX - replay.targetX, checkpoint.targetY - replay.targetY)
            <= ALCHEMY_TRACKING_PROOF_POSITION_TOLERANCE
            && Math.hypot(checkpoint.pointerX - replay.pointerX, checkpoint.pointerY - replay.pointerY)
            <= ALCHEMY_TRACKING_PROOF_POSITION_TOLERANCE
            && Math.abs(checkpoint.gauge - replay.gauge) <= ALCHEMY_TRACKING_PROOF_GAUGE_TOLERANCE;
        if (matches) matchingCheckpoints++;
    }
    if (matchingCheckpoints / trajectory.length < ALCHEMY_TRACKING_PROOF_MATCH_RATIO) {
        return invalidAlchemyTrackingProof('trajectory-replay');
    }

    const lastReplay = simulateAlchemyTracking(config, inputs, lastCheckpoint.at);
    if (Math.hypot(lastCheckpoint.targetX - lastReplay.targetX, lastCheckpoint.targetY - lastReplay.targetY)
        > ALCHEMY_TRACKING_PROOF_LAST_POSITION_TOLERANCE
        || Math.hypot(lastCheckpoint.pointerX - lastReplay.pointerX, lastCheckpoint.pointerY - lastReplay.pointerY)
        > ALCHEMY_TRACKING_PROOF_LAST_POSITION_TOLERANCE
        || Math.abs(lastCheckpoint.gauge - lastReplay.gauge)
        > ALCHEMY_TRACKING_PROOF_LAST_GAUGE_TOLERANCE) {
        return invalidAlchemyTrackingProof('last-checkpoint');
    }

    const proof: AlchemyTrackingProof = {
        version: ALCHEMY_TRACKING_PROOF_VERSION,
        elapsedMs: candidate.elapsedMs,
        success: candidate.success,
        inputs,
        trajectory,
    };
    const finalReplay = simulateAlchemyTracking(config, inputs, proof.elapsedMs);
    return {
        valid: true,
        accepted: isAlchemyTrackingResultAccepted(finalReplay, proof),
        score: finalReplay.accuracy,
        proof,
    };
}

function emitToUser(userId: number, event: 'miniGameResolved' | 'miniGameCancelled', data: unknown): void {
    for (const [, socket] of getIO().sockets.sockets) {
        const session = socket.data.sessionToken ? getSession(socket.data.sessionToken) : undefined;
        if (session?.userId !== userId) continue;
        if (event === 'miniGameResolved') socket.emit(event, data as MiniGameResolvedData);
        else socket.emit(event, data as MiniGameCancelledData);
    }
}

export function hasActiveMiniGame(userId: number): boolean {
    return activeByUser.has(userId);
}

export function normalizeMiniGameInputs(request: MiniGameValidationRequest): MiniGameInputSample[] {
    const elapsedMs = Math.max(0, request.elapsedMs);
    const normalized = (Array.isArray(request.inputs) ? request.inputs : [])
        .filter((input): input is MiniGameInputSample => Boolean(input)
            && typeof input === 'object'
            && Number.isFinite(input.at)
            && Number.isFinite(input.x)
            && Number.isFinite(input.y))
        .map(input => ({
            at: Math.max(0, Math.min(elapsedMs, input.at)),
            x: Math.max(-1, Math.min(1, input.x)),
            y: Math.max(-1, Math.min(1, input.y)),
        }))
        .sort((left, right) => left.at - right.at);
    if (normalized.length === 0) return [{ at: 0, x: 0, y: 0 }];
    const maximum = MAX_MINIGAME_INPUT_SAMPLES;
    if (normalized.length <= maximum) return normalized;
    const last = normalized.length - 1;
    return Array.from({ length: maximum }, (_, index) => (
        normalized[Math.round(index * last / (maximum - 1))]
    ));
}

export function normalizeMiniGameActions(request: MiniGameValidationRequest): MiniGameActionSample[] {
    const elapsedMs = Math.max(0, request.elapsedMs);
    return (Array.isArray(request.actions) ? request.actions : [])
        .filter((action): action is MiniGameActionSample => Boolean(action)
            && typeof action === 'object'
            && action.action === 'strike'
            && Number.isFinite(action.at))
        .map(action => ({ action: action.action, at: Math.max(0, Math.min(elapsedMs, action.at)) }))
        .sort((left, right) => left.at - right.at)
        .slice(0, 512);
}

function expireMiniGameSession(userId: number, sessionId: string): void {
    const active = activeByUser.get(userId);
    if (!active || active.sessionId !== sessionId) return;
    if (active.type === 'alchemy_tracking' && active.readyAt === undefined) {
        cancelMiniGame(userId, '가마솥 추적을 시작하지 않아 조제가 취소되었습니다.');
        return;
    }
    void failMiniGame(userId, '제한 시간 안에 미니게임을 완료하지 못했습니다.');
}

export function startMiniGame<T extends MiniGameType>(options: StartMiniGameOptions<T>): MiniGameStartData | null {
    if (activeByUser.has(options.userId)) return null;
    const targetSocket = getPreferredUserSocket(options.userId);
    const startedAt = Date.now();
    const sessionId = randomHex(12);
    const token = randomHex(24);
    const requestedTimeoutMs = Math.max(1_000, options.expiresInMs);
    const initialTimeoutMs = options.type === 'alchemy_tracking'
        ? Math.max(ALCHEMY_TRACKING_IDLE_TIMEOUT_MS, requestedTimeoutMs)
        : requestedTimeoutMs;
    const expiresAt = startedAt + initialTimeoutMs;
    const timeoutKey = `minigame:${options.userId}:${sessionId}`;
    const active: ActiveMiniGame = {
        ...options,
        sessionId,
        token,
        startedAt,
        expiresAt,
        timeoutKey,
        inputSocketId: targetSocket?.id,
        inputs: [],
        actions: [],
    };
    activeByUser.set(options.userId, active);
    for (const handler of [...miniGameStartedHandlers]) {
        try {
            handler({ userId: options.userId, type: options.type });
        } catch (error) {
            logger.error('미니게임 시작 구독 처리 실패:', error);
        }
    }
    scheduleGameTask(timeoutKey, initialTimeoutMs / 1000 + 1, () => {
        expireMiniGameSession(options.userId, sessionId);
    });
    const payload = { sessionId, token, type: options.type, expiresAt, config: options.config } as MiniGameStartData;
    targetSocket?.emit('miniGameStart', payload);
    return payload;
}

function matchesSession(
    active: ActiveMiniGame | undefined,
    socketId: string,
    request: MiniGameSessionRequest,
): active is ActiveMiniGame {
    return active !== undefined
        && request !== null
        && typeof request === 'object'
        && request.sessionId === active.sessionId
        && request.token === active.token
        && (active.inputSocketId === undefined || active.inputSocketId === socketId);
}

/** 배정된 소켓의 준비를 확인하고, 배정 정보가 없을 때만 최초 준비 소켓으로 fallback한다. */
export function readyMiniGame(
    userId: number,
    socketId: string,
    request: MiniGameSessionRequest,
    now = Date.now(),
): boolean {
    const active = activeByUser.get(userId);
    if (!matchesSession(active, socketId, request) || now > active.expiresAt) return false;
    if (active.readyAt === undefined) {
        let readyResult: Pick<MiniGameValidationResult, 'success' | 'message'> = { success: true };
        try {
            readyResult = active.onReady?.() ?? readyResult;
        } catch {
            readyResult = { success: false, message: '미니게임 시작 비용을 확정하지 못했습니다.' };
        }
        if (!readyResult.success) {
            cancelMiniGame(userId, readyResult.message ?? '미니게임을 시작할 수 없어 취소되었습니다.');
            return false;
        }
        if (active.inputSocketId === undefined) active.inputSocketId = socketId;
        active.readyAt = now;
        active.inputs = [{ at: 0, x: 0, y: 0 }];
        active.actions = [];
        if (active.type === 'alchemy_tracking') {
            const executionTimeoutMs = Math.max(
                active.expiresInMs,
                active.config.durationMs + ALCHEMY_TRACKING_EXECUTION_GRACE_MS,
            );
            cancelGameTask(active.timeoutKey);
            active.expiresAt = now + executionTimeoutMs;
            scheduleGameTask(active.timeoutKey, executionTimeoutMs / 1_000 + 1, () => {
                expireMiniGameSession(userId, active.sessionId);
            });
        }
    }
    return active.readyAt !== undefined;
}

/** 이동형 미니게임 입력을 클라이언트 trace가 아닌 서버 수신 시각으로 기록한다. */
export function recordMiniGameInput(
    userId: number,
    socketId: string,
    request: MiniGameInputRequest,
    now = Date.now(),
): boolean {
    const active = activeByUser.get(userId);
    if (!matchesSession(active, socketId, request) || active.readyAt === undefined
        || now > active.expiresAt || !Number.isFinite(request.x) || !Number.isFinite(request.y)) return false;
    const at = Math.max(0, Math.min(active.config.durationMs, now - active.readyAt));
    appendMiniGameInputSample(active.inputs, {
        at,
        x: Math.max(-1, Math.min(1, request.x)),
        y: Math.max(-1, Math.min(1, request.y)),
    });
    return true;
}

/** 단조 타격을 발생 즉시 서버 수신 시각으로 기록해 사후 조작된 박자 배열을 받지 않는다. */
export function recordMiniGameAction(
    userId: number,
    socketId: string,
    request: MiniGameActionRequest,
    now = Date.now(),
): boolean {
    const active = activeByUser.get(userId);
    if (!matchesSession(active, socketId, request) || active.readyAt === undefined
        || active.type !== 'forge_rhythm' || request.action !== 'strike' || now > active.expiresAt) return false;
    const maximumActions = 128;
    if (active.actions.length >= maximumActions) return false;
    active.actions.push({
        action: 'strike',
        at: Math.max(0, Math.min(active.config.durationMs, now - active.readyAt)),
    });
    return true;
}

/**
 * 타입 validator에 넘길 불변 서버 권위 snapshot.
     * 낚시·가마솥 추적은 게이지 0/100% 조기 종료를 허용하지만 회피·단조는 전체 시간이 지나야 한다.
 */
export function getMiniGameValidationSnapshot(
    userId: number,
    socketId: string,
    request: MiniGameResultRequest,
    now = Date.now(),
): MiniGameValidationRequest | undefined {
    const active = activeByUser.get(userId);
    if (!matchesSession(active, socketId, request) || active.readyAt === undefined || now > active.expiresAt) {
        return undefined;
    }
    const serverElapsed = Math.max(0, now - active.readyAt);
    if (active.type !== 'fishing_capture' && active.type !== 'alchemy_tracking'
        && serverElapsed + MINIGAME_RESULT_EARLY_TOLERANCE_MS < active.config.durationMs) {
        return undefined;
    }
    if (active.type === 'fishing_capture') {
        const validation = validateFishingCaptureProof(
            active.config as FishingCaptureConfig,
            request.fishingProof,
            serverElapsed,
        );
        if (!validation.valid || !validation.proof) return undefined;
        return {
            sessionId: active.sessionId,
            token: active.token,
            elapsedMs: validation.proof.elapsedMs,
            inputs: validation.proof.inputs.map(input => ({ ...input })),
            actions: [],
            fishingProof: {
                ...validation.proof,
                inputs: validation.proof.inputs.map(input => ({ ...input })),
                trajectory: validation.proof.trajectory.map(checkpoint => ({ ...checkpoint })),
            },
        };
    }
    if (active.type === 'alchemy_tracking') {
        const validation = validateAlchemyTrackingProof(
            active.config as AlchemyTrackingConfig,
            request.alchemyTrackingProof,
            serverElapsed,
        );
        if (!validation.valid || !validation.proof) return undefined;
        return {
            sessionId: active.sessionId,
            token: active.token,
            elapsedMs: validation.proof.elapsedMs,
            inputs: [],
            actions: [],
            score: validation.score,
            alchemyTrackingProof: {
                ...validation.proof,
                inputs: validation.proof.inputs.map(input => ({ ...input })),
                trajectory: validation.proof.trajectory.map(checkpoint => ({ ...checkpoint })),
            },
        };
    }
    return {
        sessionId: active.sessionId,
        token: active.token,
        elapsedMs: active.config.durationMs,
        inputs: active.inputs.map(input => ({ ...input })),
        actions: active.actions.map(action => ({ ...action })),
    };
}

async function failMiniGame(
    userId: number,
    reason: string,
    expectedSocketId?: string,
): Promise<boolean> {
    const active = activeByUser.get(userId);
    if (!active || (expectedSocketId !== undefined && active.inputSocketId !== expectedSocketId)) return false;
    cancelActiveMiniGameTasks(active);
    activeByUser.delete(userId);
    const result: MiniGameValidationResult = { success: false, message: reason };
    try {
        await active.onResolved(result);
    } catch {
        result.message = '미니게임 실패 결과 처리 중 오류가 발생했습니다.';
    }
    emitToUser(userId, 'miniGameResolved', {
        sessionId: active.sessionId,
        success: false,
        message: result.message,
    });
    return true;
}

/** 입력 소켓 종료는 실패다. 단, 아직 시작하지 않은 가마솥 추적은 재료 소모 없는 취소다. */
export function failMiniGameOnDisconnect(userId: number, socketId: string): Promise<boolean> {
    const active = activeByUser.get(userId);
    if (active?.type === 'alchemy_tracking' && active.readyAt === undefined
        && (active.inputSocketId === undefined || active.inputSocketId === socketId)) {
        return Promise.resolve(cancelMiniGame(userId, '연결이 끊겨 시작 전 조제가 취소되었습니다.'));
    }
    return failMiniGame(userId, '연결이 끊겨 미니게임에 실패했습니다.', socketId);
}

export function cancelMiniGame(userId: number, reason = '미니게임이 취소되었습니다.'): boolean {
    const active = activeByUser.get(userId);
    if (!active) return false;
    cancelActiveMiniGameTasks(active);
    activeByUser.delete(userId);
    active.onCancelled?.(reason);
    emitToUser(userId, 'miniGameCancelled', { sessionId: active.sessionId, reason });
    return true;
}

async function resolveMiniGameResult(
    userId: number,
    socketId: string,
    request: MiniGameResultRequest,
): Promise<boolean> {
    const active = activeByUser.get(userId);
    if (!matchesSession(active, socketId, request)) return false;
    const validationRequest = getMiniGameValidationSnapshot(userId, socketId, request);
    if (!validationRequest) {
        await failMiniGame(userId, active.type === 'fishing_capture'
            ? '낚시 포획 기록을 검증하지 못해 실패했습니다.'
            : active.type === 'alchemy_tracking'
                ? '가마솥 추적 기록을 검증하지 못해 실패했습니다.'
                : '미니게임 진행 시간이 올바르지 않아 실패했습니다.');
        return false;
    }

    cancelActiveMiniGameTasks(active);
    activeByUser.delete(userId);
    let result: MiniGameValidationResult;
    try {
        result = active.validate(validationRequest);
        if (active.type === 'fishing_capture' && result.success) {
            const replay = simulateFishingCapture(
                active.config as FishingCaptureConfig,
                validationRequest.inputs,
                validationRequest.elapsedMs,
            );
            if (!isFishingCaptureResultAccepted(replay, validationRequest.fishingProof)) {
                result = { success: false, message: '낚시 포획 기록을 검증하지 못했습니다.' };
            }
        } else if (active.type === 'alchemy_tracking') {
            const replay = simulateAlchemyTracking(
                active.config as AlchemyTrackingConfig,
                validationRequest.alchemyTrackingProof?.inputs ?? [],
                validationRequest.elapsedMs,
            );
            const accepted = isAlchemyTrackingResultAccepted(replay, validationRequest.alchemyTrackingProof);
            result = {
                ...result,
                success: result.success && accepted,
                score: replay.accuracy,
                message: result.success && !accepted
                    ? '가마솥 목표 추적에 실패했습니다.'
                    : result.message,
            };
        }
        await active.onResolved(result);
    } catch {
        result = { success: false, message: '미니게임 결과 처리 중 오류가 발생했습니다.' };
    }
    emitToUser(userId, 'miniGameResolved', {
        sessionId: active.sessionId,
        success: result.success,
        message: result.message,
    });
    return true;
}

/** 낚시·가마솥 추적은 proof로 즉시 확정하고, 다른 미니게임은 서버 수신 trace 판정을 유지한다. */
export function submitMiniGameResult(
    userId: number,
    socketId: string,
    request: MiniGameResultRequest,
): boolean {
    const active = activeByUser.get(userId);
    if (!matchesSession(active, socketId, request)) return false;
    if (active.resultRequested) return true;
    active.resultRequested = true;
    void resolveMiniGameResult(userId, socketId, request);
    return true;
}

export function initMiniGame(): void {
    getIO().on('connection', socket => {
        socket.on('miniGameReady', (request: MiniGameSessionRequest) => {
            const session = socket.data.sessionToken ? getSession(socket.data.sessionToken) : undefined;
            if (session) readyMiniGame(session.userId, socket.id, request);
        });
        socket.on('miniGameInput', (request: MiniGameInputRequest) => {
            const session = socket.data.sessionToken ? getSession(socket.data.sessionToken) : undefined;
            if (session) recordMiniGameInput(session.userId, socket.id, request);
        });
        socket.on('miniGameAction', (request: MiniGameActionRequest) => {
            const session = socket.data.sessionToken ? getSession(socket.data.sessionToken) : undefined;
            if (session) recordMiniGameAction(session.userId, socket.id, request);
        });
        socket.on('miniGameResult', (request: MiniGameResultRequest) => {
            const session = socket.data.sessionToken ? getSession(socket.data.sessionToken) : undefined;
            if (!session || !request || typeof request !== 'object') return;
            submitMiniGameResult(session.userId, socket.id, request);
        });
        socket.on('disconnect', () => {
            const userId = typeof socket.data.onlineUserId === 'number'
                ? socket.data.onlineUserId
                : socket.data.sessionToken ? getSession(socket.data.sessionToken)?.userId : undefined;
            if (userId !== undefined) {
                void failMiniGameOnDisconnect(userId, socket.id);
            }
        });
    });
}
