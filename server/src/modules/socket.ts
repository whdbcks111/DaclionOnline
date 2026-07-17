import { Server, Socket } from 'socket.io'
import { Server as HttpServer } from 'http'
import logger from '../utils/logger.js';
import { getSession, isUserOnline, setUserOnline, setUserOffline } from './login.js';
import { getUserChannel, getChannelRoomKey } from './channel.js';

let io: Server;

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
      }
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
        const session = socket.data.sessionToken ? getSession(socket.data.sessionToken) : undefined;
        if (session) {
            socket.data.onlineUserId = session.userId;
            setUserOnline(session.userId, socket.id);
            socket.join(getChannelRoomKey(getUserChannel(session.userId)));
            logger.success(`로그인: ${session.username} (${socket.id})`);
        }

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
                    ]).then(([registry, party, visibility]) => {
                        if (isUserOnline(onlineUserId)) return;
                        const player = registry.getOnlinePlayer(onlineUserId);
                        const result = player ? party.partyManager.removeDisconnectedPlayer(player) : undefined;
                        visibility.clearInformationMode(onlineUserId);
                        for (const affectedUserId of result?.affectedUserIds ?? []) {
                            if (affectedUserId !== onlineUserId && registry.getOnlinePlayer(affectedUserId)) {
                                void import('./message.js').then(({ sendBotMessageToUser }) =>
                                    sendBotMessageToUser(affectedUserId, `${player?.name ?? '파티원'}님이 접속을 종료해 파티에서 나갔습니다.`));
                            }
                        }
                    });
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
