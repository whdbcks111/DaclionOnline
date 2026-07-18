import assert from 'node:assert/strict';
import test from 'node:test';
import Entity from './Entity.js';
import Equipment from './Equipment.js';
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
