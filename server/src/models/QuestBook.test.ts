import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { registerOnlinePlayer, unregisterOnlinePlayer } from '../modules/playerRegistry.js';
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

const CRITICAL_QUEST_ID = 'test:quest_critical';
defineQuest({
    id: CRITICAL_QUEST_ID,
    name: '시험 치명타 의뢰',
    description: '치명타를 기록합니다.',
    giverNpcIds: ['test_guide'],
    stages: [new QuestStage({
        id: 'critical',
        objectives: [QuestObjective.event({
            id: 'critical-hit',
            label: '치명타 적중',
            required: 2,
            eventId: GameEventIds.CRITICAL_HIT,
        })],
    })],
    rewards: [],
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

test('아이템 보상 이름은 퀘스트 정의보다 늦게 등록된 마스터 데이터도 표시명으로 해석한다', () => {
    const reward = QuestReward.item('quest_late_reward', 1);
    assert.equal(reward.label, 'quest_late_reward x1');
    defineItem({
        id: 'quest_late_reward',
        name: '뒤늦게 등록된 보상',
        description: '', category: '시험', weight: 1, stackable: true, maxStack: 99,
        baseMetadata: null, onUse: null, equipSlot: null, modifiers: null, baseDurability: null, tags: [],
    });
    assert.equal(reward.label, '뒤늦게 등록된 보상 x1');
});

class TestQuestTarget extends Entity {
    override readonly name: string;
    private readonly defeatCreditUserIds: readonly number[];

    constructor(name: string, tags: string[], defeatCreditUserIds: readonly number[] = []) {
        super(1, 0, 'test', { maxLife: 10 }, Equipment.createEmpty(), undefined, tags);
        this.name = name;
        this.defeatCreditUserIds = Object.freeze([...defeatCreditUserIds]);
    }

    override getDefeatCreditUserIds(): readonly number[] { return this.defeatCreditUserIds; }
}

function registerTestPlayers(...players: TestQuestPlayer[]): () => void {
    for (const player of players) registerOnlinePlayer(player as unknown as Player);
    return () => {
        for (const player of players) unregisterOnlinePlayer(player.userId);
    };
}

test('솔로 처치는 일치하는 목표만 올리고 보고 시 보상을 한 번 지급한다', () => {
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

test('2인 처치는 막타 중복을 제거하고 양수 기여자 중 온라인·동일 장소·생존자만 진행시킨다', () => {
    const finisher = new TestQuestPlayer(88_101);
    const contributor = new TestQuestPlayer(88_102);
    const noContribution = new TestQuestPlayer(88_103);
    const elsewhere = new TestQuestPlayer(88_104);
    const defeated = new TestQuestPlayer(88_105);
    const offline = new TestQuestPlayer(88_108);
    elsewhere.locationId = 'other-place';
    defeated.life = 0;
    const players = [finisher, contributor, noContribution, elsewhere, defeated];
    const cleanup = registerTestPlayers(...players);

    try {
        for (const player of [...players, offline]) {
            assert.equal(player.quests.accept(HUNT_QUEST_ID, 'test_guide').success, true);
        }
        const slime = new TestQuestTarget('공동 처치 슬라임', [GameTags.ENTITY_SLIME], [
            finisher.userId,
            contributor.userId,
            contributor.userId,
            elsewhere.userId,
            defeated.userId,
            offline.userId,
        ]);
        emitGameEvent(GameEventIds.ENTITY_DEFEATED, {
            actor: finisher as unknown as Player,
            subject: slime,
        });

        assert.equal(finisher.quests.getSnapshot(HUNT_QUEST_ID)?.objectives[0].progress, 1);
        assert.equal(contributor.quests.getSnapshot(HUNT_QUEST_ID)?.objectives[0].progress, 1);
        assert.equal(noContribution.quests.getSnapshot(HUNT_QUEST_ID)?.objectives[0].progress, 0);
        assert.equal(elsewhere.quests.getSnapshot(HUNT_QUEST_ID)?.objectives[0].progress, 0);
        assert.equal(defeated.quests.getSnapshot(HUNT_QUEST_ID)?.objectives[0].progress, 0);
        assert.equal(offline.quests.getSnapshot(HUNT_QUEST_ID)?.objectives[0].progress, 0);
    } finally {
        cleanup();
    }
});

test('처치 외 이벤트는 subject 기여자에게 확산하지 않고 기존 직접 actor만 진행시킨다', () => {
    const actor = new TestQuestPlayer(88_106);
    const contributor = new TestQuestPlayer(88_107);
    const cleanup = registerTestPlayers(actor, contributor);

    try {
        actor.quests.accept(CRITICAL_QUEST_ID, 'test_guide');
        contributor.quests.accept(CRITICAL_QUEST_ID, 'test_guide');
        const target = new TestQuestTarget('치명타 표적', [], [contributor.userId]);
        emitGameEvent(GameEventIds.CRITICAL_HIT, {
            actor: actor as unknown as Player,
            subject: target,
        });

        assert.equal(actor.quests.getSnapshot(CRITICAL_QUEST_ID)?.objectives[0].progress, 1);
        assert.equal(contributor.quests.getSnapshot(CRITICAL_QUEST_ID)?.objectives[0].progress, 0);
    } finally {
        cleanup();
    }
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
    const cleanup = registerTestPlayers(actual);

    try {
        player.quests.accept(HUNT_QUEST_ID, 'test_guide');
        emitGameEvent(GameEventIds.ENTITY_DEFEATED, { actor: player, subject: slime });
        assert.equal(player.quests.abandon(HUNT_QUEST_ID).success, true);
        assert.equal(player.quests.getStatus(HUNT_QUEST_ID), QuestStatus.ABANDONED);
        assert.equal(player.quests.accept(HUNT_QUEST_ID, 'test_guide').success, true);
        assert.equal(player.quests.getSnapshot(HUNT_QUEST_ID)?.objectives[0].progress, 0);
    } finally {
        cleanup();
    }
});
