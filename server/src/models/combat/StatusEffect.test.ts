import assert from 'node:assert/strict';
import test from 'node:test';
import { GameTags } from '../../../../shared/tags.js';
import Entity, { ControlTargetProfile } from '../core/Entity.js';
import Equipment from '../economy/Equipment.js';
import {
    ControlCategory,
    StatusEffectApplyAction,
    StatusEffectRemovalReason,
    StatusEffectType,
} from './StatusEffect.js';
import { defineTagEffectModifier } from './TagEffect.js';
import type { TagId } from '../../../../shared/tags.js';
import { ActionType } from '../core/Action.js';
import { AttributeType } from '../core/Attribute.js';
import '../../data/combat/statusEffects.js';
import {
    WITCH_CURSE_STATUS_EFFECT,
    WITCH_GAZE_STATUS_EFFECT,
} from '../../data/combat/statusEffects.js';

class TestStatusEntity extends Entity {
    override readonly name: string;
    controlTimeMs = 0;

    constructor(name: string, tags: readonly TagId[] = [], maxLife = 1000) {
        super(1, 0, 'status_test', { maxLife }, Equipment.createEmpty(), undefined, tags);
        this.name = name;
    }

    protected override getControlDiminishingTimeMs(): number { return this.controlTimeMs; }
}

class TestSurvivalPlayer extends TestStatusEntity {
    override get isPlayer(): boolean { return true; }
}

test('독과 맹독 입력은 겹친 별칭 없이 서로 다른 정식 상태이상을 찾는다', () => {
    assert.equal(StatusEffectType.fromInput('독')?.id, 'poison');
    assert.equal(StatusEffectType.fromInput('맹독')?.id, 'deadly_poison');
    assert.equal(StatusEffectType.fromInput('deadly_poison')?.label, '맹독');
});

