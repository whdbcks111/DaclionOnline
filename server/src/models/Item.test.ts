import assert from 'node:assert/strict';
import test from 'node:test';
import { defineItem, Item, type ItemData } from './Item.js';

function itemData(id: string, image?: string): ItemData {
    return {
        id,
        name: id,
        description: '',
        image,
        category: 'test',
        weight: 0,
        stackable: false,
        maxStack: 1,
        baseMetadata: null,
        onUse: null,
        equipSlot: null,
        modifiers: null,
        baseDurability: null,
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
