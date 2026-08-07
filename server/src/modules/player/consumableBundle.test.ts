import assert from 'node:assert/strict';
import test from 'node:test';
import type Player from '../../models/actors/Player.js';
import Inventory from '../../models/economy/Inventory.js';
import { defineItem, MAX_STACKABLE_ITEM_COUNT, type ItemData } from '../../models/economy/Item.js';
import { registerItemUse } from './itemUse.js';
import {
    executeConsumableBundle,
    normalizeConsumableBundleUseRequest,
} from './consumableBundle.js';

function consumable(id: string, onUse: string): ItemData {
    return {
        id,
        name: id,
        description: '',
        image: 'items/health_potion',
        category: '소모품',
        weight: 0,
        stackable: true,
        maxStack: MAX_STACKABLE_ITEM_COUNT,
        baseMetadata: null,
        onUse,
        equipSlot: null,
        modifiers: null,
        baseDurability: null,
        tags: ['item:consumable'],
    };
}

test('소모품 묶음 요청은 1~8개의 중복 없는 정의 ID만 받는다', () => {
    assert.deepEqual(normalizeConsumableBundleUseRequest({
        requestId: 'bundle:1',
        itemDataIds: ['health_potion', 'mana_potion'],
    }), {
        requestId: 'bundle:1',
        itemDataIds: ['health_potion', 'mana_potion'],
    });
    assert.equal(normalizeConsumableBundleUseRequest({
        requestId: 'bundle:1',
        itemDataIds: ['health_potion', 'health_potion'],
    }), undefined);
    assert.equal(normalizeConsumableBundleUseRequest({
        requestId: 'bundle:1',
        itemDataIds: Array.from({ length: 9 }, (_, index) => `potion_${index}`),
    }), undefined);
});

test('소모품 묶음은 비동기 사용을 등록 순서대로 직렬 완료한다', async () => {
    const firstId = 'test_bundle_first_item';
    const secondId = 'test_bundle_second_item';
    defineItem(consumable(firstId, 'test_bundle_first_handler'));
    defineItem(consumable(secondId, 'test_bundle_second_handler'));
    const order: string[] = [];
    registerItemUse('test_bundle_first_handler', (inventory, item, finish) => {
        order.push('first:start');
        inventory.removeItemInstance(item, 1);
        setTimeout(() => {
            order.push('first:end');
            finish();
        }, 5);
    }, { quickBundle: true });
    registerItemUse('test_bundle_second_handler', (inventory, item, finish) => {
        order.push('second:start');
        inventory.removeItemInstance(item, 1);
        order.push('second:end');
        finish();
    }, { quickBundle: true });

    const inventory = Inventory.createEmpty(991_001, 100);
    assert.equal(inventory.addItem(firstId, 1), true);
    assert.equal(inventory.addItem(secondId, 1), true);
    const fakePlayer = {
        userId: 991_001,
        isDead: false,
        inventory,
        canPerformAction: () => true,
        getItemRequirementDeniedReason: () => undefined,
    } as unknown as Player;

    const result = await executeConsumableBundle(fakePlayer, [firstId, secondId]);
    assert.deepEqual(order, ['first:start', 'first:end', 'second:start', 'second:end']);
    assert.deepEqual(result.usedItemDataIds, [firstId, secondId]);
    assert.deepEqual(result.skipped, []);
    assert.equal(inventory.getCount(firstId), 0);
    assert.equal(inventory.getCount(secondId), 0);
});
