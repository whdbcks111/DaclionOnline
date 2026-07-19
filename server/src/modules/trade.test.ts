import assert from 'node:assert/strict';
import test from 'node:test';
import Inventory from '../models/Inventory.js';
import { defineItem } from '../models/Item.js';
import type Player from '../models/Player.js';
import { TradeManager } from './trade.js';

defineItem({
    id: 'trade_test_ore', name: '거래 시험 광석', description: '', category: '재료',
    weight: 1, stackable: true, maxStack: 99, baseMetadata: null, onUse: null,
    equipSlot: null, modifiers: null, baseDurability: null, tags: [],
});
defineItem({
    id: 'trade_test_sword', name: '거래 시험 장검', description: '', category: '검',
    weight: 5, stackable: false, maxStack: 1, baseMetadata: null, onUse: null,
    equipSlot: null, modifiers: null, baseDurability: 100, tags: [],
});

function createPlayer(userId: number, name: string, maxWeight = 100): Player {
    return {
        userId,
        name,
        locationId: 'trade_test_location',
        isDefeated: false,
        gold: 1_000,
        inventory: Inventory.createEmpty(userId, maxWeight),
        save: async () => undefined,
    } as unknown as Player;
}

test('거래는 아이템 metadata와 골드를 에스크로한 뒤 양쪽 확인으로 교환한다', () => {
    const manager = new TradeManager();
    const first = createPlayer(1, '첫째');
    const second = createPlayer(2, '둘째');
    first.inventory.addItem('trade_test_sword', 1, { customName: '별을 벼린 검' });
    second.inventory.addItem('trade_test_ore', 5);

    assert.equal(manager.invite(first, second, 1_000).success, true);
    assert.equal(manager.accept(second, 1_100).success, true);
    assert.equal(manager.addItem(first, 0, 1).success, true);
    assert.equal(manager.addItem(second, 0, 3).success, true);
    assert.equal(manager.setGold(first, 200).success, true);
    assert.equal(manager.setGold(second, 50).success, true);
    assert.equal(first.gold, 800);
    assert.equal(second.gold, 950);

    assert.equal(manager.confirm(first).success, true);
    assert.equal(manager.confirm(second).success, true);
    assert.equal(manager.hasActiveSession(first.userId), false);
    assert.equal(first.gold, 850);
    assert.equal(second.gold, 1_150);
    assert.equal(first.inventory.getCount('trade_test_ore'), 3);
    assert.equal(second.inventory.getFirstItemByData('trade_test_sword')?.name, '별을 벼린 검');
});

test('거래 제안을 바꾸면 양쪽 확인이 자동 해제되고 취소 시 원상 복구한다', () => {
    const manager = new TradeManager();
    const first = createPlayer(3, '셋째');
    const second = createPlayer(4, '넷째');
    first.inventory.addItem('trade_test_ore', 8);
    manager.invite(first, second, 2_000);
    manager.accept(second, 2_100);
    manager.addItem(first, 0, 5);
    manager.confirm(first);
    assert.equal(manager.getSessionSnapshot(first.userId)?.first.confirmed, true);

    manager.setGold(second, 100);
    const changed = manager.getSessionSnapshot(first.userId)!;
    assert.equal(changed.first.confirmed, false);
    assert.equal(changed.second.confirmed, false);
    manager.cancel(second);

    assert.equal(first.inventory.getCount('trade_test_ore'), 8);
    assert.equal(second.gold, 1_000);
});

test('받는 사람의 중량이 부족하면 최종 확인을 취소하고 거래를 유지한다', () => {
    const manager = new TradeManager();
    const first = createPlayer(5, '다섯째');
    const second = createPlayer(6, '여섯째', 1);
    first.inventory.addItem('trade_test_sword', 1);
    manager.invite(first, second, 3_000);
    manager.accept(second, 3_100);
    manager.addItem(first, 0, 1);
    manager.confirm(first);
    const result = manager.confirm(second);

    assert.equal(result.success, false);
    assert.match(result.reason ?? '', /중량/);
    assert.equal(manager.hasActiveSession(first.userId), true);
    assert.equal(manager.getSessionSnapshot(first.userId)?.first.confirmed, false);
    manager.cancel(first);
    assert.equal(first.inventory.getCount('trade_test_sword'), 1);
});

test('거래 중 장소 이탈이나 접속 종료가 감지되면 에스크로를 자동 복원한다', () => {
    const manager = new TradeManager();
    const first = createPlayer(7, '일곱째');
    const second = createPlayer(8, '여덟째');
    first.inventory.addItem('trade_test_ore', 4);
    manager.invite(first, second, 4_000);
    manager.accept(second, 4_100);
    manager.addItem(first, 0, 4);
    manager.setGold(second, 300);

    second.locationId = 'another_location';
    manager.update([first, second], 4_200);

    assert.equal(manager.hasActiveSession(first.userId), false);
    assert.equal(first.inventory.getCount('trade_test_ore'), 4);
    assert.equal(second.gold, 1_000);
});
