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
