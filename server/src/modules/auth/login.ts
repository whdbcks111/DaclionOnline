import logger from "../../utils/logger.js";
import { getIO } from "../infrastructure/socket.js"
import { randomHex } from "../../utils/random.js";
import { isValidPayload, validateNickname } from "../../utils/validators.js";
import { verifyPasswordHash } from "../../utils/password.js";
import { FixedWindowRateLimiter } from "../../utils/rateLimit.js";
import prisma from "../../config/prisma.js";
import type { LoginRequest } from "../../../../shared/types.js";
import { getUserChannel, getChannelRoomKey, getAvailableChannels } from "../communication/channel.js";
import type { Session } from "../../types/index.js";

// message/socket → login → player → Entity → message 순환 초기화를 피한다.
async function loadPlayerByUserId(userId: number) {
    return (await import('../player/player.js')).loadPlayerByUserId(userId);
}

async function unloadPlayerByUserId(userId: number) {
    return (await import('../player/player.js')).unloadPlayerByUserId(userId);
}

const sessionMap = new Map<string, Session>()
export const NICKNAME_CHANGE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const LOGIN_ATTEMPT_LIMIT = 20;
const LOGIN_ATTEMPT_WINDOW_MS = 60_000;
const loginAttemptLimiter = new FixedWindowRateLimiter(
    LOGIN_ATTEMPT_LIMIT,
    LOGIN_ATTEMPT_WINDOW_MS,
    20_000,
);

function getSocketIp(socket: { handshake: { address?: string } }): string {
    return socket.handshake.address?.trim() || 'unknown';
}

/** 일반 계정의 닉네임 변경까지 남은 시간을 반환한다. 권한 10 이상은 제한하지 않는다. */
export function getNicknameChangeCooldownRemaining(
    changedAt: Date | null | undefined,
    permission: number,
    now = Date.now(),
): number {
    if (permission >= 10 || !changedAt) return 0;
    return Math.max(0, changedAt.getTime() + NICKNAME_CHANGE_COOLDOWN_MS - now);
}

