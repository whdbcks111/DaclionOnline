import assert from 'node:assert/strict';
import test from 'node:test';
import { GameTags } from '../../../../shared/tags.js';
import {
    buildInstanceDungeonLocations,
    defineInstanceDungeon,
    INSTANCE_ROOM_CLEAR_CONDITION,
} from './InstanceDungeon.js';

const definition = defineInstanceDungeon({
    id: 'test_runtime_rift',
    name: '시험 균열',
    recommendedLevel: 1,
    durationSeconds: 60,
    rooms: [
        {
            key: 'entry', name: '입구',
            objects: [{ type: 'monster', dataId: 'test_monster', maxCount: 1, respawnTime: 30 }],
        },
        {
            key: 'core', name: '핵',
            objects: [{ type: 'monster', dataId: 'test_boss', maxCount: 1, respawnTime: 600 }],
        },
    ],
});

test('인스턴스 장소는 원정별 ID, 무리스폰 몬스터, 방 정리 잠금과 마지막 보스방 태그를 만든다', () => {
    const locations = buildInstanceDungeonLocations(definition, 'run_1');

    assert.equal(locations.length, 2);
    assert.equal(locations[0].id, 'instance_test_runtime_rift_run_1_entry');
    assert.equal(locations[0].objects[0].respawnTime, 0);
    assert.equal(locations[0].connections[0].condition, INSTANCE_ROOM_CLEAR_CONDITION);
    assert.ok(locations[0].tags.includes(GameTags.LOCATION_INSTANCE_DUNGEON));
    assert.ok(locations[0].tags.includes(GameTags.LOCATION_HIDDEN));
    assert.equal(locations[0].tags.includes(GameTags.LOCATION_BOSS_ROOM), false);
    assert.ok(locations[1].tags.includes(GameTags.LOCATION_BOSS_ROOM));
});
