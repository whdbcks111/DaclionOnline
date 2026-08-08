import { GameTags } from '../../../../shared/tags.js';
import type Player from '../actors/Player.js';
import NPC from '../actors/NPC.js';
import { getItemData } from '../economy/Item.js';
import {
    getDiscoveredCraftingRecipes,
    type CraftingRecipe,
} from '../professions/Crafting.js';
import { defineProgress, ProgressType } from './Progress.js';

export const NPC_FAVOR_MAX = 100;
export const NPC_FAVOR_DAILY_CAP = 10;
export const NPC_COMMISSION_COMPLETED_PROGRESS_ID = 'npc-commission:completed';

defineProgress({
    id: NPC_COMMISSION_COMPLETED_PROGRESS_ID,
    type: ProgressType.COUNTER,
    label: 'NPC 제작 의뢰 완료',
    description: 'NPC에게 제작품을 납품해 완료한 의뢰 수입니다.',
    visible: true,
    format: value => `${value}회`,
    tags: ['npc:commission'],
});

export type NpcCommissionRequestType = 'item' | 'forged';

export class NpcFavorTier {
    private static readonly all: NpcFavorTier[] = [];

    static readonly STRANGER = new NpcFavorTier('stranger', '낯섦', 0, 1);
    static readonly ACQUAINTANCE = new NpcFavorTier('acquaintance', '안면', 10, 1.1);
    static readonly FRIENDLY = new NpcFavorTier('friendly', '친밀', 30, 1.2);
    static readonly TRUSTED = new NpcFavorTier('trusted', '신뢰', 60, 1.35);
    static readonly BEST_FRIEND = new NpcFavorTier('best-friend', '절친', 100, 1.5);

    private constructor(
        readonly key: string,
        readonly label: string,
        readonly threshold: number,
        readonly commissionRewardMultiplier: number,
    ) {
        NpcFavorTier.all.push(this);
        Object.freeze(this);
    }

    static values(): readonly NpcFavorTier[] { return Object.freeze([...NpcFavorTier.all]); }

    static forFavor(favor: number): NpcFavorTier {
        return [...NpcFavorTier.all].reverse().find(tier => favor >= tier.threshold)
            ?? NpcFavorTier.STRANGER;
    }
}

export interface NpcFavorSnapshot {
    readonly npcId: string;
    readonly npcName: string;
    readonly favor: number;
    readonly maxFavor: number;
    readonly tierKey: string;
    readonly tierLabel: string;
    readonly gainedToday: number;
    readonly dailyCap: number;
    readonly remainingToday: number;
    readonly maxRewardClaimed: boolean;
    readonly commissionRewardMultiplier: number;
}

export interface NpcFavorAwardResult {
    readonly gained: number;
    readonly snapshot: NpcFavorSnapshot;
    readonly tierChanged: boolean;
    readonly maxRewardGranted: boolean;
}

export interface NpcCommissionSnapshot {
    readonly npcId: string;
    readonly npcName: string;
    readonly dayKey: string;
    readonly requestType: NpcCommissionRequestType;
    readonly itemDataId?: string;
    readonly itemName: string;
    readonly quantity: number;
    readonly completed: boolean;
    readonly ownedQuantity: number;
    readonly eligibleItemIndexes: readonly number[];
    readonly goldReward: number;
    readonly experienceReward: number;
    readonly favorReward: number;
}

export type NpcCommissionDeliveryResult =
    | {
        readonly delivered: true;
        readonly snapshot: NpcCommissionSnapshot;
        readonly favor: NpcFavorAwardResult;
        readonly levelsGained: readonly number[];
    }
    | {
        readonly delivered: false;
        readonly reason: 'unavailable' | 'completed' | 'missing-item' | 'invalid-item';
        readonly message: string;
        readonly snapshot?: NpcCommissionSnapshot;
    };

interface StoredCommission {
    readonly dayKey: string;
    readonly requestType: NpcCommissionRequestType;
    readonly itemDataId?: string;
    readonly quantity: number;
    readonly completed: boolean;
}

let relationshipProgressInitialized = false;

function favorProgressId(npcId: string): string {
    return `npc-favor:${npcId}`;
}

function favorDailyProgressId(npcId: string): string {
    return `npc-favor-daily:${npcId}`;
}

function favorRewardProgressId(npcId: string): string {
    return `npc-favor-reward:${npcId}`;
}

