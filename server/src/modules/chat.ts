import logger from "../utils/logger.js";
import { getIO } from "./socket.js";
import { getSession, broadcastUserCount, isUserOnline } from "./login.js";
import {
    broadcastMessageAll,
    sendMessageToAudience,
    sendMessageToChannel,
    getFlagsForPermission,
    sendNotificationToUser,
    sendWhisperMessage,
} from "./message.js";
import {
    getUserChannel,
    setUserChannel,
    getChannelHistory,
    getChannelRoomKey,
    getAvailableChannels,
    getFilteredHistoryForUser,
    getPublicReplyReference,
} from "./channel.js";
import { sendPlayerStats, sendLocationInfo, getPlayerByUserId } from "./player.js";
import { handleCommand, isCommandAliasInput } from "./bot.js";
import {
    CHAT_ADVERTISEMENT_COOLDOWN_MS,
    ChatType,
    isChatMessageId,
} from "../../../shared/chat.js";
import type {
    ChatMessage,
    ChatReplyReference,
    ChatTypeKey,
    SendChatImageRequest,
    SendChatMessageRequest,
} from "../../../shared/types.js";
import { ActionType } from "../models/Action.js";
import {
    findOnlinePlayerByIdentity,
    getOnlinePlayerUserIdsAtLocation,
    searchOnlinePlayerIdentitySnapshots,
} from './playerRegistry.js';
import { getOwnedChatImage } from './upload.js';
import { chat } from '../utils/chatBuilder.js';
import { partyManager } from './party.js';

const MAX_MESSAGE_LENGTH = 500;
const MAX_CHAT_IMAGE_BATCH = 10;
const lastAdvertisementAtByUserId = new Map<number, number>();

export interface WhisperInput {
    target: string;
    message: string;
}

export function parseChatMessageRequest(payload: unknown): SendChatMessageRequest | undefined {
    if (typeof payload === 'string') return { content: payload };
    if (typeof payload !== 'object' || payload === null) return undefined;
    const { content, replyToId, chatType } = payload as {
        content?: unknown;
        replyToId?: unknown;
        chatType?: unknown;
    };
    if (typeof content !== 'string') return undefined;
    if (replyToId !== undefined && !isChatMessageId(replyToId)) return undefined;
    if (chatType !== undefined && !ChatType.fromKey(chatType)) return undefined;
    return {
        content,
        ...(replyToId === undefined ? {} : { replyToId }),
        ...(chatType === undefined ? {} : { chatType: chatType as ChatTypeKey }),
    };
}

/** @닉네임 뒤의 첫 공백을 기준으로 수신자와 본문을 분리한다. @ 입력은 오류 안내를 위해 빈 값도 반환한다. */
export function parseWhisperInput(content: string): WhisperInput | null {
    const trimmed = content.trim();
    if (!trimmed.startsWith('@')) return null;
    const separator = trimmed.search(/\s/);
    if (separator < 0) return { target: trimmed.slice(1), message: '' };
    return {
        target: trimmed.slice(1, separator),
        message: trimmed.slice(separator).trim(),
    };
}

/** 단일 레거시 payload와 다중 이미지 payload를 답장 참조까지 포함해 정규화한다. */
export function parseChatImageRequest(payload: unknown): SendChatImageRequest | undefined {
    if (typeof payload !== 'object' || payload === null) return undefined;
    const record = payload as {
        filename?: unknown;
        filenames?: unknown;
        replyToId?: unknown;
        chatType?: unknown;
    };
    const raw = record.filenames ?? (record.filename === undefined ? undefined : [record.filename]);
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_CHAT_IMAGE_BATCH) return undefined;
    if (!raw.every(filename => typeof filename === 'string' && filename.length > 0 && filename.length <= 160)) return undefined;
    if (record.replyToId !== undefined && !isChatMessageId(record.replyToId)) return undefined;
    if (record.chatType !== undefined && !ChatType.fromKey(record.chatType)) return undefined;
    return {
        filenames: raw as string[],
        ...(record.replyToId === undefined ? {} : { replyToId: record.replyToId }),
        ...(record.chatType === undefined ? {} : { chatType: record.chatType as ChatTypeKey }),
    };
}

/** 기존 테스트·호출부에서 파일명 배열만 필요할 때 사용하는 호환 API. */
export function parseChatImageFilenames(payload: unknown): string[] | undefined {
    return parseChatImageRequest(payload)?.filenames;
}

