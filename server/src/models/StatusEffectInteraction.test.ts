import assert from 'node:assert/strict';
import test from 'node:test';
import { GameTags } from '../../../shared/tags.js';
import { LegacyStatusEffects } from '../data/statusEffects.js';
import { ActionType } from './Action.js';
import Entity from './Entity.js';
import Equipment from './Equipment.js';
import { StatusEffectApplyAction, StatusEffectType } from './StatusEffect.js';
import { getStatusEffectInteractionSnapshots } from './StatusEffectInteraction.js';

class InteractionEntity extends Entity {
    constructor(readonly name: string) {
        super(1, 0, 'interaction:test', { maxLife: 1000 }, Equipment.createEmpty(), undefined, [GameTags.TRAIT_LIVING]);
    }
}

test('화염과 빙결은 레벨 곱하기 남은 시간의 세기로 상쇄된다', () => {
    const weakerFire = new InteractionEntity('약한 화염 대상');
    weakerFire.applyStatusEffect(LegacyStatusEffects.FROZEN, 10, 2);
    const rejected = weakerFire.applyStatusEffect(StatusEffectType.FIRE, 5, 1);
    assert.equal(rejected.action, StatusEffectApplyAction.REJECTED);
    assert.equal(weakerFire.getStatusEffect(LegacyStatusEffects.FROZEN)?.duration, 7.5);

    const strongerFire = new InteractionEntity('강한 화염 대상');
    strongerFire.applyStatusEffect(LegacyStatusEffects.FROZEN, 10, 2);
    const applied = strongerFire.applyStatusEffect(StatusEffectType.FIRE, 10, 4);
    assert.equal(applied.action, StatusEffectApplyAction.ADDED);
    assert.equal(strongerFire.hasStatusEffect(LegacyStatusEffects.FROZEN), false);
    assert.equal(applied.effect?.duration, 5);

    const equal = new InteractionEntity('동일 세기 대상');
    equal.applyStatusEffect(LegacyStatusEffects.FROZEN, 10, 2);
    assert.equal(equal.applyStatusEffect(StatusEffectType.FIRE, 5, 4).action, StatusEffectApplyAction.REJECTED);
    assert.equal(equal.hasStatusEffect(LegacyStatusEffects.FROZEN), false);
    assert.equal(equal.hasStatusEffect(StatusEffectType.FIRE), false);
});

test('해독과 속성 저항은 기존 효과를 제거하고 새 효과를 차단한다', () => {
    const target = new InteractionEntity('저항 대상');
    target.applyStatusEffect(StatusEffectType.DEADLY_POISON, 10, 3);
    target.applyStatusEffect(LegacyStatusEffects.DETOXIFICATION, 20, 1);
    assert.equal(target.hasStatusEffect(StatusEffectType.DEADLY_POISON), false);
    assert.equal(
        target.applyStatusEffect(StatusEffectType.PARALYTIC_POISON, 10, 20).action,
        StatusEffectApplyAction.REJECTED,
    );

    target.applyStatusEffect(StatusEffectType.FIRE, 10, 2);
    target.applyStatusEffect(LegacyStatusEffects.FIRE_RESISTANCE, 20, 1);
    assert.equal(target.hasStatusEffect(StatusEffectType.FIRE), false);
    assert.equal(target.applyStatusEffect(StatusEffectType.FIRE, 10, 10).action, StatusEffectApplyAction.REJECTED);
});

test('무적·수면·실명은 피해와 행동 경계 API로 작동한다', () => {
    const target = new InteractionEntity('제어 대상');
    target.applyStatusEffect(LegacyStatusEffects.INVULNERABLE, 10, 1);
    const blocked = target.damage(100, 'absolute', { type: 'void', causeEntity: null, fixedDamage: true });
    assert.equal(blocked.lifeDamage, 0);
    target.removeStatusEffect(LegacyStatusEffects.INVULNERABLE);
    assert.equal(target.damage(100, 'absolute').lifeDamage, 100);

    target.applyStatusEffect(LegacyStatusEffects.SLEEP, 10, 1);
    assert.equal(target.canPerformAction(ActionType.SKILL), false);
    target.damage(1, 'absolute');
    assert.equal(target.hasStatusEffect(LegacyStatusEffects.SLEEP), false);
    assert.equal(target.canPerformAction(ActionType.SKILL), true);

    target.applyStatusEffect(LegacyStatusEffects.BLINDNESS, 10, 1);
    target.earlyUpdate(0.05);
    assert.equal(target.canPerformAction(ActionType.EVASION), false);
    assert.equal(target.canPerformAction(ActionType.MOVEMENT), true);
});

test('레거시 효과 registry와 상호작용 표는 기능별 공개 API로 조회된다', () => {
    assert.ok(Object.keys(LegacyStatusEffects).length >= 30);
    const snapshots = getStatusEffectInteractionSnapshots();
    assert.ok(snapshots.some(rule => rule.incomingId === 'fire' && rule.existingId === 'frozen'));
    assert.ok(snapshots.some(rule => rule.incomingId === 'deadly_poison' && rule.existingId === 'detoxification'));
});
