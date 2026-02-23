import logger from "../utils/logger.js";
import { getIO } from "./socket.js";
import { getSession } from "./login.js";
import { sendMessageToChannel, getFlagsForPermission } from "./message.js";
import { getUserChannel, setUserChannel, getChannelHistory, getChannelRoomKey, getAvailableChannels, getFilteredHistoryForUser } from "./channel.js";
import { sendPlayerStats } from "./player.js";
import { handleCommand } from "./bot.js";
import type { ChatMessage } from "../../../shared/types.js";

const MAX_MESSAGE_LENGTH = 500;

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
            } else {
                socket.emit('chatHistory', publicHistory);
            }
        });

        // 채널 목록 요청
        socket.on('requestChannelList', () => {
            socket.emit('channelList', getAvailableChannels());
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
            if (trimmed.startsWith('/')) {
                handleCommand(session.userId, trimmed, msg, session.permission);
                return;
            }

            sendMessageToChannel(msg, getUserChannel(session.userId));
        });
    });

    logger.success('채팅 모듈 초기화 완료');
};
