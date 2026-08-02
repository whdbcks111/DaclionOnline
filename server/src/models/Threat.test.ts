import assert from 'node:assert/strict';
import test from 'node:test';
import { GameTags } from '../../../shared/tags.js';
import Entity from './Entity.js';
import Equipment from './Equipment.js';
import Monster, { defineMonster } from './Monster.js';
import {
    MonsterAiDisposition,
    normalizeMonsterAiProfile,
    ThreatAction,
    ThreatTable,
} from './Threat.js';

class ThreatEntity extends Entity {
    constructor(override readonly name: string) {
        super(1, 0, 'threat-test', { maxLife: 100 }, Equipment.createEmpty());
    }
}

class ThreatPlayer extends ThreatEntity {
    override get isPlayer(): boolean { return true; }
    override get playerUserId(): number { return this.userId; }

    constructor(readonly userId: number, name: string) { super(name); }
}

defineMonster({
    id: 'defeat_credit_test_monster',
    name: '처치 기여 시험 몬스터',
    description: '',
    level: 1,
    exp: 0,
    baseAttribute: { maxLife: 100 },
    drops: [],
    expReward: 0,
    equipments: [],
    tags: [GameTags.ENTITY_MONSTER],
});

test('단순 AI는 누적 피해와 무관하게 마지막 공격자를 선택한다', () => {
    const owner = new ThreatEntity('슬라임');
    const first = new ThreatEntity('첫 공격자');
    const last = new ThreatEntity('마지막 공격자');
    const table = new ThreatTable(owner, normalizeMonsterAiProfile({
        disposition: MonsterAiDisposition.LAST_ATTACKER,
        intelligence: 5,
    }));
    table.record(first, ThreatAction.DAMAGE, 100);
    table.record(last, ThreatAction.ATTACK, 1);
    assert.equal(table.selectTarget(first), last);
    table.dispose();
});

test('지능형 AI는 마스터 행동 가중치와 도발 저항으로 대상을 선택한다', () => {
    const owner = new ThreatEntity('보스');
    const dealer = new ThreatEntity('딜러');
    const healer = new ThreatEntity('힐러');
    const taunter = new ThreatEntity('도발자');
    const profile = normalizeMonsterAiProfile({
        disposition: MonsterAiDisposition.THREAT,
        intelligence: 90,
        weights: { damage: 1, healing: 2, taunt: 4 },
        tauntResistance: 0.9,
        switchThreshold: 0,
    });
    const table = new ThreatTable(owner, profile);
    table.record(dealer, ThreatAction.DAMAGE, 100);
    table.record(healer, ThreatAction.HEALING, 120);
    assert.equal(table.selectTarget(dealer), healer);
    table.record(taunter, ThreatAction.TAUNT, 200);
    assert.equal(table.selectTarget(healer), healer);
    assert.equal(table.getContributionSnapshots()[0].actor, healer);
    table.dispose();
});

test('교전 대상 치유는 source가 명시되면 관련 위협 테이블에 자동 기록된다', () => {
    const owner = new ThreatEntity('보스');
    const tank = new ThreatEntity('탱커');
    const healer = new ThreatEntity('힐러');
    const table = new ThreatTable(owner, normalizeMonsterAiProfile({ weights: { healing: 2 }, switchThreshold: 0 }));
    table.record(tank, ThreatAction.DAMAGE, 10);
    tank.damage(30, 'absolute');
    tank.heal(20, healer);
    assert.equal(table.selectTarget(tank), healer);
    assert.equal(table.getContributionSnapshots().find(entry => entry.actor === healer)?.healing, 20);
    table.dispose();
});

test('처치 기여 원장은 AI 대상이 이탈해도 userId 불변 스냅샷으로 보존되고 clear에서만 초기화된다', () => {
    const owner = new ThreatEntity('보스');
    const dealer = new ThreatPlayer(101, '딜러');
    const table = new ThreatTable(owner, normalizeMonsterAiProfile());
    table.record(dealer, ThreatAction.DAMAGE, 25);

    dealer.life = 0;
    table.update(1);
    assert.deepEqual(table.getContributionSnapshots(), []);
    const snapshot = table.getDefeatContributionSnapshot();
    assert.deepEqual(snapshot, [{
        userId: dealer.userId,
        damage: 25,
        healing: 0,
        shielding: 0,
        control: 0,
        total: 25,
    }]);
    assert.equal(Object.isFrozen(snapshot), true);
    assert.equal(Object.isFrozen(snapshot[0]), true);

    table.clear();
    assert.deepEqual(table.getDefeatContributionSnapshot(), []);
    table.dispose();
});

test('Monster는 양수 처치 기여 userId만 중복 없이 불변 스냅샷으로 공개한다', () => {
    const monster = new Monster('defeat_credit_test_monster', 'threat-test');
    const first = new ThreatPlayer(201, '첫 기여자');
    const duplicate = new ThreatPlayer(201, '같은 계정의 다른 공격체');
    const second = new ThreatPlayer(202, '둘째 기여자');
    const noContribution = new ThreatPlayer(203, '도발만 한 플레이어');

    monster.recordThreat(noContribution, ThreatAction.TAUNT, 100);
    assert.deepEqual(monster.getDefeatCreditUserIds(), []);
    monster.recordThreat(first, ThreatAction.DAMAGE, 20);
    monster.recordThreat(duplicate, ThreatAction.CONTROL, 5);
    monster.recordThreat(second, ThreatAction.HEALING, 10);

    const snapshot = monster.getDefeatCreditUserIds();
    assert.deepEqual(snapshot, [201, 202]);
    assert.equal(Object.isFrozen(snapshot), true);
});
