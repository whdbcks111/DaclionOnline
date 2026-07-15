import assert from 'node:assert/strict';
import test from 'node:test';
import { GameTags } from '../../../shared/tags.js';
import Entity from './Entity.js';
import Equipment from './Equipment.js';
import {
    StatusEffectApplyAction,
    StatusEffectRemovalReason,
    StatusEffectType,
} from './StatusEffect.js';
import { defineTagEffectModifier } from './TagEffect.js';
import type { TagId } from '../../../shared/tags.js';
import { ActionType } from './Action.js';

class TestStatusEntity extends Entity {
    override readonly name: string;

    constructor(name: string, tags: readonly TagId[] = [], maxLife = 1000) {
        super(1, 0, 'status_test', { maxLife }, Equipment.createEmpty(), undefined, tags);
        this.name = name;
    }
}

let starts = 0;
let updates = 0;
let removes = 0;
const MERGE_TEST_EFFECT = StatusEffectType.define({
    id: 'test_merge_effect',
    label: '병합 시험',
    maxLevel: 5,
    descriptionTemplate: '레벨 {{level}}, 값 {{meta.runtimeValue}}, 계산 {{calc.doubled}}',
    baseMetadata: { runtimeValue: 0 },
    calculatedFields: {
        doubled: ({ effect }) => effect.level * 2,
    },
    onStart: ({ effect }) => {
        starts++;
        effect.setMetadata('runtimeValue', 7);
    },
    onUpdate: ({ effect }, dt) => {
        updates++;
        effect.setMetadata('elapsedByCallback', (effect.getMetadata<number>('elapsedByCallback') ?? 0) + dt);
    },
    onRemove: () => { removes++; },
});

test('같은 상태효과 재적용은 인스턴스와 metadata를 유지하며 레벨·지속시간 규칙을 따른다', () => {
    const target = new TestStatusEntity('병합 대상');
    starts = 0;
    updates = 0;

    const added = target.applyStatusEffect(MERGE_TEST_EFFECT, 10, 2);
    const effect = added.effect!;
    assert.equal(added.action, StatusEffectApplyAction.ADDED);
    assert.equal(starts, 1);
    assert.equal(effect.getMetadata('runtimeValue'), 7);

    target.updateStatusEffects(2);
    assert.equal(effect.duration, 8);
    assert.equal(updates, 1);

    const refreshed = target.applyStatusEffect(MERGE_TEST_EFFECT, 9, 2);
    assert.equal(refreshed.action, StatusEffectApplyAction.REFRESHED);
    assert.equal(refreshed.effect, effect);
    assert.equal(effect.duration, 9);
    assert.equal(effect.maxDuration, 10);

    const ignored = target.applyStatusEffect(MERGE_TEST_EFFECT, 99, 1);
    assert.equal(ignored.action, StatusEffectApplyAction.IGNORED);
    assert.equal(effect.duration, 9);

    const upgraded = target.applyStatusEffect(MERGE_TEST_EFFECT, 4, 3);
    assert.equal(upgraded.action, StatusEffectApplyAction.UPGRADED);
    assert.equal(upgraded.effect, effect);
    assert.equal(effect.level, 3);
    assert.equal(effect.duration, 4);
    assert.equal(effect.maxDuration, 4);
    assert.equal(effect.getMetadata('runtimeValue'), 7);
    assert.equal(starts, 1);

    target.updateStatusEffects(1);
    assert.equal(updates, 2);
    assert.equal(effect.getMetadata('elapsedByCallback'), 3);
    assert.equal(effect.formatDescription(target), '레벨 3, 값 7, 계산 6');
    assert.deepEqual(target.getStatusEffectDisplaySnapshots(), [{
        id: 'test_merge_effect',
        label: '병합 시험',
        icon: 'status-effects/test_merge_effect',
        level: 3,
        duration: 3,
        maxDuration: 4,
        durationRatio: 0.75,
        description: '레벨 3, 값 7, 계산 6',
    }]);
});

test('상태효과는 만료·직접 제거 시 callback을 실행하고 Entity 목록에서 제거된다', () => {
    const target = new TestStatusEntity('제거 대상');
    removes = 0;
    target.applyStatusEffect(MERGE_TEST_EFFECT, 1, 1);
    target.updateStatusEffects(1);
    assert.equal(target.hasStatusEffect(MERGE_TEST_EFFECT), false);
    assert.equal(removes, 1);

    target.applyStatusEffect(MERGE_TEST_EFFECT, 5, 1);
    assert.equal(target.removeStatusEffect(MERGE_TEST_EFFECT, StatusEffectRemovalReason.MANUAL), true);
    assert.equal(removes, 2);
});

test('화염은 1초마다 불 속성 상성을 적용하고 누적 시간 초과 시 화상을 부여한다', () => {
    defineTagEffectModifier(GameTags.PROPERTY_FIRE, GameTags.PROPERTY_NATURAL, 1.5);
    const target = new TestStatusEntity('화염 대상', [GameTags.TRAIT_LIVING, GameTags.PROPERTY_NATURAL]);
    target.applyStatusEffect(StatusEffectType.FIRE, 30, 1);

    target.updateStatusEffects(1);
    assert.equal(target.life, target.maxLife - 5.25);
    assert.equal(target.hasStatusEffect(StatusEffectType.BURN), false);

    target.updateStatusEffects(18);
    assert.equal(target.hasStatusEffect(StatusEffectType.BURN), false);
    target.updateStatusEffects(0.1);
    const burn = target.getStatusEffect(StatusEffectType.BURN);
    assert.equal(burn?.level, 1);
    assert.equal(burn?.duration, 10);
});

