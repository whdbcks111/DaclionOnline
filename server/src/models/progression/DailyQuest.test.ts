import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { GameTags } from '../../../../shared/tags.js';
import '../../data/progression/progress.js';
import '../../data/economy/items.js';
import '../../data/combat/statusEffects.js';
import '../../data/progression/jobs.js';
import '../../data/progression/quests.js';
import { initSocket } from '../../modules/infrastructure/socket.js';
import Entity from '../core/Entity.js';
import Equipment from '../economy/Equipment.js';
import Inventory from '../economy/Inventory.js';
import type Player from '../actors/Player.js';
import { PlayerProgress } from './Progress.js';
import QuestBook from './QuestBook.js';
import { emitGameEvent, GameEventIds } from '../core/GameEvent.js';
import {
    DailyCommissionType,
    DAILY_COMMISSION_LAST_CLAIM_DAY,
    DAILY_COMMISSION_NPC_ID,
    getDailyCommissionDayKey,
    getDailyCommissionDefinition,
} from '../../data/progression/quests.js';

initSocket(createServer(), '*');

class DailyQuestPlayer extends Entity {
    override readonly name = '일일 의뢰 시험 플레이어';
    readonly userId: number;
    readonly inventory: Inventory;
    readonly progress: PlayerProgress;
    readonly quests: QuestBook;
    readonly skills = { grant: () => ({ acquired: true }) };
    gold = 0;
    gainedExp = 0;

    constructor(userId: number, level: number) {
        super(level, 0, 'town_square', { maxLife: 100 }, Equipment.createEmpty());
        this.userId = userId;
        this.inventory = Inventory.createEmpty(userId, 100);
        this.progress = PlayerProgress.createEmpty(userId);
        this.quests = QuestBook.createEmpty(userId);
        this.quests.bindOwner(this as unknown as Player);
        this.inventory.subscribeChanges(() => this.quests.refreshSnapshotObjectives());
        this.progress.subscribeChanges(() => this.quests.refreshSnapshotObjectives());
    }

    override get isPlayer(): boolean { return true; }
    override get playerUserId(): number { return this.userId; }
    override get maxExp(): number { return 1_000; }
    gainExp(amount: number): number[] { this.gainedExp += amount; return []; }
    async save(): Promise<void> {}
}

class DailyQuestTarget extends Entity {
    override readonly name = '일일 의뢰 시험 몬스터';

    constructor(level: number, boss = false, extraTags: string[] = []) {
        super(level, 0, 'test', { maxLife: 10 }, Equipment.createEmpty(), undefined, [
            GameTags.ENTITY_MONSTER,
            ...(boss ? [GameTags.ENTITY_BOSS] : []),
            ...extraTags,
        ]);
    }
}

function findUserIdForDailyType(level: number, type: DailyCommissionType, start = 88_100): number {
    for (let userId = start; userId < start + 20; userId++) {
        if (getDailyCommissionDefinition(level, userId).type === type) return userId;
    }
    throw new Error(`일일 의뢰 유형을 배정할 userId를 찾지 못했습니다: ${type.key}`);
}

test('일일 의뢰 날짜는 한국 표준시 자정에 바뀐다', () => {
    assert.equal(getDailyCommissionDayKey(new Date('2026-07-30T14:59:59.000Z')), '2026-07-30');
    assert.equal(getDailyCommissionDayKey(new Date('2026-07-30T15:00:00.000Z')), '2026-07-31');
});

test('계정별 일일 의뢰는 레벨별 접근 가능한 유형을 KST 날짜와 userId로 고르게 배정한다', () => {
    const day = new Date();
    const assigned = Array.from({ length: 5 }, (_, index) =>
        getDailyCommissionDefinition(200, 89_000 + index, day).type.key);
    assert.deepEqual(new Set(assigned), new Set(DailyCommissionType.values().map(type => type.key)));

    const lowLevelAssigned = Array.from({ length: 3 }, (_, index) =>
        getDailyCommissionDefinition(30, 89_100 + index, day).type);
    assert.equal(lowLevelAssigned.includes(DailyCommissionType.GATHERING), false);
    assert.equal(lowLevelAssigned.includes(DailyCommissionType.BOSS), false);

    const midLevelAssigned = Array.from({ length: 4 }, (_, index) =>
        getDailyCommissionDefinition(50, 89_200 + index, day).type);
    assert.deepEqual(
        new Set(midLevelAssigned),
        new Set([
            DailyCommissionType.HUNT,
            DailyCommissionType.MINING,
            DailyCommissionType.FISHING,
            DailyCommissionType.BOSS,
        ]),
    );

    const today = getDailyCommissionDefinition(200, 89_500, new Date('2026-07-31T03:00:00.000Z'));
    const tomorrow = getDailyCommissionDefinition(200, 89_500, new Date('2026-08-01T03:00:00.000Z'));
    assert.notEqual(today.type, tomorrow.type);
});

