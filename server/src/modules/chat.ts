import logger from "../utils/logger.js";
import { getIO } from "./socket.js";
import { getSession } from "./login.js";
import { broadcastMessage, getChatHistory, getFlagsForPermission } from "./message.js";
import { handleCommand } from "./bot.js";
import type { ChatMessage } from "../../../shared/types.js";

const MAX_MESSAGE_LENGTH = 500;

export const initChat = () => {
    const io = getIO();

    io.on('connection', (socket) => {
        // 클라이언트 요청 시 이전 대화 전송
        socket.on('requestChatHistory', () => {
            socket.emit('chatHistory', getChatHistory());
        });

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

            const flags = getFlagsForPermission(session.permission);
            const msg: ChatMessage = {
                userId: session.userId,
                nickname: session.nickname,
                profileImage: session.profileImage,
                flags: flags.length > 0 ? flags : undefined,
                content: trimmed,
                timestamp: Date.now(),
            };

            broadcastMessage(msg);

            // 명령어 처리
            if (trimmed.startsWith('/')) {
                handleCommand(session.userId, trimmed);
            }
        });
    });

    logger.success('채팅 모듈 초기화 완료');
};
