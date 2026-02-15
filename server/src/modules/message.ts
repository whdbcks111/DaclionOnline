import { getIO } from "./socket.js";
import type { ChatMessage } from "../../../shared/types.js";

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

/** 봇 메시지 전송 */
export function sendBotMessage(content: string): void {
    broadcastMessage({
        userId: BOT_USER_ID,
        nickname: BOT_NICKNAME,
        content,
        timestamp: Date.now(),
        profileImage: '/icons/favicon.png'
    });
}
