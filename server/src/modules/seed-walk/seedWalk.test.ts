import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { initSocket } from '../infrastructure/socket.js';
import { createSession, removeSession } from '../portal/login.js';
import { initSeedWalk, updateSeedWalk } from './seedWalk.js';
import type { SeedWalkJoinResult, SeedWalkSnapshot } from '../../../../shared/seedWalk.js';

class TestSocket {
    connected = true;
    data: Record<string, unknown> = {};
    handlers = new Map<string, (...args: any[]) => unknown>();
    result?: SeedWalkJoinResult;
    constructor(readonly id: string) {}
    on(event: string, handler: (...args: any[]) => unknown) { this.handlers.set(event, handler); }
    use() {}
    join() {}
    leave() {}
    emit(event: string, result: SeedWalkJoinResult) { if (event === 'seedWalkJoined') this.result = result; }
    send(event: string, payload?: unknown) { this.handlers.get(event)!(payload); }
}

test('인증된 계정만 같은 시드에서 만나며 입력과 로그아웃은 해당 연결의 캐릭터에만 적용된다', t => {
    const io = initSocket(createServer(), '*');
    initSeedWalk();
    const snapshots: SeedWalkSnapshot[] = [];
    t.mock.method(io, 'to', () => ({ volatile: { emit: (_event: string, snapshot: SeedWalkSnapshot) => snapshots.push(snapshot) } }) as never);
    const a = new TestSocket('walker-a'), b = new TestSocket('walker-b'), guest = new TestSocket('guest');
    const tokenA = createSession({ id: 99601, username: 'walker-a', nickname: '산책자A' });
    const tokenB = createSession({ id: 99602, username: 'walker-b', nickname: '산책자B' });
    a.data.sessionToken = tokenA; b.data.sessionToken = tokenB;
    try {
        for (const socket of [a, b, guest]) for (const listener of io.sockets.listeners('connection')) listener(socket as never);
        guest.send('seedWalkJoin', { seed: 'test' });
        assert.equal(guest.result?.ok, false);
        a.send('seedWalkJoin', { seed: 'test' }); b.send('seedWalkJoin', { seed: 'test' });
        assert.ok(a.result?.ok && b.result?.ok);
        assert.equal(b.result.state.players.length, 2);
        assert.equal(a.result.state.worldId, b.result.state.worldId);
        const before = b.result.state.players.find(player => player.id === 99601)!;
        a.send('seedWalkInput', { seq: 1, x: 1, y: 0, userId: 99602 });
        updateSeedWalk(.05);
        const after = snapshots.at(-1)!;
        assert.equal(after.players.find(player => player.id === 99601)!.x, before.x + 9);
        removeSession(tokenA);
        updateSeedWalk(.05);
        assert.deepEqual(snapshots.at(-1)!.players.map(player => player.id), [99602]);
        b.send('logout');
        assert.equal(b.data.seedWalkActive, false);
    } finally {
        for (const socket of [a, b, guest]) socket.send('seedWalkLeave');
        removeSession(tokenA); removeSession(tokenB); io.close();
    }
});
