import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import test from 'node:test';
import { io as connect, type Socket } from 'socket.io-client';
import { initSocket } from '../infrastructure/socket.js';
import { createSession, removeSession } from '../portal/login.js';
import { initSeedWalk, updateSeedWalk } from './seedWalk.js';
import type { SeedWalkJoinResult, SeedWalkSnapshot } from '../../../../shared/seedWalk.js';

const clientOnce = (socket: Socket, event: string): Promise<any[]> => new Promise(resolve => socket.once(event, (...args: any[]) => resolve(args)));

/** Real transports, isolated in-memory accounts: does not read or mutate a player's DB data. */
test('실제 두 소켓은 같은 맵에서 상대 이동과 퇴장을 받고 비인증 접속은 거절된다', { timeout: 10_000 }, async () => {
    const http = createServer();
    const io = initSocket(http, '*');
    initSeedWalk();
    http.listen(0, '127.0.0.1');
    await once(http, 'listening');
    const url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
    const tokens = [
        createSession({ id: 99611, username: 'integration-a', nickname: '산책A' }),
        createSession({ id: 99612, username: 'integration-b', nickname: '산책B' }),
    ];
    const clients = [...tokens, ''].map(token => connect(url, { transports: ['websocket'], reconnection: false, extraHeaders: token ? { Cookie: `sessionToken=${token}` } : {} }));
    const join = async (client: Socket): Promise<SeedWalkJoinResult> => {
        const result = clientOnce(client, 'seedWalkJoined');
        client.emit('seedWalkJoin', { seed: 'network-test' });
        return (await result)[0];
    };
    try {
        await Promise.all(clients.map(client => clientOnce(client, 'connect')));
        const first = await join(clients[0]), second = await join(clients[1]), guest = await join(clients[2]);
        assert.ok(first.ok && second.ok);
        assert.equal(guest.ok, false);
        assert.equal(first.state.worldId, second.state.worldId);
        assert.equal(second.state.players.length, 2);
        const beforeA = second.state.players.find(player => player.id === 99611)!;
        const beforeB = second.state.players.find(player => player.id === 99612)!;
        const serverA = io.sockets.sockets.get(clients[0].id!)!;
        const processed = once(serverA, 'seedWalkInput');
        clients[0].emit('seedWalkInput', { seq: 1, x: 1, y: 0, userId: 99612 });
        await processed;
        const receivedA = clientOnce(clients[0], 'seedWalkState'), receivedB = clientOnce(clients[1], 'seedWalkState');
        updateSeedWalk(.05);
        const stateA = (await receivedA)[0] as SeedWalkSnapshot;
        const stateB = (await receivedB)[0] as SeedWalkSnapshot;
        assert.deepEqual(stateA, stateB);
        assert.equal(stateB.players.find(player => player.id === 99611)!.x, beforeA.x + 9);
        assert.equal(stateB.players.find(player => player.id === 99612)!.x, beforeB.x);
        const disconnected = once(serverA, 'disconnect');
        clients[0].disconnect();
        await disconnected;
        const left = clientOnce(clients[1], 'seedWalkState');
        updateSeedWalk(.05);
        assert.deepEqual(((await left)[0] as SeedWalkSnapshot).players.map(player => player.id), [99612]);
    } finally {
        clients.forEach(client => client.disconnect());
        tokens.forEach(removeSession);
        await new Promise<void>(resolve => io.close(() => resolve()));
    }
});
