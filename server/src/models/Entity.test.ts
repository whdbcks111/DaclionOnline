import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import Entity from './Entity.js';
import Equipment from './Equipment.js';
import { AttributeType } from './Attribute.js';
import { defineItem, Item, type ItemData } from './Item.js';
import Stat, {
    calculateMentalityRegenBonus,
    calculateSensibilityCritRateBonus,
    calculateVitalityLifeRegenBonus,
    MENTALITY_MAGIC_DEF_PER_POINT,
    MENTALITY_MAX_MENTALITY_PER_POINT,
    MENTALITY_REGEN_PER_POINT,
    SENSIBILITY_CRIT_RATE_CAP,
    STAT_REGEN_DIMINISHING_SCALE,
    StatType,
    VITALITY_LIFE_REGEN_PER_POINT,
} from './Stat.js';
import { GameTags } from '../../../shared/tags.js';
import { StatusEffectType } from './StatusEffect.js';
import { ShieldType } from './Shield.js';
import '../data/tagEffects.js';

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

class CombatEntity extends Entity {
    override readonly name: string;

    constructor(name: string, tags: readonly string[] = []) {
        super(1, 0, 'test', {
            maxLife: 1_000,
            speed: 1,
            attackSpeed: 1,
        }, Equipment.createEmpty(), undefined, tags);
        this.name = name;
    }
}

