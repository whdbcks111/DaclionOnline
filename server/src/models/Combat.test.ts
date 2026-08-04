import assert from 'node:assert/strict';
import test from 'node:test';
import type { AttributeRecord } from './Attribute.js';
import Entity from './Entity.js';
import Equipment from './Equipment.js';
import { ActionType } from './Action.js';
import {
    calculateDefenseScale,
    calculateEvasionChance,
    calculateFinalDamage,
    calculateLevelGapDamageMultiplier,
    LEVEL_GAP_DAMAGE_DOUBLING_INTERVAL,
    LEVEL_GAP_DAMAGE_MAX_MULTIPLIER,
    LEVEL_GAP_DAMAGE_MIN_MULTIPLIER,
    rollEvasion,
} from './Combat.js';
import { CombatStage, registerCombatHook } from './CombatPipeline.js';
import { ShieldType } from './Shield.js';

class TestEntity extends Entity {
    override readonly name: string;

    constructor(name: string, attributes: Partial<AttributeRecord> = {}, level = 1) {
        super(level, 0, 'combat-test', { maxLife: 100, ...attributes }, Equipment.createEmpty());
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
    assert.equal(rollEvasion(1, () => 0.999999), true);
});

test('비례 방어 공식은 방어가 높을수록 피해를 줄이고 관통이 높을수록 피해를 복원한다', () => {
    const rawDamage = 1_000;
    const level = 100;
    assert.equal(calculateFinalDamage(rawDamage, 0, 0, level), rawDamage);
    assert.equal(calculateFinalDamage(rawDamage, 500, 500, level), rawDamage);

    const byDefense = [0, 100, 250, 500, 1_000]
        .map(defense => calculateFinalDamage(rawDamage, defense, 0, level));
    for (let index = 1; index < byDefense.length; index++) {
        assert.ok(byDefense[index] < byDefense[index - 1]);
    }

    const byPenetration = [0, 100, 250, 500]
        .map(penetration => calculateFinalDamage(rawDamage, 500, penetration, level));
    for (let index = 1; index < byPenetration.length; index++) {
        assert.ok(byPenetration[index] > byPenetration[index - 1]);
    }

    const scale = calculateDefenseScale(level);
    const effectiveDefense = 500;
    const expected = rawDamage * scale / (scale + effectiveDefense);
    assert.ok(Math.abs(byDefense[3] - expected) < 1e-10);
});

test('치명타 배율은 방어 적용 뒤에도 정확히 같은 비율을 유지한다', () => {
    const normal = calculateFinalDamage(100, 400, 75, 200);
    const critical = calculateFinalDamage(200, 400, 75, 200);
    assert.equal(critical, normal * 2);
});

test('Entity 피해는 낮은 방어 기준 레벨을 유지하면서 공격자·방어자 레벨 차이를 양방향 적용한다', () => {
    const attacker = new TestEntity('Lv.100 공격자', { speed: 1 }, 100);
    const sameLevelTarget = new TestEntity('Lv.100 방어자', { def: 100, speed: 1 }, 100);
    const highLevelTarget = new TestEntity('Lv.1000 방어자', { def: 100, speed: 1 }, 1_000);
    const highLevelAttacker = new TestEntity('Lv.1000 공격자', { speed: 1 }, 1_000);
    const lowLevelTarget = new TestEntity('Lv.100 방어자 2', { def: 100, speed: 1 }, 100);
    const cause = { type: 'attack', causeEntity: attacker } as const;

    const sameLevelDamage = sameLevelTarget.damage(100, 'physical', cause).finalDamage;
    const highTargetDamage = highLevelTarget.damage(100, 'physical', cause).finalDamage;
    const lowTargetDamage = lowLevelTarget.damage(100, 'physical', {
        type: 'attack',
        causeEntity: highLevelAttacker,
    }).finalDamage;
    const expected = calculateFinalDamage(100, 100, 0, 100);
    assert.equal(sameLevelDamage, expected);
    assert.equal(
        highTargetDamage,
        expected * calculateLevelGapDamageMultiplier(attacker.level, highLevelTarget.level),
    );
    assert.equal(
        lowTargetDamage,
        expected * calculateLevelGapDamageMultiplier(highLevelAttacker.level, lowLevelTarget.level),
    );
    assert.ok(highTargetDamage < sameLevelDamage);
    assert.ok(lowTargetDamage > sameLevelDamage);

    const environmentalTarget = new TestEntity('환경 피해 대상', { def: 100, speed: 1 }, 1_000);
    assert.equal(
        environmentalTarget.damage(100, 'physical').finalDamage,
        calculateFinalDamage(100, 100, 0, 1_000),
    );

    const selfDamageTarget = new TestEntity('자해 피해 대상', { def: 100, speed: 1 }, 1_000);
    assert.equal(
        selfDamageTarget.damage(100, 'physical', {
            type: 'attack',
            causeEntity: selfDamageTarget,
        }).finalDamage,
        calculateFinalDamage(100, 100, 0, 1_000),
    );
});

