import assert from 'node:assert/strict';
import test from 'node:test';
import {
    MAX_SHOP_RESTOCK_SECONDS,
    SHOP_SHARED_PLAYER_CAPACITY,
    Shop,
    resolveShopRestockTime,
    resolveShopStockCapacity,
} from './Shop.js';

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

test('공유 상점은 다섯 명분 재고와 재입고 처리량을 제공한다', () => {
    assert.equal(SHOP_SHARED_PLAYER_CAPACITY, 5);
    assert.equal(resolveShopStockCapacity(1), 5);
    assert.equal(resolveShopRestockTime(30), 6);
    assert.equal(resolveShopRestockTime(3_900), MAX_SHOP_RESTOCK_SECONDS);

    const shop = testShop(3_900);
    assert.equal(shop.getStock(0), 5);
    assert.equal(shop.getStockCapacity(0), 5);
    assert.equal(shop.consumeStock(0, 5), true);
    assert.equal(shop.consumeStock(0, 1), false);
    shop.update(MAX_SHOP_RESTOCK_SECONDS - 1);
    assert.equal(shop.getStock(0), 0);
    shop.update(1);
    assert.equal(shop.getStock(0), 1);
    shop.update(MAX_SHOP_RESTOCK_SECONDS * 4);
    assert.equal(shop.getStock(0), 5);
});
