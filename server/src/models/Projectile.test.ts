import assert from 'node:assert/strict';
import test from 'node:test';
import { AttributeType, type AttributeRecord } from './Attribute.js';
import Entity from './Entity.js';
import Equipment from './Equipment.js';
import { defineItem, Item, ItemMetadataKeys, type ItemData, type ItemMetadata } from './Item.js';
import {
    defineProjectileData,
    getActiveProjectiles,
    spawnProjectile,
    spawnProjectileFromData,
    updateProjectiles,
} from './Projectile.js';
import { executeProjectileItemAttack } from '../modules/itemAttack.js';
import { GameTags } from '../../../shared/tags.js';
import type { TagId } from '../../../shared/tags.js';
import '../data/tagEffects.js';

class TestEntity extends Entity {
    override readonly name: string;

    constructor(name: string, tags: readonly TagId[] = [], attributes: Partial<AttributeRecord> = {}) {
        super(1, 0, 'test', { maxLife: 100, critRate: 0, ...attributes }, Equipment.createEmpty(), undefined, tags);
        this.name = name;
    }
}

function defineTestItem(id: string, baseMetadata: ItemMetadata): void {
    const data: ItemData = {
        id,
        name: id,
        description: '',
        category: 'test',
        weight: 0,
        stackable: true,
        maxStack: 99,
        baseMetadata,
        onUse: null,
        equipSlot: null,
        modifiers: null,
        baseDurability: null,
        tags: [],
    };
    defineItem(data);
}

test('투사체 상성은 owner가 아니라 투사체 자체 태그로 판정한다', () => {
    const owner = new TestEntity('불 속성 발사자', [GameTags.PROPERTY_FIRE]);
    const target = new TestEntity('무생물 표적', [GameTags.TRAIT_INANIMATE]);
    const projectile = spawnProjectile({
        owner,
        target,
        name: '독 투사체',
        damage: 20,
        damageType: 'absolute',
        tags: [GameTags.PROPERTY_POISON],
    });

    updateProjectiles(0);

    assert.equal(target.life, 100);
    assert.equal(target.lastDamageCause?.causeEntity, projectile);
    assert.equal(projectile.attackOwner, owner);
    assert.equal(getActiveProjectiles().length, 0);
});

test('투사체 데이터는 owner 공격력과 JSON 능력치 오버라이드를 합성한다', () => {
    defineProjectileData({
        id: 'test_scaled_projectile',
        name: '시험탄',
        damageType: 'physical',
        travelTime: 1,
        accelerationCoefficient: 1,
        damageMultiplier: 2,
        damageBonus: 3,
        tags: [],
        baseAttribute: { armorPen: 1 },
    });
    const owner = new TestEntity('발사자', [], { atk: 10 });
    const target = new TestEntity('표적');
    const projectile = spawnProjectileFromData({
        owner,
        target,
        dataId: 'test_scaled_projectile',
        overrides: { travelTime: 0, attributeOverrides: { armorPen: 4 } },
    });

    assert.ok(projectile);
    assert.equal(projectile.damageAmount, 23);
    assert.equal(projectile.attribute.computed.armorPen, 4);
    updateProjectiles(0);
    assert.equal(target.life, 77);
});

test('투사체 가속은 owner 능력치와 데이터 계수 및 스킬 배율을 비행 시간에 반영한다', () => {
    defineProjectileData({
        id: 'test_accelerated_projectile',
        name: '가속 시험탄',
        damageType: 'physical',
        travelTime: 1,
        accelerationCoefficient: 0.5,
        damageMultiplier: 1,
        damageBonus: 0,
        tags: [],
        baseAttribute: {},
    });
    const owner = new TestEntity('가속 발사자', [], { atk: 10, projectileAcceleration: 2 });
    const projectile = spawnProjectileFromData({
        owner,
        target: new TestEntity('가속 표적'),
        dataId: 'test_accelerated_projectile',
        overrides: { accelerationMultiplier: 2 },
    });

    assert.ok(projectile);
    assert.equal(projectile.projectileAcceleration, 3);
    assert.equal(projectile.attribute.get(AttributeType.PROJECTILE_ACCELERATION), 3);
    assert.ok(Math.abs(projectile.remainingTravelTime - 1 / 3) < 0.000_001);
    updateProjectiles(1 / 3);
    assert.equal(projectile.active, false);
});

