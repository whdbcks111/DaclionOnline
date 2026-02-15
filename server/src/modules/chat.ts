import logger from "../utils/logger.js";
import { getIO } from "./socket.js";
import { getSession } from "./login.js";
import type { ChatMessage } from "../../../shared/types.js";

const MAX_MESSAGE_LENGTH = 500;
const MAX_HISTORY = 100;

const chatHistory: ChatMessage[] = [];

export const initChat = () => {
    const io = getIO();

    io.on('connection', (socket) => {
        // 클라이언트 요청 시 이전 대화 전송
        socket.on('requestChatHistory', () => {
            socket.emit('chatHistory', chatHistory);
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

            const msg: ChatMessage = {
                userId: session.userId,
                nickname: session.nickname,
                content: trimmed,
                timestamp: Date.now(),
            };

            // 히스토리 저장 (최대 MAX_HISTORY개)
            chatHistory.push(msg);
            if (chatHistory.length > MAX_HISTORY) {
                chatHistory.shift();
            }

            io.emit('chatMessage', msg);
        });
    });

    logger.success('채팅 모듈 초기화 완료');
};
