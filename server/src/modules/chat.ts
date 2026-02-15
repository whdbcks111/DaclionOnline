import logger from "../utils/logger.js";
import { getIO } from "./socket.js";
import { getSession } from "./login.js";

const MAX_MESSAGE_LENGTH = 500;

export const initChat = () => {
    const io = getIO();

    io.on('connection', (socket) => {
        socket.on('sendMessage', (content: unknown) => {
            if (typeof content !== 'string') return;

            const trimmed = content.trim();
            if (trimmed.length === 0 || trimmed.length > MAX_MESSAGE_LENGTH) return;

            // 세션 검증
            const session = socket.data.sessionToken
                ? getSession(socket.data.sessionToken)
                : undefined;

            if (!session) {
                socket.emit('sessionInvalid');
                return;
            }

            io.emit('chatMessage', {
                nickname: session.nickname,
                content: trimmed,
                timestamp: Date.now(),
            });
        });
    });

    logger.success('채팅 모듈 초기화 완료');
};
