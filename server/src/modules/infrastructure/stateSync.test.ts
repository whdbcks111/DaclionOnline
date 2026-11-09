import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import type { Socket } from 'socket.io';
import { RevisionedSnapshot, publishUserSnapshot, clearUserSnapshotStreams } from './stateSync.js';
import { initSocket } from './socket.js';
import { createSession, removeSession } from '../portal/login.js';

test('revision snapshot은 내용이 바뀔 때만 증가하고 reset 뒤 새 syncId로 시작한다', () => {
    const stream = new RevisionedSnapshot<{ life: number }>();
    const first = stream.resolve({ life: 100 });
    const same = stream.resolve({ life: 100 });
    const changed = stream.resolve({ life: 90 });
    assert.equal(first, same);
    assert.equal(first.revision, 1);
    assert.equal(changed.revision, 2);
    assert.equal(changed.syncId, first.syncId);

    stream.reset();
    const reset = stream.resolve({ life: 90 });
    assert.equal(reset.revision, 1);
    assert.notEqual(reset.syncId, first.syncId);
});

test('같은 계정의 포털 탭에는 게임 HUD를 보내지 않고 게임 탭에만 전송한다', () => {
    const io = initSocket(createServer(), '*');
    const userId = 99503;
    const token = createSession({ id: userId, username: 'snapshot-test', nickname: '시험계정' });
    const portal = { id: 'portal', data: { sessionToken: token } } as Socket;
    const game = { id: 'game', data: { sessionToken: token, onlineUserId: userId } } as Socket;
    io.sockets.sockets.set(portal.id, portal);
    io.sockets.sockets.set(game.id, game);
    const delivered: string[] = [];
    try {
        assert.equal(publishUserSnapshot(userId, 'stats-test', { life: 100 }, socket => delivered.push(socket.id)), 1);
        assert.deepEqual(delivered, ['game']);
        assert.equal(publishUserSnapshot(userId, 'stats-test', { life: 100 }, socket => delivered.push(socket.id)), 0);
    } finally {
        io.sockets.sockets.delete(portal.id);
        io.sockets.sockets.delete(game.id);
        clearUserSnapshotStreams(userId);
        removeSession(token);
        io.close();
    }
});
