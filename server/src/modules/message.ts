import { getIO } from "./socket.js";
import { getSession } from "./login.js";
import { parseChatMessage } from "../utils/chatParser.js";
import { getChannelRoomKey, addToChannelHistory, addToFilteredChannelHistory, getUserChannel } from "./channel.js";
import type { ChatMessage, ChatFlag, ChatNode, NotificationData } from "../../../shared/types.js";

const BOT_USER_ID = 0;
const BOT_NICKNAME = "Daclion System";

/** permission 기반 플래그 생성 */
export function getFlagsForPermission(permission: number): ChatFlag[] {
    const flags: ChatFlag[] = [];
    if (permission >= 10) flags.push({ text: '관리자', color: '#e74c3c' });
    return flags;
}

// ── 채널 브로드캐스트 ──

/** 특정 채널에 메시지 전송 (채널 히스토리에 저장) */
export function sendMessageToChannel(msg: ChatMessage, channel: string | null): void {
    addToChannelHistory(channel, msg);
    getIO().to(getChannelRoomKey(channel)).emit('chatMessage', msg);
}

/** 모든 채널에 브로드캐스트 (히스토리에 저장하지 않음) */
export function broadcastMessageAll(msg: ChatMessage): void {
    getIO().emit('chatMessage', msg);
}

// ── 봇 메시지 헬퍼 ──

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

/** 특정 채널에 봇 메시지 전송 */
export function sendBotMessageToChannel(channel: string | null, content: string | ChatNode[]): void {
    sendMessageToChannel(makeBotMessage(content), channel);
}

/** 봇 메시지 전송 (기본: 메인 채널 null) */
export function sendBotMessage(content: string | ChatNode[], channel: string | null = null): void {
    sendMessageToChannel(makeBotMessage(content), channel);
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

// ── 필터 기반 전송 ──

/** filter를 통과한 유저들에게 메시지 전송 (채널 범위 한정, 필터 히스토리 저장)
 *  @param privateLabel true면 클라이언트에 "나에게만 보이는 메시지" 라벨 표시 (기본 true) */
export function sendMessageFiltered(
    filter: (userId: number) => boolean,
    channel: string | null,
    msg: ChatMessage,
    privateLabel = true,
): void {
    const emitMsg = privateLabel ? { ...msg, private: true } : msg;
    addToFilteredChannelHistory(channel, filter, emitMsg);
    // 해당 채널에 현재 접속 중인 유저에게만 실시간 전달
    forEachSocket(
        userId => filter(userId) && getUserChannel(userId) === channel,
        socket => socket.emit('chatMessage', emitMsg)
    );
}

/** filter를 통과한 유저들에게 봇 메시지 전송 (채널 범위 한정) */
export function sendBotMessageFiltered(
    filter: (userId: number) => boolean,
    channel: string | null,
    content: string | ChatNode[],
    privateLabel = true,
): void {
    sendMessageFiltered(filter, channel, makeBotMessage(content), privateLabel);
}

/** filter를 통과한 유저들에게 알림 전송 */
export function sendNotificationFiltered(filter: (userId: number) => boolean, data: NotificationData): void {
    forEachSocket(filter, socket => socket.emit('notification', data));
}

// ── 편의 함수 ──

/** 특정 유저에게만 메시지 전송 (유저의 현재 채널로 범위 한정) */
export function sendMessageToUser(userId: number, msg: ChatMessage, privateLabel = true): void {
    sendMessageFiltered(id => id === userId, getUserChannel(userId), msg, privateLabel);
}

/** 특정 유저에게만 봇 메시지 전송 (유저의 현재 채널로 범위 한정) */
export function sendBotMessageToUser(userId: number, content: string | ChatNode[], privateLabel = true): void {
    sendMessageFiltered(id => id === userId, getUserChannel(userId), makeBotMessage(content), privateLabel);
}

/** 전체 알림 브로드캐스트 */
export function broadcastNotification(data: NotificationData): void {
    getIO().emit('notification', data);
}

/** 특정 유저에게만 알림 전송 */
export function sendNotificationToUser(userId: number, data: NotificationData): void {
    sendNotificationFiltered(id => id === userId, data);
}
