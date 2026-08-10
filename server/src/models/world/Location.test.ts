import assert from 'node:assert/strict';
import test from 'node:test';
import { GameTags } from '../../../../shared/tags.js';
import { defineMonster } from '../actors/Monster.js';
import Equipment from '../economy/Equipment.js';
import Entity from '../core/Entity.js';
import Location from './Location.js';
import { DROPPED_ITEM_LIFETIME_MS } from './Location.js';
import { defineItem } from '../economy/Item.js';

defineMonster({
    id: 'test_instance_group_monster',
    name: '시험 균열 무리',
    description: '인스턴스 무리 교전 배정 시험용 몬스터.',
    level: 1,
    exp: 0,
    baseAttribute: { maxLife: 100, maxMentality: 10, atk: 1 },
    drops: [],
    expReward: 0,
    equipments: [],
    tags: [GameTags.ENTITY_MONSTER],
});

defineItem({
    id: 'test_dropped_item_expiration',
    name: '시험용 바닥 아이템',
    description: '바닥 아이템 만료 시험용 아이템.',
    image: 'items/health_potion',
    category: 'test',
    weight: 0.1,
    stackable: true,
    maxStack: 99,
    baseMetadata: null,
    onUse: null,
    equipSlot: null,
    modifiers: null,
    baseDurability: null,
    tags: [],
});

class TestIntruder extends Entity {
    override get name(): string { return `시험 침입자 ${this.userId}`; }
    override get isPlayer(): boolean { return true; }
    override get playerUserId(): number { return this.userId; }

    constructor(private readonly userId: number, locationId: string) {
        super(1, 0, locationId, { maxLife: 100, maxMentality: 10 }, Equipment.createEmpty(), undefined, [
            GameTags.ENTITY_PLAYER,
        ]);
    }
}

test('인스턴스의 몬스터 무리는 참가자가 둘이면 대상을 순환 분산하고 혼자면 전부 한 명을 압박한다', () => {
    const location = new Location({
        id: 'test_instance_group_room',
        name: '시험 균열 방',
        zoneType: 'safe',
        x: 0, y: 0, z: -1000,
        npcIds: [],
        objects: [{ type: 'monster', dataId: 'test_instance_group_monster', maxCount: 4, respawnTime: 0 }],
        connections: [],
        tags: [GameTags.LOCATION_INSTANCE_DUNGEON],
    });
    const first = new TestIntruder(1, location.id);
    const second = new TestIntruder(2, location.id);
    location.authorizeMonsterCombatParticipants([1, 2]);

    assert.equal(location.engageHostileMonsterGroup([first, second]), 4);
    assert.deepEqual(
        location.getMonstersByDataId('test_instance_group_monster').map(monster => monster.currentTarget),
        [first, second, first, second],
    );

    const soloLocation = new Location({
        id: 'test_instance_solo_room',
        name: '시험 단독 균열 방',
        zoneType: 'safe',
        x: 0, y: 0, z: -1000,
        npcIds: [],
        objects: [{ type: 'monster', dataId: 'test_instance_group_monster', maxCount: 4, respawnTime: 0 }],
        connections: [],
        tags: [GameTags.LOCATION_INSTANCE_DUNGEON],
    });
    const solo = new TestIntruder(3, soloLocation.id);
    soloLocation.authorizeMonsterCombatParticipants([3]);

    assert.equal(soloLocation.engageHostileMonsterGroup([solo]), 4);
    assert.ok(soloLocation.getMonstersByDataId('test_instance_group_monster')
        .every(monster => monster.currentTarget === solo));
});

test('바닥 아이템은 5분 뒤 조회와 줍기 대상에서 제거된다', t => {
    let now = 1_000;
    t.mock.method(Date, 'now', () => now);
    const location = new Location({
        id: 'test_dropped_item_expiration_location',
        name: '시험 바닥',
        zoneType: 'safe',
        x: 0, y: 0, z: 0,
        npcIds: [], objects: [], connections: [], tags: [],
    });

    location.addDroppedItem({
        itemDataId: 'test_dropped_item_expiration',
        count: 2,
        durability: null,
        metadataDelta: null,
        tags: [],
    });
    now += DROPPED_ITEM_LIFETIME_MS - 1;
    assert.equal(location.getDroppedItems().length, 1);

    now += 1;
    assert.deepEqual(location.getDroppedItemDisplays(), []);
    assert.equal(location.pickupItem(0), null);
});

test('같은 바닥 묶음에 새 아이템이 합쳐지면 전체 묶음의 5분 수명이 갱신된다', t => {
    let now = 10_000;
    t.mock.method(Date, 'now', () => now);
    const location = new Location({
        id: 'test_dropped_item_stack_expiration_location',
        name: '시험 바닥 묶음',
        zoneType: 'safe',
        x: 0, y: 0, z: 0,
        npcIds: [], objects: [], connections: [], tags: [],
    });
    const snapshot = {
        itemDataId: 'test_dropped_item_expiration',
        count: 1,
        durability: null,
        metadataDelta: null,
        tags: [],
    };

    location.addDroppedItem(snapshot);
    now += DROPPED_ITEM_LIFETIME_MS - 1;
    location.addDroppedItem(snapshot);
    now += DROPPED_ITEM_LIFETIME_MS - 1;

    assert.equal(location.getDroppedItems()[0]?.count, 2);
});