function defensiveTestItemData(
    id: string,
    onDamageTaken: NonNullable<ItemData['onDamageTaken']>,
): ItemData {
    return {
        id,
        name: id,
        description: '',
        category: '방패',
        weight: 0,
        stackable: false,
        maxStack: 1,
        baseMetadata: null,
        onUse: null,
        equipSlot: 'offHand',
        modifiers: null,
        baseDurability: null,
        tags: [],
        onDamageTaken,
    };
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

test('현재 대상 표시 스냅샷은 같은 장소 대상의 자원·보호막·상태이상만 복제한다', () => {
    const owner = new CombatEntity('공격자');
    const target = new CombatEntity('대상', [GameTags.ENTITY_BOSS]);
    target.life = 720;
    target.mentality = 12;
    target.setShield('test:target-hud', 80, ShieldType.GENERAL, 10, target);
    target.applyStatusEffect(StatusEffectType.FIRE, 5, 2);
    owner.currentTarget = target;

    const snapshot = owner.getCurrentTargetDisplaySnapshot();
    assert.equal(snapshot?.name, '대상');
    assert.equal(snapshot?.isBoss, true);
    assert.equal(snapshot?.life, 720);
    assert.equal(snapshot?.shields[0]?.amount, 80);
    assert.equal(snapshot?.statusEffects[0]?.label, '화염');

    target.locationId = 'other';
    assert.equal(owner.getCurrentTarget(), null);
    assert.equal(owner.getCurrentTargetDisplaySnapshot(), null);
});

test('피해를 받은 대상의 보조 장비는 실제 피해가 발생한 뒤 한 번만 방어 효과를 실행한다', () => {
    let triggers = 0;
    defineItem(defensiveTestItemData('test_reactive_offhand', ({ target, result }) => {
        triggers++;
        target.setShield('test:reactive-offhand', result.finalDamage, ShieldType.GENERAL, 5, target);
    }));
    const attacker = new CombatEntity('공격자');
    attacker.attribute.setBase(AttributeType.CRIT_RATE, 0);
    const target = new CombatEntity('방어자');
    target.equipment.equip(
        'offHand',
        new Item('test_reactive_offhand', 1, null, null),
        target.attribute,
    );

    const result = attacker.attack(target, 'absolute', 100, { unavoidable: true });

    assert.equal(result?.finalDamage, 100);
    assert.equal(triggers, 1);
    assert.equal(target.getTotalShield(), 100);
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
    assert.match(AttributeType.DEF.getDescription(100), /비례 감산·나눗셈 혼합/);
    assert.match(AttributeType.MAGIC_DEF.getDescription(100), /비례 감산·나눗셈 혼합/);
});

test('근력은 공격력과 함께 물리 관통력과 최대 중량을 높인다', () => {
    const entity = new VitalEntity();
    const stat = new Stat({ strength: 100 });
    stat.applyModifiers(entity);

    assert.equal(entity.attribute.get(AttributeType.ATK), 210);
    assert.equal(entity.attribute.get(AttributeType.ARMOR_PEN), 50);
    assert.equal(entity.attribute.get(AttributeType.MAX_WEIGHT), 70);
    assert.match(StatType.STRENGTH.getDescription(100), /공격력 \+200/);
    assert.match(StatType.STRENGTH.getDescription(100), /물리 관통력 \+50/);
    assert.match(StatType.STRENGTH.getDescription(100), /최대 중량 \+20kg/);
});

test('민첩과 정신력은 레벨 성장에 쓰이는 투사체 가속 능력치를 높인다', () => {
    const entity = new VitalEntity();
    const stat = new Stat({ agility: 100, mentality: 100 });
    stat.applyModifiers(entity);

    assert.equal(entity.attribute.get(AttributeType.PROJECTILE_ACCELERATION), 1.5);
    assert.equal(
        entity.maxMentality,
        80 + 100 * MENTALITY_MAX_MENTALITY_PER_POINT,
    );
    assert.equal(
        entity.attribute.get(AttributeType.MAGIC_DEF),
        100 * MENTALITY_MAGIC_DEF_PER_POINT,
    );
    assert.ok(Math.abs(
        entity.attribute.get(AttributeType.MENTALITY_REGEN)
            - (1 + calculateMentalityRegenBonus(100)),
    ) < 1e-10);
    assert.match(StatType.MENTALITY.getDescription(100), /최대 정신력 \+525/);
    assert.match(StatType.AGILITY.getDescription(100), /투사체 가속/);
    assert.match(StatType.MENTALITY.getDescription(100), /투사체 가속/);
    assert.match(StatType.MENTALITY.getDescription(100), /마법 저항력 \+50/);
    assert.match(StatType.MENTALITY.getDescription(100), /정신력 재생 \+1\.19\/초/);
});

test('체력과 정신력 재생은 저스탯 기울기를 유지하고 고스탯에서 점감분을 회복한다', () => {
    const entity = new VitalEntity();
    const stat = new Stat({ vitality: 100, mentality: 100 });
    stat.applyModifiers(entity);

    assert.ok(Math.abs(
        entity.attribute.get(AttributeType.LIFE_REGEN)
            - (1 + calculateVitalityLifeRegenBonus(100)),
    ) < 1e-10);
    assert.ok(Math.abs(
        entity.attribute.get(AttributeType.MENTALITY_REGEN)
            - (1 + calculateMentalityRegenBonus(100)),
    ) < 1e-10);
    assert.match(StatType.VITALITY.getDescription(100), /생명력 재생 \+2\.38\/초/);

    const oldVitalityAt100 = VITALITY_LIFE_REGEN_PER_POINT * 100
        / (1 + 100 / STAT_REGEN_DIMINISHING_SCALE);
    const oldMentalityAt100 = MENTALITY_REGEN_PER_POINT * 100
        / (1 + 100 / STAT_REGEN_DIMINISHING_SCALE);
    assert.ok(Math.abs(calculateVitalityLifeRegenBonus(100) - oldVitalityAt100) < 1e-12);
    assert.ok(Math.abs(calculateMentalityRegenBonus(100) - oldMentalityAt100) < 1e-12);

    let previousVitality = 0;
    let previousMentality = 0;
    for (let points = 1; points <= 5_000; points++) {
        const vitality = calculateVitalityLifeRegenBonus(points);
        const mentality = calculateMentalityRegenBonus(points);
        assert.ok(vitality > previousVitality);
        assert.ok(mentality > previousMentality);
        previousVitality = vitality;
        previousMentality = mentality;
    }

    const oldDiminishedAt1000 = MENTALITY_REGEN_PER_POINT * 1_000
        / (1 + 1_000 / STAT_REGEN_DIMINISHING_SCALE);
    const linearAt1000 = MENTALITY_REGEN_PER_POINT * 1_000;
    assert.ok(calculateMentalityRegenBonus(1_000) > oldDiminishedAt1000 * 1.3);
    assert.ok(calculateMentalityRegenBonus(1_000) < linearAt1000);

    const linearAt5000 = MENTALITY_REGEN_PER_POINT * 5_000;
    assert.ok(Math.abs(calculateMentalityRegenBonus(5_000) - linearAt5000) < 0.01);
    assert.ok(calculateVitalityLifeRegenBonus(5_000) > 50);
    assert.ok(calculateMentalityRegenBonus(5_000) > 50);
});

test('감각은 치명타 능력치와 대장장이용 제련 정밀도를 함께 높인다', () => {
    const entity = new VitalEntity();
    const stat = new Stat({ sensibility: 100 });
    stat.applyModifiers(entity);

    assert.ok(Math.abs(entity.attribute.get(AttributeType.CRIT_RATE) - (0.05 + calculateSensibilityCritRateBonus(100))) < 1e-10);
    assert.equal(entity.attribute.get(AttributeType.CRIT_DMG), 2.5);
    assert.ok(Math.abs(entity.attribute.get(AttributeType.FORGING_PRECISION) - 0.15) < 1e-10);
    assert.match(StatType.SENSIBILITY.getDescription(100), /치명타율 \+9\.1%p/);
    assert.match(StatType.SENSIBILITY.getDescription(100), /제련 정밀도 \+15\.0%/);
});

test('감각 치명타율은 낮은 구간의 기울기를 보존하면서 50%p에 점근한다', () => {
    assert.equal(calculateSensibilityCritRateBonus(0), 0);
    assert.ok(Math.abs(calculateSensibilityCritRateBonus(100) - 0.09063462346100909) < 1e-12);
    assert.ok(calculateSensibilityCritRateBonus(500) < SENSIBILITY_CRIT_RATE_CAP);
    assert.ok(calculateSensibilityCritRateBonus(10_000) <= SENSIBILITY_CRIT_RATE_CAP);

    const earlyGain = calculateSensibilityCritRateBonus(100) - calculateSensibilityCritRateBonus(0);
    const lateGain = calculateSensibilityCritRateBonus(1_000) - calculateSensibilityCritRateBonus(900);
    assert.ok(lateGain < earlyGain);
    assert.match(StatType.SENSIBILITY.getDescription(1_000), /치명타율 \+43\.2%p/);
    assert.match(StatType.SENSIBILITY.getDescription(1_000), /최대 \+50%p/);
});

test('모든 능력치는 고유한 128px 투명 아이콘과 스킬 포맷 문법을 제공한다', () => {
    const icons = new Set<string>();
    for (const attribute of AttributeType.values()) {
        assert.equal(attribute.icon, `attributes/${attribute.key}`);
        assert.equal(attribute.iconMarkup, `[icon=attributes/${attribute.key}]`);
        assert.equal(icons.has(attribute.icon), false);
        icons.add(attribute.icon);
        const png = readFileSync(new URL(`../../../client/public/icons/${attribute.icon}.png`, import.meta.url));
        assert.equal(png.readUInt32BE(16), 128);
        assert.equal(png.readUInt32BE(20), 128);
        assert.equal(png[25], 6);
    }
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

test('부활하면 생명력과 정신력, 배고픔과 수분을 최대값으로 회복한다', () => {
    const entity = new VitalEntity();
    entity.life = 0;
    entity.mentality = 0;
    entity.hungry = 0;
    entity.thirsty = 0;
    entity.isDead = true;

    entity.respawn();

    assert.equal(entity.life, entity.maxLife);
    assert.equal(entity.mentality, entity.maxMentality);
    assert.equal(entity.hungry, entity.maxHungry);
    assert.equal(entity.thirsty, entity.maxThirsty);
});

test('직접 스킬 공격은 지정한 속성 태그로 상성을 계산한다', () => {
    const attacker = new CombatEntity('그림자 추격 시전자');
    const target = new CombatEntity('빛 속성 대상', [GameTags.PROPERTY_LIGHT]);

    const result = attacker.attack(target, 'physical', 100, {
        unavoidable: true,
        effectTags: [GameTags.PROPERTY_DARK],
        consumeMainHandDurability: false,
        triggerMainHandHitEffects: false,
    });

    assert.ok(result);
    assert.equal(result.effectSourceTag, GameTags.PROPERTY_DARK);
    assert.equal(result.effectTargetTag, GameTags.PROPERTY_LIGHT);
    assert.equal(result.effectModifier, 1.5);
    assert.equal(result.finalDamage, 150);
});
