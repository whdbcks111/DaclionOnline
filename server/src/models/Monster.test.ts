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
import { StatusEffectType } from './StatusEffect.js';
import { ShieldType } from './Shield.js';
import '../data/statusEffects.js';

const LONG_RESPAWN_BOSS_ID = 'test:long_respawn_boss';
const STANDARD_RESPAWN_MONSTER_ID = 'test:standard_respawn_monster';
const CONTRIBUTION_MONSTER_ID = 'test:contribution_monster';
const MONSTER_TEST_LOCATION_ID = 'monster-test';

class TestMonsterAttacker extends Entity {
    override readonly name = '보스 도입 시험 공격자';
}

class TestContributionPlayer extends Entity {
    override readonly name: string;
    override get isPlayer(): boolean { return true; }
    override get playerUserId(): number { return this.userId; }

    constructor(readonly userId: number, locationId: string, name = `기여자 ${userId}`) {
        super(1, 0, locationId, { maxLife: 100, atk: 10, speed: 1 }, Equipment.createEmpty());
        this.name = name;
    }
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

defineMonster({
    id: CONTRIBUTION_MONSTER_ID,
    name: '기여 원장 시험 몬스터',
    description: '실제 전투 기여 원장 시험용 몬스터',
    level: 1,
    exp: 0,
    baseAttribute: { maxLife: 100, atk: 1, speed: 1, def: 0, magicDef: 0 },
    drops: [],
    expReward: 100,
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

test('직접 피해와 source가 있는 DoT는 실제 피해만 각각 한 번 기여 원장에 기록한다', () => {
    const locationId = 'contribution-direct-dot';
    const monster = new Monster(CONTRIBUTION_MONSTER_ID, locationId);
    const attacker = new TestContributionPlayer(10_001, locationId);
    const direct = monster.damage(10, 'absolute', {
        type: 'attack',
        causeEntity: attacker,
        fixedDamage: true,
    });
    assert.equal(direct.lifeDamage, 10);
    assert.equal(monster.getDefeatContributionSnapshot()[0]?.damage, 10);

    monster.applyStatusEffect(StatusEffectType.FIRE, 3, 1, attacker);
    monster.updateStatusEffects(1);

    const snapshot = monster.getDefeatContributionSnapshot()[0];
    assert.equal(snapshot?.userId, attacker.userId);
    assert.equal(snapshot?.damage, 13.5);
    assert.equal(monster.lastDamageCause?.causeEntity?.attackOwner, attacker);
});

test('과잉 피해는 남은 생명력까지만 lifeDamage와 기여도로 인정한다', () => {
    const locationId = 'contribution-overkill';
    const monster = new Monster(CONTRIBUTION_MONSTER_ID, locationId);
    const attacker = new TestContributionPlayer(10_002, locationId);

    const result = monster.damage(1_000, 'absolute', {
        type: 'attack',
        causeEntity: attacker,
        fixedDamage: true,
    });

    assert.equal(result.finalDamage, 1_000);
    assert.equal(result.lifeDamage, 100);
    assert.equal(result.remainingLife, 0);
    assert.equal(monster.getDefeatContributionSnapshot()[0]?.damage, 100);
});

test('치유와 보호막은 claim 안 source의 실제 회복·흡수량만 기록하고 미사용량은 제외한다', () => {
    const locationId = 'contribution-support';
    const monster = new Monster(CONTRIBUTION_MONSTER_ID, locationId);
    const tank = new TestContributionPlayer(10_003, locationId, '탱커');
    const outsider = new TestContributionPlayer(10_004, locationId, '외부 지원자');
    monster.acquireCombatTarget(tank);

    assert.equal(tank.heal(50, tank).healedAmount, 0);
    tank.damage(20, 'absolute');
    assert.equal(tank.heal(50, outsider).healedAmount, 20);
    assert.deepEqual(monster.getDefeatContributionSnapshot(), []);

    tank.damage(20, 'absolute');
    assert.equal(tank.heal(10, tank).healedAmount, 10);
    tank.setShield('test:used', 50, ShieldType.GENERAL, 10, tank);
    assert.equal(monster.getDefeatContributionSnapshot()[0]?.shielding ?? 0, 0);
    tank.damage(30, 'absolute');
    tank.setShield('test:unused', 40, ShieldType.GENERAL, 0.5, tank);
    tank.earlyUpdate(1);

    const snapshot = monster.getDefeatContributionSnapshot()[0];
    assert.equal(snapshot?.healing, 10);
    assert.equal(snapshot?.shielding, 30);
    assert.equal(snapshot?.total, 40);
});

test('제어 기여는 저항·점감 후 실제 가동 시간만 환산하고 조기 제거·만료를 중복 집계하지 않는다', () => {
    const locationId = 'contribution-control';
    const monster = new Monster(CONTRIBUTION_MONSTER_ID, locationId);
    const controller = new TestContributionPlayer(10_005, locationId);
    const stun = StatusEffectType.fromKey('stun')!;
    const sleep = StatusEffectType.fromKey('sleep')!;
    monster.acquireCombatTarget(controller);

    const first = monster.applyStatusEffect(stun, 10, 1, controller).effect!;
    assert.equal(first.duration, 2.5);
    monster.updateStatusEffects(1);
    monster.removeStatusEffect(stun);
    monster.updateStatusEffects(5);

    const diminished = monster.applyStatusEffect(sleep, 10, 1, controller).effect!;
    assert.equal(diminished.duration, 1.25);
    monster.updateStatusEffects(5);
    monster.updateStatusEffects(5);

    // 최대 생명력 100의 1% × (1초 + 1.25초)
    assert.equal(monster.getDefeatContributionSnapshot()[0]?.control, 2.25);
});