function resolveReplyReference(
    userId: number,
    channel: string | null,
    replyToId?: string,
): { ok: true; replyTo?: ChatReplyReference } | { ok: false } {
    if (!replyToId) return { ok: true };
    const replyTo = getPublicReplyReference(channel, replyToId);
    if (replyTo) return { ok: true, replyTo };
    sendNotificationToUser(userId, {
        key: 'chat-reply-target-missing',
        message: '답장할 원본 메시지가 현재 공개 채팅 기록에 없습니다.',
    });
    return { ok: false };
}

export interface AdvertisementCooldownResult {
    allowed: boolean;
    remainingMs: number;
}

/** 광고 채팅의 30초 제한을 원자적으로 확인한다. 관리자 권한은 제한하지 않는다. */
export function tryStartAdvertisementCooldown(
    userId: number,
    permission: number,
    now = Date.now(),
): AdvertisementCooldownResult {
    if (permission >= ChatType.NOTICE.requiredPermission) {
        return { allowed: true, remainingMs: 0 };
    }
    const lastSentAt = lastAdvertisementAtByUserId.get(userId) ?? Number.NEGATIVE_INFINITY;
    const remainingMs = Math.max(0, lastSentAt + CHAT_ADVERTISEMENT_COOLDOWN_MS - now);
    if (remainingMs > 0) return { allowed: false, remainingMs };
    lastAdvertisementAtByUserId.set(userId, now);
    return { allowed: true, remainingMs: 0 };
}

export interface ChatDeliveryResult {
    ok: boolean;
    reason?: string;
}

/** 선택된 채팅 타입의 권한과 audience를 서버에서 확정해 메시지를 전달한다. */
export function deliverChatMessage(
    userId: number,
    permission: number,
    message: ChatMessage,
    type: ChatType,
    now = Date.now(),
): ChatDeliveryResult {
    if (permission < type.requiredPermission) {
        return { ok: false, reason: `${type.label} 채팅을 사용할 권한이 없습니다.` };
    }

    if (type === ChatType.CHANNEL) {
        sendMessageToChannel(message, getUserChannel(userId));
        return { ok: true };
    }
    if (type === ChatType.NEARBY) {
        const player = getPlayerByUserId(userId);
        if (!player) return { ok: false, reason: '현재 플레이어 위치를 확인할 수 없습니다.' };
        const audience = getOnlinePlayerUserIdsAtLocation(player.locationId).filter(isUserOnline);
        sendMessageToAudience(audience, message, type);
        return { ok: true };
    }
    if (type === ChatType.PARTY) {
        const party = partyManager.getParty(userId);
        if (!party) return { ok: false, reason: '파티에 소속되어 있지 않습니다.' };
        sendMessageToAudience(party.memberUserIds.filter(isUserOnline), message, type);
        return { ok: true };
    }
    if (type === ChatType.ADVERTISEMENT) {
        const cooldown = tryStartAdvertisementCooldown(userId, permission, now);
        if (!cooldown.allowed) {
            return {
                ok: false,
                reason: `광고 채팅은 ${Math.ceil(cooldown.remainingMs / 1_000)}초 후 다시 보낼 수 있습니다.`,
            };
        }
        broadcastMessageAll(message, type);
        return { ok: true };
    }

    broadcastMessageAll(message, ChatType.NOTICE);
    return { ok: true };
}

function notifyChatDeliveryFailure(userId: number, result: ChatDeliveryResult): void {
    if (result.ok) return;
    sendNotificationToUser(userId, {
        key: 'chat-type-denied',
        message: result.reason ?? '선택한 채팅 타입으로 메시지를 보낼 수 없습니다.',
    });
}

