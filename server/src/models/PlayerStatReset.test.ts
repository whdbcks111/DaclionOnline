import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { initSocket } from '../modules/socket.js';
import Equipment from './Equipment.js';
import Inventory from './Inventory.js';
import { defineItem, Item, ItemMetadataKeys } from './Item.js';
import { reloadAllLocations } from './Location.js';
import Player, { calculatePlayerStatReset } from './Player.js';
import { PlayerProgress } from './Progress.js';
import QuestBook from './QuestBook.js';
import SkillBook from './SkillBook.js';

initSocket(createServer(), '*');
reloadAllLocations([{
    id: 'stat-reset-test-field',
    name: '스탯 초기화 시험장',
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

let nextPlayerId = 88_000;

function createPlayer(
    stats: { strength: number; agility: number; vitality: number; sensibility: number; mentality: number },
    statPoint = 0,
): Player {
    const userId = nextPlayerId++;
    return Reflect.construct(Player, [
        userId,
        `초기화시험${userId}`,
        21,
        0,
        'stat-reset-test-field',
        100,
        Inventory.createEmpty(userId, 1_000),
        Equipment.createEmpty(),
        PlayerProgress.createEmpty(userId),
        SkillBook.createEmpty(userId),
        QuestBook.createEmpty(userId),
        stats,
        10_000,
        10_000,
        100,
        100,
        statPoint,
    ]) as Player;
}

test('Lv.1 자동 성장분만 있는 플레이어는 환급할 포인트가 없다', () => {
    const result = calculatePlayerStatReset(1, {
        strength: 0, agility: 0, vitality: 0, sensibility: 0, mentality: 0,
    }, 3);
    assert.equal(result.automaticFloor, 0);
    assert.equal(result.refundedStatPoints, 0);
    assert.equal(result.statPoint, 3);
});

test('완전 초기화는 레벨 자동 성장 하한을 보존하고 기존 미사용 포인트에 정확히 합산한다', () => {
    const result = calculatePlayerStatReset(21, {
        strength: 45,
        agility: 20,
        vitality: 34,
        sensibility: 19,
        mentality: 200,
    }, 7);
    assert.deepEqual(result.stats, {
        strength: 20,
        agility: 20,
        vitality: 20,
        sensibility: 19,
        mentality: 20,
    });
    assert.equal(result.refundedStatPoints, 219);
    assert.equal(result.statPoint, 226);
});

test('빛바랜 초기화는 스탯마다 10개, 전체 50개까지만 환급한다', () => {
    const result = calculatePlayerStatReset(21, {
        strength: 100,
        agility: 100,
        vitality: 100,
        sensibility: 100,
        mentality: 100,
    }, 4, 10);
    assert.deepEqual(result.stats, {
        strength: 90,
        agility: 90,
        vitality: 90,
        sensibility: 90,
        mentality: 90,
    });
    assert.equal(result.refundedStatPoints, 50);
    assert.equal(result.statPoint, 54);
});

test('정련·복원 되돌림은 스탯별 상한과 전체 상한을 균등하게 함께 적용한다', () => {
    const stats = {
        strength: 200, agility: 200, vitality: 200, sensibility: 200, mentality: 200,
    };
    const refined = calculatePlayerStatReset(21, stats, 0, 25, 100);
    assert.deepEqual(refined.stats, {
        strength: 180, agility: 180, vitality: 180, sensibility: 180, mentality: 180,
    });
    assert.equal(refined.refundedStatPoints, 100);
    assert.equal(refined.statPoint, 100);

    const restored = calculatePlayerStatReset(21, stats, 0, 50, 200);
    assert.deepEqual(restored.stats, {
        strength: 160, agility: 160, vitality: 160, sensibility: 160, mentality: 160,
    });
    assert.equal(restored.refundedStatPoints, 200);
    assert.equal(restored.statPoint, 200);
});

test('전체 환급 상한의 못 채운 분량은 다른 스탯의 남은 배분량으로 재분배한다', () => {
    const result = calculatePlayerStatReset(21, {
        strength: 25,
        agility: 100,
        vitality: 100,
        sensibility: 100,
        mentality: 100,
    }, 0, 25, 100);
    assert.equal(result.stats.strength, 20);
    assert.equal(result.refundedStatPoints, 100);
    assert.equal(Object.values(result.statDeltas).reduce((sum, delta) => sum - delta, 0), 100);
    assert.ok(Object.values(result.statDeltas).every(delta => delta >= -25));
});

test('스탯 하한 미만의 구버전 값은 초기화가 임의로 올리지 않는다', () => {
    const result = calculatePlayerStatReset(21, {
        strength: 5,
        agility: 20,
        vitality: 21,
        sensibility: 0,
        mentality: 20,
    }, 0);
    assert.deepEqual(result.stats, {
        strength: 5,
        agility: 20,
        vitality: 20,
        sensibility: 0,
        mentality: 20,
    });
    assert.equal(result.refundedStatPoints, 1);
});

test('초기화 계산은 DB Int 경계를 벗어나는 입력을 거부한다', () => {
    const stats = { strength: 20, agility: 20, vitality: 20, sensibility: 20, mentality: 20 };
    assert.throws(() => calculatePlayerStatReset(Number.NaN, stats, 0));
    assert.throws(() => calculatePlayerStatReset(21, { ...stats, strength: 20.5 }, 0));
    assert.throws(() => calculatePlayerStatReset(21, stats, -1));
    assert.throws(() => calculatePlayerStatReset(21, stats, 0, 0));
    assert.throws(() => calculatePlayerStatReset(21, stats, 0, 10, 0));
});

test('Player 초기화 API는 modifier·현재 자원·인벤토리 중량 상한까지 즉시 동기화한다', () => {
    const player = createPlayer({
        strength: 45,
        agility: 20,
        vitality: 40,
        sensibility: 20,
        mentality: 50,
    }, 2);
    const result = player.resetAllocatedStats();

    assert.equal(result.refundedStatPoints, 75);
    assert.equal(player.statPoint, 77);
    assert.equal(player.stat.points.strength, 20);
    assert.equal(player.stat.points.vitality, 20);
    assert.equal(player.inventory.maxWeight, player.maxWeight);
    assert.ok(player.life <= player.maxLife);
    assert.ok(player.mentality <= player.maxMentality);
    assert.equal(player.dirty, true);
});

test('초기화 뒤 요구 스탯이 부족해질 장비가 있으면 preview에서 사용을 막는다', () => {
    defineItem({
        id: 'stat_reset_requirement_blade',
        name: '초기화 요구치 시험검',
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
        strength: 45,
        agility: 20,
        vitality: 20,
        sensibility: 20,
        mentality: 20,
    });
    const blade = new Item('stat_reset_requirement_blade', 1, null, {
        [ItemMetadataKeys.REQUIREMENTS]: {
            level: 1,
            stats: { strength: 40 },
            source: 'shop',
        },
    });
    assert.equal(player.equipment.equip('mainHand', blade, player.attribute), true);

    const preview = player.previewAllocatedStatReset();
    assert.match(preview.deniedReason ?? '', /먼저 장비를 해제/);
    assert.throws(() => player.resetAllocatedStats());
    assert.equal(player.stat.points.strength, 45);
});
