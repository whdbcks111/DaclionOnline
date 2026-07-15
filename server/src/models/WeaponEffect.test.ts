import assert from 'node:assert/strict';
import test from 'node:test';
import '../data/items.js';
import Entity from './Entity.js';
import Equipment from './Equipment.js';
import { Item } from './Item.js';
import { StatusEffectType } from './StatusEffect.js';
import { GameTags } from '../../../shared/tags.js';

class TestWeaponEntity extends Entity {
    override readonly name: string;

    constructor(name: string, equipment = Equipment.createEmpty(), tags: string[] = []) {
        super(1, 0, 'test', { maxLife: 100, atk: 10, def: 0 }, equipment, undefined, tags);
        this.name = name;
    }
}

test('장착 무기의 독 태그는 기본 물리 공격 전체를 무생물 면역으로 만들지 않는다', () => {
    const equipment = Equipment.createEmpty();
    const attacker = new TestWeaponEntity('독 단검 사용자', equipment);
    const dagger = new Item('venom_dagger', 1, 40, null);
    assert.equal(equipment.equip('mainHand', dagger, attacker.attribute), true);
    const target = new TestWeaponEntity('무생물 표적', Equipment.createEmpty(), [GameTags.TRAIT_INANIMATE]);

    const result = attacker.attack(target, 'physical', undefined, { unavoidable: true });

    assert.ok(result);
    assert.equal(result.effectModifier, 1);
    assert.ok(result.finalDamage > 0);
});

test('독 단검 적중 callback은 50% 판정 성공 시 생명체에게 8초 맹독을 부여한다', () => {
    const target = new TestWeaponEntity('생명체 표적', Equipment.createEmpty(), [GameTags.TRAIT_LIVING]);
    const equipment = Equipment.createEmpty();
    const attacker = new TestWeaponEntity('공격자', equipment);
    const weapon = new Item('venom_dagger', 1, 40, null);
    assert.equal(equipment.equip('mainHand', weapon, attacker.attribute), true);
    const originalRandom = Math.random;
    Math.random = () => 0.49;
    try {
        attacker.attack(target, 'physical', undefined, { unavoidable: true });
    } finally {
        Math.random = originalRandom;
    }

    const poison = target.getStatusEffect(StatusEffectType.DEADLY_POISON);
    assert.ok(poison);
    assert.equal(poison.level, 1);
    assert.equal(poison.duration, 8);
});
