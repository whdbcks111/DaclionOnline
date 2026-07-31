import assert from 'node:assert/strict';
import test from 'node:test';
import Entity from './Entity.js';
import Equipment from './Equipment.js';
import { PlayerProgress } from './Progress.js';
import type Player from './Player.js';
import {
    claimFishingCollectionRewards,
    getFishingCollectionSnapshot,
    recordFishingCollectionCatch,
} from './FishingCollection.js';
import { GameTags } from '../../../shared/tags.js';
import '../data/items.js';
import '../data/skills.js';
import '../data/progress.js';

class TestCollectionPlayer extends Entity {
    override readonly name = '도감 시험 플레이어';
    readonly progress = PlayerProgress.createEmpty(9811);
    gold = 0;
    gainedExperience = 0;
    readonly loot: Array<{ itemDataId: string; count: number }> = [];
    readonly grantedSkills: Array<{ skillDataId: string; source: string }> = [];
    readonly skills = {
        grant: (skillDataId: string, source: string) => {
            this.grantedSkills.push({ skillDataId, source });
            return { skill: { name: skillDataId }, acquired: true };
        },
    };

    constructor() {
        super(100, 0, 'fishing-test', { maxLife: 100 }, Equipment.createEmpty(), undefined, [
            GameTags.ENTITY_PLAYER,
            GameTags.TRAIT_LIVING,
        ]);
    }

    override get isPlayer(): boolean { return true; }
    override get playerUserId(): number { return this.progress.playerId; }
    gainExp(amount: number): number[] {
        this.gainedExperience += amount;
        return [];
    }
    receiveLoot(itemDataId: string, count: number): 'inventory' {
        this.loot.push({ itemDataId, count });
        return 'inventory';
    }
}

test('낚시도감은 어종별 최초 포획만 영속 기록하고 단계 보상을 한 번만 지급한다', () => {
    const player = new TestCollectionPlayer();
    const initial = getFishingCollectionSnapshot(player as unknown as Player);
    assert.ok(initial.totalCount > 50);

    const firstId = initial.entries[0].itemDataId;
    const first = recordFishingCollectionCatch(player as unknown as Player, firstId);
    const duplicate = recordFishingCollectionCatch(player as unknown as Player, firstId);
    assert.equal(first.newlyCollected, true);
    assert.equal(duplicate.newlyCollected, false);
    assert.equal(duplicate.collectedCount, 1);

    for (const entry of initial.entries.slice(1, 10)) {
        recordFishingCollectionCatch(player as unknown as Player, entry.itemDataId);
    }
    const reached = getFishingCollectionSnapshot(player as unknown as Player);
    assert.equal(reached.collectedCount, 10);
    assert.equal(reached.rewards[0].claimed, true);
    assert.equal(player.gold, 5_000);
    assert.deepEqual(player.loot, [
        { itemDataId: 'earthworm_bait', count: 100 },
        { itemDataId: 'battle_tonic', count: 3 },
        { itemDataId: 'arcane_tonic', count: 3 },
        { itemDataId: 'swift_tonic', count: 3 },
    ]);

    recordFishingCollectionCatch(player as unknown as Player, initial.entries[9].itemDataId);
    assert.equal(player.gold, 5_000);
    assert.equal(player.loot.length, 4);
});

test('기존 도감 달성자는 낚시도감 확인 시 신규 전투 보상과 전용 스킬을 소급 수령한다', () => {
    const player = new TestCollectionPlayer();
    const initial = getFishingCollectionSnapshot(player as unknown as Player);
    for (const entry of initial.entries) {
        player.progress.setFlag(`fishing-collection:fish/${entry.itemDataId}`);
    }
    for (const requiredCount of [10, 20, 35, 50, initial.totalCount]) {
        player.progress.setFlag(`fishing-collection:reward/${requiredCount}`);
    }

    const grants = claimFishingCollectionRewards(player as unknown as Player);
    const snapshot = getFishingCollectionSnapshot(player as unknown as Player);

    assert.equal(grants.length, 5);
    assert.deepEqual(player.grantedSkills, [
        { skillDataId: 'silver_scale_veil', source: 'fishing-collection:35' },
        { skillDataId: 'abyssal_harpoon', source: `fishing-collection:${initial.totalCount}` },
    ]);
    assert.ok(player.loot.some(item => item.itemDataId === 'large_health_potion' && item.count === 3));
    assert.equal(snapshot.rewards.at(-1)?.claimed, true);
    assert.deepEqual(claimFishingCollectionRewards(player as unknown as Player), []);
});
