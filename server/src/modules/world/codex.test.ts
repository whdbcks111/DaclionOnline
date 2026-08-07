import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { AttributeType } from '../../models/core/Attribute.js';
import CodexBook, {
    CodexCategory,
    createCodexEntryId,
    reloadCodexRegistry,
    type CodexEntryDefinition,
} from '../../models/progression/Codex.js';
import Entity from '../../models/core/Entity.js';
import Equipment from '../../models/economy/Equipment.js';
import { emitGameEvent, GameEventIds } from '../../models/core/GameEvent.js';
import { defineLocation } from '../../models/world/Location.js';
import Monster, { defineMonster } from '../../models/actors/Monster.js';
import type Player from '../../models/actors/Player.js';
import { PlayerProgress } from '../../models/progression/Progress.js';
import Resource, { defineResource } from '../../models/actors/Resource.js';
import { markLocationVisited } from '../../models/world/WorldMap.js';
import { GameTags } from '../../../../shared/tags.js';
import { initSocket } from '../infrastructure/socket.js';
import {
    initCodexEventTracking,
    initializePlayerCodex,
    refreshCodexBonuses,
    resetCodexEventTracking,
} from './codex.js';

initSocket(createServer(), '*');

const NORMAL_MONSTER_ID = 'codex_event_normal';
const BOSS_MONSTER_ID = 'codex_event_boss';
const ORE_ID = 'codex_event_ore';
const NON_ORE_ID = 'codex_event_herb';
const LOCATION_ID = 'codex_event_location';
const RECIPE_ID = 'codex-event:meal';

class CodexTestPlayer extends Entity {
    readonly userId: number;
    readonly progress: PlayerProgress;
    readonly codex: CodexBook;

    constructor(userId: number, progress = PlayerProgress.createEmpty(userId)) {
        super(1, 0, LOCATION_ID, {
            maxLife: 1_000,
            maxMentality: 500,
            atk: 100,
            magicForce: 100,
            def: 100,
            magicDef: 100,
            speed: 10,
        }, Equipment.createEmpty());
        this.userId = userId;
        this.progress = progress;
        this.codex = new CodexBook(progress);
    }

    override get name(): string { return `도감 시험자 ${this.userId}`; }
    override get isPlayer(): boolean { return true; }
    override get playerUserId(): number { return this.userId; }
}

class AttackProxy extends Entity {
    constructor(private readonly owner: Entity) {
        super(1, 0, LOCATION_ID, { maxLife: 1 }, Equipment.createEmpty());
    }
    override get name(): string { return '최종 소유권 시험 공격체'; }
    override get attackOwner(): Entity { return this.owner.attackOwner; }
}

function definition(
    category: CodexCategory,
    sourceId: string,
    thresholds = { bronze: 1, silver: 1, gold: 1 },
): CodexEntryDefinition {
    return {
        id: createCodexEntryId(category, sourceId),
        category,
        name: `${category.label} ${sourceId}`,
        thresholds,
    };
}

function eventDefinitions(): CodexEntryDefinition[] {
    const definitions = [
        {
            ...definition(CodexCategory.MONSTER, NORMAL_MONSTER_ID, { bronze: 10, silver: 50, gold: 200 }),
            platinum: { type: 'no-hit' as const, description: '금 달성 후 무피격 처치' },
        },
        {
            ...definition(CodexCategory.BOSS, BOSS_MONSTER_ID, { bronze: 1, silver: 5, gold: 20 }),
            platinum: { type: 'no-hit' as const, description: '금 달성 후 무피격 처치' },
        },
        {
            ...definition(CodexCategory.ORE, ORE_ID, { bronze: 5, silver: 25, gold: 100 }),
            platinum: { type: 'barehand' as const, description: '금 달성 후 맨손 채굴' },
        },
        definition(CodexCategory.EXPLORATION, LOCATION_ID),
        {
            ...definition(CodexCategory.COOKING, RECIPE_ID, { bronze: 1, silver: 5, gold: 20 }),
            platinum: { type: 'count' as const, threshold: 200, description: '200회 요리' },
        },
    ];
    for (const category of CodexCategory.values()) {
        for (let index = 0; index < 12; index++) {
            definitions.push(definition(category, `codex_event_filler_${category.key}_${index}`, {
                bronze: category === CodexCategory.EXPLORATION ? 1 : 999,
                silver: category === CodexCategory.EXPLORATION ? 1 : 1_999,
                gold: category === CodexCategory.EXPLORATION ? 1 : 2_999,
            }));
        }
    }
    return definitions;
}

function count(player: CodexTestPlayer, category: CodexCategory, sourceId: string): number {
    return player.codex.getEntrySnapshot(createCodexEntryId(category, sourceId))?.count ?? -1;
}