test('보스 일일 의뢰는 수락 레벨 80~120% 보스를 정확히 한 체만 인정한다', () => {
    const userId = findUserIdForDailyType(200, DailyCommissionType.BOSS);
    const actual = new DailyQuestPlayer(userId, 200);
    const player = actual as unknown as Player;
    const definition = getDailyCommissionDefinition(player.level, player.userId);
    assert.equal(definition.required, 1);
    assert.equal(player.quests.accept(definition.id, DAILY_COMMISSION_NPC_ID).success, true);

    emitGameEvent(GameEventIds.ENTITY_DEFEATED, {
        actor: player,
        subject: new DailyQuestTarget(200),
    });
    emitGameEvent(GameEventIds.ENTITY_DEFEATED, {
        actor: player,
        subject: new DailyQuestTarget(159, true),
    });
    emitGameEvent(GameEventIds.ENTITY_DEFEATED, {
        actor: player,
        subject: new DailyQuestTarget(241, true),
    });
    assert.equal(player.quests.getSnapshot(definition.id)?.objectives[0].progress, 0);

    const otherPlayer = new DailyQuestPlayer(userId + 10_000, 200) as unknown as Player;
    emitGameEvent(GameEventIds.ENTITY_DEFEATED, {
        actor: otherPlayer,
        subject: new DailyQuestTarget(200, true),
    });
    assert.equal(player.quests.getSnapshot(definition.id)?.objectives[0].progress, 0);

    emitGameEvent(GameEventIds.ENTITY_DEFEATED, {
        actor: player,
        subject: new DailyQuestTarget(200, true),
    });
    assert.equal(player.quests.canTurnIn(definition.id, DAILY_COMMISSION_NPC_ID), true);
    assert.equal(player.quests.turnIn(definition.id, DAILY_COMMISSION_NPC_ID).success, true);
    assert.equal(actual.gainedExp, 500);
    assert.equal(actual.inventory.getCount('battle_tonic') > 0, true);
    assert.equal(actual.inventory.getCount('arcane_tonic') > 0, true);
    assert.equal(actual.inventory.getCount('hostile_return_scroll'), 1);
});

test('Lv.200 토벌 일일 의뢰는 적정 일반 몬스터만 세고 복합 보상을 지급한다', () => {
    const userId = findUserIdForDailyType(200, DailyCommissionType.HUNT);
    const actual = new DailyQuestPlayer(userId, 200);
    const player = actual as unknown as Player;
    const definition = getDailyCommissionDefinition(player.level, player.userId);
    assert.equal(definition.required, 16);
    assert.equal(player.quests.accept(definition.id, DAILY_COMMISSION_NPC_ID).success, true);

    const tooLow = new DailyQuestTarget(159);
    const appropriate = new DailyQuestTarget(160);
    const boss = new DailyQuestTarget(200, true);
    emitGameEvent(GameEventIds.ENTITY_DEFEATED, { actor: player, subject: tooLow });
    emitGameEvent(GameEventIds.ENTITY_DEFEATED, { actor: player, subject: boss });
    assert.equal(player.quests.getSnapshot(definition.id)?.objectives[0].progress, 0);

    for (let index = 0; index < definition.required; index++) {
        emitGameEvent(GameEventIds.ENTITY_DEFEATED, { actor: player, subject: appropriate });
    }
    assert.equal(player.quests.canTurnIn(definition.id, DAILY_COMMISSION_NPC_ID), true);
    assert.equal(player.quests.turnIn(definition.id, DAILY_COMMISSION_NPC_ID).success, true);
    assert.equal(actual.gainedExp, 500);
    assert.equal(actual.gold, definition.gold);
    assert.equal(actual.inventory.getCount('large_health_potion'), definition.recoveryCount);
    assert.ok(actual.inventory.getCount('battle_tonic') > 0);
    assert.equal(actual.progress.getState(DAILY_COMMISSION_LAST_CLAIM_DAY), getDailyCommissionDayKey());
    assert.equal(player.quests.canAccept(definition.id, DAILY_COMMISSION_NPC_ID), false);
});

test('채광·채집·낚시 일일 의뢰는 각 생활 콘텐츠의 성공 이벤트만 진행시킨다', () => {
    for (const type of [DailyCommissionType.MINING, DailyCommissionType.GATHERING, DailyCommissionType.FISHING]) {
        const userId = findUserIdForDailyType(200, type, 89_200);
        const actual = new DailyQuestPlayer(userId, 200);
        const player = actual as unknown as Player;
        const definition = getDailyCommissionDefinition(player.level, player.userId);
        assert.equal(player.quests.accept(definition.id, DAILY_COMMISSION_NPC_ID).success, true);

        for (let index = 0; index < definition.required; index++) {
            if (type === DailyCommissionType.MINING) {
                const ore = new DailyQuestTarget(1, false, [GameTags.ENTITY_RESOURCE, GameTags.RESOURCE_ORE]);
                emitGameEvent(GameEventIds.RESOURCE_DESTROYED, { actor: player, subject: ore });
            } else if (type === DailyCommissionType.GATHERING) {
                emitGameEvent(GameEventIds.RESOURCE_INTERACTED, {
                    actor: player,
                    data: { resourceDataId: 'snowmoss_patch' },
                });
            } else {
                emitGameEvent(GameEventIds.FISH_CAUGHT, {
                    actor: player,
                    data: { itemDataId: 'silver_minnow', rarity: 'common' },
                });
            }
        }

        assert.equal(player.quests.canTurnIn(definition.id, DAILY_COMMISSION_NPC_ID), true);
        assert.equal(player.quests.turnIn(definition.id, DAILY_COMMISSION_NPC_ID).success, true);
        assert.equal(actual.gainedExp, 500);
        assert.equal(actual.gold, definition.gold);
        assert.ok(actual.inventory.getCount(type === DailyCommissionType.MINING
            ? 'mana_crystal'
            : type === DailyCommissionType.GATHERING ? 'swift_tonic' : 'earthworm_bait') > 0);
    }
});
