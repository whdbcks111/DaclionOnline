import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { MusicCombatState } from '../../../shared/adaptiveMusic.js';
import { GameTags } from '../../../shared/tags.js';
import { initSocket } from '../modules/socket.js';
import Entity from './Entity.js';
import Equipment from './Equipment.js';
import Inventory from './Inventory.js';
import { reloadAllLocations } from './Location.js';
import Player, { MUSIC_COMBAT_HOLD_SECONDS } from './Player.js';
import { PlayerProgress } from './Progress.js';
import QuestBook from './QuestBook.js';
import SkillBook from './SkillBook.js';

const FIELD_LOCATION_ID = 'adaptive-music-combat-field';
const OTHER_LOCATION_ID = 'adaptive-music-combat-other';

initSocket(createServer(), '*');
reloadAllLocations([
    {
        id: FIELD_LOCATION_ID,
        name: '적응형 음악 교전 시험장',
        zoneType: 'hostile',
        x: 0,
        y: 0,
        z: 0,
        isRespawnLocation: true,
        mapColor: '#6fa85d',
        npcIds: [],
        objects: [],
        connections: [{ locationId: OTHER_LOCATION_ID }],
        tags: [],
    },
    {
        id: OTHER_LOCATION_ID,
        name: '적응형 음악 이동 시험장',
        zoneType: 'safe',
        x: 1,
        y: 0,
        z: 0,
        mapColor: '#d6a85f',
        npcIds: [],
        objects: [],
        connections: [{ locationId: FIELD_LOCATION_ID }],
        tags: [],
    },
]);

let nextPlayerId = 70_000;

function createPlayer(locationId = FIELD_LOCATION_ID): Player {
    const userId = nextPlayerId++;
    return Reflect.construct(Player, [
        userId,
        `적응음악${userId}`,
        1,
        0,
        locationId,
        1_000,
        Inventory.createEmpty(userId, 1_000),
        Equipment.createEmpty(),
        PlayerProgress.createEmpty(userId),
        SkillBook.createEmpty(userId),
        QuestBook.createEmpty(userId),
    ]) as Player;
}

class TestCombatant extends Entity {
    override readonly name: string;

    constructor(
        name: string,
        tags: readonly string[],
        locationId = FIELD_LOCATION_ID,
    ) {
        super(1, 0, locationId, {
            maxLife: 1_000,
            speed: 1,
            attackSpeed: 1,
        }, Equipment.createEmpty(), undefined, tags);
        this.name = name;
    }
}

function createMonster(name = '일반 몬스터'): TestCombatant {
    return new TestCombatant(name, [GameTags.ENTITY_MONSTER, GameTags.TRAIT_LIVING]);
}

function createBoss(): TestCombatant {
    return new TestCombatant('보스 몬스터', [
        GameTags.ENTITY_MONSTER,
        GameTags.ENTITY_BOSS,
        GameTags.TRAIT_LIVING,
    ]);
}

const ATTACK_OPTIONS = Object.freeze({
    unavoidable: true,
    criticalRate: 0,
    consumeMainHandDurability: false,
    triggerMainHandHitEffects: false,
});

test('플레이어가 일반 몬스터를 실제 공격하면 수동 대상 지정과 무관하게 전투 음악 상태가 된다', () => {
    const player = createPlayer();
    const monster = createMonster();

    assert.equal(player.musicCombatState, MusicCombatState.EXPLORATION);
    const result = player.attack(monster, 'absolute', 10, ATTACK_OPTIONS);

    assert.ok(result);
    assert.equal(result.evaded, false);
    assert.equal(player.musicCombatState, MusicCombatState.COMBAT);
});

test('플레이어가 공격받거나 공격 source의 지속 피해를 받으면 실제 피격자 교전도 갱신된다', () => {
    const attacked = createPlayer();
    const attacker = createMonster('공격 몬스터');
    assert.ok(attacker.attack(attacked, 'absolute', 10, ATTACK_OPTIONS));
    assert.equal(attacked.musicCombatState, MusicCombatState.COMBAT);

    const damaged = createPlayer();
    const source = createMonster('지속 피해 원본');
    const result = damaged.damage(10, 'absolute', {
        type: 'poison',
        causeEntity: source,
        fixedDamage: true,
    });
    assert.equal(result.finalDamage, 10);
    assert.equal(damaged.musicCombatState, MusicCombatState.COMBAT);
});

