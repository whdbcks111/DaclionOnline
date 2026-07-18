import { getIO } from "./socket.js";
import { getSession, getSessionByUserId } from "./login.js";
import { parseChatMessage } from "../utils/chatParser.js";
import { getChannelRoomKey, addToChannelHistory, addToAllChannelHistories, addToFilteredChannelHistory, getUserChannel, editMessageInHistory, deleteMessageFromHistory } from "./channel.js";
import type { ChatMessage, ChatFlag, ChatNode, NotificationData } from "../../../shared/types.js";
import { shouldPublishInformationOutput } from './informationVisibility.js';

const BOT_USER_ID = 0;
const BOT_NICKNAME = "Daclion System";

// ── 메시지 ID 생성 ──

let _msgCounter = 0;
function generateMessageId(): string {
    return `m${Date.now().toString(36)}_${(++_msgCounter).toString(36)}`;
}

function withId(msg: ChatMessage): ChatMessage {
    return msg.id ? msg : { ...msg, id: generateMessageId() };
}

/** permission 기반 플래그 생성 */
export function getFlagsForPermission(permission: number): ChatFlag[] {
    const flags: ChatFlag[] = [];
    if (permission >= 10) flags.push({ text: '관리자', color: '#e74c3c' });
    return flags;
}

// ── 채널 브로드캐스트 ──

/** 특정 채널에 메시지 전송 (채널 히스토리에 저장) */
export function sendMessageToChannel(msg: ChatMessage, channel: string | null): void {
    const identified = withId(msg);
    addToChannelHistory(channel, identified);
    getIO().to(getChannelRoomKey(channel)).emit('chatMessage', identified);
}

const FLAG_ALL: ChatFlag = { text: '전체', color: '#08c26e' };
const FLAG_WHISPER: ChatFlag = { text: '귓속말', color: '#a855f7' };
const FLAG_PARTY: ChatFlag = { text: '파티', color: '#38bdf8' };

/** 모든 채널에 브로드캐스트 (모든 채널 히스토리에 저장, [전체] 플래그 자동 부착) */
export function broadcastMessageAll(msg: ChatMessage): void {
    const flagged: ChatMessage = withId({ ...msg, flags: [FLAG_ALL, ...(msg.flags ?? [])] });
    addToAllChannelHistories(flagged);
    getIO().emit('chatMessage', flagged);
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

function makePlayerTextMessage(userId: number, content: string): ChatMessage | undefined {
    const session = getSessionByUserId(userId);
    if (!session) return undefined;
    const flags = getFlagsForPermission(session.permission);
    return {
        userId,
        nickname: session.nickname,
        profileImage: session.profileImage,
        flags: flags.length > 0 ? flags : undefined,
        content: [{ type: 'text', text: content }],
        timestamp: Date.now(),
    };
}

/** 시스템이 플레이어의 실제 채팅처럼 현재 채널에 짧은 텍스트를 전송한다. */
export function sendPlayerTextToCurrentChannel(userId: number, content: string): boolean {
    const message = makePlayerTextMessage(userId, content);
    if (!message) return false;
    sendMessageToChannel(message, getUserChannel(userId));
    return true;
}

/** 플레이어 표시 메시지를 현재 채널에서 해당 플레이어 본인에게만 전송한다. */
export function sendPrivatePlayerTextToCurrentChannel(userId: number, content: string): boolean {
    const message = makePlayerTextMessage(userId, content);
    if (!message) return false;
    sendMessageFiltered(id => id === userId, getUserChannel(userId), message);
    return true;
}

/** 시전자의 플레이어 메시지를 각 파티원의 현재 채널에 파티 피드로 남긴다. */
export function sendPlayerTextToPartyMembers(
    sourceUserId: number,
    memberUserIds: readonly number[],
    content: string,
): boolean {
    const message = makePlayerTextMessage(sourceUserId, content);
    if (!message) return false;
    message.flags = [FLAG_PARTY, ...(message.flags ?? [])];
    for (const userId of new Set(memberUserIds)) sendMessageToUser(userId, message, false);
    return true;
}

/** 서로 다른 채널에 있어도 발신자와 수신자의 각 비공개 히스토리에 귓속말을 남긴다. */
export function sendWhisperMessage(senderUserId: number, targetUserId: number, content: string): boolean {
    const sender = getSessionByUserId(senderUserId);
    const target = getSessionByUserId(targetUserId);
    const received = makePlayerTextMessage(senderUserId, content);
    if (!sender || !target || !received) return false;

    received.flags = [FLAG_WHISPER, ...(received.flags ?? [])];
    sendMessageToUser(targetUserId, received, false);
    sendMessageToUser(senderUserId, {
        ...received,
        content: [{ type: 'text', text: `→ ${target.nickname}: ${content}` }],
    }, false);
    return true;
}

/** 모든 채널에 봇 메시지 브로드캐스트 (모든 채널 히스토리에 저장) */
export function broadcastBotMessageAll(content: string | ChatNode[]): void {
    broadcastMessageAll(makeBotMessage(content));
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
    const emitMsg = withId(privateLabel ? { ...msg, private: true } : msg);
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
    if (shouldPublishInformationOutput(userId)) {
        sendBotMessageToChannel(getUserChannel(userId), content);
        return;
    }
    sendMessageFiltered(id => id === userId, getUserChannel(userId), makeBotMessage(content), privateLabel);
}

/** 공개 정보 명령 문맥에서도 반드시 본인에게만 봇 메시지를 보낸다. */
export function sendPrivateBotMessageToUser(userId: number, content: string | ChatNode[], privateLabel = true): void {
    sendMessageFiltered(id => id === userId, getUserChannel(userId), makeBotMessage(content), privateLabel);
}

/** 전투·스킬 봇 메시지를 각 파티원의 현재 채널에 파티 피드로 남긴다. */
export function sendBotMessageToPartyMembers(memberUserIds: readonly number[], content: string | ChatNode[]): void {
    const message = makeBotMessage(content);
    message.flags = [FLAG_PARTY, ...(message.flags ?? [])];
    for (const userId of new Set(memberUserIds)) sendMessageToUser(userId, message, false);
}

/** 전체 알림 브로드캐스트 */
export function broadcastNotification(data: NotificationData): void {
    getIO().emit('notification', data);
}

/** 특정 유저에게만 알림 전송 */
export function sendNotificationToUser(userId: number, data: NotificationData): void {
    sendNotificationFiltered(id => id === userId, data);
}

/** 동일한 실시간 알림을 중복을 제거한 여러 사용자에게 전송한다. */
export function sendNotificationToUsers(userIds: readonly number[], data: NotificationData): void {
    const recipients = new Set(userIds);
    if (recipients.size > 0) sendNotificationFiltered(userId => recipients.has(userId), data);
}

// ── 메시지 편집 / 삭제 ──

/** 이미 전송된 메시지 내용 수정 후 전체 브로드캐스트 */
export function editMessage(id: string, newContent: ChatMessage['content']): void {
    editMessageInHistory(id, newContent);
    getIO().emit('editMessage', id, newContent);
}

/** 이미 전송된 메시지 삭제 후 전체 브로드캐스트 */
export function deleteMessage(id: string): void {
    deleteMessageFromHistory(id);
    getIO().emit('deleteMessage', id);
}
