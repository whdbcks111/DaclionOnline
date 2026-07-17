import type {
    MiniGameCancelledData,
    MiniGameResolvedData,
    MiniGameResultRequest,
    MiniGameStartData,
    MiniGameType,
} from '../../../shared/minigames.js';
import { randomHex } from '../utils/random.js';
import { getSession } from './login.js';
import { getIO } from './socket.js';

export interface MiniGameValidationResult {
    success: boolean
    message?: string
}

interface StartMiniGameOptions {
    userId: number
    type: MiniGameType
    config: MiniGameStartData['config']
    expiresInMs: number
    validate: (request: MiniGameResultRequest) => MiniGameValidationResult
    onResolved: (result: MiniGameValidationResult) => void | Promise<void>
    onCancelled?: (reason: string) => void
}

interface ActiveMiniGame extends StartMiniGameOptions {
    sessionId: string
    token: string
    startedAt: number
    expiresAt: number
    timeout: ReturnType<typeof setTimeout>
}

const activeByUser = new Map<number, ActiveMiniGame>();

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

export function startMiniGame(options: StartMiniGameOptions): MiniGameStartData | null {
    if (activeByUser.has(options.userId)) return null;
    const startedAt = Date.now();
    const sessionId = randomHex(12);
    const token = randomHex(24);
    const expiresAt = startedAt + Math.max(1_000, options.expiresInMs);
    const active: ActiveMiniGame = {
        ...options,
        sessionId,
        token,
        startedAt,
        expiresAt,
        timeout: setTimeout(() => cancelMiniGame(options.userId, '미니게임 제한 시간이 지났습니다.'), options.expiresInMs + 1_000),
    };
    activeByUser.set(options.userId, active);
    const payload: MiniGameStartData = { sessionId, token, type: options.type, expiresAt, config: options.config };
    emitToUser(options.userId, 'miniGameStart', payload);
    return payload;
}

export function cancelMiniGame(userId: number, reason = '미니게임이 취소되었습니다.'): boolean {
    const active = activeByUser.get(userId);
    if (!active) return false;
    clearTimeout(active.timeout);
    activeByUser.delete(userId);
    active.onCancelled?.(reason);
    emitToUser(userId, 'miniGameCancelled', { sessionId: active.sessionId, reason });
    return true;
}

export function initMiniGame(): void {
    getIO().on('connection', socket => {
        socket.on('miniGameResult', async (request: MiniGameResultRequest) => {
            const session = socket.data.sessionToken ? getSession(socket.data.sessionToken) : undefined;
            if (!session || !request || typeof request !== 'object') return;
            const active = activeByUser.get(session.userId);
            if (!active || request.sessionId !== active.sessionId || request.token !== active.token) return;

            const serverElapsed = Date.now() - active.startedAt;
            if (!Number.isFinite(request.elapsedMs) || request.elapsedMs < 0
                || request.elapsedMs > active.expiresInMs
                || request.elapsedMs > serverElapsed + 1_000
                || Date.now() > active.expiresAt + 1_000) {
                cancelMiniGame(session.userId, '미니게임 결과 검증에 실패했습니다.');
                return;
            }

            clearTimeout(active.timeout);
            activeByUser.delete(session.userId);
            let result: MiniGameValidationResult;
            try {
                result = active.validate(request);
                await active.onResolved(result);
            } catch {
                result = { success: false, message: '미니게임 결과 처리 중 오류가 발생했습니다.' };
            }
            emitToUser(session.userId, 'miniGameResolved', {
                sessionId: active.sessionId,
                success: result.success,
                message: result.message,
            });
        });
    });
}
