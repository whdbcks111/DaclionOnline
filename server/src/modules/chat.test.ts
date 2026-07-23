import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import {
    CHAT_ADVERTISEMENT_COOLDOWN_MS,
    CHAT_WHISPER_DISPLAY,
    ChatType,
    summarizeChatContent,
} from '../../../shared/chat.js';
import type Player from '../models/Player.js';
import {
    deliverChatMessage,
    parseChatImageFilenames,
    parseChatImageRequest,
    parseChatMessageRequest,
    parseWhisperInput,
    tryStartAdvertisementCooldown,
} from './chat.js';
import {
    getChannelHistory,
    getFilteredHistoryForUser,
    getPublicReplyReference,
    setUserChannel,
} from './channel.js';
import {
    createSession,
    removeSession,
    setUserOffline,
    setUserOnline,
} from './login.js';
import {
    broadcastMessageAll,
    sendMessageFiltered,
    sendMessageToChannel,
    sendWhisperMessage,
} from './message.js';
import {
    registerOnlinePlayer,
    searchOnlinePlayerIdentitySnapshots,
    unregisterOnlinePlayer,
} from './playerRegistry.js';
import { getIO, initSocket } from './socket.js';

const httpServer = createServer();
initSocket(httpServer, 'http://localhost');
test.after(() => { getIO().close(); });

test('귓속말 입력은 첫 공백을 기준으로 닉네임과 본문을 분리한다', () => {
    assert.deepEqual(parseWhisperInput('@모험가 안녕하세요 반갑습니다'), {
        target: '모험가',
        message: '안녕하세요 반갑습니다',
    });
    assert.deepEqual(parseWhisperInput('@모험가'), { target: '모험가', message: '' });
    assert.deepEqual(parseWhisperInput('@ 메시지'), { target: '', message: '메시지' });
    assert.equal(parseWhisperInput('일반 메시지'), null);
});

test('채팅 이미지 payload는 단일 호환 입력과 최대 10장 묶음을 검증한다', () => {
    assert.deepEqual(parseChatImageFilenames({ filename: 'one.webp' }), ['one.webp']);
    assert.deepEqual(parseChatImageFilenames({ filenames: ['one.webp', 'two.webp'] }), ['one.webp', 'two.webp']);
    assert.equal(parseChatImageFilenames({ filenames: [] }), undefined);
    assert.equal(parseChatImageFilenames({ filenames: Array.from({ length: 11 }, (_, index) => `${index}.webp`) }), undefined);
    assert.equal(parseChatImageFilenames({ filenames: ['valid.webp', 3] }), undefined);
});

test('채팅 타입은 클래스형 enum으로 조회되고 권한에 따라 공지 노출을 구분한다', () => {
    assert.equal(ChatType.fromKey('party'), ChatType.PARTY);
    assert.equal(ChatType.fromInput('근처'), ChatType.NEARBY);
    assert.deepEqual(
        ChatType.values().filter(type => type.requiredPermission <= 0).map(type => type.key),
        ['channel', 'nearby', 'party', 'advertisement'],
    );
    assert.equal(ChatType.NOTICE.requiredPermission, 10);
});

test('텍스트와 이미지 답장 payload는 구형 입력을 유지하면서 서버 메시지 ID만 허용한다', () => {
    assert.deepEqual(parseChatMessageRequest('안녕하세요'), { content: '안녕하세요' });
    assert.deepEqual(parseChatMessageRequest({
        content: '답장입니다',
        replyToId: 'mreply_1',
    }), {
        content: '답장입니다',
        replyToId: 'mreply_1',
    });
    assert.equal(parseChatMessageRequest({ content: '변조', replyToId: '../private' }), undefined);
    assert.deepEqual(parseChatMessageRequest({
        content: '근처 채팅',
        chatType: 'nearby',
    }), {
        content: '근처 채팅',
        chatType: 'nearby',
    });
    assert.equal(parseChatMessageRequest({ content: '변조', chatType: 'admin-bypass' }), undefined);
    assert.deepEqual(parseChatImageRequest({
        filenames: ['one.webp'],
        replyToId: 'mreply_2',
        chatType: 'party',
    }), {
        filenames: ['one.webp'],
        replyToId: 'mreply_2',
        chatType: 'party',
    });
    assert.equal(parseChatImageRequest({
        filenames: ['one.webp'],
        replyToId: 'not-a-server-id',
    }), undefined);
});

