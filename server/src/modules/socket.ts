import { Server, type Socket } from 'socket.io'
import { Server as HttpServer } from 'http'
import type { ClientPresenceState } from '../../../shared/types.js'
import logger from '../utils/logger.js';
import { getSession, isUserOnline, setUserOnline, setUserOffline } from './login.js';
import { getUserChannel, getChannelRoomKey } from './channel.js';

let io: Server;

const CLIENT_PRESENCE_RANK: Readonly<Record<ClientPresenceState, number>> = {
    focused: 2,
    visible: 1,
    hidden: 0,
};

function isClientPresenceState(value: unknown): value is ClientPresenceState {
    return value === 'focused' || value === 'visible' || value === 'hidden';
}

/** 같은 계정의 연결 중 최근 실제 입력이 있었던 focused 화면을 우선한다. */
export function getPreferredUserSocket(userId: number): Socket | undefined {
    let preferred: Socket | undefined;
    let preferredRank = -1;
    let preferredUpdatedAt = -1;
    for (const [, socket] of getIO().sockets.sockets) {
        const session = socket.data.sessionToken ? getSession(socket.data.sessionToken) : undefined;
        const socketUserId = typeof socket.data.onlineUserId === 'number'
            ? socket.data.onlineUserId
            : session?.userId;
        if (socketUserId !== userId) continue;
        const rawPresence: unknown = socket.data.clientPresence;
        const presence = isClientPresenceState(rawPresence)
            ? rawPresence
            : 'visible';
        const rank = CLIENT_PRESENCE_RANK[presence];
        const updatedAt = typeof socket.data.clientPresenceUpdatedAt === 'number'
            ? socket.data.clientPresenceUpdatedAt
            : 0;
        if (rank > preferredRank || (rank === preferredRank && updatedAt > preferredUpdatedAt)) {
            preferred = socket;
            preferredRank = rank;
            preferredUpdatedAt = updatedAt;
        }
    }
    return preferred;
}

function parseCookie(cookie: string, name: string): string | undefined {
    const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
    return match?.[1];
}

export const initSocket = (httpServer: HttpServer, corsOrigin: string) => {
    io = new Server(httpServer, {
      cors: {
        origin: corsOrigin,
        methods: ['GET', 'POST'],
        credentials: true
      },
      // 게임 socket payload는 텍스트 명령과 작은 상태 요청뿐이다. 대용량 이미지는 별도 HTTP API를 사용한다.
      maxHttpBufferSize: 256 * 1024,
    });

    // 세션 미들웨어: 모든 연결에서 쿠키 → 세션 자동 바인딩
    io.use((socket, next) => {
        const cookies = socket.handshake.headers.cookie;
        if (cookies) {
            const token = parseCookie(cookies, 'sessionToken');
            if (token) {
                socket.data.sessionToken = token;
            }
        }
        next();
    });

    io.on('connection', (socket) => {
        logger.socket('클라이언트 연결됨:', socket.id);
        socket.data.clientPresence = 'visible' satisfies ClientPresenceState;
        socket.data.clientPresenceUpdatedAt = performance.now();
        const session = socket.data.sessionToken ? getSession(socket.data.sessionToken) : undefined;
        if (session) {
            socket.data.onlineUserId = session.userId;
            setUserOnline(session.userId, socket.id);
            socket.join(getChannelRoomKey(getUserChannel(session.userId)));
            logger.success(`로그인: ${session.username} (${socket.id})`);
        }

        socket.on('clientPresence', (state: unknown) => {
            if (!isClientPresenceState(state)) return;
            socket.data.clientPresence = state;
            socket.data.clientPresenceUpdatedAt = performance.now();
        });

        // 클라이언트 연결 해제
        socket.on('disconnect', () => {
            const currentSession = socket.data.sessionToken ? getSession(socket.data.sessionToken) : undefined;
            const onlineUserId = typeof socket.data.onlineUserId === 'number'
                ? socket.data.onlineUserId
                : currentSession?.userId;
            if (onlineUserId !== undefined) {
                setUserOffline(onlineUserId, socket.id);
                if (!isUserOnline(onlineUserId)) {
                    void import('../models/NpcDialogue.js').then(({ endNpcDialogueByUserId }) => {
                        if (!isUserOnline(onlineUserId)) {
                            endNpcDialogueByUserId(onlineUserId);
                        }
                    });
                    void Promise.all([
                        import('./playerRegistry.js'),
                        import('./party.js'),
                        import('./informationVisibility.js'),
                        import('./fishing.js'),
                    ]).then(async ([registry, party, visibility, fishing]) => {
                        if (isUserOnline(onlineUserId)) return;
                        const player = registry.getOnlinePlayer(onlineUserId);
                        const result = player ? party.partyManager.removeDisconnectedPlayer(player) : undefined;
                        visibility.clearInformationMode(onlineUserId);
                        fishing.cancelFishing(onlineUserId, '연결이 종료되어 낚시가 취소되었습니다.');
                        for (const affectedUserId of result?.affectedUserIds ?? []) {
                            if (affectedUserId !== onlineUserId && registry.getOnlinePlayer(affectedUserId)) {
                                void import('./message.js').then(({ sendBotMessageToUser }) =>
                                    sendBotMessageToUser(affectedUserId, `${player?.name ?? '파티원'}님이 접속을 종료해 파티에서 나갔습니다.`));
                            }
                        }
                        if (!isUserOnline(onlineUserId)) {
                            const { unloadPlayerByUserId } = await import('./player.js');
                            await unloadPlayerByUserId(onlineUserId, true);
                        }
                    }).catch(error => logger.error(`연결 종료 Player 정리 실패: UID ${onlineUserId}`, error));
                }
                logger.warn(`로그아웃: ${currentSession?.username ?? `UID ${onlineUserId}`} (${socket.id})`);
            } else {
                logger.warn('클라이언트 연결 해제됨:', socket.id);
            }
        });
    });

    logger.success('소켓 초기화 완료');
    return io;
}

export const getIO = (): Server => {
    if(!io) {
        throw new Error('Socket.io has not been initialized!');
    }
    return io;
}
