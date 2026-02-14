import { Server, Socket } from 'socket.io'
import { Server as HttpServer } from 'http'
import logger from '../utils/logger.js';
import { getSession } from './login.js';

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
        let session;
        if (socket.data.sessionToken && (session = getSession(socket.data.sessionToken))) {
            logger.info(`세션 복원: ${session.username}`);
        }

        // 클라이언트 연결 해제
        socket.on('disconnect', () => {
            logger.warn('클라이언트 연결 해제됨:', socket.id);
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