test('일반 광고는 30초 쿨타임을 적용하고 관리자 광고는 제한하지 않는다', () => {
    const userId = 9681;
    assert.deepEqual(tryStartAdvertisementCooldown(userId, 0, 1_000), {
        allowed: true,
        remainingMs: 0,
    });
    assert.deepEqual(tryStartAdvertisementCooldown(userId, 0, 1_001), {
        allowed: false,
        remainingMs: CHAT_ADVERTISEMENT_COOLDOWN_MS - 1,
    });
    assert.deepEqual(tryStartAdvertisementCooldown(userId, 0, 1_000 + CHAT_ADVERTISEMENT_COOLDOWN_MS), {
        allowed: true,
        remainingMs: 0,
    });
    assert.deepEqual(tryStartAdvertisementCooldown(9682, 10, 1_000), {
        allowed: true,
        remainingMs: 0,
    });
    assert.deepEqual(tryStartAdvertisementCooldown(9682, 10, 1_001), {
        allowed: true,
        remainingMs: 0,
    });
});

test('전체 브로드캐스트는 전체 대신 공지 또는 광고 플래그를 붙인다', () => {
    broadcastMessageAll({
        userId: 0,
        nickname: '테스트',
        content: [{ type: 'text', text: '공지 테스트' }],
        timestamp: Date.now(),
    });
    assert.equal(getChannelHistory(null).at(-1)?.flags?.[0]?.text, '공지');

    broadcastMessageAll({
        userId: 0,
        nickname: '테스트',
        content: [{ type: 'text', text: '광고 테스트' }],
        timestamp: Date.now(),
    }, ChatType.ADVERTISEMENT);
    assert.equal(getChannelHistory(null).at(-1)?.flags?.[0]?.text, '광고');
});

test('일반 사용자가 변조한 공지 요청은 서버 전달 경계에서 거절한다', () => {
    const before = getChannelHistory(null).length;
    const result = deliverChatMessage(9683, 0, {
        userId: 9683,
        nickname: '일반 사용자',
        content: [{ type: 'text', text: '권한 없는 공지' }],
        timestamp: Date.now(),
    }, ChatType.NOTICE);
    assert.equal(result.ok, false);
    assert.match(result.reason ?? '', /권한/);
    assert.equal(getChannelHistory(null).length, before);
});

test('근처 채팅은 발신자와 같은 장소의 온라인 플레이어에게만 전달한다', () => {
    const source = { userId: 9684, name: '근처 발신자', level: 1, locationId: 'nearby-a' } as Player;
    const nearby = { userId: 9685, name: '근처 수신자', level: 1, locationId: 'nearby-a' } as Player;
    const remote = { userId: 9686, name: '원거리 수신자', level: 1, locationId: 'nearby-b' } as Player;
    const players = [source, nearby, remote];
    players.forEach((player, index) => {
        registerOnlinePlayer(player);
        setUserOnline(player.userId, `nearby-test-${index}`);
        setUserChannel(player.userId, `nearby-channel-${index}`);
    });

    try {
        const result = deliverChatMessage(source.userId, 0, {
            userId: source.userId,
            nickname: source.name,
            content: [{ type: 'text', text: '근처 메시지' }],
            timestamp: Date.now(),
        }, ChatType.NEARBY);
        assert.equal(result.ok, true);
        assert.equal(getFilteredHistoryForUser(source.userId, 'nearby-channel-0').at(-1)?.flags?.[0]?.text, '근처');
        assert.equal(getFilteredHistoryForUser(nearby.userId, 'nearby-channel-1').at(-1)?.flags?.[0]?.text, '근처');
        assert.equal(getFilteredHistoryForUser(remote.userId, 'nearby-channel-2').length, 0);
    } finally {
        players.forEach((player, index) => {
            setUserOffline(player.userId, `nearby-test-${index}`);
            unregisterOnlinePlayer(player.userId);
        });
    }
});

