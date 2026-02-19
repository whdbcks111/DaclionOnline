import { getIO } from "./socket.js";
import { getSession } from "./login.js";
import { parseChatMessage } from "../utils/chatParser.js";
import type { ChatMessage, ChatFlag, ChatNode, NotificationData } from "../../../shared/types.js";

const BOT_USER_ID = 0;
const BOT_NICKNAME = "Daclion System";

const MAX_HISTORY = 100;
const chatHistory: ChatMessage[] = [];

// ── 필터 히스토리 ──

interface FilteredHistoryEntry {
    filter: (userId: number) => boolean;
    msg: ChatMessage;
}

const MAX_FILTERED_HISTORY = 200;
const filteredHistory: FilteredHistoryEntry[] = [];

function addToFilteredHistory(filter: (userId: number) => boolean, msg: ChatMessage): void {
    filteredHistory.push({ filter, msg });
    if (filteredHistory.length > MAX_FILTERED_HISTORY) {
        filteredHistory.shift();
    }
}

/** 특정 userId가 받아야 할 필터 히스토리 메시지 반환 */
export function getFilteredHistoryForUser(userId: number): ChatMessage[] {
    return filteredHistory
        .filter(entry => entry.filter(userId))
        .map(entry => entry.msg);
}

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

// ── 내부 헬퍼 ──

/** filter를 통과한 소켓마다 콜백 실행 */
function forEachSocket(
    filter: (userId: number) => boolean,
    cb: (socket: ReturnType<typeof getIO>['sockets']['sockets'] extends Map<string, infer S> ? S : never) => void
): void {
    const io = getIO();
    for (const [, socket] of io.sockets.sockets) {
        const session = socket.data.sessionToken
            ? getSession(socket.data.sessionToken)
            : undefined;
        if (session && filter(session.userId)) {
            cb(socket);
        }
    }
}

function makeBotMessage(content: string | ChatNode[]): ChatMessage {
    return {
        userId: BOT_USER_ID,
        nickname: BOT_NICKNAME,
        flags: [{ text: '봇', color: '$primary' }],
        content: typeof content === 'string' ? parseChatMessage(content) : content,
        timestamp: Date.now(),
        profileImage: '/icons/favicon.png',
    };
}

// ── 필터 기반 전송 ──

/** filter를 통과한 유저들에게 메시지 전송 (필터 히스토리 저장)
 *  @param privateLabel true면 클라이언트에 "나에게만 보이는 메시지" 라벨 표시 (기본 true) */
export function sendMessageFiltered(
    filter: (userId: number) => boolean,
    msg: ChatMessage,
    privateLabel = true,
): void {
    const emitMsg = privateLabel ? { ...msg, private: true } : msg;
    addToFilteredHistory(filter, emitMsg);
    forEachSocket(filter, socket => socket.emit('chatMessage', emitMsg));
}

/** filter를 통과한 유저들에게 봇 메시지 전송 */
export function sendBotMessageFiltered(
    filter: (userId: number) => boolean,
    content: string | ChatNode[],
    privateLabel = true,
): void {
    sendMessageFiltered(filter, makeBotMessage(content), privateLabel);
}

/** filter를 통과한 유저들에게 알림 전송 */
export function sendNotificationFiltered(filter: (userId: number) => boolean, data: NotificationData): void {
    forEachSocket(filter, socket => socket.emit('notification', data));
}

// ── 편의 함수 ──

/** 특정 유저에게만 메시지 전송 */
export function sendMessageToUser(userId: number, msg: ChatMessage, privateLabel = true): void {
    sendMessageFiltered(id => id === userId, msg, privateLabel);
}

/** 특정 유저에게만 봇 메시지 전송 */
export function sendBotMessageToUser(userId: number, content: string | ChatNode[], privateLabel = true): void {
    sendMessageFiltered(id => id === userId, makeBotMessage(content), privateLabel);
}

/** 전체 알림 브로드캐스트 */
export function broadcastNotification(data: NotificationData): void {
    getIO().emit('notification', data);
}

/** 특정 유저에게만 알림 전송 */
export function sendNotificationToUser(userId: number, data: NotificationData): void {
    sendNotificationFiltered(id => id === userId, data);
}
