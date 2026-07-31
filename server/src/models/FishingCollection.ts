import type Player from './Player.js';
import { defineProgress, ProgressType } from './Progress.js';

export const FISHING_CATCH_COUNT_PROGRESS_ID = 'title-stat:fishing/caught';

export interface FishingCollectionEntryDefinition {
    readonly itemDataId: string;
    readonly name: string;
    readonly rarityKey: string;
    readonly rarityLabel: string;
    readonly rarityColor: string;
}

export interface FishingCollectionRewardDefinition {
    readonly requiredCount: number;
    readonly label: string;
    readonly experienceRatio: number;
    readonly gold: number;
    readonly itemDataId?: string;
    readonly itemCount?: number;
    readonly combatBonus?: FishingCollectionCombatBonusDefinition;
}

export interface FishingCollectionCombatBonusDefinition {
    readonly label: string;
    readonly items?: readonly {
        readonly itemDataId: string;
        readonly count: number;
    }[];
    readonly skillDataIds?: readonly string[];
}

export interface FishingCollectionEntrySnapshot extends FishingCollectionEntryDefinition {
    readonly collected: boolean;
}

export interface FishingCollectionRewardSnapshot {
    readonly requiredCount: number;
    readonly label: string;
    readonly claimed: boolean;
    readonly available: boolean;
}

export interface FishingCollectionSnapshot {
    readonly collectedCount: number;
    readonly totalCount: number;
    readonly entries: readonly FishingCollectionEntrySnapshot[];
    readonly rewards: readonly FishingCollectionRewardSnapshot[];
}

export interface FishingCollectionGrant {
    readonly requiredCount: number;
    readonly label: string;
    readonly experience: number;
    readonly gold: number;
    readonly itemDataId?: string;
    readonly itemCount?: number;
}

export interface FishingCollectionCatchResult {
    readonly newlyCollected: boolean;
    readonly collectedCount: number;
    readonly totalCount: number;
    readonly grants: readonly FishingCollectionGrant[];
}

let entries: readonly FishingCollectionEntryDefinition[] = [];
let rewards: readonly FishingCollectionRewardDefinition[] = [];

function catchProgressId(itemDataId: string): string {
    return `fishing-collection:fish/${itemDataId}`;
}

function rewardProgressId(requiredCount: number): string {
    return `fishing-collection:reward/${requiredCount}`;
}

function combatRewardProgressId(requiredCount: number): string {
    return `fishing-collection:combat-reward/${requiredCount}`;
}

/** 물고기 단일 원본을 영속 Progress 플래그와 도감 보상 정의로 연결한다. */
export function defineFishingCollection(
    nextEntries: readonly FishingCollectionEntryDefinition[],
    nextRewards: readonly FishingCollectionRewardDefinition[],
): void {
    const itemIds = new Set<string>();
    for (const entry of nextEntries) {
        if (itemIds.has(entry.itemDataId)) throw new Error(`Duplicate fishing collection entry: ${entry.itemDataId}`);
        itemIds.add(entry.itemDataId);
        defineProgress({
            id: catchProgressId(entry.itemDataId),
            type: ProgressType.FLAG,
            label: `${entry.name} 도감 등록`,
            description: '낚시 성공으로 해당 어종을 한 번 이상 획득했는지 영속 보존합니다.',
            visible: false,
            tags: ['fishing:collection'],
        });
    }
    let previousThreshold = 0;
    for (const reward of nextRewards) {
        if (reward.requiredCount <= previousThreshold || reward.requiredCount > nextEntries.length) {
            throw new Error(`Invalid fishing collection reward threshold: ${reward.requiredCount}`);
        }
        previousThreshold = reward.requiredCount;
        defineProgress({
            id: rewardProgressId(reward.requiredCount),
            type: ProgressType.FLAG,
            label: `낚시도감 ${reward.requiredCount}종 보상`,
            description: '도감 단계 보상의 중복 지급을 방지하는 영속 플래그입니다.',
            visible: false,
            tags: ['fishing:collection-reward'],
        });
        if (reward.combatBonus) {
            defineProgress({
                id: combatRewardProgressId(reward.requiredCount),
                type: ProgressType.FLAG,
                label: `낚시도감 ${reward.requiredCount}종 전투 보상`,
                description: '도감 전투 보상의 중복 지급을 방지하는 영속 플래그입니다.',
                visible: false,
                tags: ['fishing:collection-combat-reward'],
            });
        }
    }
    entries = Object.freeze([...nextEntries]);
    rewards = Object.freeze([...nextRewards]);
}