test('레벨차 피해 배율은 동레벨 1·상하한 0.5~2이며 반대 방향과 서로 역수다', () => {
    assert.equal(calculateLevelGapDamageMultiplier(1, 1), 1);
    assert.equal(calculateLevelGapDamageMultiplier(1_000, 1_000), 1);

    for (const gap of [1, 25, 100, 299]) {
        const higher = calculateLevelGapDamageMultiplier(500 + gap, 500);
        const lower = calculateLevelGapDamageMultiplier(500, 500 + gap);
        assert.ok(higher > 1 && higher < LEVEL_GAP_DAMAGE_MAX_MULTIPLIER);
        assert.ok(lower < 1 && lower > LEVEL_GAP_DAMAGE_MIN_MULTIPLIER);
        assert.ok(Math.abs(higher * lower - 1) < 1e-12, `gap=${gap}`);
    }

    assert.equal(
        calculateLevelGapDamageMultiplier(500 + LEVEL_GAP_DAMAGE_DOUBLING_INTERVAL, 500),
        LEVEL_GAP_DAMAGE_MAX_MULTIPLIER,
    );
    assert.equal(
        calculateLevelGapDamageMultiplier(500, 500 + LEVEL_GAP_DAMAGE_DOUBLING_INTERVAL),
        LEVEL_GAP_DAMAGE_MIN_MULTIPLIER,
    );
    assert.equal(calculateLevelGapDamageMultiplier(10_000, 0), LEVEL_GAP_DAMAGE_MAX_MULTIPLIER);
    assert.equal(calculateLevelGapDamageMultiplier(0, 10_000), LEVEL_GAP_DAMAGE_MIN_MULTIPLIER);
    assert.throws(() => calculateLevelGapDamageMultiplier(-1, 1), /attackerLevel/);
    assert.throws(() => calculateLevelGapDamageMultiplier(1, Number.NaN), /defenderLevel/);
});

test('방어 척도는 Lv.200까지 기존 곡선, 이후 연속적인 선형 곡선을 사용한다', () => {
    assert.equal(calculateDefenseScale(199), 696.005);
    assert.equal(calculateDefenseScale(200), 700);
    assert.equal(calculateDefenseScale(201), 704);
    assert.equal(calculateDefenseScale(350), 1_300);
    assert.equal(calculateDefenseScale(500), 1_900);
    assert.equal(calculateDefenseScale(1_000), 3_900);
});

test('비례 방어 공식은 Lv.1~1000에서 유한하고 잘못된 입력을 거부한다', () => {
    for (let level = 1; level <= 1_000; level++) {
        const damage = calculateFinalDamage(1_000_000, level * 10, level, level);
        assert.ok(Number.isFinite(damage));
        assert.ok(damage > 0 && damage <= 1_000_000);
    }

    assert.throws(() => calculateFinalDamage(-1, 0, 0, 1), /rawAmount/);
    assert.throws(() => calculateFinalDamage(1, Number.POSITIVE_INFINITY, 0, 1), /defense/);
    assert.throws(() => calculateFinalDamage(1, 0, -1, 1), /penetration/);
    assert.throws(() => calculateFinalDamage(1, 0, 0, Number.NaN), /referenceLevel/);
});