defineMonster({
    id: NORMAL_MONSTER_ID,
    name: '도감 이벤트 일반 몬스터',
    description: '',
    level: 1,
    exp: 0,
    baseAttribute: { maxLife: 1, atk: 10 },
    drops: [],
    expReward: 0,
    equipments: [],
    tags: [],
});
defineMonster({
    id: BOSS_MONSTER_ID,
    name: '도감 이벤트 보스',
    description: '',
    level: 1,
    exp: 0,
    baseAttribute: { maxLife: 2 },
    drops: [],
    expReward: 0,
    equipments: [],
    tags: [GameTags.ENTITY_BOSS],
});
defineResource({
    id: ORE_ID,
    name: '도감 이벤트 광맥',
    level: 1,
    baseAttribute: { maxLife: 1 },
    drops: [],
    expReward: { min: 0, max: 0 },
    tags: [GameTags.RESOURCE_ORE],
});
defineResource({
    id: NON_ORE_ID,
    name: '도감 제외 채집물',
    level: 1,
    baseAttribute: { maxLife: 1 },
    drops: [],
    expReward: { min: 0, max: 0 },
    tags: [],
});
defineLocation({
    id: LOCATION_ID,
    name: '도감 이벤트 장소',
    zoneType: 'neutral',
    x: 91_001,
    y: 91_001,
    z: 0,
    npcIds: [],
    objects: [],
    connections: [],
    tags: [],
});

test.after(() => {
    resetCodexEventTracking();
    reloadCodexRegistry([], false);
});

test('확정 이벤트는 최종 attackOwner 플레이어에게만 종별로 한 번 기록한다', () => {
    reloadCodexRegistry(eventDefinitions());
    resetCodexEventTracking();
    initCodexEventTracking();
    initCodexEventTracking();
    const owner = new CodexTestPlayer(83_001);
    const other = new CodexTestPlayer(83_002);
    const proxy = new AttackProxy(owner);
    const nonPlayer = new AttackProxy(new Monster(NORMAL_MONSTER_ID));
    const normal = new Monster(NORMAL_MONSTER_ID);
    const boss = new Monster(BOSS_MONSTER_ID);
    const ore = new Resource(ORE_ID);
    const nonOre = new Resource(NON_ORE_ID);

    emitGameEvent(GameEventIds.ENTITY_DEFEATED, { actor: nonPlayer, subject: normal });
    assert.equal(count(owner, CodexCategory.MONSTER, NORMAL_MONSTER_ID), 0);

    emitGameEvent(GameEventIds.ENTITY_DEFEATED, { actor: proxy, subject: normal });
    emitGameEvent(GameEventIds.ENTITY_DEFEATED, { actor: proxy, subject: boss });
    assert.equal(count(owner, CodexCategory.MONSTER, NORMAL_MONSTER_ID), 1);
    assert.equal(count(owner, CodexCategory.BOSS, BOSS_MONSTER_ID), 1);

    // Resource.onDeath의 공용 ENTITY_DEFEATED와 전용 RESOURCE_DESTROYED가 함께 와도 광물은 한 번만 센다.
    emitGameEvent(GameEventIds.ENTITY_DEFEATED, { actor: proxy, subject: ore });
    emitGameEvent(GameEventIds.RESOURCE_DESTROYED, { actor: proxy, subject: ore });
    assert.equal(count(owner, CodexCategory.ORE, ORE_ID), 1);
    emitGameEvent(GameEventIds.RESOURCE_DESTROYED, { actor: proxy, subject: nonOre });
    assert.equal(count(owner, CodexCategory.ORE, ORE_ID), 1);

    emitGameEvent(GameEventIds.LOCATION_CHANGED, {
        actor: owner,
        data: { fromLocationId: 'before', toLocationId: LOCATION_ID },
    });
    emitGameEvent(GameEventIds.LOCATION_CHANGED, {
        actor: owner,
        data: { fromLocationId: 'before', toLocationId: LOCATION_ID },
    });
    assert.equal(count(owner, CodexCategory.EXPLORATION, LOCATION_ID), 1);

    emitGameEvent(GameEventIds.ITEM_CRAFTED, {
        actor: proxy,
        data: { recipeId: RECIPE_ID, quantity: 3 },
    });
    assert.equal(count(owner, CodexCategory.COOKING, RECIPE_ID), 3);
    emitGameEvent(GameEventIds.ITEM_CRAFTED, {
        actor: proxy,
        data: { recipeId: 'codex-event:not-a-food', quantity: 20 },
    });
    assert.equal(count(owner, CodexCategory.COOKING, RECIPE_ID), 3);

    emitGameEvent(GameEventIds.ENTITY_DEFEATED, { actor: other, subject: normal });
    assert.equal(count(owner, CodexCategory.MONSTER, NORMAL_MONSTER_ID), 1);
    assert.equal(count(other, CodexCategory.MONSTER, NORMAL_MONSTER_ID), 1);
});