export const initChat = () => {
    const io = getIO();

    io.on('connection', (socket) => {
        // 클라이언트 요청 시 현재 채널의 히스토리 전송
        socket.on('requestChatHistory', () => {
            const session = socket.data.sessionToken ? getSession(socket.data.sessionToken) : undefined;
            const channel = session ? getUserChannel(session.userId) : null;
            const publicHistory = getChannelHistory(channel);

            if (session) {
                const privateHistory = getFilteredHistoryForUser(session.userId, channel);
                const combined = [...publicHistory, ...privateHistory]
                    .sort((a, b) => a.timestamp - b.timestamp);
                socket.emit('chatHistory', combined);
                sendPlayerStats(session.userId);
                sendLocationInfo(session.userId);
            } else {
                socket.emit('chatHistory', publicHistory);
            }
        });

        socket.on('requestLocationInfo', () => {
            const session = socket.data.sessionToken ? getSession(socket.data.sessionToken) : undefined;
            if (session) sendLocationInfo(session.userId);
        });

        // 채널 목록 요청
        socket.on('requestChannelList', () => {
            socket.emit('channelList', getAvailableChannels());
        });

        socket.on('requestMentionCompletions', (query: unknown) => {
            if (typeof query !== 'string' || query.length > 12 || /\s/.test(query)) return;
            const session = socket.data.sessionToken ? getSession(socket.data.sessionToken) : undefined;
            if (!session) { socket.emit('sessionInvalid'); return; }
            socket.emit('mentionCompletions', searchOnlinePlayerIdentitySnapshots(query, session.userId).map(player => ({
                value: player.nickname,
                description: `ID ${player.userId} · Lv.${player.level}`,
            })));
        });

        // 채널 변경: 유저의 모든 소켓을 새 채널 room으로 이동하고 히스토리 전송
        socket.on('joinChannel', (channelRaw: unknown) => {
            if (channelRaw !== null && typeof channelRaw !== 'string') return;
            const channel = channelRaw as string | null;

            const session = socket.data.sessionToken ? getSession(socket.data.sessionToken) : undefined;
            if (!session) { socket.emit('sessionInvalid'); return; }

            // 개인 채널은 본인 것만 접근 가능
            if (typeof channel === 'string' && channel.startsWith('private_')) {
                if (channel !== `private_${session.userId}`) return;
            }

            const oldChannel = getUserChannel(session.userId);
            if (oldChannel === channel) return;

            // 해당 유저의 모든 소켓을 새 채널 room으로 이동
            for (const [, sock] of io.sockets.sockets) {
                const sess = sock.data.sessionToken ? getSession(sock.data.sessionToken) : undefined;
                if (sess?.userId === session.userId) {
                    sock.leave(getChannelRoomKey(oldChannel));
                    sock.join(getChannelRoomKey(channel));
                }
            }

            setUserChannel(session.userId, channel);
            broadcastUserCount();

            // 새 채널의 히스토리 + 필터 히스토리 합쳐서 전송
            const publicHistory = getChannelHistory(channel);
            const privateHistory = getFilteredHistoryForUser(session.userId, channel);
            const combined = [...publicHistory, ...privateHistory]
                .sort((a, b) => a.timestamp - b.timestamp);
            socket.emit('channelChanged', channel, combined);
        });

        socket.on('chatButtonClick', (payload: unknown) => {
            if (typeof payload !== 'object' || payload === null) return;
            const { action, showCommand } = payload as { action: unknown; showCommand?: unknown };
            if (typeof action !== 'string') return;

            const trimmed = action.trim();
            if (!trimmed.startsWith('/')) return;

            const session = socket.data.sessionToken ? getSession(socket.data.sessionToken) : undefined;
            if (!session) { socket.emit('sessionInvalid'); return; }
            const player = getPlayerByUserId(session.userId);
            if (player && !player.canPerformAction(ActionType.COMMAND)) {
                sendNotificationToUser(session.userId, {
                    key: 'action-disabled:command',
                    message: '현재 명령어를 사용할 수 없는 상태입니다.',
                });
                return;
            }

            const flags = getFlagsForPermission(session.permission);
            const msg: ChatMessage | null = showCommand === true ? {
                userId: session.userId,
                nickname: session.nickname,
                profileImage: session.profileImage,
                flags: flags.length > 0 ? flags : undefined,
                content: [{ type: 'text', text: trimmed }],
                timestamp: Date.now(),
            } : null;

            handleCommand(session.userId, trimmed, msg, session.permission);
        });

        socket.on('sendMessage', (payload: unknown) => {
            const request = parseChatMessageRequest(payload);
            if (!request) return;
            const trimmed = request.content.trim();
            if (trimmed.length === 0 || trimmed.length > MAX_MESSAGE_LENGTH) return;

            const session = socket.data.sessionToken
                ? getSession(socket.data.sessionToken)
                : undefined;

            if (!session) {
                socket.emit('sessionInvalid');
                return;
            }

            const chatType = ChatType.fromKey(request.chatType) ?? ChatType.CHANNEL;
            if (request.replyToId && chatType !== ChatType.CHANNEL) {
                sendNotificationToUser(session.userId, {
                    key: 'chat-reply-channel-only',
                    message: '답장은 채널 채팅으로만 보낼 수 있습니다.',
                });
                return;
            }
            const channel = getUserChannel(session.userId);
            const resolvedReply = resolveReplyReference(session.userId, channel, request.replyToId);
            if (!resolvedReply.ok) return;
            const flags = getFlagsForPermission(session.permission);
            const msg: ChatMessage = {
                userId: session.userId,
                nickname: session.nickname,
                profileImage: session.profileImage,
                flags: flags.length > 0 ? flags : undefined,
                content: [{ type: 'text', text: trimmed }],
                timestamp: Date.now(),
                replyTo: resolvedReply.replyTo,
            };

            // 명령어 처리
            if (trimmed.startsWith('/') || isCommandAliasInput(trimmed)) {
                const player = getPlayerByUserId(session.userId);
                if (player && !player.canPerformAction(ActionType.COMMAND)) {
                    sendNotificationToUser(session.userId, {
                        key: 'action-disabled:command',
                        message: '현재 명령어를 사용할 수 없는 상태입니다.',
                    });
                    return;
                }
                handleCommand(session.userId, trimmed, msg, session.permission);
                return;
            }

            const player = getPlayerByUserId(session.userId);
            if (player && !player.canPerformAction(ActionType.CHAT)) {
                sendNotificationToUser(session.userId, {
                    key: 'action-disabled:chat',
                    message: '현재 채팅을 사용할 수 없는 상태입니다.',
                });
                return;
            }

            const whisper = parseWhisperInput(trimmed);
            if (whisper) {
                if (!whisper.target || !whisper.message) {
                    sendNotificationToUser(session.userId, {
                        key: 'whisper-invalid',
                        message: '@닉네임 뒤에 보낼 메시지를 입력해주세요.',
                    });
                    return;
                }
                const target = findOnlinePlayerByIdentity(whisper.target);
                if (!target) {
                    sendNotificationToUser(session.userId, {
                        key: 'whisper-target-offline',
                        message: '해당 닉네임의 온라인 플레이어를 찾을 수 없습니다.',
                    });
                    return;
                }
                if (target.userId === session.userId) {
                    sendNotificationToUser(session.userId, {
                        key: 'whisper-self',
                        message: '자기 자신에게는 귓속말을 보낼 수 없습니다.',
                    });
                    return;
                }
                if (!sendWhisperMessage(session.userId, target.userId, whisper.message)) {
                    sendNotificationToUser(session.userId, {
                        key: 'whisper-target-offline',
                        message: '상대가 오프라인이 되어 귓속말을 보내지 못했습니다.',
                    });
                }
                return;
            }

            // 일반 채팅 형식으로 등록된 스킬 트리거를 명령과 동일한 발동 API로 처리
            const skillActivation = player?.skills.activateFromMessage(trimmed);
            if (skillActivation?.matched) return;

            notifyChatDeliveryFailure(
                session.userId,
                deliverChatMessage(session.userId, session.permission, msg, chatType),
            );
        });

        const sendImageBatch = async (payload: unknown) => {
            const request = parseChatImageRequest(payload);
            const filenames = request?.filenames;
            if (!request || !filenames) return;
            const session = socket.data.sessionToken ? getSession(socket.data.sessionToken) : undefined;
            if (!session) { socket.emit('sessionInvalid'); return; }
            const player = getPlayerByUserId(session.userId);
            if (player && !player.canPerformAction(ActionType.CHAT)) {
                sendNotificationToUser(session.userId, {
                    key: 'action-disabled:chat',
                    message: '현재 채팅을 사용할 수 없는 상태입니다.',
                });
                return;
            }

            const chatType = ChatType.fromKey(request.chatType) ?? ChatType.CHANNEL;
            if (request.replyToId && chatType !== ChatType.CHANNEL) {
                sendNotificationToUser(session.userId, {
                    key: 'chat-reply-channel-only',
                    message: '답장은 채널 채팅으로만 보낼 수 있습니다.',
                });
                return;
            }
            const channel = getUserChannel(session.userId);
            const resolvedReply = resolveReplyReference(session.userId, channel, request.replyToId);
            if (!resolvedReply.ok) return;
            const images = await Promise.all(filenames.map(filename => getOwnedChatImage(session.userId, filename)));
            if (images.some(image => !image)) {
                sendNotificationToUser(session.userId, {
                    key: 'chat-image-invalid',
                    message: '전송할 이미지 중 찾을 수 없거나 보관 기간이 만료된 항목이 있습니다.',
                });
                return;
            }

            const flags = getFlagsForPermission(session.permission);
            const content = chat();
            images.forEach((image, index) => {
                if (!image) return;
                if (index > 0) content.text('\n');
                content.image({
                    src: image.url,
                    alt: `${session.nickname}님이 보낸 이미지 ${index + 1}`,
                    width: image.width,
                    height: image.height,
                });
            });
            notifyChatDeliveryFailure(session.userId, deliverChatMessage(session.userId, session.permission, {
                userId: session.userId,
                nickname: session.nickname,
                profileImage: session.profileImage,
                flags: flags.length > 0 ? flags : undefined,
                content: content.build(),
                timestamp: Date.now(),
                replyTo: resolvedReply.replyTo,
            }, chatType));
        };

        socket.on('sendImageMessage', sendImageBatch);
        socket.on('sendImageMessages', sendImageBatch);
    });

    logger.success('채팅 모듈 초기화 완료');
};