test('실제로 받아들여진 공격은 대상이 회피해도 양쪽 플레이어 owner의 교전을 갱신한다', () => {
    const attacker = createPlayer();
    const defender = createPlayer();
    defender.grantGuaranteedEvasion('test:adaptive-music');

    const result = attacker.attack(defender, 'absolute', 10, {
        ...ATTACK_OPTIONS,
        unavoidable: false,
    });

    assert.ok(result);
    assert.equal(result.evaded, true);
    assert.equal(attacker.musicCombatState, MusicCombatState.COMBAT);
    assert.equal(defender.musicCombatState, MusicCombatState.COMBAT);
});

test('보스 상태는 우선하지만 일반 교전이 보스 타이머를 무기한 연장하지 않는다', () => {
    const player = createPlayer();
    const boss = createBoss();
    const monster = createMonster();

    assert.ok(boss.attack(player, 'absolute', 10, ATTACK_OPTIONS));
    assert.equal(player.musicCombatState, MusicCombatState.BOSS);

    player.update(5);
    assert.ok(monster.attack(player, 'absolute', 10, ATTACK_OPTIONS));
    assert.equal(player.musicCombatState, MusicCombatState.BOSS);

    player.update(4.01);
    assert.equal(player.musicCombatState, MusicCombatState.COMBAT);
    player.update(5);
    assert.equal(player.musicCombatState, MusicCombatState.EXPLORATION);
});

test('일반 교전 상태는 마지막 실제 교전 약 9초 뒤 탐험으로 만료된다', () => {
    const player = createPlayer();
    assert.ok(player.attack(createMonster(), 'absolute', 10, ATTACK_OPTIONS));

    player.update(MUSIC_COMBAT_HOLD_SECONDS - 0.01);
    assert.equal(player.musicCombatState, MusicCombatState.COMBAT);
    player.update(0.02);
    assert.equal(player.musicCombatState, MusicCombatState.EXPLORATION);
});

test('장소 이동과 사망 및 부활은 남아 있던 적응형 음악 교전 상태를 즉시 지운다', () => {
    const moved = createPlayer();
    assert.ok(moved.attack(createBoss(), 'absolute', 10, ATTACK_OPTIONS));
    assert.equal(moved.musicCombatState, MusicCombatState.BOSS);
    moved.locationId = OTHER_LOCATION_ID;
    assert.equal(moved.musicCombatState, MusicCombatState.EXPLORATION);

    const defeated = createPlayer();
    assert.ok(createBoss().attack(defeated, 'absolute', 10, ATTACK_OPTIONS));
    defeated.onDeath();
    assert.equal(defeated.musicCombatState, MusicCombatState.EXPLORATION);

    const respawned = createPlayer();
    assert.ok(createBoss().attack(respawned, 'absolute', 10, ATTACK_OPTIONS));
    respawned.respawn();
    assert.equal(respawned.musicCombatState, MusicCombatState.EXPLORATION);
});

test('광맥과 일반 오브젝트 공격 및 source 피해는 적응형 음악 교전으로 취급하지 않는다', () => {
    const player = createPlayer();
    const resource = new TestCombatant('광맥', [
        GameTags.ENTITY_RESOURCE,
        GameTags.RESOURCE_ORE,
        GameTags.TRAIT_INANIMATE,
    ]);

    assert.ok(player.attack(resource, 'absolute', 10, ATTACK_OPTIONS));
    assert.equal(player.musicCombatState, MusicCombatState.EXPLORATION);

    resource.damage(10, 'absolute', {
        type: 'attack',
        causeEntity: player,
        fixedDamage: true,
    });
    assert.equal(player.musicCombatState, MusicCombatState.EXPLORATION);
});
