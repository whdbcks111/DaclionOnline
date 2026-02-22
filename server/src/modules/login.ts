import { pbkdf2Sync } from "crypto";
import logger from "../utils/logger.js";
import { getIO } from "./socket.js"
import { randomHex } from "../utils/random.js";
import { isValidPayload, validateNickname } from "../utils/validators.js";
import prisma from "../config/prisma.js";
import type { LoginRequest } from "../../../shared/types.js";
import { loadPlayerByUserId, unloadPlayerByUserId } from "./player.js";
import { getUserChannel, getChannelRoomKey } from "./channel.js";
import type { Session } from "../types/index.js";

const sessionMap = new Map<string, Session>()

// 유저별 세션 카운트: userId -> Set<sessionToken> (다중 로그인 지원)
const userSessions = new Map<number, Set<string>>()

export function getSession(token: string): Session | undefined {
    return sessionMap.get(token);
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

// 온라인 유저 추적: userId -> 연결된 소켓 수
const onlineUsers = new Map<number, number>()

function broadcastUserCount(): void {
    try { getIO().emit('userCount', onlineUsers.size) } catch { /* 소켓 미초기화 시 무시 */ }
}

export function setUserOnline(userId: number) {
    onlineUsers.set(userId, (onlineUsers.get(userId) ?? 0) + 1);
    broadcastUserCount();
}

export function setUserOffline(userId: number) {
    const count = (onlineUsers.get(userId) ?? 1) - 1;
    if (count <= 0) onlineUsers.delete(userId);
    else onlineUsers.set(userId, count);
    broadcastUserCount();
}

export function isUserOnline(userId: number): boolean {
    return onlineUsers.has(userId);
}

/** userId로 permission 조회 (세션에서) */
export function getUserPermission(userId: number): number {
    for (const session of sessionMap.values()) {
        if (session.userId === userId) return session.permission;
    }
    return 0;
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

                const { id, pw } = data;

                const user = await prisma.user.findUnique({
                    where: { username: id },
                    select: { id: true, username: true, nickname: true, profileImage: true, permission: true, passwordHash: true, passwordSalt: true },
                });

                if (!user) {
                    socket.emit('loginResult', { error: '아이디 또는 비밀번호가 일치하지 않습니다.' });
                    return;
                }

                const hash = pbkdf2Sync(pw, user.passwordSalt, 10000, 64, 'sha512').toString('hex');

                if (hash !== user.passwordHash) {
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

                socket.data.sessionToken = sessionToken;
                setUserOnline(user.id);
                socket.join(getChannelRoomKey(getUserChannel(user.id)));
                await loadPlayerByUserId(user.id);
                socket.emit('loginResult', {
                    ok: true,
                    userId: user.id,
                    sessionToken,
                    nickname: user.nickname,
                    profileImage: user.profileImage ?? undefined,
                });
            } catch(e) {
                logger.error('login 처리 중 오류:', e);
                socket.emit('loginResult', { error: '서버 오류가 발생했습니다.' });
            }
        });

        socket.on('requestUserCount', () => {
            socket.emit('userCount', onlineUsers.size);
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

                // 중복 검사
                const existing = await prisma.user.findUnique({ where: { nickname: trimmed }, select: { id: true } });
                if (existing && existing.id !== session.userId) {
                    socket.emit('nicknameResult', { error: '이미 사용 중인 닉네임입니다.' });
                    return;
                }

                await prisma.user.update({ where: { id: session.userId }, data: { nickname: trimmed } });

                // 해당 유저의 모든 세션 닉네임 업데이트
                for (const s of sessionMap.values()) {
                    if (s.userId === session.userId) s.nickname = trimmed;
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
                if (logoutSession && getUserSessionCount(logoutSession.userId) <= 1) {
                    await unloadPlayerByUserId(logoutSession.userId);
                }
                removeSession(token);
                socket.emit('logoutResult', { ok: true });
            } catch(e) {
                logger.error('logout 처리 중 오류:', e);
                socket.emit('logoutResult', { error: '서버 오류가 발생했습니다.' });
            }
        });

    });

    logger.success('로그인 모듈 초기화 완료');
}
