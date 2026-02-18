import { getIO } from "./socket.js";
import { getSession } from "./login.js";
import { parseChatMessage } from "../utils/chatParser.js";
import type { ChatMessage, ChatFlag, ChatNode, NotificationData } from "../../../shared/types.js";

const BOT_USER_ID = 0;
const BOT_NICKNAME = "Daclion System";

const MAX_HISTORY = 100;
const chatHistory: ChatMessage[] = [];

export function getChatHistory(): ChatMessage[] {
    return chatHistory;
}

/** 메시지를 히스토리에 저장하고 전체 브로드캐스트 */
export function broadcastMessage(msg: ChatMessage): void {
    chatHistory.push(msg);
    if (chatHistory.length > MAX_HISTORY) {
        chatHistory.shift();
    }
    getIO().emit('chatMessage', msg);
}

/** permission 기반 플래그 생성 */
export function getFlagsForPermission(permission: number): ChatFlag[] {
    const flags: ChatFlag[] = [];
    if (permission >= 10) flags.push({ text: '관리자', color: '#e74c3c' });
    return flags;
}

/** 봇 메시지 전송 (string이면 자동 파싱) */
export function sendBotMessage(content: string | ChatNode[]): void {
    broadcastMessage({
        userId: BOT_USER_ID,
        nickname: BOT_NICKNAME,
        flags: [{ text: '봇', color: '$primary' }],
        content: typeof content === 'string' ? parseChatMessage(content) : content,
        timestamp: Date.now(),
        profileImage: '/icons/favicon.png'
    });
}

/** 특정 유저에게만 메시지 전송 */
export function sendMessageToUser(userId: number, msg: ChatMessage): void {
    const io = getIO();
    for (const [, socket] of io.sockets.sockets) {
        const session = socket.data.sessionToken
            ? getSession(socket.data.sessionToken)
            : undefined;
        if (session?.userId === userId) {
            socket.emit('chatMessage', { ...msg, private: true });
        }
    }
}

/** 특정 유저에게만 봇 메시지 전송 */
export function sendBotMessageToUser(userId: number, content: string | ChatNode[]): void {
    sendMessageToUser(userId, {
        userId: BOT_USER_ID,
        nickname: BOT_NICKNAME,
        flags: [{ text: '봇', color: '$primary' }],
        content: typeof content === 'string' ? parseChatMessage(content) : content,
        timestamp: Date.now(),
        profileImage: '/icons/favicon.png'
    });
}

/** 전체 알림 브로드캐스트 */
export function broadcastNotification(data: NotificationData): void {
    getIO().emit('notification', data);
}

/** 특정 유저에게만 알림 전송 */
export function sendNotificationToUser(userId: number, data: NotificationData): void {
    const io = getIO();
    for (const [, socket] of io.sockets.sockets) {
        const session = socket.data.sessionToken
            ? getSession(socket.data.sessionToken)
            : undefined;
        if (session?.userId === userId) {
            socket.emit('notification', data);
        }
    }
}
