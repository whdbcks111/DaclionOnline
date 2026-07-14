import assert from 'node:assert/strict';
import test from 'node:test';
import Entity from './Entity.js';
import Equipment from './Equipment.js';
import Location from './Location.js';
import Monster, { defineMonster } from './Monster.js';
import Resource, { defineResource, registerResourceInteraction } from './Resource.js';
import { defineItem, Item } from './Item.js';
import { GameTags } from '../../../shared/tags.js';

class TestEntity extends Entity {
    override readonly name = '시험 공격자';

    constructor() {
        super(1, 0, 'test', { maxLife: 100 }, Equipment.createEmpty());
    }
}

function defineTestResource(id: string): void {
    defineResource({
        id,
        name: '시험 광석',
        level: 1,
        baseAttribute: { maxLife: 20 },
        requiredToolTags: [GameTags.TOOL_MINING],
        drops: [
            { itemDataId: 'test_stone', weight: 50, minCount: 1, maxCount: 1 },
            { itemDataId: 'test_coal', weight: 25, minCount: 1, maxCount: 1 },
            { itemDataId: 'test_iron', weight: 13, minCount: 1, maxCount: 1 },
            { itemDataId: 'test_gold', weight: 5, minCount: 1, maxCount: 1 },
            { itemDataId: 'test_ruby', weight: 3, minCount: 1, maxCount: 1 },
            { itemDataId: 'test_emerald', weight: 3, minCount: 1, maxCount: 1 },
            { itemDataId: 'test_diamond', weight: 1, minCount: 1, maxCount: 1 },
        ],
        expReward: { min: 3, max: 7 },
        tags: [GameTags.RESOURCE_ORE],
    });
}

test('자원 드롭은 지정된 100 가중치 경계대로 하나를 선택한다', () => {
    defineTestResource('test_weighted_resource');
    const resource = new Resource('test_weighted_resource');
    const cases = [
        [0, 'test_stone'],
        [0.5, 'test_coal'],
        [0.75, 'test_iron'],
        [0.88, 'test_gold'],
        [0.93, 'test_ruby'],
        [0.96, 'test_emerald'],
        [0.99, 'test_diamond'],
    ] as const;

    for (const [selection, expected] of cases) {
        const values = [selection, 0];
        assert.equal(resource.rollDrop(() => values.shift() ?? 0)?.itemDataId, expected);
    }
});

test('자원 경험치는 정의된 최소·최대 범위 안에서 결정된다', () => {
    defineTestResource('test_exp_resource');
    const resource = new Resource('test_exp_resource');

    assert.equal(resource.rollExp(() => 0), 3);
    assert.equal(resource.rollExp(() => 0.999999), 7);
});

test('필수 도구 태그는 주무기에 장착된 아이템 공개 API로 검사한다', () => {
    defineTestResource('test_tool_resource');
    defineItem({
        id: 'test_pickaxe',
        name: '시험 곡괭이',
        description: '',
        category: '도구',
        weight: 0,
        stackable: false,
        maxStack: 1,
        baseMetadata: null,
        onUse: null,
        equipSlot: 'mainHand',
        modifiers: null,
        baseDurability: 10,
        tags: [GameTags.ITEM_TOOL, GameTags.TOOL_MINING],
    });
    const resource = new Resource('test_tool_resource');
    const attacker = new TestEntity();

    assert.ok(resource.getAttackDeniedReason(attacker));
    assert.equal(
        attacker.equipment.equip('mainHand', new Item('test_pickaxe', 1, 10, null), attacker.attribute),
        true,
    );
    assert.equal(resource.getAttackDeniedReason(attacker), undefined);
});

test('Location은 몬스터와 자원을 하나의 오브젝트 API로 제공한다', () => {
    defineTestResource('test_location_resource');
    defineMonster({
        id: 'test_location_monster',
        name: '시험 몬스터',
        level: 1,
        exp: 0,
        baseAttribute: { maxLife: 10 },
        drops: [],
        expReward: 0,
        goldReward: 0,
        equipments: [],
        tags: [],
    });
    const location = new Location({
        id: 'test_location',
        name: '시험 장소',
        zoneType: 'normal',
        x: 0,
        y: 0,
        z: 0,
        objects: [
            { type: 'monster', dataId: 'test_location_monster', maxCount: 1, respawnTime: 10 },
            { type: 'resource', dataId: 'test_location_resource', maxCount: 2, respawnTime: 20 },
        ],
        connections: [],
        tags: [],
    });
    const objects = location.getObjects();

    assert.equal(objects.length, 3);
    assert.ok(objects[0] instanceof Monster);
    assert.ok(objects[1] instanceof Resource);
    assert.ok(objects[2] instanceof Resource);
});

test('등록된 상호작용만 자원을 상호작용 가능 상태로 만든다', () => {
    let interactions = 0;
    registerResourceInteraction('test_inspect', () => { interactions++; });
    defineResource({
        id: 'test_interactive_resource',
        name: '상호작용 자원',
        level: 1,
        baseAttribute: { maxLife: 10 },
        requiredToolTags: [],
        drops: [],
        expReward: { min: 0, max: 0 },
        interaction: 'test_inspect',
        tags: [],
    });
    const resource = new Resource('test_interactive_resource');

    assert.equal(resource.isInteractable, true);
    assert.equal(resource.interact(new TestEntity() as never), true);
    assert.equal(interactions, 1);
    resource.life = 0;
    assert.equal(resource.isInteractable, false);
    assert.equal(resource.isDefeated, true);
    assert.equal(resource.isDead, false);
    assert.equal(resource.defeatLabel, '파괴됨');
});

test('자원은 target이 있어도 스스로 공격하지 않는다', () => {
    defineTestResource('test_passive_resource');
    const resource = new Resource('test_passive_resource');
    const target = new TestEntity();
    resource.currentTarget = target;

    resource.update(10);

    assert.equal(target.life, target.maxLife);
    assert.equal(target.lastDamageCause, null);
});
