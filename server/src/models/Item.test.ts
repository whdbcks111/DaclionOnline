import assert from 'node:assert/strict';
import test from 'node:test';
import {
    defineItem,
    isPersistedItemMetadataDelta,
    Item,
    migratePersistedItemMetadata,
    type ItemData,
    type ItemMetadata,
} from './Item.js';
import Attribute, { AttributeType } from './Attribute.js';
import Equipment from './Equipment.js';
import Inventory from './Inventory.js';
import Player from './Player.js';

function itemData(
    id: string,
    image?: string,
    baseMetadata: ItemMetadata | null = null,
    baseDurability: number | null = null,
): ItemData {
    return {
        id,
        name: id,
        description: '',
        image,
        category: 'test',
        weight: 0,
        stackable: false,
        maxStack: 1,
        baseMetadata,
        onUse: null,
        equipSlot: null,
        modifiers: null,
        baseDurability,
        tags: [],
    };
}

test('아이템 이미지는 metadata, 정의, ID 기본 경로 순서로 결정한다', () => {
    defineItem(itemData('test_default_image'));
    defineItem(itemData('test_defined_image', 'items/defined'));

    assert.equal(new Item('test_default_image', 1, null, null).image, 'items/test_default_image');
    assert.equal(new Item('test_defined_image', 1, null, null).image, 'items/defined');
    assert.equal(
        new Item('test_defined_image', 1, null, { image: 'items/metadata' }).image,
        'items/metadata',
    );
});

test('안전하지 않은 metadata 이미지 경로는 정의 이미지로 대체한다', () => {
    defineItem(itemData('test_safe_image', 'items/safe'));

    assert.equal(
        new Item('test_safe_image', 1, null, { image: '../outside' }).image,
        'items/safe',
    );
    assert.throws(() => defineItem(itemData('test_invalid_image', 'https://example.com/item.png')));
});

test('override가 없는 인스턴스는 변경된 기본 metadata를 즉시 상속한다', () => {
    defineItem(itemData('test_live_base', undefined, { amount: 50, time: 1 }));
    const item = new Item('test_live_base', 1, null, null);

    assert.equal(item.getMetadata<number>('amount'), 50);
    defineItem(itemData('test_live_base', undefined, { amount: 80, time: 2 }));
    assert.deepEqual(item.getMetadataSnapshot(), { amount: 80, time: 2 });
});

test('metadata setter는 delta만 저장하고 변경 callback을 호출한다', () => {
    defineItem(itemData('test_metadata_api', undefined, { amount: 50 }));
    const item = new Item('test_metadata_api', 1, null, null);
    let changes = 0;
    item.setPersistentChangeHandler(() => { changes++; });

    item.setMetadata('amount', 75);
    assert.equal(item.getMetadata<number>('amount'), 75);
    assert.deepEqual(item.getMetadataDeltaSnapshot(), { amount: 75 });
    assert.equal(changes, 1);

    item.setMetadata('amount', 50);
    assert.equal(item.getMetadata<number>('amount'), 50);
    assert.equal(item.getMetadataDeltaSnapshot(), null);
    assert.equal(changes, 2);
});

test('제작 장비 metadata는 이름·설명·최대 내구도·인스턴스 능력치를 안전하게 재정의한다', () => {
    defineItem({
        ...itemData('test_forged_weapon', 'items/old_sword', null, 50),
        equipSlot: 'mainHand',
        modifiers: [{ attribute: 'atk', op: 'add', value: 2, source: '' }],
    });
    const item = new Item('test_forged_weapon', 1, null, {
        customName: '정밀한 철 장검',
        customDescription: '단조 시험으로 제작된 무기.',
        maxDurability: 180,
        instanceModifiers: [
            { attribute: 'atk', op: 'add', value: 14 },
            { attribute: 'critRate', op: 'add', value: 0.02 },
            { attribute: 'unknown', op: 'add', value: 999 },
        ],
    });
    assert.equal(item.name, '정밀한 철 장검');
    assert.equal(item.description, '단조 시험으로 제작된 무기.');
    assert.equal(item.baseDurability, 180);
    assert.equal(item.durability, 180);
    assert.deepEqual(item.modifiers?.map(({ attribute, op, value }) => ({ attribute, op, value })), [
        { attribute: 'atk', op: 'add', value: 14 },
        { attribute: 'critRate', op: 'add', value: 0.02 },
    ]);

    const equipment = Equipment.createEmpty();
    const attribute = new Attribute({ atk: 10, critRate: 0 });
    assert.equal(equipment.equip('mainHand', item, attribute), true);
    assert.equal(attribute.get(AttributeType.ATK), 24);
    assert.equal(attribute.get(AttributeType.CRIT_RATE), 0.02);
    item.setMetadata('instanceModifiers', [{ attribute: 'atk', op: 'add', value: 20 }]);
    assert.equal(attribute.get(AttributeType.ATK), 30);
    assert.equal(attribute.get(AttributeType.CRIT_RATE), 0);
});