test('투사체는 발사 순간 owner의 치명타 확률과 피해를 동기화한다', () => {
    defineProjectileData({
        id: 'test_critical_projectile',
        name: '치명타 시험탄',
        damageType: 'magic',
        travelTime: 0,
        accelerationCoefficient: 1,
        damageMultiplier: 1,
        damageBonus: 0,
        tags: [],
        baseAttribute: { critRate: 0 },
    });
    const owner = new TestEntity('치명타 발사자', [], {
        magicForce: 10,
        critRate: 1,
        critDmg: 2,
    });
    const target = new TestEntity('치명타 표적', [], { magicDef: 0 });
    const projectile = spawnProjectileFromData({ owner, target, dataId: 'test_critical_projectile' });

    assert.ok(projectile);
    assert.equal(projectile.attribute.get(AttributeType.CRIT_RATE), 1);
    assert.equal(projectile.attribute.get(AttributeType.CRIT_DMG), 2);
    updateProjectiles(0);
    assert.equal(target.life, 80);
    assert.equal(target.lastDamageCause?.critical, true);
});

test('탄약 모드는 아이템 한 개를 소비해 투사체를 발사한다', () => {
    defineProjectileData({
        id: 'test_ammunition_projectile',
        name: '탄약탄',
        damageType: 'absolute',
        travelTime: 0,
        accelerationCoefficient: 1,
        damageMultiplier: 1,
        damageBonus: 0,
        tags: [],
        baseAttribute: {},
    });
    defineTestItem('test_bow', {
        [ItemMetadataKeys.PROJECTILE_ATTACK]: { ammunitionItemId: 'test_arrow' },
    });
    defineTestItem('test_arrow', {
        [ItemMetadataKeys.PROJECTILE]: {
            dataId: 'test_ammunition_projectile',
            overrides: { damage: 12 },
        },
    });

    const owner = new TestEntity('궁수');
    const target = new TestEntity('표적');
    const weapon = new Item('test_bow', 1, null, null);
    const ammunition = new Item('test_arrow', 2, null, null);
    let consumed = 0;
    const inventory = {
        getFirstItemByData: (id: string) => id === 'test_arrow' ? ammunition : undefined,
        removeItemInstance: (item: Item, count: number) => {
            assert.equal(item, ammunition);
            consumed += count;
            return true;
        },
    };

    assert.equal(executeProjectileItemAttack({
        attacker: owner,
        target,
        weapon,
        inventory: inventory as never,
    }), true);
    assert.equal(consumed, 1);
    assert.ok(owner.attackCooldown > 0);
    updateProjectiles(0);
    assert.equal(target.life, 88);
});

test('무탄약 모드는 무기 자체의 투사체 참조를 사용하고, 탄약 누락은 폴백 신호를 반환한다', () => {
    defineProjectileData({
        id: 'test_inline_projectile',
        name: '인라인탄',
        damageType: 'absolute',
        travelTime: 0,
        accelerationCoefficient: 1,
        damageMultiplier: 1,
        damageBonus: 0,
        tags: [],
        baseAttribute: {},
    });
    defineTestItem('test_staff', {
        [ItemMetadataKeys.PROJECTILE_ATTACK]: {
            projectile: { dataId: 'test_inline_projectile', overrides: { damage: 9 } },
        },
    });
    defineTestItem('test_empty_bow', {
        [ItemMetadataKeys.PROJECTILE_ATTACK]: { ammunitionItemId: 'missing_arrow' },
    });
    const directOwner = new TestEntity('마도사');
    const target = new TestEntity('표적');

    assert.equal(executeProjectileItemAttack({
        attacker: directOwner,
        target,
        weapon: new Item('test_staff', 1, null, null),
    }), true);
    updateProjectiles(0);
    assert.equal(target.life, 91);

    assert.equal(executeProjectileItemAttack({
        attacker: new TestEntity('빈 궁수'),
        target: new TestEntity('다른 표적'),
        weapon: new Item('test_empty_bow', 1, null, null),
        inventory: {
            getFirstItemByData: () => undefined,
        } as never,
    }), false);
});
