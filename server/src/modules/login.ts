import { pbkdf2Sync } from "crypto";
import logger from "../utils/logger.js";
import { getIO } from "./socket.js"
import { randomHex } from "../utils/random.js";
import prisma from "../config/prisma.js";

// 세션 저장소: sessionToken -> { userId, username, nickname }
interface Session {
    userId: number
    username: string
    nickname: string
}

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

export function createSession(user: { id: number, username: string, nickname: string }): string {
    const sessionToken = randomHex(32)

    sessionMap.set(sessionToken, {
        userId: user.id,
        username: user.username,
        nickname: user.nickname,
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
                username: session.username,
                nickname: session.nickname,
            });
        }
        else {
            socket.emit('sessionInvalid');
        }

        socket.on('login', async data => {
            if (typeof data !== 'object') return;

            const { id, pw } = data;

            if (!id || !pw) {
                socket.emit('loginResult', { error: '아이디와 비밀번호를 입력해주세요.' });
                return;
            }

            const user = await prisma.user.findUnique({
                where: { username: id },
                select: { id: true, username: true, nickname: true, passwordHash: true, passwordSalt: true },
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

            const sessionToken = createSession(user);
            socket.emit('loginResult', { ok: true, sessionToken });
        });

        socket.on('logout', (token: string) => {
            removeSession(token);
            socket.emit('logoutResult', { ok: true });
        });

    });

    logger.success('로그인 모듈 초기화 완료');
}