function commissionProgressId(npcId: string): string {
    return `npc-commission:${npcId}`;
}

/** NPC master 등록 뒤, Player 로드 전에 NPC별 영속 progress 정의를 만든다. */
export function initializeNpcRelationshipProgress(): void {
    for (const npc of NPC.getAll()) {
        defineProgress({
            id: favorProgressId(npc.id),
            type: ProgressType.COUNTER,
            label: `${npc.name} 호감도`,
            description: `${npc.name}과(와)의 호감도입니다.`,
            visible: false,
            tags: ['npc:favor'],
        });
        defineProgress({
            id: favorDailyProgressId(npc.id),
            type: ProgressType.STATE,
            label: `${npc.name} 일일 호감도`,
            description: `${npc.name}에게 오늘 얻은 호감도입니다.`,
            visible: false,
            tags: ['npc:favor'],
        });
        defineProgress({
            id: favorRewardProgressId(npc.id),
            type: ProgressType.FLAG,
            label: `${npc.name} 최대 호감도 보상`,
            description: `${npc.name}의 최대 호감도 답례를 받았는지 나타냅니다.`,
            visible: false,
            tags: ['npc:favor'],
        });
        defineProgress({
            id: commissionProgressId(npc.id),
            type: ProgressType.STATE,
            label: `${npc.name} 일일 제작 의뢰`,
            description: `${npc.name}이(가) 요청한 오늘의 제작품과 완료 상태입니다.`,
            visible: false,
            tags: ['npc:commission'],
        });
    }
    relationshipProgressInitialized = true;
}

export function isNpcRelationshipProgressInitialized(): boolean {
    return relationshipProgressInitialized;
}

/** 한국 표준시 자정에 바뀌는 NPC 생활 콘텐츠 날짜 key. */
export function getNpcRelationshipDayKey(now = new Date()): string {
    return new Date(now.getTime() + 9 * 60 * 60 * 1_000).toISOString().slice(0, 10);
}

function requireNpc(npcOrId: NPC | string): NPC {
    const npc = typeof npcOrId === 'string' ? NPC.getNpc(npcOrId) : npcOrId;
    if (!npc) throw new Error(`Unknown NPC relationship target: ${npcOrId}`);
    return npc;
}

function parseDailyFavor(value: string, dayKey: string): number {
    const [storedDay, storedAmount] = value.split('|');
    const amount = Number(storedAmount);
    return storedDay === dayKey && Number.isSafeInteger(amount) && amount >= 0
        ? Math.min(NPC_FAVOR_DAILY_CAP, amount)
        : 0;
}

export function getNpcFavorSnapshot(
    player: Player,
    npcOrId: NPC | string,
    now = new Date(),
): NpcFavorSnapshot {
    const npc = requireNpc(npcOrId);
    const favor = Math.min(NPC_FAVOR_MAX, player.progress.getCounterNumber(favorProgressId(npc.id)));
    const dayKey = getNpcRelationshipDayKey(now);
    const gainedToday = parseDailyFavor(player.progress.getState(favorDailyProgressId(npc.id)), dayKey);
    const tier = NpcFavorTier.forFavor(favor);
    return Object.freeze({
        npcId: npc.id,
        npcName: npc.name,
        favor,
        maxFavor: NPC_FAVOR_MAX,
        tierKey: tier.key,
        tierLabel: tier.label,
        gainedToday,
        dailyCap: NPC_FAVOR_DAILY_CAP,
        remainingToday: NPC_FAVOR_DAILY_CAP - gainedToday,
        maxRewardClaimed: player.progress.getFlag(favorRewardProgressId(npc.id)),
        commissionRewardMultiplier: tier.commissionRewardMultiplier,
    });
}

export function getNpcFavorSnapshots(player: Player, now = new Date()): readonly NpcFavorSnapshot[] {
    return Object.freeze(NPC.getAll()
        .map(npc => getNpcFavorSnapshot(player, npc, now))
        .filter(snapshot => snapshot.favor > 0)
        .sort((left, right) => right.favor - left.favor || left.npcName.localeCompare(right.npcName, 'ko')));
}

