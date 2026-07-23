import assert from 'node:assert/strict';
import test from 'node:test';
import type { LocationData } from '../../../shared/types.js';
import { PlayerProgress } from './Progress.js';
import { normalizeLocationData, reloadAllLocations } from './Location.js';
import {
    findShortestVisitedRoute,
    getVisitedLocationMatches,
    getVisitedLocationIds,
    getFullWorldMapSnapshot,
    getWorldMapSnapshot,
    markAllLocationsVisited,
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
        zoneType: id === 'start' ? 'safe' : 'neutral',
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

test('관리자 전체 지역 잠금 해제는 아직 방문하지 않은 장소만 발견 처리한다', () => {
    reloadAllLocations([
        location('start', 0, ['near']),
        location('near', 100, ['start']),
        location('secret', 200, [], ['location:hidden']),
    ]);
    const player = { locationId: 'start', progress: PlayerProgress.createEmpty(12) } as Player;

    assert.equal(markLocationVisited(player, 'start'), true);
    assert.equal(markAllLocationsVisited(player), 2);
    assert.equal(markAllLocationsVisited(player), 0);
    assert.deepEqual(getVisitedLocationIds(player).sort(), ['near', 'secret', 'start']);
    assert.equal(getWorldMapSnapshot(player).locations.some(node => node.id === 'secret'), false);
});

test('방문 장소 검색은 exact를 우선하고 구분 기호 없는 부분 이름을 지원한다', () => {
    reloadAllLocations([
        { ...location('start', 0, []), name: '피버릭 광장' },
        { ...location('meadow_1', 100, []), name: '피버릭 초원 1구역' },
        { ...location('meadow_2', 200, []), name: '피버릭 초원 2구역' },
        { ...location('mist_swamp_1', 240, []), name: '안개수렁 1 물먹은 둑' },
        { ...location('mist_swamp_2', 260, []), name: '안개수렁 2 잠든 포자밭' },
        { ...location('secret', 300, [], ['location:hidden']), name: '숨은 초원' },
    ]);
    const player = { locationId: 'start', progress: PlayerProgress.createEmpty(13) } as Player;
    for (const id of ['start', 'meadow_1', 'meadow_2', 'mist_swamp_1', 'mist_swamp_2', 'secret']) {
        markLocationVisited(player, id);
    }

    assert.deepEqual(
        getVisitedLocationMatches(player, 'meadow_1'),
        [{ locationId: 'meadow_1', name: '피버릭 초원 1구역' }],
    );
    assert.deepEqual(
        getVisitedLocationMatches(player, '초원').map(match => match.locationId),
        ['meadow_1', 'meadow_2'],
    );
    assert.deepEqual(getVisitedLocationMatches(player, '숨은'), []);
    assert.deepEqual(
        getVisitedLocationMatches(player, '안개 수령').map(match => match.locationId),
        ['mist_swamp_1', 'mist_swamp_2'],
    );
});

test('A* 자동이동 경로는 방문한 공개 장소의 현재 열린 연결 중 최단 거리를 고른다', () => {
    reloadAllLocations([
        { ...location('start', 0, ['short', 'detour']), y: 0 },
        { ...location('short', 5, ['goal']), y: 0 },
        { ...location('detour', 1, ['goal']), y: 10 },
        { ...location('goal', 10, []), y: 0 },
    ]);
    const allVisited = { locationId: 'start', progress: PlayerProgress.createEmpty(14) } as Player;
    for (const id of ['start', 'short', 'detour', 'goal']) markLocationVisited(allVisited, id);
    assert.deepEqual(
        findShortestVisitedRoute(allVisited, 'start', 'goal'),
        ['start', 'short', 'goal'],
    );

    const detourOnly = { locationId: 'start', progress: PlayerProgress.createEmpty(15) } as Player;
    for (const id of ['start', 'detour', 'goal']) markLocationVisited(detourOnly, id);
    assert.deepEqual(
        findShortestVisitedRoute(detourOnly, 'start', 'goal'),
        ['start', 'detour', 'goal'],
    );
});