export function getFishingCollectionSnapshot(player: Player): FishingCollectionSnapshot {
    const entrySnapshots = entries.map(entry => ({
        ...entry,
        collected: player.progress.getFlag(catchProgressId(entry.itemDataId)),
    }));
    const collectedCount = entrySnapshots.filter(entry => entry.collected).length;
    return {
        collectedCount,
        totalCount: entrySnapshots.length,
        entries: entrySnapshots,
        rewards: rewards.map(reward => ({
            requiredCount: reward.requiredCount,
            label: reward.combatBonus ? `${reward.label} + ${reward.combatBonus.label}` : reward.label,
            claimed: player.progress.getFlag(rewardProgressId(reward.requiredCount))
                && (!reward.combatBonus || player.progress.getFlag(combatRewardProgressId(reward.requiredCount))),
            available: collectedCount >= reward.requiredCount,
        })),
    };
}

export function getFishingCollectionCount(player: Player): number {
    return entries.reduce(
        (count, entry) => count + (player.progress.getFlag(catchProgressId(entry.itemDataId)) ? 1 : 0),
        0,
    );
}

export function getFishingCollectionTotalCount(): number {
    return entries.length;
}

/** 달성했지만 아직 받지 않은 일반·전투 보상을 모두 지급한다. 기존 도감 완성자도 명령 확인 시 소급 수령한다. */
export function claimFishingCollectionRewards(player: Player): readonly FishingCollectionGrant[] {
    const collectedCount = getFishingCollectionCount(player);
    const grants: FishingCollectionGrant[] = [];
    for (const reward of rewards) {
        if (collectedCount < reward.requiredCount) continue;

        const claimId = rewardProgressId(reward.requiredCount);
        if (!player.progress.getFlag(claimId)) {
            // 지급 성공 여부와 관계없이 바닥 드롭까지 보상으로 간주해 먼저 중복 수령을 차단한다.
            player.progress.setFlag(claimId);
            const experience = Math.floor(player.maxExp * reward.experienceRatio);
            if (experience > 0) player.gainExp(experience);
            if (reward.gold > 0) player.gold += reward.gold;
            if (reward.itemDataId && reward.itemCount) {
                player.receiveLoot(reward.itemDataId, reward.itemCount);
            }
            grants.push({
                requiredCount: reward.requiredCount,
                label: reward.label,
                experience,
                gold: reward.gold,
                itemDataId: reward.itemDataId,
                itemCount: reward.itemCount,
            });
        }

        const combatBonus = reward.combatBonus;
        const combatClaimId = combatRewardProgressId(reward.requiredCount);
        if (!combatBonus || player.progress.getFlag(combatClaimId)) continue;
        player.progress.setFlag(combatClaimId);
        for (const item of combatBonus.items ?? []) {
            player.receiveLoot(item.itemDataId, item.count);
        }
        for (const skillDataId of combatBonus.skillDataIds ?? []) {
            player.skills.grant(skillDataId, `fishing-collection:${reward.requiredCount}`);
        }
        grants.push({
            requiredCount: reward.requiredCount,
            label: combatBonus.label,
            experience: 0,
            gold: 0,
        });
    }
    return grants;
}

/** 첫 포획만 도감을 갱신하고, 도달한 모든 미수령 단계 보상을 즉시 지급한다. */
export function recordFishingCollectionCatch(
    player: Player,
    itemDataId: string,
): FishingCollectionCatchResult {
    const entry = entries.find(candidate => candidate.itemDataId === itemDataId);
    if (!entry) {
        return { newlyCollected: false, collectedCount: getFishingCollectionCount(player), totalCount: entries.length, grants: [] };
    }
    const progressId = catchProgressId(itemDataId);
    const newlyCollected = !player.progress.getFlag(progressId);
    if (newlyCollected) player.progress.setFlag(progressId);
    const collectedCount = getFishingCollectionCount(player);
    const grants = claimFishingCollectionRewards(player);
    return { newlyCollected, collectedCount, totalCount: entries.length, grants };
}
