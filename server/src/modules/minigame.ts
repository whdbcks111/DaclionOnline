import {
    appendMiniGameInputSample,
    type MiniGameActionRequest,
    type MiniGameInputRequest,
    type MiniGameSessionRequest,
} from '../../../shared/minigames.js';
import type {
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
import { getSession } from './login.js';
import { getIO } from './socket.js';
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
    validate: (request: MiniGameValidationRequest) => MiniGameValidationResult
    onResolved: (result: MiniGameValidationResult) => void | Promise<void>
    onCancelled?: (reason: string) => void
}

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
    resultSettleKey?: string
}

const activeByUser = new Map<number, ActiveMiniGame>();
/** 전송·브라우저 frame 순서의 작은 흔들림만 허용한다. 기존 1초 조기 완료 허용은 제거한다. */
export const MINIGAME_RESULT_EARLY_TOLERANCE_MS = 80;
/** 낚시 성공 경계에서 ready/input/result 패킷의 지연 편차를 서버 시계가 따라잡는 정산 시간. */
export const FISHING_RESULT_SETTLE_MS = 300;

function cancelActiveMiniGameTasks(active: ActiveMiniGame): void {
    cancelGameTask(active.timeoutKey);
    if (active.resultSettleKey) cancelGameTask(active.resultSettleKey);
}

function emitToUser(userId: number, event: 'miniGameStart' | 'miniGameResolved' | 'miniGameCancelled', data: unknown): void {
    for (const [, socket] of getIO().sockets.sockets) {
        const session = socket.data.sessionToken ? getSession(socket.data.sessionToken) : undefined;
        if (session?.userId !== userId) continue;
        if (event === 'miniGameStart') socket.emit(event, data as MiniGameStartData);
        else if (event === 'miniGameResolved') socket.emit(event, data as MiniGameResolvedData);
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
    const maximum = 2_048;
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

export function startMiniGame<T extends MiniGameType>(options: StartMiniGameOptions<T>): MiniGameStartData | null {
    if (activeByUser.has(options.userId)) return null;
    const startedAt = Date.now();
    const sessionId = randomHex(12);
    const token = randomHex(24);
    const expiresAt = startedAt + Math.max(1_000, options.expiresInMs);
    const timeoutKey = `minigame:${options.userId}:${sessionId}`;
    const active: ActiveMiniGame = {
        ...options,
        sessionId,
        token,
        startedAt,
        expiresAt,
        timeoutKey,
        inputs: [],
        actions: [],
    };
    activeByUser.set(options.userId, active);
    scheduleGameTask(timeoutKey, options.expiresInMs / 1000 + 1, () => {
        void failMiniGame(options.userId, '제한 시간 안에 미니게임을 완료하지 못했습니다.');
    });
    const payload = { sessionId, token, type: options.type, expiresAt, config: options.config } as MiniGameStartData;
    emitToUser(options.userId, 'miniGameStart', payload);
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

/** 최초 준비 소켓을 입력 권한 소켓으로 고정하고 서버 기준 미니게임 시계를 시작한다. */
export function readyMiniGame(
    userId: number,
    socketId: string,
    request: MiniGameSessionRequest,
    now = Date.now(),
): boolean {
    const active = activeByUser.get(userId);
    if (!matchesSession(active, socketId, request) || now > active.expiresAt) return false;
    if (active.inputSocketId === undefined) {
        active.inputSocketId = socketId;
        active.readyAt = now;
        active.inputs = [{ at: 0, x: 0, y: 0 }];
        active.actions = [];
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
 * 낚시는 게이지 0/100% 조기 종료를 허용하지만 회피·단조는 실제 전체 시간이 지나야 한다.
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
    if (active.type !== 'fishing_capture'
        && serverElapsed + MINIGAME_RESULT_EARLY_TOLERANCE_MS < active.config.durationMs) {
        return undefined;
    }
    const validationElapsed = active.type === 'fishing_capture'
        ? Math.min(active.config.durationMs, serverElapsed)
        : active.config.durationMs;
    return {
        sessionId: active.sessionId,
        token: active.token,
        elapsedMs: validationElapsed,
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

/** 미니게임 입력을 소유한 연결이 끊기면 취소가 아닌 실패 보상을 적용한다. */
export function failMiniGameOnDisconnect(userId: number, socketId: string): Promise<boolean> {
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
        await failMiniGame(userId, '미니게임 진행 시간이 올바르지 않아 실패했습니다.');
        return false;
    }

    cancelActiveMiniGameTasks(active);
    activeByUser.delete(userId);
    let result: MiniGameValidationResult;
    try {
        result = active.validate(validationRequest);
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

/**
 * 낚시는 클라이언트 100% 프레임과 서버 수신 trace 사이의 짧은 지연 편차를 정산한 뒤 확정한다.
 * 정산 중 도착한 최신 입력도 같은 서버 권위 trace에 포함한다.
 */
export function submitMiniGameResult(
    userId: number,
    socketId: string,
    request: MiniGameResultRequest,
): boolean {
    const active = activeByUser.get(userId);
    if (!matchesSession(active, socketId, request)) return false;
    if (active.resultRequested) return true;
    active.resultRequested = true;

    if (active.type === 'fishing_capture') {
        const settleKey = `${active.timeoutKey}:result-settle`;
        active.resultSettleKey = settleKey;
        scheduleGameTask(settleKey, FISHING_RESULT_SETTLE_MS / 1_000, () => {
            void resolveMiniGameResult(userId, socketId, request);
        });
        return true;
    }

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
