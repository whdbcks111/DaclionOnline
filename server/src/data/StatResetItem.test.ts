import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import './items.js';
import Equipment from '../models/Equipment.js';
import Inventory from '../models/Inventory.js';
import { defineItem, Item, ItemMetadataKeys } from '../models/Item.js';
import { reloadAllLocations } from '../models/Location.js';
import Player from '../models/Player.js';
import { PlayerProgress } from '../models/Progress.js';
import QuestBook from '../models/QuestBook.js';
import SkillBook from '../models/SkillBook.js';
import { registerOnlinePlayer, unregisterOnlinePlayer } from '../modules/playerRegistry.js';
import { initSocket } from '../modules/socket.js';

initSocket(createServer(), '*');
reloadAllLocations([{
    id: 'stat-reset-item-test-field',
    name: '초기화권 시험장',
    zoneType: 'safe',
    x: 0,
    y: 0,
    z: 0,
    isRespawnLocation: true,
    npcIds: [],
    objects: [],
    connections: [],
    tags: [],
}]);

let nextPlayerId = 89_000;

function createPlayer(
    stats: { strength: number; agility: number; vitality: number; sensibility: number; mentality: number },
): Player {
    const userId = nextPlayerId++;
    const player = Reflect.construct(Player, [
        userId,
        `초기화권시험${userId}`,
        21,
        0,
        'stat-reset-item-test-field',
        100,
        Inventory.createEmpty(userId, 1_000),
        Equipment.createEmpty(),
        PlayerProgress.createEmpty(userId),
        SkillBook.createEmpty(userId),
        QuestBook.createEmpty(userId),
        stats,
    ]) as Player;
    registerOnlinePlayer(player);
    return player;
}

async function useTicket(player: Player, itemDataId: string): Promise<void> {
    assert.equal(player.inventory.addItem(itemDataId, 1), true);
    const item = player.inventory.getFirstItemByData(itemDataId);
    assert.ok(item);
    await player.inventory.useItemInstance(item);
}

test('완전 초기화권은 직접 분배 포인트가 있을 때만 1장을 소모한다', async t => {
    const player = createPlayer({
        strength: 45, agility: 20, vitality: 20, sensibility: 20, mentality: 20,
    });
    t.after(() => unregisterOnlinePlayer(player.userId));
    await useTicket(player, 'stat_point_reset_ticket');
    assert.equal(player.stat.points.strength, 20);
    assert.equal(player.statPoint, 25);
    assert.equal(player.inventory.getCount('stat_point_reset_ticket'), 0);
});

test('환급할 포인트가 없으면 초기화권을 소모하지 않는다', async t => {
    const player = createPlayer({
        strength: 20, agility: 20, vitality: 20, sensibility: 20, mentality: 20,
    });
    t.after(() => unregisterOnlinePlayer(player.userId));
    await useTicket(player, 'stat_point_reset_ticket');
    assert.equal(player.statPoint, 0);
    assert.equal(player.inventory.getCount('stat_point_reset_ticket'), 1);
});

test('저장 전 id=0 아이템이 앞에 있어도 선택한 초기화권 인스턴스를 사용한다', async t => {
    const player = createPlayer({
        strength: 45, agility: 20, vitality: 20, sensibility: 20, mentality: 20,
    });
    t.after(() => unregisterOnlinePlayer(player.userId));
    assert.equal(player.inventory.addItem('health_potion', 1), true);
    assert.equal(player.inventory.addItem('stat_point_reset_ticket', 1), true);
    const potion = player.inventory.getFirstItemByData('health_potion');
    const ticket = player.inventory.getFirstItemByData('stat_point_reset_ticket');
    assert.ok(potion);
    assert.ok(ticket);
    assert.equal(potion.id, 0);
    assert.equal(ticket.id, 0);

    await player.inventory.useItemInstance(ticket);
    assert.equal(player.inventory.getCount('health_potion'), 1);
    assert.equal(player.inventory.getCount('stat_point_reset_ticket'), 0);
    assert.equal(player.stat.points.strength, 20);
});

test('빛바랜 초기화권은 각 스탯에서 최대 10개씩 총 50개를 환급한다', async t => {
    const player = createPlayer({
        strength: 100, agility: 100, vitality: 100, sensibility: 100, mentality: 100,
    });
    t.after(() => unregisterOnlinePlayer(player.userId));
    await useTicket(player, 'faded_stat_reset_ticket');
    assert.deepEqual(player.stat.points, {
        strength: 90, agility: 90, vitality: 90, sensibility: 90, mentality: 90,
    });
    assert.equal(player.statPoint, 50);
    assert.equal(player.inventory.getCount('faded_stat_reset_ticket'), 0);
});

test('장착 요구치를 잃는 초기화는 거부하고 티켓을 보존한다', async t => {
    defineItem({
        id: 'stat_reset_item_requirement_blade',
        name: '초기화권 요구치 시험검',
        description: '',
        image: 'items/old_sword',
        category: '장검',
        weight: 1,
        stackable: false,
        maxStack: 1,
        baseMetadata: null,
        onUse: null,
        equipSlot: 'mainHand',
        modifiers: null,
        baseDurability: null,
        tags: [],
    });
    const player = createPlayer({
        strength: 45, agility: 20, vitality: 20, sensibility: 20, mentality: 20,
    });
    t.after(() => unregisterOnlinePlayer(player.userId));
    const blade = new Item('stat_reset_item_requirement_blade', 1, null, {
        [ItemMetadataKeys.REQUIREMENTS]: {
            level: 1,
            stats: { strength: 40 },
            source: 'shop',
        },
    });
    assert.equal(player.equipment.equip('mainHand', blade, player.attribute), true);
    await useTicket(player, 'stat_point_reset_ticket');
    assert.equal(player.stat.points.strength, 45);
    assert.equal(player.inventory.getCount('stat_point_reset_ticket'), 1);
});

test('초기화 적용이 예외로 중단되면 먼저 제거한 티켓을 원상 복구한다', async t => {
    const player = createPlayer({
        strength: 45, agility: 20, vitality: 20, sensibility: 20, mentality: 20,
    });
    t.after(() => unregisterOnlinePlayer(player.userId));
    Object.defineProperty(player, 'resetAllocatedStats', {
        value: () => { throw new Error('의도한 초기화 실패'); },
    });
    await useTicket(player, 'stat_point_reset_ticket');
    assert.equal(player.stat.points.strength, 45);
    assert.equal(player.inventory.getCount('stat_point_reset_ticket'), 1);
});
