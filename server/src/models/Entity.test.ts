import assert from 'node:assert/strict';
import test from 'node:test';
import Entity from './Entity.js';
import Equipment from './Equipment.js';

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