export function awardNpcFavor(
    player: Player,
    npcOrId: NPC | string,
    amount: number,
    now = new Date(),
): NpcFavorAwardResult {
    const npc = requireNpc(npcOrId);
    const before = getNpcFavorSnapshot(player, npc, now);
    const requested = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
    const gained = Math.min(requested, before.remainingToday, NPC_FAVOR_MAX - before.favor);
    if (gained > 0) {
        player.progress.setCounter(favorProgressId(npc.id), before.favor + gained);
        player.progress.setState(
            favorDailyProgressId(npc.id),
            `${getNpcRelationshipDayKey(now)}|${before.gainedToday + gained}`,
        );
    }
    let maxRewardGranted = false;
    const reachedMax = before.favor + gained >= NPC_FAVOR_MAX;
    if (reachedMax && !player.progress.getFlag(favorRewardProgressId(npc.id))) {
        player.progress.setFlag(favorRewardProgressId(npc.id));
        player.gold += 25_000;
        player.receiveLoot('large_health_potion', 3);
        player.receiveLoot('large_mana_potion', 3);
        maxRewardGranted = true;
    }
    const snapshot = getNpcFavorSnapshot(player, npc, now);
    return Object.freeze({
        gained,
        snapshot,
        tierChanged: before.tierKey !== snapshot.tierKey,
        maxRewardGranted,
    });
}

function deterministicIndex(seed: string, length: number): number {
    let hash = 2_166_136_261;
    for (const char of seed) {
        hash ^= char.codePointAt(0) ?? 0;
        hash = Math.imul(hash, 16_777_619);
    }
    return Math.abs(hash) % length;
}

function getEligibleCommissionRecipes(player: Player): CraftingRecipe[] {
    const seen = new Set<string>();
    return getDiscoveredCraftingRecipes(player).filter(recipe => {
        const itemDataId = recipe.resultItemDataId;
        const item = itemDataId ? getItemData(itemDataId) : undefined;
        if (!itemDataId || !item || item.bound || !item.stackable
            || !item.tags.includes(GameTags.ITEM_CONSUMABLE) || seen.has(itemDataId)) return false;
        seen.add(itemDataId);
        return true;
    });
}

function serializeCommission(value: StoredCommission): string {
    return [
        value.dayKey,
        value.requestType,
        value.itemDataId ?? '-',
        value.quantity,
        value.completed ? 1 : 0,
    ].join('|');
}

function parseCommission(value: string, dayKey: string): StoredCommission | undefined {
    const [storedDay, type, itemDataId, quantityRaw, completedRaw] = value.split('|');
    const quantity = Number(quantityRaw);
    if (storedDay !== dayKey || (type !== 'item' && type !== 'forged')
        || !Number.isSafeInteger(quantity) || quantity <= 0
        || (type === 'item' && (!itemDataId || itemDataId === '-' || !getItemData(itemDataId)))) return undefined;
    return {
        dayKey,
        requestType: type,
        ...(type === 'item' ? { itemDataId } : {}),
        quantity,
        completed: completedRaw === '1',
    };
}

function createCommission(player: Player, npc: NPC, dayKey: string): StoredCommission | undefined {
    if (npc.id === 'blacksmith_master') {
        return { dayKey, requestType: 'forged', quantity: 1, completed: false };
    }
    const recipes = getEligibleCommissionRecipes(player);
    if (recipes.length === 0) return undefined;
    const recipe = recipes[deterministicIndex(`${dayKey}:${npc.id}:${player.userId}`, recipes.length)]!;
    return {
        dayKey,
        requestType: 'item',
        itemDataId: recipe.resultItemDataId!,
        quantity: 3,
        completed: false,
    };
}

function getStoredCommission(
    player: Player,
    npc: NPC,
    now: Date,
    create: boolean,
): StoredCommission | undefined {
    const dayKey = getNpcRelationshipDayKey(now);
    const progressId = commissionProgressId(npc.id);
    const existing = parseCommission(player.progress.getState(progressId), dayKey);
    if (existing || !create) return existing;
    const generated = createCommission(player, npc, dayKey);
    if (generated) player.progress.setState(progressId, serializeCommission(generated));
    return generated;
}