test('답장 요약은 구조화 노드를 한 줄로 만들고 길이를 제한한다', () => {
    assert.equal(summarizeChatContent([
        { type: 'color', color: '$primary', children: [{ type: 'text', text: '안녕하세요\n모험가' }] },
        { type: 'image', src: '/image.webp', alt: '이미지', maxHeight: 100 },
    ]), '안녕하세요 모험가 사진');
    assert.equal(summarizeChatContent('1234567890 ABC', 10), '123456789…');
});

test('공개 메시지만 답장 원문 스냅샷으로 조회되고 필터 메시지는 노출되지 않는다', () => {
    const publicChannel = 'reply-public-test';
    const privateChannel = 'reply-private-test';
    sendMessageToChannel({
        id: 'mreplypublic_1',
        userId: 9911,
        nickname: '공개모험가',
        content: [{ type: 'text', text: '공개 원문입니다.' }],
        timestamp: Date.now(),
    }, publicChannel);
    const storedPublic = getChannelHistory(publicChannel).at(-1);
    assert.equal(storedPublic?.replyable, true);
    assert.deepEqual(getPublicReplyReference(publicChannel, 'mreplypublic_1'), {
        messageId: 'mreplypublic_1',
        userId: 9911,
        nickname: '공개모험가',
        preview: '공개 원문입니다.',
    });

    const filteredId = sendMessageFiltered(
        userId => userId === 9912,
        privateChannel,
        {
            id: 'mreplyprivate_1',
            userId: 9911,
            nickname: '비공개모험가',
            content: [{ type: 'text', text: '노출되면 안 되는 원문' }],
            timestamp: Date.now(),
        },
    );
    assert.equal(getFilteredHistoryForUser(9912, privateChannel).at(-1)?.replyable, false);
    assert.equal(getPublicReplyReference(privateChannel, filteredId), undefined);
});

test('온라인 플레이어 mention 검색은 본인을 제외하고 닉네임 prefix를 정렬해 반환한다', () => {
    const players = [
        { userId: 9711, name: 'Alpha', level: 10 },
        { userId: 9712, name: 'alpine', level: 20 },
        { userId: 9713, name: 'Beta', level: 30 },
    ] as Player[];
    for (const player of players) registerOnlinePlayer(player);
    try {
        assert.deepEqual(searchOnlinePlayerIdentitySnapshots('al', 9711), [{
            userId: 9712,
            nickname: 'alpine',
            level: 20,
        }]);
    } finally {
        for (const player of players) unregisterOnlinePlayer(player.userId);
    }
});

test('귓속말은 서로 다른 채널의 양쪽 필터 히스토리에만 남는다', () => {
    const senderId = 9721;
    const targetId = 9722;
    const senderToken = createSession({ id: senderId, username: 'whisper_sender', nickname: '보내는이' });
    const targetToken = createSession({ id: targetId, username: 'whisper_target', nickname: '받는이' });
    setUserChannel(senderId, null);
    setUserChannel(targetId, '거래');
    const senderPublicCount = getChannelHistory(null).length;
    const targetPublicCount = getChannelHistory('거래').length;

    try {
        assert.equal(sendWhisperMessage(senderId, targetId, '비밀 메시지'), true);
        assert.equal(getChannelHistory(null).length, senderPublicCount);
        assert.equal(getChannelHistory('거래').length, targetPublicCount);

        const sent = getFilteredHistoryForUser(senderId, null).at(-1);
        const received = getFilteredHistoryForUser(targetId, '거래').at(-1);
        assert.equal(sent?.flags?.[0]?.text, '귓속말');
        assert.equal(received?.flags?.[0]?.text, '귓속말');
        assert.equal(sent?.flags?.[0]?.color, CHAT_WHISPER_DISPLAY.color);
        assert.equal(received?.flags?.[0]?.color, CHAT_WHISPER_DISPLAY.color);
        assert.equal(sent?.private, undefined);
        assert.equal(received?.private, undefined);
        assert.deepEqual(sent?.content, [{ type: 'text', text: '→ 받는이: 비밀 메시지' }]);
        assert.deepEqual(received?.content, [{ type: 'text', text: '비밀 메시지' }]);
    } finally {
        removeSession(senderToken);
        removeSession(targetToken);
    }
});
