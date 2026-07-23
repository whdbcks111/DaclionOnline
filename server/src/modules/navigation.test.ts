import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type Player from '../models/Player.js';
import type { LocationData } from '../../../shared/types.js';
import { reloadAllLocations } from '../models/Location.js';
import { tickCoroutines } from './coroutine.js';
import { cancelNavigation, startLocationTravel } from './navigation.js';
import { initSocket } from './socket.js';

const httpServer = createServer();
const io = initSocket(httpServer, '*');

before(() => {
    const location = (id: string, x: number, connections: string[]): LocationData => ({
        id,
        name: id,
        zoneType: 'safe',
        x,
        y: 0,
        z: 0,
        npcIds: [],
        objects: [],
        connections: connections.map(locationId => ({ locationId })),
        tags: ['location:safe'],
    });
    reloadAllLocations([
        location('start', 0, ['next']),
        location('next', 5, ['start']),
    ]);
});

after(() => {
    io.close();
    httpServer.close();
});

test('이동취소는 대기 중인 단일 이동 코루틴이 목적지를 적용하지 못하게 한다', () => {
    const player = {
        userId: 9_901,
        locationId: 'start',
        moving: false,
        isDead: false,
        attribute: { get: () => 1 },
        canPerformAction: () => true,
    } as unknown as Player;

    assert.equal(startLocationTravel(player, 'next').ok, true);
    assert.equal(player.moving, true);
    assert.equal(cancelNavigation(player, false), true);
    assert.equal(player.moving, false);

    tickCoroutines(10);
    assert.equal(player.locationId, 'start');
    assert.equal(cancelNavigation(player, false), false);
});
