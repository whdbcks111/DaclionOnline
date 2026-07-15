import assert from 'node:assert/strict';
import test from 'node:test';
import type { AttributeRecord } from './Attribute.js';
import Entity from './Entity.js';
import Equipment from './Equipment.js';
import { ActionType } from './Action.js';
import { calculateEvasionChance, rollEvasion } from './Combat.js';

class TestEntity extends Entity {
    override readonly name: string;

    constructor(name: string, attributes: Partial<AttributeRecord> = {}) {
        super(1, 0, 'combat-test', { maxLife: 100, ...attributes }, Equipment.createEmpty());
        this.name = name;
    }
}

test('속도 비율 2배는 50%, 3배 이상은 최대 90% 회피율을 만든다', () => {
    assert.equal(calculateEvasionChance(100, 100), 0);
    assert.equal(calculateEvasionChance(100, 200), 0.5);
    assert.equal(calculateEvasionChance(100, 300), 0.9);
    assert.equal(calculateEvasionChance(100, 1_000), 0.9);
    assert.equal(rollEvasion(0.5, () => 0.49), true);
    assert.equal(rollEvasion(0.5, () => 0.5), false);
});

test('일반 공격은 회피되지만 회피 불가 옵션과 이동 제한은 회피를 무시한다', () => {
    const attacker = new TestEntity('공격자', { atk: 10, speed: 100, critRate: 0 });
    const target = new TestEntity('피격자', { speed: 300 });
    const originalRandom = Math.random;

    try {
        Math.random = () => 0;
        const evaded = attacker.attack(target, 'physical', 10, { consumeMainHandDurability: false });
        assert.ok(evaded);
        assert.equal(evaded.evaded, true);
        assert.equal(evaded.finalDamage, 0);
        assert.equal(target.life, 100);

        attacker.earlyUpdate(attacker.maxAttackCooldown);
        const unavoidable = attacker.attack(target, 'physical', 10, {
            unavoidable: true,
            consumeMainHandDurability: false,
        });
        assert.ok(unavoidable);
        assert.equal(unavoidable.evaded, false);
        assert.equal(target.life, 90);

        attacker.earlyUpdate(attacker.maxAttackCooldown);
        target.disableActionForTick(ActionType.MOVEMENT, 'test:paralysis');
        const movementDisabled = attacker.attack(target, 'physical', 10, {
            consumeMainHandDurability: false,
        });
        assert.ok(movementDisabled);
        assert.equal(movementDisabled.evaded, false);
        assert.equal(target.life, 80);
    } finally {
        Math.random = originalRandom;
    }
});

test('고정 피해 옵션은 치명타·속성 타입별 방어·관통 계산 없이 정확한 피해를 준다', () => {
    const attacker = new TestEntity('공격자', { critRate: 1, critDmg: 10, speed: 100 });
    const target = new TestEntity('피격자', { def: 100, magicDef: 100, speed: 100 });
    const result = attacker.attack(target, 'magic', 25, {
        fixedDamage: true,
        unavoidable: true,
        consumeMainHandDurability: false,
    });

    assert.ok(result);
    assert.equal(result.fixedDamage, true);
    assert.equal(result.critical, false);
    assert.equal(result.rawAmount, 25);
    assert.equal(result.finalDamage, 25);
    assert.equal(target.life, 75);
});
