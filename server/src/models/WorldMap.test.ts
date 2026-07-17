import assert from 'node:assert/strict';
import test from 'node:test';
import type { LocationData } from '../../../shared/types.js';
import { PlayerProgress } from './Progress.js';
import { normalizeLocationData, reloadAllLocations } from './Location.js';
import {
    getVisitedLocationIds,
    getFullWorldMapSnapshot,
    getWorldMapSnapshot,
    markLocationVisited,
} from './WorldMap.js';
import type Player from './Player.js';

function location(
    id: string,
    x: number,
    connections: string[],
    tags: string[] = ['location:wilderness'],
): LocationData {
    return {
        id,
        name: id,
        zoneType: id === 'start' ? 'safe' : 'normal',
        x,
        y: 0,
        z: 0,
        npcIds: [],
        objects: [],
        connections: connections.map(locationId => ({ locationId })),
        tags,
        ...(id === 'start' ? { mapIcon: 'town-plaza', mapColor: '#6aa6d8' } : {}),
    };
}

test('장소 대표색은 6자리 HEX 색상만 허용한다', () => {
    assert.equal(
        normalizeLocationData({ ...location('color', 0, []), mapColor: '#A1B2C3' }).mapColor,
        '#a1b2c3',
    );
    assert.throws(
        () => normalizeLocationData({ ...location('invalid-color', 0, []), mapColor: 'red' }),
        /Invalid location map color/,
    );
});

test('지도는 방문 장소와 한 단계 인접 미방문 장소만 공개하고 hidden 장소는 제외한다', () => {
    reloadAllLocations([
        location('start', 0, ['near', 'secret']),
        { ...location('near', 100, ['start', 'beyond']), mapColor: '#7a8b9c' },
        location('beyond', 200, ['near']),
        location('secret', -100, ['start'], ['location:hidden']),
        location('isolated', 400, []),
    ]);
    const player = {
        locationId: 'start',
        level: 50,
        progress: PlayerProgress.createEmpty(10),
    } as Player;

    assert.equal(markLocationVisited(player, 'start'), true);
    assert.equal(markLocationVisited(player, 'start'), false);
    assert.equal(markLocationVisited(player, 'secret'), true);
    assert.equal(markLocationVisited(player, 'isolated'), true);
    assert.deepEqual(getVisitedLocationIds(player).sort(), ['isolated', 'secret', 'start']);

    const snapshot = getWorldMapSnapshot(player);
    assert.deepEqual(snapshot.locations.map(node => node.id).sort(), ['isolated', 'near', 'start']);
    assert.equal(snapshot.locations.find(node => node.id === 'start')?.current, true);
    assert.equal(snapshot.locations.find(node => node.id === 'start')?.mapIcon, 'town-plaza');
    assert.equal(snapshot.locations.find(node => node.id === 'start')?.mapColor, '#6aa6d8');
    assert.equal(snapshot.locations.find(node => node.id === 'near')?.visited, false);
    assert.equal(snapshot.locations.find(node => node.id === 'near')?.mapColor, undefined);
    assert.equal(snapshot.locations.some(node => node.id === 'beyond'), false);
    assert.equal(snapshot.locations.some(node => node.id === 'secret'), false);
    assert.deepEqual(snapshot.connections, [{ from: 'near', to: 'start', discovered: false }]);
});

test('관리자 전체 지도는 hidden과 고립 장소를 포함한 모든 장소를 공개한다', () => {
    reloadAllLocations([
        location('start', 0, ['near', 'secret']),
        location('near', 100, ['start']),
        location('secret', -100, ['start'], ['location:hidden']),
        location('isolated', 400, []),
    ]);
    const player = {
        locationId: 'start',
        progress: PlayerProgress.createEmpty(11),
    } as Player;

    const snapshot = getFullWorldMapSnapshot(player);
    assert.deepEqual(snapshot.locations.map(node => node.id).sort(), ['isolated', 'near', 'secret', 'start']);
    assert.equal(snapshot.locations.every(node => node.visited), true);
    assert.equal(snapshot.locations.find(node => node.id === 'start')?.current, true);
    assert.equal(snapshot.locations.find(node => node.id === 'start')?.mapColor, '#6aa6d8');
    assert.deepEqual(snapshot.connections.map(edge => `${edge.from}:${edge.to}`).sort(), ['near:start', 'secret:start']);
});
