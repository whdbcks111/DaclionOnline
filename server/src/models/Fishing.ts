import { GameTags, type TagId } from '../../../shared/tags.js';
import Entity from './Entity.js';

export class FishRarity {
    private static readonly all: FishRarity[] = [];

    static readonly COMMON = new FishRarity('common', '일반', '#aab4bd', GameTags.FISH_RARITY_COMMON, 5, 62, 1, [0.7, 0.9]);
    static readonly UNCOMMON = new FishRarity('uncommon', '고급', '#54b978', GameTags.FISH_RARITY_UNCOMMON, 20, 22, 2, [0.85, 1.05]);
    static readonly RARE = new FishRarity('rare', '희귀', '#4f95e8', GameTags.FISH_RARITY_RARE, 90, 9, 3, [1.05, 1.3]);
    static readonly EPIC = new FishRarity('epic', '서사', '#9b67e8', GameTags.FISH_RARITY_EPIC, 400, 4.5, 4, [1.35, 1.7]);
    static readonly LEGENDARY = new FishRarity('legendary', '전설', '#efaa35', GameTags.FISH_RARITY_LEGENDARY, 1800, 2, 5, [1.9, 2.4]);
    static readonly MYTHIC = new FishRarity('mythic', '신화', '#ef5c72', GameTags.FISH_RARITY_MYTHIC, 8000, 0.5, 6, [3, 4]);

    private constructor(
        readonly key: FishRarityKey,
        readonly label: string,
        readonly color: string,
        readonly tag: TagId,
        readonly sellPrice: number,
        readonly baseWeight: number,
        readonly difficulty: number,
        /** 동레벨 일반 몬스터 한 마리 경험치에 곱하는 최소~최대 배율. */
        readonly experienceRateRange: readonly [number, number],
    ) {
        FishRarity.all.push(this);
    }

    static values(): readonly FishRarity[] { return FishRarity.all; }
    static fromKey(key: string): FishRarity | undefined { return FishRarity.all.find(value => value.key === key); }
}

export type FishRarityKey = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';

export interface FishData {
    id: string
    itemDataId: string
    rarity: FishRarity
}

const fishRegistry = new Map<string, FishData>();

export function defineFish(data: FishData): FishData {
    if (fishRegistry.has(data.id)) throw new Error(`중복 물고기 정의: ${data.id}`);
    fishRegistry.set(data.id, Object.freeze({ ...data }));
    return data;
}

export function getFish(id: string): FishData | undefined { return fishRegistry.get(id); }
export function getAllFish(): FishData[] { return [...fishRegistry.values()]; }
export function getFishByRarity(rarity: FishRarity): FishData[] {
    return getAllFish().filter(fish => fish.rarity === rarity);
}

export interface FishRarityChance {
    rarity: FishRarity
    weight: number
    probability: number
}

/** 실제 추첨과 등급표가 공유하는 현재 행운 기준 등급별 가중치·확률 snapshot. */
export function getFishRarityChances(luck: number): FishRarityChance[] {
    const safeLuck = Math.max(0, Math.min(100, luck));
    const rarities = FishRarity.values();
    const weights = rarities.map((rarity, index) => {
        if (index === 0) return rarity.baseWeight * Math.max(0.25, 1 - safeLuck * 0.018);
        return rarity.baseWeight * (1 + safeLuck * 0.045 * index);
    });
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    return rarities.map((rarity, index) => ({ rarity, weight: weights[index], probability: weights[index] / total }));
}

/** 행운이 높을수록 일반 가중치는 줄고 상위 등급 가중치는 단계적으로 증가한다. */
export function rollFishRarity(luck: number, random: () => number = Math.random): FishRarity {
    let cursor = Math.max(0, Math.min(1, random()));
    for (const chance of getFishRarityChances(luck)) {
        cursor -= chance.probability;
        if (cursor <= 0) return chance.rarity;
    }
    return FishRarity.COMMON;
}

export function rollFish(rarity: FishRarity, random: () => number = Math.random): FishData | undefined {
    const pool = getFishByRarity(rarity);
    return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}

export function rollFishingExp(
    rarity: FishRarity,
    anglerLevel: number,
    random: () => number = Math.random,
): number {
    const [minRate, maxRate] = rarity.experienceRateRange;
    const roll = Math.max(0, Math.min(1, random()));
    const standardHuntExp = Entity.getStandardMonsterExpOfLevel(anglerLevel);
    return Math.max(1, Math.round(standardHuntExp * (minRate + (maxRate - minRate) * roll)));
}

export const FISHING_BASE_WAIT_RANGE = Object.freeze({ min: 45, max: 65 });

/** 기본 대기 시간을 현재 입질 속도로 나눠 실제 대기 시간을 계산한다. */
export function rollFishingWaitSeconds(biteSpeed: number, random: () => number = Math.random): number {
    const safeSpeed = Number.isFinite(biteSpeed) ? Math.max(0.25, biteSpeed) : 1;
    const roll = Math.max(0, Math.min(1, random()));
    const base = FISHING_BASE_WAIT_RANGE.min
        + (FISHING_BASE_WAIT_RANGE.max - FISHING_BASE_WAIT_RANGE.min) * roll;
    return base / safeSpeed;
}