test('실제 생명력을 0으로 만든 원인은 흡수·0피해 후속 판정으로 덮어쓰지 않는다', () => {
    const first = new TestEntity('흡수된 공격자', { speed: 1 });
    const lethal = new TestEntity('실제 막타자', { speed: 1 });
    const target = new TestEntity('막타 기록 대상', { speed: 1 });
    const absorbedCause = { type: 'attack', causeEntity: first, fixedDamage: true } as const;
    const lethalCause = { type: 'poison', causeEntity: lethal, fixedDamage: true } as const;
    const lethalSnapshot = () => target.lastLethalDamageCause;

    target.setShield('test:lethal-cause', 100, ShieldType.GENERAL, 10, target);
    assert.equal(target.damage(100, 'absolute', absorbedCause).lifeDamage, 0);
    assert.equal(lethalSnapshot(), null);

    assert.equal(target.damage(100, 'absolute', lethalCause).lifeDamage, 100);
    assert.equal(lethalSnapshot()?.causeEntity, lethal);
    assert.equal(lethalSnapshot()?.type, 'poison');

    assert.equal(target.damage(100, 'absolute', absorbedCause).lifeDamage, 0);
    assert.equal(target.lastDamageCause?.causeEntity, first);
    assert.equal(lethalSnapshot()?.causeEntity, lethal);
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
        assert.equal(target.currentTarget, attacker);

        attacker.earlyUpdate(attacker.maxAttackCooldown);
        const unavoidable = attacker.attack(target, 'physical', 10, {
            unavoidable: true,
            consumeMainHandDurability: false,
        });
        assert.ok(unavoidable);
        assert.equal(unavoidable.evaded, false);
        assert.equal(target.life, 90);

        attacker.earlyUpdate(attacker.maxAttackCooldown);
        target.disableActionForTick(ActionType.EVASION, 'test:paralysis');
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

test('지속형 확정 회피는 같은 tick의 연속 공격을 모두 피하고 일회성 회피는 한 번만 소비된다', () => {
    const first = new TestEntity('첫 공격자', { atk: 10, speed: 100, critRate: 0 });
    const second = new TestEntity('둘째 공격자', { atk: 10, speed: 100, critRate: 0 });
    const target = new TestEntity('피격자', { speed: 100 });

    target.grantPersistentGuaranteedEvasion('test:wind-evasion');
    assert.equal(first.attack(target, 'physical', 10, { consumeMainHandDurability: false })?.evaded, true);
    assert.equal(target.hasPersistentGuaranteedEvasion('test:wind-evasion'), true);
    assert.equal(target.canPerformAction(ActionType.EVASION), true);
    assert.equal(second.attack(target, 'physical', 10, { consumeMainHandDurability: false })?.evaded, true);
    assert.equal(target.life, 100);

    target.removePersistentGuaranteedEvasion('test:wind-evasion');
    first.earlyUpdate(first.maxAttackCooldown);
    assert.equal(first.attack(target, 'physical', 10, {
        unavoidable: true,
        consumeMainHandDurability: false,
    })?.evaded, false);
    assert.equal(target.life, 90);

    target.grantGuaranteedEvasion('test:single-evasion');
    first.earlyUpdate(first.maxAttackCooldown);
    second.earlyUpdate(second.maxAttackCooldown);
    assert.equal(first.attack(target, 'physical', 10, { consumeMainHandDurability: false })?.evaded, true);
    assert.equal(second.attack(target, 'physical', 10, {
        consumeMainHandDurability: false,
    })?.evaded, false);
    assert.equal(target.hasGuaranteedEvasion('test:single-evasion'), false);
});

test('피격자는 대상이 없을 때 공격자를 자동 타게팅하고 기존 대상은 유지한다', () => {
    const firstAttacker = new TestEntity('첫 공격자', { atk: 10, speed: 100 });
    const secondAttacker = new TestEntity('두 번째 공격자', { atk: 10, speed: 100 });
    const target = new TestEntity('피격자', { speed: 100 });

    const firstResult = firstAttacker.attack(target, 'physical', 10, {
        unavoidable: true,
        consumeMainHandDurability: false,
    });
    assert.ok(firstResult);
    assert.equal(target.currentTarget, firstAttacker);

    const secondResult = secondAttacker.attack(target, 'physical', 10, {
        unavoidable: true,
        consumeMainHandDurability: false,
    });
    assert.ok(secondResult);
    assert.equal(target.currentTarget, firstAttacker);
});

test('고정 피해 옵션은 레벨차·치명타·속성 타입별 방어·관통 없이 정확한 피해를 준다', () => {
    const attacker = new TestEntity('Lv.1000 공격자', { critRate: 1, critDmg: 10, speed: 100 }, 1_000);
    const target = new TestEntity('Lv.1 피격자', { def: 100, magicDef: 100, speed: 100 }, 1);
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

test('전투 pipeline은 계산 전 피해 수정과 준비 단계 취소를 key 기반으로 등록·해제한다', () => {
    const attacker = new TestEntity('pipeline 공격자', { critRate: 0, speed: 100 });
    const target = new TestEntity('pipeline 피격자', { speed: 100 });
    const removeBonus = registerCombatHook({
        key: 'test:double-damage',
        stage: CombatStage.BEFORE_DAMAGE,
        filter: context => context.attacker === attacker,
        run: context => { context.amount *= 2; },
    });
    const doubled = attacker.attack(target, 'physical', 10, { unavoidable: true, consumeMainHandDurability: false });
    assert.equal(doubled?.finalDamage, 20);
    assert.equal(removeBonus(), true);

    const blockedAttacker = new TestEntity('blocked 공격자', { speed: 100 });
    const removeBlock = registerCombatHook({
        key: 'test:block-attack',
        stage: CombatStage.PREPARE,
        filter: context => context.attacker === blockedAttacker,
        run: context => { context.cancelled = true; context.cancelReason = '테스트 취소'; },
    });
    assert.equal(blockedAttacker.attack(target, 'physical', 10, { unavoidable: true }), null);
    assert.equal(target.life, 80);
    assert.equal(removeBlock(), true);
});