let starts = 0;
let updates = 0;
let removes = 0;
const MERGE_TEST_EFFECT = StatusEffectType.define({
    id: 'test_merge_effect',
    label: '병합 시험',
    descriptionTemplate: '레벨 {{level}}, 값 {{meta.runtimeValue}}, 계산 {{calc.doubled}}',
    baseMetadata: { runtimeValue: 0 },
    calculatedFields: {
        doubled: ({ effect }) => effect.level * 2,
    },
    calculatedFieldTooltips: {
        doubled: '효과 레벨 × 2',
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

const REJECTED_HARD_CONTROL = StatusEffectType.define({
    id: 'test_rejected_hard_control',
    label: '거부 제어 시험',
    descriptionTemplate: '항상 거부됩니다.',
    controlCategory: ControlCategory.HARD,
    onStart: () => 'remove',
});

test('제어 분류는 클래스형 enum 조회 API를 제공하고 일반 효과는 NONE을 사용한다', () => {
    assert.equal(ControlCategory.fromKey('hard'), ControlCategory.HARD);
    assert.equal(ControlCategory.fromInput('행동 방해'), ControlCategory.SOFT);
    assert.equal(ControlTargetProfile.fromInput('보스'), ControlTargetProfile.BOSS);
    assert.equal(MERGE_TEST_EFFECT.controlCategory, ControlCategory.NONE);
    assert.equal(StatusEffectType.fromKey('stun')?.controlCategory, ControlCategory.HARD);
    assert.equal(StatusEffectType.fromKey('silence')?.controlCategory, ControlCategory.SOFT);
    assert.equal(StatusEffectType.PARALYTIC_POISON.controlCategory, ControlCategory.NONE);

    const other = new TestStatusEntity('제어 저항 미적용 대상');
    const stun = StatusEffectType.fromKey('stun')!;
    const sleep = StatusEffectType.fromKey('sleep')!;
    assert.equal(other.applyStatusEffect(stun, 10, 1).effect?.duration, 10);
    other.removeStatusEffect(stun);
    assert.equal(other.applyStatusEffect(sleep, 10, 1).effect?.duration, 10);
});

test('마녀의 주시는 직접 해제할 수 없고 만료되면 5초 생명력 소진 저주로 전환된다', () => {
    const target = new TestStatusEntity('균열 참가자', [GameTags.TRAIT_LIVING], 1000);
    target.applyStatusEffect(WITCH_GAZE_STATUS_EFFECT, 1, 1);

    assert.equal(target.removeStatusEffect(WITCH_GAZE_STATUS_EFFECT), false);
    target.updateStatusEffects(1);
    assert.equal(target.hasStatusEffect(WITCH_GAZE_STATUS_EFFECT), false);
    assert.equal(target.hasStatusEffect(WITCH_CURSE_STATUS_EFFECT), true);
    assert.equal(target.removeStatusEffect(WITCH_CURSE_STATUS_EFFECT, StatusEffectRemovalReason.INTERACTION), false);

    target.updateStatusEffects(2.5);
    assert.equal(target.life, 500);
    target.updateStatusEffects(2.5);
    assert.equal(target.life, 0);
});

test('시스템 정상 귀환 제거는 마녀의 주시를 저주로 바꾸지 않는다', () => {
    const target = new TestStatusEntity('귀환자', [GameTags.TRAIT_LIVING]);
    target.applyStatusEffect(WITCH_GAZE_STATUS_EFFECT, 10, 1);

    assert.equal(target.removeStatusEffect(
        WITCH_GAZE_STATUS_EFFECT,
        StatusEffectRemovalReason.INVALID_TARGET,
    ), true);
    assert.equal(target.hasStatusEffect(WITCH_CURSE_STATUS_EFFECT), false);
});

test('hard 제어는 대상별 최초 저항과 12초 공유 점감 100/50/25/면역을 적용한다', () => {
    const cases = [
        { tags: [GameTags.ENTITY_BOSS, GameTags.ENTITY_MONSTER], durations: [1.25, 0.625, 0.3125] },
        { tags: [GameTags.ENTITY_MONSTER], durations: [2.5, 1.25, 0.625] },
        { tags: [GameTags.ENTITY_PLAYER], durations: [2, 1, 0.5] },
    ] as const;
    const controls = ['stun', 'sleep', 'charm', 'overmaster'].map(id => StatusEffectType.fromKey(id)!);

    for (const [caseIndex, scenario] of cases.entries()) {
        const target = new TestStatusEntity(`제어 대상 ${caseIndex}`, scenario.tags);
        for (let index = 0; index < 3; index++) {
            const result = target.applyStatusEffect(controls[index], 10, 1);
            assert.equal(result.action, StatusEffectApplyAction.ADDED);
            assert.equal(result.effect?.duration, scenario.durations[index]);
            target.removeStatusEffect(controls[index]);
        }
        assert.equal(
            target.applyStatusEffect(controls[3], 10, 1).action,
            StatusEffectApplyAction.REJECTED,
        );
    }
});

test('soft 제어는 hard와 별도 점감 bucket 및 더 완만한 대상 저항을 사용한다', () => {
    const boss = new TestStatusEntity('보스 제어 대상', [GameTags.ENTITY_BOSS, GameTags.ENTITY_MONSTER]);
    const stun = StatusEffectType.fromKey('stun')!;
    const slowness = StatusEffectType.fromKey('slowness')!;
    const silence = StatusEffectType.fromKey('silence')!;

    assert.equal(boss.applyStatusEffect(stun, 10, 1).effect?.duration, 1.25);
    boss.removeStatusEffect(stun);
    assert.equal(boss.applyStatusEffect(slowness, 10, 1).effect?.duration, 4);
    boss.removeStatusEffect(slowness);
    assert.equal(boss.applyStatusEffect(silence, 10, 1).effect?.duration, 2);
});

test('무시·거부된 제어는 점감 횟수를 소모하지 않고 사망 시 기록이 초기화된다', () => {
    const target = new TestStatusEntity('점감 기록 대상', [GameTags.ENTITY_BOSS, GameTags.ENTITY_MONSTER]);
    const stun = StatusEffectType.fromKey('stun')!;
    const sleep = StatusEffectType.fromKey('sleep')!;

    assert.equal(target.applyStatusEffect(stun, 1, 1).effect?.duration, 0.35);
    assert.equal(target.applyStatusEffect(stun, 1, 1).action, StatusEffectApplyAction.IGNORED);
    assert.equal(target.applyStatusEffect(REJECTED_HARD_CONTROL, 10, 1).action, StatusEffectApplyAction.REJECTED);
    target.removeStatusEffect(stun);
    assert.equal(target.applyStatusEffect(sleep, 10, 1).effect?.duration, 0.625);

    target.onDeath();
    target.respawn();
    assert.equal(target.applyStatusEffect(stun, 10, 1).effect?.duration, 1.25);

    target.removeStatusEffect(stun);
    target.controlTimeMs += 12_001;
    assert.equal(target.applyStatusEffect(sleep, 10, 1).effect?.duration, 1.25);
});

test('점감된 상위 레벨 제어는 기존 남은 시간을 줄이지 않으면서 실제 갱신만 charge를 사용한다', () => {
    const target = new TestStatusEntity('제어 강화 대상', [GameTags.ENTITY_MONSTER]);
    const stun = StatusEffectType.fromKey('stun')!;
    const sleep = StatusEffectType.fromKey('sleep')!;

    const first = target.applyStatusEffect(stun, 10, 1).effect!;
    assert.equal(first.duration, 2.5);
    const upgraded = target.applyStatusEffect(stun, 10, 2);
    assert.equal(upgraded.action, StatusEffectApplyAction.UPGRADED);
    assert.equal(first.duration, 2.5);
    target.removeStatusEffect(stun);

    // 추가와 실제 강화 두 번만 charge되어 세 번째 성공은 25% 점감이다.
    assert.equal(target.applyStatusEffect(sleep, 10, 1).effect?.duration, 0.625);
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
    assert.equal(
        effect.formatDescription(target, { calculationTooltips: true }),
        '레벨 3, 값 7, 계산 [tooltip=효과 레벨 × 2]6[/tooltip]',
    );
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

test('상태효과 source는 성공한 재적용만 교체하고 무시·무출처 갱신은 기존 귀속을 보존한다', () => {
    const target = new TestStatusEntity('source 병합 대상');
    const firstSource = new TestStatusEntity('첫 source');
    const secondSource = new TestStatusEntity('둘째 source');
    const effect = target.applyStatusEffect(MERGE_TEST_EFFECT, 10, 2, firstSource).effect!;
    assert.equal(effect.source, firstSource);

    const ignored = target.applyStatusEffect(MERGE_TEST_EFFECT, 99, 1, secondSource);
    assert.equal(ignored.action, StatusEffectApplyAction.IGNORED);
    assert.equal(effect.source, firstSource);

    target.updateStatusEffects(2);
    const refreshed = target.applyStatusEffect(MERGE_TEST_EFFECT, 9, 2, secondSource);
    assert.equal(refreshed.action, StatusEffectApplyAction.REFRESHED);
    assert.equal(effect.source, secondSource);

    target.updateStatusEffects(2);
    const sourceLessRefresh = target.applyStatusEffect(MERGE_TEST_EFFECT, 8, 2);
    assert.equal(sourceLessRefresh.action, StatusEffectApplyAction.REFRESHED);
    assert.equal(effect.source, secondSource);

    const upgraded = target.applyStatusEffect(MERGE_TEST_EFFECT, 4, 3, firstSource);
    assert.equal(upgraded.action, StatusEffectApplyAction.UPGRADED);
    assert.equal(effect.source, firstSource);
});

test('상태효과 레벨은 타입 상한 없이 적용되고 효과별 계산식이 강도를 제어한다', () => {
    const target = new TestStatusEntity('무제한 레벨 대상');
    const effect = target.applyStatusEffect(MERGE_TEST_EFFECT, 10, 100).effect!;
    assert.equal(effect.level, 100);
    assert.equal(effect.getCalculatedField('doubled', target), 200);
});

test('재생은 최대 생명력과 레벨에 비례해 직접 회복하고 치유 감소를 적용받는다', () => {
    const regeneration = StatusEffectType.fromKey('regeneration');
    assert.ok(regeneration);
    const target = new TestStatusEntity('재생 대상', [GameTags.TRAIT_LIVING], 1000);
    target.life = 100;
    target.setHealingReceivedModifier('test:heal-reduction', 0.5);
    const effect = target.applyStatusEffect(regeneration, 10, 10).effect!;

    assert.equal(effect.getCalculatedField('healPercent', target), 1.75);
    target.updateStatusEffects(1);
    assert.equal(target.life, 108.75);
});

test('영웅 효과는 레벨에 따라 획득 경험치를 높이고 제거 시 modifier를 정리한다', () => {
    const hero = StatusEffectType.fromKey('hero');
    assert.ok(hero);
    const target = new TestStatusEntity('현상금 사냥꾼', [GameTags.TRAIT_LIVING]);
    target.applyStatusEffect(hero, 900, 3);

    assert.equal(target.getExperienceGainModifier(), 1.25);
    assert.equal(target.getStatusEffect(hero)?.getCalculatedField('experienceBonusPercent', target), 25);
    target.removeStatusEffect(hero);
    assert.equal(target.getExperienceGainModifier(), 1);
});

test('쇠약의 저주는 공격력·마법력과 받는 치유량을 같은 source로 감소시킨다', () => {
    const curse = StatusEffectType.fromKey('curse');
    assert.ok(curse);
    const target = new TestStatusEntity('저주 대상', [GameTags.TRAIT_LIVING]);
    target.attribute.setBase(AttributeType.ATK, 100);
    target.attribute.setBase(AttributeType.MAGIC_FORCE, 100);
    target.life = 500;

    target.applyStatusEffect(curse, 10, 2);
    assert.equal(target.attribute.get(AttributeType.ATK), 90.25);
    assert.equal(target.attribute.get(AttributeType.MAGIC_FORCE), 90.25);
    assert.equal(target.heal(100).healedAmount, 92.16);

    target.removeStatusEffect(curse);
    assert.equal(target.attribute.get(AttributeType.ATK), 100);
    assert.equal(target.attribute.get(AttributeType.MAGIC_FORCE), 100);
    assert.equal(target.getHealingReceivedModifier(), 1);
});

test('석화는 아이템 사용을 남겨두고 전투·이동 행동을 제한하며 방어 성향을 바꾼다', () => {
    const petrification = StatusEffectType.fromKey('petrification');
    assert.ok(petrification);
    const target = new TestStatusEntity('석화 대상', [GameTags.TRAIT_LIVING]);
    target.attribute.setBase(AttributeType.DEF, 100);
    target.attribute.setBase(AttributeType.MAGIC_DEF, 100);

    target.applyStatusEffect(petrification, 10, 1);
    assert.equal(target.canPerformAction(ActionType.ATTACK), false);
    assert.equal(target.canPerformAction(ActionType.SKILL), false);
    assert.equal(target.canPerformAction(ActionType.MOVEMENT), false);
    assert.equal(target.canPerformAction(ActionType.EVASION), false);
    assert.equal(target.canPerformAction(ActionType.LOCATION_TRAVEL), false);
    assert.equal(target.canPerformAction(ActionType.ITEM_USE), true);
    assert.equal(target.attribute.get(AttributeType.DEF), 120);
    assert.equal(target.attribute.get(AttributeType.MAGIC_DEF), 80);

    target.removeStatusEffect(petrification);
    assert.equal(target.canPerformAction(ActionType.ATTACK), true);
    assert.equal(target.canPerformAction(ActionType.LOCATION_TRAVEL), true);
    assert.equal(target.attribute.get(AttributeType.DEF), 100);
    assert.equal(target.attribute.get(AttributeType.MAGIC_DEF), 100);
});

test('열병은 생명체의 속도·공격속도를 낮추고 수분 감소를 가속한다', () => {
    const sunFever = StatusEffectType.fromKey('sun_fever');
    assert.ok(sunFever);
    const object = new TestStatusEntity('열병 무효 대상', [GameTags.TRAIT_INANIMATE]);
    assert.equal(object.applyStatusEffect(sunFever, 10, 3).action, StatusEffectApplyAction.REJECTED);

    const living = new TestStatusEntity('열병 대상', [GameTags.TRAIT_LIVING]);
    living.attribute.setBase(AttributeType.SPEED, 10);
    living.attribute.setBase(AttributeType.ATTACK_SPEED, 10);
    living.applyStatusEffect(sunFever, 10, 3);
    assert.ok(Math.abs(living.attribute.get(AttributeType.SPEED) - 8.84736) < 1e-9);
    assert.ok(Math.abs(living.attribute.get(AttributeType.ATTACK_SPEED) - 8.84736) < 1e-9);
    assert.ok(Math.abs(living.attribute.get(AttributeType.THIRST_DRAIN) - 0.08) < 1e-9);

    living.removeStatusEffect(sunFever);
    assert.equal(living.attribute.get(AttributeType.SPEED), 10);
    assert.equal(living.attribute.get(AttributeType.ATTACK_SPEED), 10);
    assert.equal(living.attribute.get(AttributeType.THIRST_DRAIN), 0.02);
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

test('실전 부패 레벨은 플레이어급 생명력에서 초당 2% 상한을 지키며 단독 처형하지 않는다', () => {
    const decay = StatusEffectType.fromKey('decay')!;
    for (const sample of [
        { effectLevel: 3, duration: 8, maxLife: 2_000 },
        { effectLevel: 8, duration: 10, maxLife: 8_000 },
        { effectLevel: 10, duration: 12, maxLife: 12_000 },
        { effectLevel: 24, duration: 14, maxLife: 25_000 },
    ]) {
        const target = new TestStatusEntity(
            `부패 Lv.${sample.effectLevel} 대상`,
            [GameTags.TRAIT_LIVING],
            sample.maxLife,
        );
        target.applyStatusEffect(decay, sample.duration, sample.effectLevel);
        const expectedMultiplier = Math.max(0.8, Math.pow(0.99, sample.effectLevel));
        assert.ok(Math.abs(target.maxLife - sample.maxLife * expectedMultiplier) < 0.001);

        for (let second = 0; second < sample.duration; second++) {
            const lifeBeforeTick = target.life;
            const maxLifeBeforeTick = target.maxLife;
            target.updateStatusEffects(1);
            const lifeDamage = lifeBeforeTick - target.life;
            assert.ok(
                lifeDamage <= maxLifeBeforeTick * 0.02 + 0.001,
                `부패 Lv.${sample.effectLevel} ${second + 1}초 피해 ${lifeDamage}`,
            );
        }
        const lostRatio = 1 - target.life / sample.maxLife;
        assert.ok(lostRatio >= 0.05, `부패 Lv.${sample.effectLevel} 위험도 ${(lostRatio * 100).toFixed(2)}%`);
        assert.equal(target.isDefeated, false);
    }

    const refreshTarget = new TestStatusEntity('부패 갱신 대상', [GameTags.TRAIT_LIVING], 2_000);
    const applied = refreshTarget.applyStatusEffect(decay, 8, 3);
    refreshTarget.updateStatusEffects(2);
    const refreshed = refreshTarget.applyStatusEffect(decay, 8, 3);
    assert.equal(refreshed.action, StatusEffectApplyAction.REFRESHED);
    assert.equal(refreshed.effect, applied.effect);
    assert.equal(refreshTarget.getStatusEffects().filter(effect => effect.type === decay).length, 1);
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
    assert.equal(living.canPerformAction(ActionType.EVASION), false);
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

test('공복과 갈증은 상태효과로 생명력 재생을 막고 합산 60초 고갈 피해를 준다', () => {
    const target = new TestSurvivalPlayer('생존 대상', [GameTags.TRAIT_LIVING], 600);
    target.life = 300;
    target.hungry = 0;
    target.thirsty = 0;
    target.attribute.addModifiers([{ attribute: 'lifeRegen', op: 'add', value: 100, source: 'test:regen' }]);

    target.applyStatusEffect(StatusEffectType.HUNGER, 1000, 1);
    target.applyStatusEffect(StatusEffectType.THIRST, 1000, 1);
    assert.equal(target.attribute.get(AttributeType.LIFE_REGEN), 0);

    target.earlyUpdate(1);
    assert.equal(target.life, 290);
    assert.equal(target.hasStatusEffect(StatusEffectType.HUNGER), true);
    assert.equal(target.hasStatusEffect(StatusEffectType.THIRST), true);

    target.restoreHunger(10);
    target.removeStatusEffect(StatusEffectType.HUNGER);
    assert.equal(target.attribute.get(AttributeType.LIFE_REGEN), 0);
    target.restoreThirst(10);
    target.removeStatusEffect(StatusEffectType.THIRST);
    assert.equal(target.attribute.get(AttributeType.LIFE_REGEN), 101);
});

test('공복 상태가 60초 지속되면 레벨과 생명력 고갈 속도가 상승한다', () => {
    const target = new TestSurvivalPlayer('장기 공복 대상', [GameTags.TRAIT_LIVING], 600);
    target.hungry = 0;
    const effect = target.applyStatusEffect(StatusEffectType.HUNGER, 1000, 1).effect!;

    target.updateStatusEffects(59);
    target.life = target.maxLife;
    target.updateStatusEffects(1);

    assert.equal(effect.level, 2);
    assert.equal(effect.getCalculatedField('damagePercent', target), 2.08);
    const before = target.life;
    target.updateStatusEffects(1);
    assert.equal(before - target.life, 12.5);
});
