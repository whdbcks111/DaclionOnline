import assert from 'node:assert/strict';
import test from 'node:test';
import { GameTags } from '../../../../shared/tags.js';
import '../../data/economy/items.js';
import '../../data/professions/crafting.js';
import type Player from '../actors/Player.js';
import NPC, { Dialogue, DialogueScenario } from '../actors/NPC.js';
import Entity from '../core/Entity.js';
import Equipment from '../economy/Equipment.js';
import Inventory from '../economy/Inventory.js';
import {
    getRecipeDiscoveryProgressId,
} from '../professions/Crafting.js';
import { PlayerProgress } from './Progress.js';
import {
    NPC_COMMISSION_COMPLETED_PROGRESS_ID,
    NPC_FAVOR_DAILY_CAP,
    NPC_FAVOR_MAX,
    awardNpcFavor,
    deliverNpcCommission,
    getNpcCommissionSnapshot,
    getNpcFavorSnapshot,
    getNpcRelationshipDayKey,
    initializeNpcRelationshipProgress,
} from './NpcRelationship.js';

const TEST_NPC = NPC.define({
    id: 'test_relationship_npc',
    name: '관계 시험 NPC',
    entryScenario: () => 'hello',
    scenarios: [new DialogueScenario('hello', function* () {
        yield Dialogue.say('안녕하세요.');
        yield Dialogue.end();
    })],
});

const TEST_BLACKSMITH = NPC.define({
    id: 'blacksmith_master',
    name: '관계 시험 대장장이',
    entryScenario: () => 'hello',
    scenarios: [new DialogueScenario('hello', function* () {
        yield Dialogue.say('망치 소리가 좋군.');
        yield Dialogue.end();
    })],
});

initializeNpcRelationshipProgress();

class RelationshipTestPlayer extends Entity {
    readonly userId: number;
    readonly progress: PlayerProgress;
    readonly inventory: Inventory;
    gold = 0;
    gainedExperience = 0;

    constructor(userId: number) {
        super(50, 0, 'test', { maxLife: 100 }, Equipment.createEmpty());
        this.userId = userId;
        this.progress = PlayerProgress.createEmpty(userId);
        this.inventory = Inventory.createEmpty(userId, 1_000_000);
    }

    override get name(): string { return '관계 시험 플레이어'; }
    override get isPlayer(): boolean { return true; }
    override get playerUserId(): number { return this.userId; }

    gainExp(amount: number): number[] {
        this.gainedExperience += amount;
        return [];
    }

    receiveLoot(itemDataId: string, count: number): 'inventory' | 'failed' {
        return this.inventory.addItem(itemDataId, count) ? 'inventory' : 'failed';
    }
}

test('NPC 호감도는 NPC별 KST 하루 10, 최대 100으로 제한되고 최대 답례를 한 번만 준다', () => {
    const actual = new RelationshipTestPlayer(982_001);
    const player = actual as unknown as Player;
    const firstDay = new Date('2026-08-08T03:00:00.000Z');
    assert.equal(getNpcRelationshipDayKey(firstDay), '2026-08-08');

    assert.equal(awardNpcFavor(player, TEST_NPC, 8, firstDay).gained, 8);
    assert.equal(awardNpcFavor(player, TEST_NPC, 8, firstDay).gained, 2);
    assert.equal(getNpcFavorSnapshot(player, TEST_NPC, firstDay).gainedToday, NPC_FAVOR_DAILY_CAP);

    for (let day = 1; day <= 9; day++) {
        awardNpcFavor(player, TEST_NPC, 10, new Date(firstDay.getTime() + day * 86_400_000));
    }
    const max = getNpcFavorSnapshot(player, TEST_NPC, new Date(firstDay.getTime() + 9 * 86_400_000));
    assert.equal(max.favor, NPC_FAVOR_MAX);
    assert.equal(max.tierLabel, '절친');
    assert.equal(max.maxRewardClaimed, true);
    assert.equal(actual.gold, 25_000);
    assert.equal(actual.inventory.getCount('large_health_potion'), 3);
    assert.equal(actual.inventory.getCount('large_mana_potion'), 3);
    assert.equal(awardNpcFavor(player, TEST_NPC, 10, new Date(firstDay.getTime() + 10 * 86_400_000)).maxRewardGranted, false);
});

test('발견한 제작법의 고정 제작품을 납품하면 Gold·EXP·호감도와 완료 횟수를 지급한다', () => {
    const actual = new RelationshipTestPlayer(982_002);
    const player = actual as unknown as Player;
    player.progress.setFlag(getRecipeDiscoveryProgressId('fishing:moonlight_sturgeon_soup'));
    const snapshot = getNpcCommissionSnapshot(player, TEST_NPC, new Date('2026-08-08T03:00:00.000Z'));
    assert.equal(snapshot?.itemDataId, 'moonlight_sturgeon_soup');
    assert.equal(snapshot?.quantity, 3);
    actual.inventory.addItem('moonlight_sturgeon_soup', 3);

    const result = deliverNpcCommission(player, TEST_NPC, undefined, new Date('2026-08-08T03:00:00.000Z'));
    assert.equal(result.delivered, true);
    if (!result.delivered) return;
    assert.equal(actual.inventory.getCount('moonlight_sturgeon_soup'), 0);
    assert.equal(actual.gold, result.snapshot.goldReward);
    assert.equal(actual.gainedExperience, result.snapshot.experienceReward);
    assert.equal(result.favor.gained, 5);
    assert.equal(player.progress.getCounterNumber(NPC_COMMISSION_COMPLETED_PROGRESS_ID), 1);
    assert.equal(deliverNpcCommission(player, TEST_NPC, undefined, new Date('2026-08-08T03:00:00.000Z')).delivered, false);
});

test('대장장이 의뢰는 플레이어가 고른 단조 장비 한 개만 납품한다', () => {
    const actual = new RelationshipTestPlayer(982_003);
    const player = actual as unknown as Player;
    actual.inventory.addItem('iron_pickaxe', 1);
    actual.inventory.addItem('iron_pickaxe', 1, null, [GameTags.ITEM_FORGED]);
    const snapshot = getNpcCommissionSnapshot(player, TEST_BLACKSMITH, new Date('2026-08-08T03:00:00.000Z'));
    assert.deepEqual(snapshot?.eligibleItemIndexes, [2]);

    assert.equal(deliverNpcCommission(player, TEST_BLACKSMITH, 1, new Date('2026-08-08T03:00:00.000Z')).delivered, false);
    const delivered = deliverNpcCommission(player, TEST_BLACKSMITH, 2, new Date('2026-08-08T03:00:00.000Z'));
    assert.equal(delivered.delivered, true);
    assert.equal(actual.inventory.items.length, 1);
    assert.equal(actual.inventory.items[0]?.hasTag(GameTags.ITEM_FORGED), false);
});
