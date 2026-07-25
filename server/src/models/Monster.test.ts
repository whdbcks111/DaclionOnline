import assert from 'node:assert/strict';
import test from 'node:test';
import { GameTags } from '../../../shared/tags.js';
import Monster, { defineMonster } from './Monster.js';

const LONG_RESPAWN_BOSS_ID = 'test:long_respawn_boss';

defineMonster({
    id: LONG_RESPAWN_BOSS_ID,
    name: '장기 리젠 시험 보스',
    description: '위치 UI 리젠 시간 시험용 몬스터',
    level: 1,
    exp: 0,
    baseAttribute: { maxLife: 100, atk: 1, speed: 1 },
    drops: [],
    expReward: 0,
    goldReward: 0,
    equipments: [],
    tags: [GameTags.ENTITY_BOSS],
});

test('5분을 초과하는 일반 소환 보스만 리젠 표시 스냅샷을 제공한다', () => {
    const boss = new Monster(LONG_RESPAWN_BOSS_ID, 'test', 600);
    assert.deepEqual(boss.getRespawnDisplaySnapshot(), {
        duration: 600,
        remaining: 600,
    });

    const fiveMinuteBoss = new Monster(LONG_RESPAWN_BOSS_ID, 'test', 300);
    assert.equal(fiveMinuteBoss.getRespawnDisplaySnapshot(), undefined);

    const oneShotBoss = new Monster(LONG_RESPAWN_BOSS_ID, 'test', 600, true);
    assert.equal(oneShotBoss.getRespawnDisplaySnapshot(), undefined);
});

test('처치된 장기 리젠 보스는 감소한 남은 시간을 제공한다', () => {
    const boss = new Monster(LONG_RESPAWN_BOSS_ID, 'test', 600);
    boss.life = 0;
    boss.lateUpdate(0);
    boss.earlyUpdate(125.2);

    assert.deepEqual(boss.getRespawnDisplaySnapshot(), {
        duration: 600,
        remaining: 475,
    });
});