function formatNicknameCooldown(remainingMs: number): string {
    const totalMinutes = Math.max(1, Math.ceil(remainingMs / 60_000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours > 0 ? `${hours}시간 ` : ''}${minutes}분`;
}

// 유저별 세션 카운트: userId -> Set<sessionToken> (다중 로그인 지원)
const userSessions = new Map<number, Set<string>>()

export function getSession(token: string): Session | undefined {
    return sessionMap.get(token);
}

export function getSessionByUserId(userId: number): Session | undefined {
    const token = userSessions.get(userId)?.values().next().value;
    return token ? sessionMap.get(token) : undefined;
}

export function removeSession(token: string) {
    const session = sessionMap.get(token);
    if (session) {
        const tokens = userSessions.get(session.userId);
        if (tokens) {
            tokens.delete(token);
            if (tokens.size === 0) userSessions.delete(session.userId);
        }
        sessionMap.delete(token);
    }
}

export function getUserSessionCount(userId: number): number {
    return userSessions.get(userId)?.size ?? 0;
}

/** 비밀번호 재설정 등 계정 보안 변경 뒤 해당 사용자의 모든 세션과 연결을 폐기한다. */
export async function revokeUserSessions(userId: number): Promise<void> {
    const io = getIO();
    const tokens = new Set(userSessions.get(userId) ?? []);
    for (const [, connectedSocket] of io.sockets.sockets) {
        if (!connectedSocket.data.sessionToken || !tokens.has(connectedSocket.data.sessionToken)) continue;
        connectedSocket.leave(getChannelRoomKey(getUserChannel(userId)));
        setUserOffline(userId, connectedSocket.id);
        connectedSocket.data.onlineUserId = undefined;
        connectedSocket.data.sessionToken = undefined;
        connectedSocket.emit('sessionInvalid');
    }
    for (const token of tokens) removeSession(token);
    await unloadPlayerByUserId(userId);
}

// 온라인 유저 추적: userId -> 연결된 socket ID. 같은 소켓의 중복 등록과 다중 탭을 구분한다.
const onlineUsers = new Map<number, Set<string>>()

export function getUserCountData() {
    const channelCounts: Record<string, number> = {}
    for (const ch of getAvailableChannels()) {
        const key = getChannelRoomKey(ch.id)
        channelCounts[key] = 0
    }
    for (const userId of onlineUsers.keys()) {
        const key = getChannelRoomKey(getUserChannel(userId))
        channelCounts[key] = (channelCounts[key] ?? 0) + 1
    }
    return { total: onlineUsers.size, channelCounts }
}

export function broadcastUserCount(): void {
    try { getIO().emit('userCount', getUserCountData()) } catch { /* 소켓 미초기화 시 무시 */ }
}

export function setUserOnline(userId: number, connectionId: string) {
    const connections = onlineUsers.get(userId) ?? new Set<string>();
    connections.add(connectionId);
    onlineUsers.set(userId, connections);
    broadcastUserCount();
}

export function setUserOffline(userId: number, connectionId: string) {
    const connections = onlineUsers.get(userId);
    if (!connections) return;
    connections.delete(connectionId);
    if (connections.size === 0) onlineUsers.delete(userId);
    broadcastUserCount();
}

export function isUserOnline(userId: number): boolean {
    return onlineUsers.has(userId);
}

/** userId로 permission 조회 (세션에서) */
export function getUserPermission(userId: number): number {
    return getSessionByUserId(userId)?.permission ?? 0;
}

export function createSession(user: { id: number, username: string, nickname: string, profileImage?: string | null, permission?: number }): string {
    const sessionToken = randomHex(32)

    sessionMap.set(sessionToken, {
        userId: user.id,
        username: user.username,
        nickname: user.nickname,
        profileImage: user.profileImage ?? undefined,
        permission: user.permission ?? 0,
    })

    if (!userSessions.has(user.id)) {
        userSessions.set(user.id, new Set())
    }
    userSessions.get(user.id)!.add(sessionToken)

    logger.info(`로그인 성공: ${user.username} (활성 세션: ${getUserSessionCount(user.id)}개)`)
    return sessionToken;
}

export const initLogin = () => {
    const io = getIO();

    io.on('connection', socket => {
        // 미들웨어에서 바인딩된 세션이 있으면 클라이언트에 알림
        let session;
        if (socket.data.sessionToken && (session = getSession(socket.data.sessionToken))) {
            socket.emit('sessionRestore', {
                userId: session.userId,
                username: session.username,
                nickname: session.nickname,
                profileImage: session.profileImage,
                permission: session.permission,
            });
            // 세션 복원 시 플레이어가 메모리에 없을 수 있으므로 보장
            loadPlayerByUserId(session.userId).catch(e => logger.error('세션 복원 중 플레이어 로드 오류:', e));
        }
        else {
            socket.emit('sessionInvalid');
        }

        socket.on('login', async (data: LoginRequest) => {
            try {
                if (!isValidPayload(data, { id: 'string', pw: 'string' })) {
                    socket.emit('loginResult', { error: '아이디와 비밀번호를 입력해주세요.' });
                    return;
                }

                const rateLimit = loginAttemptLimiter.consume(getSocketIp(socket));
                if (!rateLimit.allowed) {
                    socket.emit('loginResult', {
                        error: `로그인 요청이 너무 많습니다. ${Math.ceil(rateLimit.retryAfterMs / 1000)}초 후 다시 시도해 주세요.`,
                    });
                    return;
                }

                const { id, pw } = data;

                const user = await prisma.user.findUnique({
                    where: { username: id },
                    select: { id: true, username: true, nickname: true, profileImage: true, permission: true, passwordHash: true, passwordSalt: true },
                });

                if (!user) {
                    socket.emit('loginResult', { error: '아이디 또는 비밀번호가 일치하지 않습니다.' });
                    return;
                }

                if (!await verifyPasswordHash(pw, user.passwordSalt, user.passwordHash)) {
                    socket.emit('loginResult', { error: '아이디 또는 비밀번호가 일치하지 않습니다.' });
                    return;
                }

                // 같은 기기에서 이미 유효한 세션이 있으면 재사용
                const existingSession = socket.data.sessionToken
                    ? getSession(socket.data.sessionToken)
                    : undefined;

                const sessionToken = existingSession?.userId === user.id
                    ? socket.data.sessionToken
                    : createSession(user);

                const previousUserId = typeof socket.data.onlineUserId === 'number'
                    ? socket.data.onlineUserId
                    : undefined;
                if (previousUserId !== undefined && previousUserId !== user.id) {
                    socket.leave(getChannelRoomKey(getUserChannel(previousUserId)));
                    setUserOffline(previousUserId, socket.id);
                }

                socket.data.sessionToken = sessionToken;
                socket.data.onlineUserId = user.id;
                setUserOnline(user.id, socket.id);
                socket.join(getChannelRoomKey(getUserChannel(user.id)));
                await loadPlayerByUserId(user.id);
                socket.emit('loginResult', {
                    ok: true,
                    userId: user.id,
                    sessionToken,
                    nickname: user.nickname,
                    profileImage: user.profileImage ?? undefined,
                    permission: user.permission ?? 0,
                });
            } catch(e) {
                logger.error('login 처리 중 오류:', e);
                socket.emit('loginResult', { error: '서버 오류가 발생했습니다.' });
            }
        });

        socket.on('requestUserCount', () => {
            socket.emit('userCount', getUserCountData());
        });

        socket.on('changeNickname', async (newNickname: unknown) => {
            try {
                const session = socket.data.sessionToken ? getSession(socket.data.sessionToken) : undefined;
                if (!session) {
                    socket.emit('nicknameResult', { error: '로그인이 필요합니다.' });
                    return;
                }

                if (typeof newNickname !== 'string') {
                    socket.emit('nicknameResult', { error: '잘못된 요청입니다.' });
                    return;
                }

                const validationError = validateNickname(newNickname.trim());
                if (validationError) {
                    socket.emit('nicknameResult', { error: validationError });
                    return;
                }

                const trimmed = newNickname.trim();
                const currentUser = await prisma.user.findUnique({
                    where: { id: session.userId },
                    select: { nickname: true, nicknameChangedAt: true, permission: true },
                });
                if (!currentUser) {
                    socket.emit('nicknameResult', { error: '계정 정보를 찾을 수 없습니다.' });
                    return;
                }
                if (currentUser.nickname === trimmed) {
                    socket.emit('nicknameResult', { ok: true, nickname: trimmed });
                    return;
                }
                const cooldownRemaining = getNicknameChangeCooldownRemaining(
                    currentUser.nicknameChangedAt,
                    currentUser.permission,
                );
                if (cooldownRemaining > 0) {
                    socket.emit('nicknameResult', {
                        error: `닉네임은 24시간에 한 번 변경할 수 있습니다. (${formatNicknameCooldown(cooldownRemaining)} 후 가능)`,
                    });
                    return;
                }

                // 중복 검사
                const existing = await prisma.user.findUnique({ where: { nickname: trimmed }, select: { id: true } });
                if (existing && existing.id !== session.userId) {
                    socket.emit('nicknameResult', { error: '이미 사용 중인 닉네임입니다.' });
                    return;
                }

                const changedAt = new Date();
                if (currentUser.permission >= 10) {
                    await prisma.user.update({
                        where: { id: session.userId },
                        data: { nickname: trimmed, nicknameChangedAt: changedAt },
                    });
                } else {
                    const result = await prisma.user.updateMany({
                        where: {
                            id: session.userId,
                            OR: [
                                { nicknameChangedAt: null },
                                { nicknameChangedAt: { lte: new Date(changedAt.getTime() - NICKNAME_CHANGE_COOLDOWN_MS) } },
                            ],
                        },
                        data: { nickname: trimmed, nicknameChangedAt: changedAt },
                    });
                    if (result.count !== 1) {
                        socket.emit('nicknameResult', {
                            error: '다른 창에서 닉네임이 변경되었습니다. 24시간 후 다시 시도해주세요.',
                        });
                        return;
                    }
                }
                const player = await loadPlayerByUserId(session.userId);
                player.name = trimmed;

                // 해당 유저의 모든 세션 닉네임 업데이트
                for (const token of userSessions.get(session.userId) ?? []) {
                    const s = sessionMap.get(token);
                    if (s) s.nickname = trimmed;
                }

                socket.emit('nicknameResult', { ok: true, nickname: trimmed });
            } catch(e) {
                logger.error('닉네임 변경 중 오류:', e);
                socket.emit('nicknameResult', { error: '서버 오류가 발생했습니다.' });
            }
        });

        socket.on('logout', async (token: unknown) => {
            try {
                if (typeof token !== 'string') return;
                const logoutSession = getSession(token);
                if (logoutSession) {
                    // await가 시작되기 전에 토큰과 모든 연결을 먼저 폐기한다.
                    // 저장 중 지연 전송된 구매·버리기 요청이 기존 Player를 다시 변경하지 못하게 한다.
                    for (const [, connectedSocket] of io.sockets.sockets) {
                        if (connectedSocket.data.sessionToken !== token) continue;
                        const onlineUserId = typeof connectedSocket.data.onlineUserId === 'number'
                            ? connectedSocket.data.onlineUserId
                            : logoutSession.userId;
                        connectedSocket.leave(getChannelRoomKey(getUserChannel(onlineUserId)));
                        setUserOffline(onlineUserId, connectedSocket.id);
                        connectedSocket.data.onlineUserId = undefined;
                        connectedSocket.data.sessionToken = undefined;
                        if (connectedSocket.id !== socket.id) connectedSocket.emit('sessionInvalid');
                    }
                    removeSession(token);
                    // 다른 기기의 살아 있는 연결은 유지하되, 연결 없는 휴면 token만으로
                    // 명시적 로그아웃 Player가 재접속 유예나 registry에 남아서는 안 된다.
                    if (!isUserOnline(logoutSession.userId)) {
                        await unloadPlayerByUserId(logoutSession.userId);
                    }
                } else {
                    removeSession(token);
                }
                socket.emit('logoutResult', { ok: true });
            } catch(e) {
                logger.error('logout 처리 중 오류:', e);
                socket.emit('logoutResult', { error: '서버 오류가 발생했습니다.' });
            }
        });

    });

    logger.success('로그인 모듈 초기화 완료');
}
