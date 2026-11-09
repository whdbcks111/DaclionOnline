import assert from 'node:assert/strict';
import test from 'node:test';
import { SeedWalkWorld } from './SeedWalkWorld.js';
import { canSeedWalkerOccupy, createSeedWalkMap, seedWalkHash, seedWalkGrassColor, isSeedWalkInput, moveSeedWalker, normalizeSeedWalkSeed, SeedWalkTerrain, SEED_WALK_SIZE, SEED_WALK_TILE } from '../../../../shared/seedWalk.js';

test('같은 시드는 동일한 지형을 만들고 시드 변경과 Unicode 정규화가 명시적으로 적용된다', () => {
    const map = createSeedWalkMap('gamebox');
    assert.deepEqual(map, createSeedWalkMap('gamebox'));
    assert.equal(seedWalkHash(map.tiles.join(',')), 651988787, 'v1 map fixture');
    assert.notDeepEqual(map.tiles, createSeedWalkMap('another-seed').tiles);
    assert.deepEqual(createSeedWalkMap(' 가 '), createSeedWalkMap('\u1100\u1161'));
    assert.equal(normalizeSeedWalkSeed('  '), 'gamebox');
    assert.equal(normalizeSeedWalkSeed('a'.repeat(49)), undefined);
    assert.equal(normalizeSeedWalkSeed('bad\nseed'), undefined);
    assert.equal(normalizeSeedWalkSeed({}), undefined);
});

test('맵의 모든 이동 가능 타일은 중앙 광장과 연결되고 맵 가장자리는 막힌다', () => {
    for (const seed of ['gamebox', '한글 시드', '1234']) {
        const map = createSeedWalkMap(seed), size = SEED_WALK_SIZE;
        const seen = new Set([32 * size + 32]), queue = [...seen];
        for (let i = 0; i < queue.length; i++) {
            const index = queue[i], x = index % size, y = Math.floor(index / size);
            for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
                const next = ny * size + nx;
                if (nx < 0 || ny < 0 || nx >= size || ny >= size || seen.has(next) || !SeedWalkTerrain.fromCode(map.tiles[next]).walkable) continue;
                seen.add(next); queue.push(next);
            }
        }
        assert.equal(seen.size, map.tiles.filter(tile => SeedWalkTerrain.fromCode(tile).walkable).length);
        assert.equal(canSeedWalkerOccupy(map, 0, 0), false);
        assert.equal(canSeedWalkerOccupy(map, 1040, 1040), true);
    }
});

test('대각선·과도한 입력도 이동 속도를 높이지 못하고 지연된 tick이 장애물을 통과하지 않는다', () => {
    const map = createSeedWalkMap('gamebox');
    const x = 1040, y = 1040;
    const straight = moveSeedWalker(map, x, y, 1, 0, .05);
    const diagonal = moveSeedWalker(map, x, y, 1, 1, .05);
    const forged = moveSeedWalker(map, x, y, 999, 0, .05);
    assert.equal(straight.x - x, 9);
    assert.ok(Math.abs(Math.hypot(diagonal.x - x, diagonal.y - y) - 9) < 1e-8);
    assert.deepEqual(forged, straight);
    const gentle = moveSeedWalker(map, x, y, .3, .4, .05);
    assert.ok(Math.abs(Math.hypot(gentle.x - x, gentle.y - y) - 4.5) < 1e-8);
    assert.equal(isSeedWalkInput({ seq: 2, x: .3, y: -.4 }), true);
    const blocked = { ...map, tiles: [...map.tiles] };
    blocked.tiles[32 * SEED_WALK_SIZE + 33] = SeedWalkTerrain.ROCK.code;
    const result = moveSeedWalker(blocked, x, y, 1, 0, 10);
    assert.ok(result.x < 33 * SEED_WALK_TILE - 9);
    assert.ok(canSeedWalkerOccupy(blocked, result.x, result.y));
    assert.equal(isSeedWalkInput({ seq: 1, x: 2, y: 0 }), false);
    assert.equal(isSeedWalkInput({ seq: NaN, x: 0, y: 0 }), false);
});

test('서버 월드는 연결 소유권과 입력 순서를 검증하고 다중 탭은 한 캐릭터를 공유한다', () => {
    const world = new SeedWalkWorld('gamebox');
    world.join(1, '첫번째', 'a'); world.join(2, '두번째', 'b'); world.join(1, '첫번째', 'another-tab');
    assert.equal(world.size, 2);
    const before = world.snapshot();
    assert.equal(world.input(1, 'forged-socket', { seq: 100, x: 1, y: 0 }, 1000), false);
    assert.equal(world.input(1, 'a', { seq: 1, x: 1, y: 0 }, 1000), true);
    assert.equal(world.input(1, 'a', { seq: 0, x: -1, y: 0 }, 1000), false);
    world.update(.05, 1000);
    assert.equal(world.snapshot().players[0].x, before.players[0].x + 9);
    assert.equal(world.snapshot().players[1].x, before.players[1].x);
    const stopped = world.snapshot().players[0].x;
    world.update(.05, 1400);
    assert.equal(world.snapshot().players[0].x, stopped);
    world.leave(1, 'a'); assert.equal(world.size, 2);
    world.leave(1, 'another-tab'); assert.equal(world.size, 1);
    assert.equal(before.players.length, 2);
    assert.equal(before.players[0].x + 9, stopped);
});

test('맵별 플레이어 수 상한은 32명이며 같은 계정의 새 탭은 자리를 추가 소비하지 않는다', () => {
    const world = new SeedWalkWorld('capacity');
    for (let i = 0; i < 32; i++) world.join(i, String(i), `socket-${i}`);
    world.join(0, '0', 'duplicate');
    assert.equal(world.size, 32);
    assert.throws(() => world.join(33, '33', 'extra'));
});

test('초원 색상은 같은 시드에서 결정론적이며 인접 위치는 부드럽게 변하고 다른 시드는 분포가 달라진다', () => {
    const colors = new Set<number>();
    let otherSeedDiffers = false;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
        const color = seedWalkGrassColor('meadow', x, y);
        assert.equal(color, seedWalkGrassColor('meadow', x, y));
        colors.add(color);
        otherSeedDiffers ||= color !== seedWalkGrassColor('other-meadow', x, y);
        const next = seedWalkGrassColor('meadow', x + 1, y);
        assert.ok(Math.abs(((color >> 8) & 255) - ((next >> 8) & 255)) <= 7);
        assert.ok(((color >> 8) & 255) >= 160 && ((color >> 8) & 255) <= 206);
    }
    assert.ok(colors.size > 15);
    assert.ok(otherSeedDiffers);
});
