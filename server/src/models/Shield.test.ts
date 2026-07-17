import assert from 'node:assert/strict';
import test from 'node:test';
import Entity from './Entity.js';
import Equipment from './Equipment.js';
import { ShieldType } from './Shield.js';

class TestEntity extends Entity {
    override readonly name = '보호막 시험체';

    constructor() {
        super(1, 0, 'shield-test', { maxLife: 100, def: 0, magicDef: 0 }, Equipment.createEmpty());
    }
}

test('보호막 타입은 클래스형 enum 조회와 피해 타입 제한을 제공한다', () => {
    assert.deepEqual(ShieldType.values().map(type => type.key), ['general', 'physical', 'magic']);
    assert.equal(ShieldType.fromKey('physical'), ShieldType.PHYSICAL);
    assert.equal(ShieldType.fromInput('마법'), ShieldType.MAGIC);
    assert.equal(ShieldType.GENERAL.absorbs('absolute'), true);
    assert.equal(ShieldType.PHYSICAL.absorbs('magic'), false);
    assert.equal(ShieldType.MAGIC.absorbs('physical'), false);
});

test('서로 다른 key 보호막은 중첩되고 맞는 타입 중 남은 시간이 짧은 순서로 소모된다', () => {
    const target = new TestEntity();
    target.setShield('general:long', 10, ShieldType.GENERAL, 10);
    target.setShield('general:short', 10, ShieldType.GENERAL, 2);
    target.setShield('physical:shortest', 5, ShieldType.PHYSICAL, 1);
    target.setShield('magic:ignored', 20, ShieldType.MAGIC, 0.5);

    const physical = target.damage(20, 'physical');
    assert.equal(physical.finalDamage, 20);
    assert.equal(physical.absorbedDamage, 20);
    assert.equal(physical.lifeDamage, 0);
    assert.equal(target.life, 100);
    assert.equal(target.hasShield('physical:shortest'), false);
    assert.equal(target.hasShield('general:short'), false);
    assert.equal(target.getShield('general:long')?.amount, 5);
    assert.equal(target.getShield('magic:ignored')?.amount, 20);

    const magic = target.damage(25, 'magic');
    assert.equal(magic.absorbedDamage, 25);
    assert.equal(magic.lifeDamage, 0);
    assert.equal(target.getTotalShield(), 0);
    assert.equal(target.life, 100);
});

test('같은 key는 교체되고 지속시간 만료와 절대 피해 규칙이 적용된다', () => {
    const target = new TestEntity();
    target.setShield('skill:barrier', 10, ShieldType.GENERAL, 5);
    target.setShield('skill:barrier', 30, ShieldType.MAGIC, 2);
    assert.equal(target.getShieldDisplaySnapshots().length, 1);
    assert.equal(target.getShield('skill:barrier')?.amount, 30);
    assert.equal(target.getShield('skill:barrier')?.type, ShieldType.MAGIC);

    const absolute = target.damage(5, 'absolute');
    assert.equal(absolute.absorbedDamage, 0);
    assert.equal(absolute.lifeDamage, 5);
    assert.equal(target.life, 95);
    assert.equal(target.getShield('skill:barrier')?.amount, 30);

    target.earlyUpdate(2);
    assert.equal(target.hasShield('skill:barrier'), false);
});

test('생명력이 소진되면 남아 있는 비호환 보호막도 제거된다', () => {
    const target = new TestEntity();
    target.setShield('magic:remaining', 50, ShieldType.MAGIC, 10);
    const result = target.damage(100, 'physical');
    assert.equal(result.remainingLife, 0);
    assert.equal(result.remainingShield, 0);
    assert.equal(target.getTotalShield(), 0);
});