test('10레벨 화염은 누적 10초 초과 시 5레벨 20초 화상을 부여한다', () => {
    const target = new TestStatusEntity('고레벨 화염 대상', [GameTags.TRAIT_LIVING], 2000);
    target.applyStatusEffect(StatusEffectType.FIRE, 30, 10);
    target.updateStatusEffects(10);
    assert.equal(target.hasStatusEffect(StatusEffectType.BURN), false);
    target.updateStatusEffects(0.1);
    const burn = target.getStatusEffect(StatusEffectType.BURN);
    assert.equal(burn?.level, 5);
    assert.equal(burn?.duration, 20);
});

test('화상은 생명체에게만 적용되고 20레벨에서 받는 치유량을 50% 감소시킨다', () => {
    const object = new TestStatusEntity('무생물', [GameTags.TRAIT_INANIMATE]);
    const rejected = object.applyStatusEffect(StatusEffectType.BURN, 10, 1);
    assert.equal(rejected.action, StatusEffectApplyAction.REJECTED);
    assert.equal(object.hasStatusEffect(StatusEffectType.BURN), false);

    const living = new TestStatusEntity('생명체', [GameTags.TRAIT_LIVING]);
    living.life = 100;
    living.applyStatusEffect(StatusEffectType.BURN, 10, 20);
    const reduced = living.heal(100);
    assert.equal(reduced.modifier, 0.5);
    assert.equal(reduced.healedAmount, 50);

    living.removeStatusEffect(StatusEffectType.BURN);
    const normal = living.heal(100);
    assert.equal(normal.modifier, 1);
    assert.equal(normal.healedAmount, 100);
});

test('맹독은 생명체에게만 적용되고 0.5초마다 잃은 체력·레벨 비례 피해와 치유 감소를 준다', () => {
    const object = new TestStatusEntity('맹독 무효 대상', [GameTags.TRAIT_INANIMATE]);
    assert.equal(
        object.applyStatusEffect(StatusEffectType.DEADLY_POISON, 10, 1).action,
        StatusEffectApplyAction.REJECTED,
    );

    const living = new TestStatusEntity('맹독 대상', [GameTags.TRAIT_LIVING]);
    living.applyStatusEffect(StatusEffectType.DEADLY_POISON, 10, 1);
    living.updateStatusEffects(0.5);
    assert.equal(living.life, living.maxLife - 5);

    const firstDamage = living.maxLife - living.life;
    living.updateStatusEffects(0.5);
    const secondDamage = living.maxLife - living.life - firstDamage;
    assert.ok(secondDamage > firstDamage);

    living.life = 100;
    const healed = living.heal(100);
    assert.equal(healed.modifier, 0.5);
    assert.equal(healed.healedAmount, 50);
    living.removeStatusEffect(StatusEffectType.DEADLY_POISON);
    assert.equal(living.getHealingReceivedModifier(), 1);
});

test('마비독 earlyUpdate 제한은 source별로 한 tick만 유지되고 다른 제한과 충돌하지 않는다', () => {
    const living = new TestStatusEntity('마비 대상', [GameTags.TRAIT_LIVING]);
    const paralysis = living.applyStatusEffect(StatusEffectType.PARALYTIC_POISON, 10, 1).effect!;
    paralysis.setMetadata('minDisableChance', 1);
    paralysis.setMetadata('maxDisableChance', 1);

    living.earlyUpdate(0.05);
    assert.equal(living.canPerformAction(ActionType.SKILL), false);
    assert.equal(living.canPerformAction(ActionType.ATTACK), false);
    assert.equal(living.canPerformAction(ActionType.MOVEMENT), false);
    assert.equal(living.canPerformAction(ActionType.LOCATION_TRAVEL), false);
    assert.equal(living.canPerformAction(ActionType.CHAT), true);
    assert.equal(living.canPerformAction(ActionType.COMMAND), true);

    living.removeStatusEffect(StatusEffectType.PARALYTIC_POISON);
    living.disableAction(ActionType.ATTACK, 'test:stun');
    living.disableAction(ActionType.ATTACK, 'test:fear');
    assert.equal(living.enableAction(ActionType.ATTACK, 'test:stun'), true);
    assert.equal(living.canPerformAction(ActionType.ATTACK), false);
    living.earlyUpdate(0.05);
    assert.equal(living.canPerformAction(ActionType.ATTACK), false);
    assert.equal(living.enableAction(ActionType.ATTACK, 'test:fear'), true);
    assert.equal(living.canPerformAction(ActionType.ATTACK), true);

    living.disableAction(ActionType.SKILL, 'test:combined');
    living.disableActionForTick(ActionType.MOVEMENT, 'test:combined');
    assert.equal(living.releaseActionDisableSource('test:combined'), true);
    assert.equal(living.canPerformAction(ActionType.SKILL), true);
    assert.equal(living.canPerformAction(ActionType.MOVEMENT), true);
});
