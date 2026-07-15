import assert from 'node:assert/strict';
import test from 'node:test';
import Entity from './Entity.js';
import Equipment from './Equipment.js';
import { AttributeType } from './Attribute.js';

class VitalEntity extends Entity {
    override readonly name = '자원 상한 시험체';

    constructor() {
        super(1, 0, 'test', {
            maxLife: 100,
            maxMentality: 80,
            maxThirsty: 70,
            maxHungry: 60,
        }, Equipment.createEmpty());
    }
}

test('최대 자원 modifier가 사라지면 현재 생명력과 자원값을 새 최대값으로 clamp한다', () => {
    const entity = new VitalEntity();
    entity.attribute.addModifiers([
        { attribute: 'maxLife', op: 'add', value: 100, source: 'test:boost' },
        { attribute: 'maxMentality', op: 'add', value: 40, source: 'test:boost' },
        { attribute: 'maxThirsty', op: 'add', value: 30, source: 'test:boost' },
        { attribute: 'maxHungry', op: 'add', value: 20, source: 'test:boost' },
    ]);
    entity.life = entity.maxLife;
    entity.mentality = entity.maxMentality;
    entity.thirsty = entity.maxThirsty;
    entity.hungry = entity.maxHungry;

    entity.attribute.removeBySource('test:boost');
    entity.earlyUpdate(0);
    assert.equal(entity.life, 100);
    assert.equal(entity.mentality, 80);
    assert.equal(entity.thirsty, 70);
    assert.equal(entity.hungry, 60);
    assert.equal(entity.clampVitals(), false);
});

test('생명력과 정신력 재생 능력치는 매초 실제 자원을 회복한다', () => {
    const entity = new VitalEntity();
    entity.life = 90;
    entity.mentality = 70;
    entity.attribute.addModifiers([
        { attribute: 'lifeRegen', op: 'add', value: 1, source: 'test:regen' },
        { attribute: 'mentalityRegen', op: 'multiply', value: 2, source: 'test:regen' },
    ]);
    entity.setHealingReceivedModifier('test:healing', 0.5);

    entity.earlyUpdate(1);

    assert.equal(entity.attribute.get(AttributeType.LIFE_REGEN), 2);
    assert.equal(entity.attribute.get(AttributeType.MENTALITY_REGEN), 2);
    assert.equal(entity.life, 91);
    assert.equal(entity.mentality, 72);
});

test('재생 능력치는 상태창 순회 목록과 표시 메타데이터를 제공한다', () => {
    assert.equal(AttributeType.fromKey('lifeRegen'), AttributeType.LIFE_REGEN);
    assert.equal(AttributeType.fromKey('mentalityRegen'), AttributeType.MENTALITY_REGEN);
    assert.equal(AttributeType.LIFE_REGEN.format(1), '1.00/초');
    assert.equal(AttributeType.MENTALITY_REGEN.getDescription(1), '초당 정신력을 1.00 회복합니다.');
});
