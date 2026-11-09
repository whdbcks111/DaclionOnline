import assert from 'node:assert/strict';
import test from 'node:test';
import { SeedWalkWorld } from './SeedWalkWorld.js';
import { canSeedWalkerOccupy, createSeedWalkMap, seedWalkGrassColor, isSeedWalkInput, moveSeedWalker, normalizeSeedWalkSeed, SeedWalkTerrain, SEED_WALK_SIZE } from '../../../../shared/seedWalk.js';

test('같은 시드는 동일한 지형을 만들고 시드 변경과 Unicode 정규화가 명시적으로 적용된다', () => {
    const map = createSeedWalkMap('gamebox');
    assert.deepEqual(map, createSeedWalkMap('gamebox'));
    assert.equal(map.version, 2);
    assert.ok(map.tiles.every(tile => tile === SeedWalkTerrain.GRASS.code), 'v2 open meadow fixture');
    assert.notEqual(map.seed, createSeedWalkMap('another-seed').seed);
    assert.deepEqual(createSeedWalkMap(' 가 '), createSeedWalkMap('\u1100\u1161'));
    assert.equal(normalizeSeedWalkSeed('  '), 'gamebox');
    assert.equal(normalizeSeedWalkSeed('a'.repeat(49)), undefined);
    assert.equal(normalizeSeedWalkSeed('bad\nseed'), undefined);
    assert.equal(normalizeSeedWalkSeed({}), undefined);
});

test('초원은 모두 연결되며 음수 좌표와 기존 맵 바깥도 이동할 수 있다', () => {
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
        assert.equal(canSeedWalkerOccupy(map, 0, 0), true);
        assert.equal(canSeedWalkerOccupy(map, -10000, 10000), true);
        assert.deepEqual(moveSeedWalker(map, 0, 0, -1, 0, .05), { x: -9, y: 0 });
        assert.equal(canSeedWalkerOccupy(map, NaN, 0), false);
    }
});

test('대각선·과도한 입력도 이동 속도를 높이지 못하고 지연된 tick은 이동량을 제한한다', () => {
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
    assert.deepEqual(moveSeedWalker(map, x, y, 1, 0, 10), { x: x + 36, y });
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

test('말풍선은 소유 연결만 작성하고 길이·공백 검증, 복사, 교체와 5초 만료를 적용한다', () => {
    const world = new SeedWalkWorld('gamebox');
    world.join(1, '산책자', 'a');
    assert.equal(world.say(1, 'other', '위조', 100), false);
    for (const input of ['', '   ', null, 'a'.repeat(121)]) assert.equal(world.say(1, 'a', input, 100), false);
    assert.equal(world.say(1, 'a', ' 안녕\n초원 ', 100), true);
    const copy = world.snapshot();
    assert.equal(copy.players[0].bubble?.text, '안녕 초원');
    copy.players[0].bubble!.text = '변조';
    assert.equal(world.snapshot().players[0].bubble?.text, '안녕 초원');
    world.update(.05, 5099); assert.ok(world.snapshot().players[0].bubble);
    world.update(.05, 5100); assert.equal(world.snapshot().players[0].bubble, undefined);
    world.say(1, 'a', '새 말풍선', 6000); world.say(1, 'a', '교체', 6100);
    assert.equal(world.snapshot().players[0].bubble?.text, '교체');
});