function createCommissionSnapshot(
    player: Player,
    npc: NPC,
    stored: StoredCommission,
    now: Date,
): NpcCommissionSnapshot {
    const favor = getNpcFavorSnapshot(player, npc, now);
    const eligibleItems = stored.requestType === 'forged'
        ? player.inventory.getIndexedItems().filter(({ item }) => (
            item.hasTag(GameTags.ITEM_FORGED) && Boolean(item.data?.equipSlot)
        ))
        : [];
    const item = stored.itemDataId ? getItemData(stored.itemDataId) : undefined;
    const baseGold = (250 + player.level * 5) * stored.quantity;
    const baseExperience = (100 + player.level * 10) * stored.quantity;
    return Object.freeze({
        npcId: npc.id,
        npcName: npc.name,
        dayKey: stored.dayKey,
        requestType: stored.requestType,
        ...(stored.itemDataId ? { itemDataId: stored.itemDataId } : {}),
        itemName: item?.name ?? '직접 단조한 장비',
        quantity: stored.quantity,
        completed: stored.completed,
        ownedQuantity: stored.itemDataId
            ? player.inventory.getCount(stored.itemDataId)
            : eligibleItems.length,
        eligibleItemIndexes: Object.freeze(eligibleItems.map(({ index }) => index + 1)),
        goldReward: Math.max(1, Math.round(baseGold * favor.commissionRewardMultiplier)),
        experienceReward: Math.max(1, Math.round(baseExperience * favor.commissionRewardMultiplier)),
        favorReward: 5,
    });
}

export function getNpcCommissionSnapshot(
    player: Player,
    npcOrId: NPC | string,
    now = new Date(),
): NpcCommissionSnapshot | undefined {
    const npc = requireNpc(npcOrId);
    const stored = getStoredCommission(player, npc, now, true);
    return stored ? createCommissionSnapshot(player, npc, stored, now) : undefined;
}

export function deliverNpcCommission(
    player: Player,
    npcOrId: NPC | string,
    itemIndex?: number,
    now = new Date(),
): NpcCommissionDeliveryResult {
    const npc = requireNpc(npcOrId);
    const stored = getStoredCommission(player, npc, now, true);
    if (!stored) {
        return { delivered: false, reason: 'unavailable', message: '발견한 제작법이 없어 오늘 배정할 제작 의뢰가 없습니다.' };
    }
    const snapshot = createCommissionSnapshot(player, npc, stored, now);
    if (stored.completed) {
        return { delivered: false, reason: 'completed', message: '오늘 이 NPC의 제작 의뢰는 이미 완료했습니다.', snapshot };
    }

    let rollback: (() => void) | undefined;
    if (stored.requestType === 'forged') {
        if (!Number.isInteger(itemIndex) || !snapshot.eligibleItemIndexes.includes(itemIndex!)) {
            return {
                delivered: false,
                reason: 'invalid-item',
                message: '납품할 단조 장비의 인벤토리 번호를 선택해주세요.',
                snapshot,
            };
        }
        const selected = player.inventory.getIndexedItems().find(entry => entry.index === itemIndex! - 1);
        if (!selected || !selected.item.hasTag(GameTags.ITEM_FORGED) || !selected.item.data?.equipSlot) {
            return { delivered: false, reason: 'invalid-item', message: '선택한 아이템은 단조 장비가 아닙니다.', snapshot };
        }
        const removed = player.inventory.takeItemSnapshotByIndex(selected.index, 1);
        if (!removed) return { delivered: false, reason: 'missing-item', message: '납품할 장비가 변경되었습니다.', snapshot };
        rollback = () => { player.inventory.addItemSnapshot(removed.snapshot); };
    } else {
        if (!stored.itemDataId || !player.inventory.removeItemByData(stored.itemDataId, stored.quantity)) {
            return {
                delivered: false,
                reason: 'missing-item',
                message: `${snapshot.itemName} ${snapshot.quantity}개가 필요합니다.`,
                snapshot,
            };
        }
        rollback = () => { player.inventory.addItem(stored.itemDataId!, stored.quantity); };
    }

    try {
        const completed = { ...stored, completed: true };
        player.progress.setState(commissionProgressId(npc.id), serializeCommission(completed));
        player.progress.increment(NPC_COMMISSION_COMPLETED_PROGRESS_ID);
        player.gold += snapshot.goldReward;
        const levelsGained = player.gainExp(snapshot.experienceReward);
        const favor = awardNpcFavor(player, npc, snapshot.favorReward, now);
        return Object.freeze({
            delivered: true,
            snapshot: createCommissionSnapshot(player, npc, completed, now),
            favor,
            levelsGained: Object.freeze([...levelsGained]),
        });
    } catch (error) {
        rollback?.();
        throw error;
    }
}