test('금 달성 후 무피격 처치·맨손 채굴은 백금을, 보스 처치는 최고 기록을 남긴다', () => {
    reloadCodexRegistry(eventDefinitions());
    resetCodexEventTracking();
    initCodexEventTracking();
    const player = new CodexTestPlayer(83_050);
    const monsterEntryId = createCodexEntryId(CodexCategory.MONSTER, NORMAL_MONSTER_ID);
    const oreEntryId = createCodexEntryId(CodexCategory.ORE, ORE_ID);
    player.codex.record(monsterEntryId, 200);
    player.codex.record(oreEntryId, 100);

    const noHitMonster = new Monster(NORMAL_MONSTER_ID, LOCATION_ID);
    noHitMonster.damage(1, 'absolute', {
        type: 'attack',
        causeEntity: player,
        fixedDamage: true,
    });
    noHitMonster.lateUpdate(0);
    assert.equal(player.codex.getEntrySnapshot(monsterEntryId)?.rankKey, 'platinum');

    const hitPlayer = new CodexTestPlayer(83_051);
    hitPlayer.codex.record(monsterEntryId, 200);
    const hitMonster = new Monster(NORMAL_MONSTER_ID, LOCATION_ID);
    hitMonster.acquireCombatTarget(hitPlayer);
    hitPlayer.damage(1, 'absolute', {
        type: 'attack',
        causeEntity: hitMonster,
        fixedDamage: true,
    });
    hitMonster.damage(1, 'absolute', {
        type: 'attack',
        causeEntity: hitPlayer,
        fixedDamage: true,
    });
    hitMonster.lateUpdate(0);
    assert.equal(hitPlayer.codex.getEntrySnapshot(monsterEntryId)?.rankKey, 'gold');

    emitGameEvent(GameEventIds.RESOURCE_DESTROYED, {
        actor: player,
        subject: new Resource(ORE_ID, LOCATION_ID),
    });
    assert.equal(player.codex.getEntrySnapshot(oreEntryId)?.rankKey, 'platinum');

    const boss = new Monster(BOSS_MONSTER_ID, LOCATION_ID);
    boss.damage(1, 'absolute', {
        type: 'attack',
        causeEntity: player,
        fixedDamage: true,
    });
    boss.update(59);
    boss.damage(1, 'absolute', {
        type: 'attack',
        causeEntity: player,
        fixedDamage: true,
    });
    boss.lateUpdate(0);
    const time = player.codex.getBossTimeAttackSnapshots()
        .find(snapshot => snapshot.entryId === createCodexEntryId(CodexCategory.BOSS, BOSS_MONSTER_ID));
    assert.equal(time?.bestMilliseconds, 59_000);
    assert.equal(time?.penetration, 0.4);
});

test('로그인 복원과 progress 변경은 최고 rank modifier만 즉시 적용하고 중복하지 않는다', () => {
    const entries = CodexCategory.values().map(category => definition(category, `bonus_${category.key}`));
    reloadCodexRegistry(entries);
    const progress = PlayerProgress.createEmpty(83_101);
    const first = new CodexTestPlayer(83_101, progress);

    for (const entry of entries) first.codex.record(entry.id);
    refreshCodexBonuses(first as unknown as Player);
    refreshCodexBonuses(first as unknown as Player);

    assert.equal(first.attribute.get(AttributeType.ATK), 102.01);
    assert.equal(first.attribute.get(AttributeType.MAGIC_FORCE), 102.01);
    assert.equal(first.attribute.get(AttributeType.DEF), 101);
    assert.equal(first.attribute.get(AttributeType.MAGIC_DEF), 101);
    assert.equal(first.attribute.get(AttributeType.SPEED), 10.2);
    assert.equal(first.attribute.get(AttributeType.MAX_LIFE), 1_010);
    assert.equal(first.attribute.get(AttributeType.MAX_MENTALITY), 505);
    assert.equal(first.attribute.get(AttributeType.ARMOR_PEN), 20);
    assert.equal(first.attribute.get(AttributeType.MAGIC_PEN), 20);
    assert.equal(first.attribute.modifiers.filter(modifier => modifier.source.startsWith('codex:')).length, 19);

    const restored = new CodexTestPlayer(83_101, progress);
    initializePlayerCodex(restored as unknown as Player);
    initializePlayerCodex(restored as unknown as Player);
    assert.equal(restored.attribute.get(AttributeType.ATK), 102.01);
    assert.equal(restored.attribute.modifiers.filter(modifier => modifier.source.startsWith('codex:')).length, 19);

    const immediateProgress = PlayerProgress.createEmpty(83_102);
    const immediate = new CodexTestPlayer(83_102, immediateProgress);
    initializePlayerCodex(immediate as unknown as Player);
    assert.equal(immediate.attribute.get(AttributeType.ATK), 100);
    immediate.codex.record(createCodexEntryId(CodexCategory.MONSTER, 'bonus_monster'));
    assert.equal(immediate.attribute.get(AttributeType.ATK), 101);
});

test('기존 location visited flag 소급과 재초기화가 탐험 counter를 1로 유지한다', () => {
    reloadCodexRegistry([definition(CodexCategory.EXPLORATION, LOCATION_ID)]);
    const player = new CodexTestPlayer(83_201);
    assert.equal(markLocationVisited(player as unknown as Player, LOCATION_ID), true);

    initializePlayerCodex(player as unknown as Player);
    initializePlayerCodex(player as unknown as Player);

    assert.equal(count(player, CodexCategory.EXPLORATION, LOCATION_ID), 1);
    assert.equal(player.attribute.modifiers.filter(modifier =>
        modifier.source === 'codex:exploration:entries').length, 1);
});
