import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_SHOP_RESTOCK_SECONDS, Shop, resolveShopRestockTime } from './Shop.js';

function testShop(restockTime: number): Shop {
    return new Shop({
        id: 'test:restock',
        tags: [],
        sellList: [],
        buyList: [{
            label: '시험 장비',
            create: () => ({ itemDataId: 'test_item', count: 1 }),
            count: 1,
            price: 1,
            stock: 1,
            restockTime,
        }],
    });
}

test('상점 재입고 시간은 짧은 주기를 유지하고 10분을 넘지 않는다', () => {
    assert.equal(resolveShopRestockTime(30), 30);
    assert.equal(resolveShopRestockTime(3_900), MAX_SHOP_RESTOCK_SECONDS);

    const shop = testShop(3_900);
    assert.equal(shop.consumeStock(0, 1), true);
    shop.update(MAX_SHOP_RESTOCK_SECONDS - 1);
    assert.equal(shop.getStock(0), 0);
    shop.update(1);
    assert.equal(shop.getStock(0), 1);
});
