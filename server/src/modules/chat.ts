import logger from "../utils/logger.js";
import { getIO } from "./socket.js";
import { getSession, broadcastUserCount } from "./login.js";
import { sendMessageToChannel, getFlagsForPermission, sendNotificationToUser, sendWhisperMessage } from "./message.js";
import { getUserChannel, setUserChannel, getChannelHistory, getChannelRoomKey, getAvailableChannels, getFilteredHistoryForUser } from "./channel.js";
import { sendPlayerStats, sendLocationInfo, getPlayerByUserId } from "./player.js";
import { handleCommand, isCommandAliasInput } from "./bot.js";
import type { ChatMessage } from "../../../shared/types.js";
import { ActionType } from "../models/Action.js";
import { findOnlinePlayerByIdentity, searchOnlinePlayerIdentitySnapshots } from './playerRegistry.js';

const MAX_MESSAGE_LENGTH = 500;

export interface WhisperInput {
    target: string;
    message: string;
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

        socket.on('sendMessage', (content: unknown) => {
            if (typeof content !== 'string') return;

            const trimmed = content.trim();
            if (trimmed.length === 0 || trimmed.length > MAX_MESSAGE_LENGTH) return;

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
                content: [{ type: 'text', text: trimmed }],
                timestamp: Date.now(),
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

            sendMessageToChannel(msg, getUserChannel(session.userId));
        });
    });

    logger.success('채팅 모듈 초기화 완료');
};
