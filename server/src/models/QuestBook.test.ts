import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { initSocket } from '../modules/socket.js';
import Entity from './Entity.js';
import Equipment from './Equipment.js';
import Inventory from './Inventory.js';
import { defineItem } from './Item.js';
import type Player from './Player.js';
import { PlayerProgress } from './Progress.js';
import {
    defineQuest,
    QuestMarker,
    QuestObjective,
    QuestReward,
    QuestStage,
    QuestStatus,
} from './Quest.js';
import QuestBook from './QuestBook.js';
import { emitGameEvent, GameEventIds } from './GameEvent.js';
import { GameTags } from '../../../shared/tags.js';

initSocket(createServer(), '*');

defineItem({
    id: 'quest_test_reward',
    name: '퀘스트 시험 보상',
    description: '',
    category: '시험',
    weight: 1,
    stackable: true,
    maxStack: 99,
    baseMetadata: null,
    onUse: null,
    equipSlot: null,
    modifiers: null,
    baseDurability: null,
    tags: [],
});

const HUNT_QUEST_ID = 'test:quest_hunt';
defineQuest({
    id: HUNT_QUEST_ID,
    name: '시험 사냥 의뢰',
    description: '슬라임 둘을 처치합니다.',
    giverNpcIds: ['test_guide'],
    turnInNpcIds: ['test_guide'],
    stages: [new QuestStage({
        id: 'hunt',
        objectives: [QuestObjective.kill(
            'slime',
            '슬라임 처치',
            2,
            target => target.hasTag(GameTags.ENTITY_SLIME),
        )],
    })],
    rewards: [QuestReward.exp(10), QuestReward.gold(20), QuestReward.item('quest_test_reward', 2)],
});

const SUBMIT_QUEST_ID = 'test:quest_submit';
defineQuest({
    id: SUBMIT_QUEST_ID,
    name: '시험 제출 의뢰',
    description: '시험 보상을 하나 제출합니다.',
    giverNpcIds: ['test_guide'],
    stages: [new QuestStage({
        id: 'submit',
        objectives: [QuestObjective.item('item', '시험 아이템 제출', 1, 'quest_test_reward', true)],
    })],
    rewards: [QuestReward.gold(5)],
});

class TestQuestPlayer extends Entity {
    override readonly name = '퀘스트 시험 플레이어';
    readonly userId: number;
    readonly inventory: Inventory;
    readonly progress: PlayerProgress;
    readonly quests: QuestBook;
    readonly skills = { grant: () => ({ acquired: true }) };
    gold = 0;
    gainedExp = 0;

    constructor(userId: number) {
        super(1, 0, 'test', { maxLife: 100 }, Equipment.createEmpty());
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
    gainExp(amount: number): number[] { this.gainedExp += amount; return []; }
    async save(): Promise<void> {}
}

class TestQuestTarget extends Entity {
    override readonly name: string;

    constructor(name: string, tags: string[]) {
        super(1, 0, 'test', { maxLife: 10 }, Equipment.createEmpty(), undefined, tags);
        this.name = name;
    }
}

test('NPC 수락 뒤 일치하는 GameEvent만 목표를 올리고 보고 시 보상을 한 번 지급한다', () => {
    const actual = new TestQuestPlayer(88001);
    const player = actual as unknown as Player;
    const slime = new TestQuestTarget('시험 슬라임', [GameTags.ENTITY_SLIME]);
    const other = new TestQuestTarget('다른 대상', []);

    assert.equal(player.quests.getNpcMarker('test_guide'), QuestMarker.AVAILABLE);
    assert.equal(player.quests.accept(HUNT_QUEST_ID, 'test_guide').success, true);
    assert.equal(player.quests.getStatus(HUNT_QUEST_ID), QuestStatus.ACTIVE);

    emitGameEvent(GameEventIds.ENTITY_DEFEATED, { actor: player, subject: other });
    emitGameEvent(GameEventIds.ENTITY_DEFEATED, { actor: player, subject: slime });
    assert.equal(player.quests.getSnapshot(HUNT_QUEST_ID)?.objectives[0].progress, 1);
    emitGameEvent(GameEventIds.ENTITY_DEFEATED, { actor: player, subject: slime });

    assert.equal(player.quests.getStatus(HUNT_QUEST_ID), QuestStatus.READY);
    assert.equal(player.quests.getNpcMarker('test_guide'), QuestMarker.READY);
    assert.equal(player.quests.turnIn(HUNT_QUEST_ID, 'test_guide').success, true);
    assert.equal(player.quests.getStatus(HUNT_QUEST_ID), QuestStatus.COMPLETED);
    assert.equal(actual.gainedExp, 10);
    assert.equal(actual.gold, 20);
    assert.equal(actual.inventory.getCount('quest_test_reward'), 2);
    assert.equal(player.quests.turnIn(HUNT_QUEST_ID, 'test_guide').success, false);
    assert.equal(actual.gold, 20);
});

test('현재 보유·제출 목표는 Inventory 공개 변경 구독으로 갱신되고 완료 시 재료를 회수한다', () => {
    const actual = new TestQuestPlayer(88002);
    const player = actual as unknown as Player;

    assert.equal(player.quests.accept(SUBMIT_QUEST_ID, 'test_guide').success, true);
    assert.equal(player.quests.getStatus(SUBMIT_QUEST_ID), QuestStatus.ACTIVE);
    actual.inventory.addItem('quest_test_reward', 1);
    assert.equal(player.quests.getStatus(SUBMIT_QUEST_ID), QuestStatus.READY);
    assert.equal(player.quests.turnIn(SUBMIT_QUEST_ID, 'test_guide').success, true);
    assert.equal(actual.inventory.getCount('quest_test_reward'), 0);
    assert.equal(actual.gold, 5);
});

test('진행 중 퀘스트는 포기 후 다시 수락하면 단계 진행도가 초기화된다', () => {
    const actual = new TestQuestPlayer(88003);
    const player = actual as unknown as Player;
    const slime = new TestQuestTarget('시험 슬라임', [GameTags.ENTITY_SLIME]);

    player.quests.accept(HUNT_QUEST_ID, 'test_guide');
    emitGameEvent(GameEventIds.ENTITY_DEFEATED, { actor: player, subject: slime });
    assert.equal(player.quests.abandon(HUNT_QUEST_ID).success, true);
    assert.equal(player.quests.getStatus(HUNT_QUEST_ID), QuestStatus.ABANDONED);
    assert.equal(player.quests.accept(HUNT_QUEST_ID, 'test_guide').success, true);
    assert.equal(player.quests.getSnapshot(HUNT_QUEST_ID)?.objectives[0].progress, 0);
});
