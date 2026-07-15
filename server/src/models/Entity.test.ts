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

test('배고픔과 수분 감소량 능력치는 생존 자원을 초당 감소시키고 0에서 멈춘다', () => {
    const entity = new VitalEntity();
    entity.attribute.addModifiers([
        { attribute: 'hungerDrain', op: 'add', value: 0.99, source: 'test:needs' },
        { attribute: 'thirstDrain', op: 'add', value: 1.98, source: 'test:needs' },
    ]);

    entity.depleteSurvivalNeeds(10);
    assert.equal(entity.hungry, 50);
    assert.equal(entity.thirsty, 50);

    entity.depleteSurvivalNeeds(100);
    assert.equal(entity.hungry, 0);
    assert.equal(entity.thirsty, 0);

    entity.hungry = 10;
    entity.thirsty = 10;
    entity.isDead = true;
    entity.depleteSurvivalNeeds(10);
    assert.equal(entity.hungry, 10);
    assert.equal(entity.thirsty, 10);
    assert.equal(AttributeType.HUNGER_DRAIN.format(0.01), '0.01/초');
    assert.equal(AttributeType.THIRST_DRAIN.getDescription(0.02), '초당 수분이 0.02 감소합니다.');
});
