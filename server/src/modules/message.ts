import { getIO } from "./socket.js";
import { parseChatMessage } from "../utils/chatParser.js";
import type { ChatMessage, ChatFlag, ChatNode } from "../../../shared/types.js";

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
