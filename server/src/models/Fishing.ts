import { GameTags, type TagId } from '../../../shared/tags.js';

export class FishRarity {
    private static readonly all: FishRarity[] = [];

    static readonly COMMON = new FishRarity('common', '일반', '#aab4bd', GameTags.FISH_RARITY_COMMON, 5, 62, 1, [12, 20]);
    static readonly UNCOMMON = new FishRarity('uncommon', '고급', '#54b978', GameTags.FISH_RARITY_UNCOMMON, 20, 22, 2, [20, 34]);
    static readonly RARE = new FishRarity('rare', '희귀', '#4f95e8', GameTags.FISH_RARITY_RARE, 90, 9, 3, [35, 55]);
    static readonly EPIC = new FishRarity('epic', '서사', '#9b67e8', GameTags.FISH_RARITY_EPIC, 400, 4.5, 4, [60, 90]);
    static readonly LEGENDARY = new FishRarity('legendary', '전설', '#efaa35', GameTags.FISH_RARITY_LEGENDARY, 1800, 2, 5, [110, 160]);
    static readonly MYTHIC = new FishRarity('mythic', '신화', '#ef5c72', GameTags.FISH_RARITY_MYTHIC, 8000, 0.5, 6, [200, 300]);

    private constructor(
        readonly key: FishRarityKey,
        readonly label: string,
        readonly color: string,
        readonly tag: TagId,
        readonly sellPrice: number,
        readonly baseWeight: number,
        readonly difficulty: number,
        readonly expRange: readonly [number, number],
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

/** 행운이 높을수록 일반 가중치는 줄고 상위 등급 가중치는 단계적으로 증가한다. */
export function rollFishRarity(luck: number, random: () => number = Math.random): FishRarity {
    const safeLuck = Math.max(0, Math.min(100, luck));
    const rarities = FishRarity.values();
    const weights = rarities.map((rarity, index) => {
        if (index === 0) return rarity.baseWeight * Math.max(0.25, 1 - safeLuck * 0.018);
        return rarity.baseWeight * (1 + safeLuck * 0.045 * index);
    });
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let cursor = random() * total;
    for (let index = 0; index < rarities.length; index++) {
        cursor -= weights[index];
        if (cursor <= 0) return rarities[index];
    }
    return FishRarity.COMMON;
}

export function rollFish(rarity: FishRarity, random: () => number = Math.random): FishData | undefined {
    const pool = getFishByRarity(rarity);
    return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}

export function rollFishingExp(rarity: FishRarity, random: () => number = Math.random): number {
    const [min, max] = rarity.expRange;
    return Math.floor(min + random() * (max - min + 1));
}

export const FISHING_BASE_WAIT_RANGE = Object.freeze({ min: 10, max: 22 });

/** 입질 속도를 적용한 대기 시간. 초보 장비도 즉시 입질하지 않도록 최소 4초를 보장한다. */
export function rollFishingWaitSeconds(biteSpeed: number, random: () => number = Math.random): number {
    const safeSpeed = Number.isFinite(biteSpeed) ? Math.max(0.25, biteSpeed) : 1;
    const roll = Math.max(0, Math.min(1, random()));
    const base = FISHING_BASE_WAIT_RANGE.min
        + (FISHING_BASE_WAIT_RANGE.max - FISHING_BASE_WAIT_RANGE.min) * roll;
    return Math.max(4, base / safeSpeed);
}
