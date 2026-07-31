import assert from 'node:assert/strict';
import test from 'node:test';
import { GameTags } from '../../../shared/tags.js';
import Monster, {
    BOSS_RECOVERY_DELAY_SECONDS,
    BOSS_RECOVERY_RATIO_PER_SECOND,
    STANDARD_MONSTER_RESPAWN_SECONDS,
    defineMonster,
} from './Monster.js';
import Entity from './Entity.js';
import Equipment from './Equipment.js';
import { defineLocation } from './Location.js';

const LONG_RESPAWN_BOSS_ID = 'test:long_respawn_boss';
const STANDARD_RESPAWN_MONSTER_ID = 'test:standard_respawn_monster';
const MONSTER_TEST_LOCATION_ID = 'monster-test';

class TestMonsterAttacker extends Entity {
    override readonly name = '보스 도입 시험 공격자';
}

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
    bossNarrative: {
        introDuration: 3,
        introLine: '시험의 문을 열어라.',
        phases: [
            { lifeRatio: 0.7, line: '첫 번째 경계다.' },
            { lifeRatio: 0.35, line: '마지막 경계다.' },
        ],
    },
    tags: [GameTags.ENTITY_BOSS],
});

defineMonster({
    id: STANDARD_RESPAWN_MONSTER_ID,
    name: '표준 리젠 시험 몬스터',
    description: '일반 사냥터 리젠 시간 시험용 몬스터',
    level: 1,
    exp: 0,
    baseAttribute: { maxLife: 100, atk: 1, speed: 1 },
    drops: [],
    expReward: 0,
    goldReward: 0,
    equipments: [],
    tags: [],
});

defineLocation({
    id: MONSTER_TEST_LOCATION_ID,
    name: '몬스터 시험장',
    zoneType: 'hostile',
    x: 0,
    y: 0,
    z: 0,
    npcIds: [],
    objects: [],
    connections: [],
    tags: [],
});

test('일반 몬스터는 장소의 레벨별 설정과 관계없이 표준 리젠 시간을 사용한다', () => {
    const earlyMonster = new Monster(STANDARD_RESPAWN_MONSTER_ID, 'test', 20);
    const lateMonster = new Monster(STANDARD_RESPAWN_MONSTER_ID, 'test', 500);

    assert.equal(earlyMonster.respawnTime, STANDARD_MONSTER_RESPAWN_SECONDS);
    assert.equal(lateMonster.respawnTime, STANDARD_MONSTER_RESPAWN_SECONDS);
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

test('보스 첫 공격은 도입 무적에 막히고 도입 시간이 끝나야 피해를 받는다', () => {
    const boss = new Monster(LONG_RESPAWN_BOSS_ID, 'test', 600);
    const attacker = new TestMonsterAttacker(1, 0, 'test', { maxLife: 100, atk: 100 }, Equipment.createEmpty());
    const cause = { type: 'attack', causeEntity: attacker, fixedDamage: true } as const;

    boss.damage(25, 'absolute', cause);
    assert.equal(boss.isBossIntroActive, true);
    assert.equal(boss.life, boss.maxLife);
    assert.equal(boss.getDamageReceivedModifier(), 0);

    boss.update(3);
    assert.equal(boss.isBossIntroActive, false);
    assert.equal(boss.getDamageReceivedModifier(), 1);
    boss.damage(25, 'absolute', cause);
    assert.equal(boss.life, boss.maxLife - 25);
});

test('보스는 전투 대상이 사라진 지 10초 후부터 초당 최대 생명력의 10%를 회복한다', () => {
    const boss = new Monster(LONG_RESPAWN_BOSS_ID, MONSTER_TEST_LOCATION_ID, 600);
    const attacker = new TestMonsterAttacker(
        1,
        0,
        MONSTER_TEST_LOCATION_ID,
        { maxLife: 100, atk: 100 },
        Equipment.createEmpty(),
    );
    boss.acquireCombatTarget(attacker);
    boss.update(3);
    boss.life = boss.maxLife * 0.25;
    attacker.life = 0;
    attacker.lateUpdate(0);

    boss.update(BOSS_RECOVERY_DELAY_SECONDS - 0.1);
    assert.equal(boss.life, boss.maxLife * 0.25);
    assert.equal(boss.isBossRecovering, false);

    boss.update(0.1);
    assert.equal(boss.life, boss.maxLife * 0.25);
    assert.equal(boss.isBossRecovering, true);

    boss.update(1);
    assert.equal(boss.life, boss.maxLife * (0.25 + BOSS_RECOVERY_RATIO_PER_SECOND));

    boss.update(6.5);
    assert.equal(boss.life, boss.maxLife);
    assert.equal(boss.isBossRecovering, false);
});

test('보스가 새 전투 대상을 얻으면 이탈 대기와 회복이 즉시 취소된다', () => {
    const boss = new Monster(LONG_RESPAWN_BOSS_ID, MONSTER_TEST_LOCATION_ID, 600);
    const first = new TestMonsterAttacker(
        1,
        0,
        MONSTER_TEST_LOCATION_ID,
        { maxLife: 100 },
        Equipment.createEmpty(),
    );
    const second = new TestMonsterAttacker(
        1,
        0,
        MONSTER_TEST_LOCATION_ID,
        { maxLife: 100 },
        Equipment.createEmpty(),
    );
    boss.acquireCombatTarget(first);
    boss.update(3);
    boss.life = boss.maxLife * 0.5;
    first.life = 0;
    first.lateUpdate(0);
    boss.update(BOSS_RECOVERY_DELAY_SECONDS + 1);
    assert.equal(boss.isBossRecovering, true);
    const recoveredLife = boss.life;

    boss.acquireCombatTarget(second);
    assert.equal(boss.isBossRecovering, false);
    boss.update(3);
    boss.update(2);
    assert.equal(boss.life, recoveredLife);
});
