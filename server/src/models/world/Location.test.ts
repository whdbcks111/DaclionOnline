import assert from 'node:assert/strict';
import test from 'node:test';
import { GameTags } from '../../../../shared/tags.js';
import { defineMonster } from '../actors/Monster.js';
import Equipment from '../economy/Equipment.js';
import Entity from '../core/Entity.js';
import Location from './Location.js';

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