test('기본 공격 오버라이드 key는 base metadata와 인스턴스 delta를 따른다', () => {
    defineItem(itemData('test_attack_override', undefined, { basicAttackOverride: 'projectile' }));
    const item = new Item('test_attack_override', 1, null, null);

    assert.equal(item.basicAttackOverrideKey, 'projectile');
    item.setMetadata('basicAttackOverride', 'custom_attack');
    assert.equal(item.basicAttackOverrideKey, 'custom_attack');
    item.resetMetadata('basicAttackOverride');
    assert.equal(item.basicAttackOverrideKey, 'projectile');
});

test('구형 전체 metadata는 기본값과 다른 필드만 delta로 마이그레이션한다', () => {
    defineItem(itemData('test_legacy_metadata', undefined, { amount: 50, time: 1 }));
    const persisted = migratePersistedItemMetadata('test_legacy_metadata', {
        amount: 50,
        time: 3,
        image: 'items/legacy_variant',
    });

    assert.equal(isPersistedItemMetadataDelta(persisted), true);
    assert.deepEqual(persisted.values, { time: 3, image: 'items/legacy_variant' });

    const item = Item.fromPersistence('test_legacy_metadata', 1, null, persisted);
    assert.deepEqual(item.getMetadataSnapshot(), {
        amount: 50,
        time: 3,
        image: 'items/legacy_variant',
    });
});

test('내구도 API는 설정·증가·차감을 범위 안에서 처리하고 변경 callback을 호출한다', () => {
    defineItem(itemData('test_durability', undefined, null, 10));
    const item = new Item('test_durability', 1, 10, null);
    let changes = 0;
    item.setPersistentChangeHandler(() => { changes++; });

    assert.equal(item.decreaseDurability(3), 7);
    assert.equal(item.durabilityRatio, 0.7);
    assert.equal(item.increaseDurability(20), 10);
    assert.equal(item.setDurability(-5), 0);
    assert.equal(item.isBroken, true);
    assert.equal(changes, 3);

    assert.equal(item.decreaseDurability(), 0);
    assert.equal(changes, 3);
    assert.throws(() => item.changeDurability(Number.NaN));
});

test('소유 중인 아이템 내구도가 0이 되면 인벤토리 또는 장비에서 파괴된다', () => {
    defineItem(itemData('test_break_inventory', undefined, null, 2));
    defineItem({
        ...itemData('test_break_equipment', undefined, null, 2),
        equipSlot: 'mainHand',
        modifiers: [{ attribute: 'atk', op: 'add', value: 5, source: '' }],
    });

    const inventory = Inventory.createEmpty(1, 100);
    inventory.addItem('test_break_inventory', 1);
    const inventoryItem = inventory.getItemByIndex(0)!;
    assert.equal(inventory.decreaseItemDurability(inventoryItem.id, 2), 0);
    assert.equal(inventory.getIndexedItems().length, 0);

    const equipment = Equipment.createEmpty();
    const attribute = new Attribute({ atk: 10 });
    const weapon = new Item('test_break_equipment', 1, 2, null);
    assert.equal(equipment.equip('mainHand', weapon, attribute), true);
    assert.equal(attribute.getBase(AttributeType.ATK), 10);
    assert.equal(attribute.get(AttributeType.ATK), 15);
    assert.equal(equipment.decreaseItemDurability('mainHand', 0, 2), 0);
    assert.equal(equipment.getEquipped('mainHand'), undefined);
    assert.equal(attribute.get(AttributeType.ATK), 10);
});

test('스택형 미끼는 묶음 전체를 장착하고 사용할 때마다 한 개씩 소비한다', () => {
    defineItem({
        ...itemData('test_bait_stack'),
        stackable: true,
        maxStack: 99,
        equipSlot: 'offHand',
    });
    const inventory = Inventory.createEmpty(1, 100);
    const equipment = Equipment.createEmpty();
    const attribute = new Attribute({});
    inventory.addItem('test_bait_stack', 10);
    const bait = inventory.getItemByIndex(0)!;
    const player = { inventory, equipment, attribute } as unknown as Player;

    assert.ok(Player.prototype.equipInventoryItem.call(player, bait, 0));
    assert.equal(inventory.getCount('test_bait_stack'), 0);
    assert.equal(equipment.getEquipped('offHand')?.count, 10);

    assert.ok(equipment.consumeEquippedItem('offHand', 0, attribute));
    assert.equal(equipment.getEquipped('offHand')?.count, 9);
    assert.ok(equipment.consumeEquippedItem('offHand', 0, attribute, 9));
    assert.equal(equipment.getEquipped('offHand'), undefined);
});
