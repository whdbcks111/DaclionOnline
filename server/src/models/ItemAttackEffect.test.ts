import assert from 'node:assert/strict';
import test from 'node:test';
import { GameTags } from '../../../shared/tags.js';
import '../data/items.js';
import '../data/statusEffects.js';
import Entity from './Entity.js';
import Equipment from './Equipment.js';
import { enchantWeapon } from './Forging.js';
import { Item } from './Item.js';
import { ItemAttackEffectType } from './ItemAttackEffect.js';
import { StatusEffectType } from './StatusEffect.js';

class EnchantTarget extends Entity {
    override readonly name = '마법 부여 시험 대상';
    constructor() {
        super(1, 0, 'enchant_test', { maxLife: 1_000 }, Equipment.createEmpty(), undefined, [GameTags.TRAIT_LIVING]);
    }
}

test('마법 부여는 무기 속성과 signature를 편향에 쓰고 인스턴스 효과를 한 번만 저장한다', () => {
    const weapon = new Item('forged_sword', 1, null, null, 0, [GameTags.PROPERTY_FIRE]);
    const rolls = [0, 0.9, 0.5, 0.5];
    const result = enchantWeapon(weapon, {
        enchanterUserId: 77,
        skillLevel: 3,
        sensibility: 500,
        random: () => rolls.shift() ?? 0.5,
    });

    assert.equal(result.success, true);
    assert.equal(result.effect?.type, ItemAttackEffectType.FIRE.id);
    assert.equal(weapon.attackEffects.length, 1);
    assert.equal(weapon.hasTag(GameTags.PROPERTY_FIRE), true);
    assert.equal(enchantWeapon(weapon, {
        enchanterUserId: 77, skillLevel: 3, sensibility: 500, random: () => 0,
    }).success, false);
});

test('마법 부여 적중 효과는 성공한 무기 공격 후 상태효과 registry를 통해 적용된다', () => {
    const weapon = new Item('forged_sword', 1, null, null);
    const result = enchantWeapon(weapon, {
        enchanterUserId: 77,
        skillLevel: 1,
        sensibility: 250,
        random: () => 0,
    });
    const attacker = new EnchantTarget();
    const target = new EnchantTarget();
    const damageResult = attacker.attack(target, 'physical', 10, {
        unavoidable: true,
        fixedDamage: true,
        consumeMainHandDurability: false,
    });

    assert.equal(result.effect?.type, ItemAttackEffectType.FIRE.id);
    assert.ok(damageResult);
    assert.deepEqual(weapon.triggerInstanceAttackEffects({
        attacker,
        target,
        result: damageResult!,
    }, () => 0), [ItemAttackEffectType.FIRE]);
    assert.equal(target.hasStatusEffect(StatusEffectType.FIRE), true);
});

test('마법 부여는 방어구와 소비 아이템을 거부한다', () => {
    const shield = new Item('old_shield', 1, null, null);
    assert.equal(enchantWeapon(shield, {
        enchanterUserId: 77, skillLevel: 1, sensibility: 500, random: () => 0,
    }).success, false);
});

test('마법 부여 각인은 상태이상 외 특수 효과까지 사용자용 설명을 제공한다', () => {
    for (const type of ItemAttackEffectType.values()) {
        assert.ok(type.label.length > 0);
        assert.ok(type.summary.length > 10);
        assert.ok(type.describe({
            type: type.id,
            chance: 0.25,
            duration: 5,
            level: 3,
            power: 0.2,
        }).length > 10);
        if (type.statusEffectId) assert.ok(StatusEffectType.fromKey(type.statusEffectId));
    }
    assert.ok(ItemAttackEffectType.values().some(type => type.statusEffectId === undefined));
});
