import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import type Player from '../models/Player.js';
import { parseWhisperInput } from './chat.js';
import { getChannelHistory, getFilteredHistoryForUser, setUserChannel } from './channel.js';
import { createSession, removeSession } from './login.js';
import { sendWhisperMessage } from './message.js';
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
        assert.equal(sent?.private, undefined);
        assert.equal(received?.private, undefined);
        assert.deepEqual(sent?.content, [{ type: 'text', text: '→ 받는이: 비밀 메시지' }]);
        assert.deepEqual(received?.content, [{ type: 'text', text: '비밀 메시지' }]);
    } finally {
        removeSession(senderToken);
        removeSession(targetToken);
    }
});
