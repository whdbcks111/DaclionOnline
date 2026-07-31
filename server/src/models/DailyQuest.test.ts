import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { GameTags } from '../../../shared/tags.js';
import '../data/progress.js';
import '../data/items.js';
import '../data/statusEffects.js';
import '../data/jobs.js';
import '../data/quests.js';
import { initSocket } from '../modules/socket.js';
import Entity from './Entity.js';
import Equipment from './Equipment.js';
import Inventory from './Inventory.js';
import type Player from './Player.js';
import { PlayerProgress } from './Progress.js';
import QuestBook from './QuestBook.js';
import { emitGameEvent, GameEventIds } from './GameEvent.js';
import {
    DAILY_COMMISSION_LAST_CLAIM_DAY,
    DAILY_COMMISSION_NPC_ID,
    getDailyCommissionDayKey,
    getDailyCommissionDefinition,
} from '../data/quests.js';

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

    constructor(level: number, boss = false) {
        super(level, 0, 'test', { maxLife: 10 }, Equipment.createEmpty(), undefined, [
            GameTags.ENTITY_MONSTER,
            ...(boss ? [GameTags.ENTITY_BOSS] : []),
        ]);
    }
}

test('일일 의뢰 날짜는 한국 표준시 자정에 바뀐다', () => {
    assert.equal(getDailyCommissionDayKey(new Date('2026-07-30T14:59:59.000Z')), '2026-07-30');
    assert.equal(getDailyCommissionDayKey(new Date('2026-07-30T15:00:00.000Z')), '2026-07-31');
});

test('Lv.200 일일 의뢰는 수락 레벨의 80~120% 일반 몬스터 16체와 경험치 50%를 요구한다', () => {
    const actual = new DailyQuestPlayer(88_100, 200);
    const player = actual as unknown as Player;
    const definition = getDailyCommissionDefinition(player.level);
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
    assert.equal(actual.progress.getState(DAILY_COMMISSION_LAST_CLAIM_DAY), getDailyCommissionDayKey());
    assert.equal(player.quests.canAccept(definition.id, DAILY_COMMISSION_NPC_ID), false);
});
