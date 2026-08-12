import prisma from "../../config/prisma.js";
import { executeItemUse, isItemQuickBundleEligible } from "../../modules/player/itemUse.js";
import { Item, createItemMetadataDelta, getItemData } from "./Item.js";
import type { ItemDurabilityRepairResult, ItemMetadata, ItemSnapshot } from "./Item.js";
import type { TagId } from "../../../../shared/tags.js";
import type { UsableItemHudData } from "../../../../shared/types.js";
import type { Prisma } from '../../generated/prisma/client.js';

export type { ItemData } from "./Item.js";
export { Item, getItemData, getAllItemData } from "./Item.js";

export interface InventoryItemRequirement {
    count: number;
    matches: (item: Item) => boolean;
}

export interface InventoryItemSelection {
    requirementIndex: number;
    item: Item;
    count: number;
}

export interface InventoryItemRequirementAvailability {
    readonly requirementIndex: number;
    readonly requiredCount: number;
    readonly selectedCount: number;
    readonly missingCount: number;
}

export interface InventoryItemSelectionPlan {
    readonly complete: boolean;
    readonly selections: readonly InventoryItemSelection[];
    readonly requirements: readonly InventoryItemRequirementAvailability[];
}

export interface RemovedInventoryItemSnapshot {
    readonly name: string;
    readonly snapshot: ItemSnapshot;
}

/** 우편처럼 DB transaction이 먼저 확정하는 인벤토리 지급 행의 생성 계획. */
export interface PersistedInventoryGrantCreateRow {
    readonly itemDataId: string;
    readonly count: number;
    readonly durability: number | null;
    readonly metadata: unknown;
    readonly tags: readonly TagId[];
}

/** 외부 transaction이 생성한 뒤 현재 온라인 인벤토리에 Clean 상태로 흡수할 행. */
export interface PersistedInventoryGrantRow extends PersistedInventoryGrantCreateRow {
    readonly id: number;
    readonly playerId: number;
    readonly sortOrder: number;
}

export interface PersistedInventoryGrantPlan {
    readonly rows: readonly PersistedInventoryGrantCreateRow[];
}

/** 인벤토리 정리 명령과 영속 순서가 공유하는 정렬 기준. */
export class InventorySortMode {
    private static readonly all: InventorySortMode[] = [];

    static readonly CATEGORY = new InventorySortMode('category', '종류별', ['종류', '카테고리']);
    static readonly NAME = new InventorySortMode('name', '이름순', ['이름']);
    static readonly AUTO = new InventorySortMode('auto', '자동', []);

    private constructor(
        readonly key: string,
        readonly label: string,
        readonly aliases: readonly string[],
    ) {
        InventorySortMode.all.push(this);
    }

    static values(): readonly InventorySortMode[] { return InventorySortMode.all; }

    static fromKey(key: string): InventorySortMode | undefined {
        const normalized = key.trim().toLocaleLowerCase('ko-KR');
        return InventorySortMode.all.find(mode => mode.key === normalized);
    }

    static fromInput(input: string): InventorySortMode | undefined {
        const normalized = input.trim().toLocaleLowerCase('ko-KR');
        return InventorySortMode.all.find(mode =>
            mode.key === normalized
            || mode.label.toLocaleLowerCase('ko-KR') === normalized
            || mode.aliases.some(alias => alias.toLocaleLowerCase('ko-KR') === normalized));
    }

    getInputValues(): readonly string[] {
        return [this.label, ...this.aliases];
    }
}

// 아이템 상태 추적
const enum ItemState { Clean, New, Modified, Deleted }

const inventoryCollator = new Intl.Collator('ko-KR', {
    numeric: true,
    sensitivity: 'base',
});
const MAX_PERSISTED_GRANT_ROWS = 100;

export default class Inventory {
    readonly playerId: number;
    private _maxWeight: number;
    private _items: Item[] = [];
    private _states: Map<Item, ItemState> = new Map();
    private _usingItem = false;
    private readonly changeHandlers = new Set<() => void>();
    private changeBatchDepth = 0;
    private changePending = false;
    private changeRevision = 0;
    private orderDirty = false;

    private constructor(playerId: number, maxWeight: number) {
        this.playerId = playerId;
        this._maxWeight = maxWeight;
    }

    /** DB 없이 사용하는 빈 인벤토리. 테스트와 비영속 소유자용이다. */
    static createEmpty(playerId: number, maxWeight: number): Inventory {
        return new Inventory(playerId, maxWeight);
    }

    private track(item: Item, state: ItemState): void {
        const markModified = () => {
            if (item.isBroken) {
                this.removeItemInstance(item, item.count);
                return;
            }
            if (this._states.get(item) === ItemState.Clean) this._states.set(item, ItemState.Modified);
            this.notifyChange();
        };
        item.tags.setPersistentChangeHandler(() => {
            markModified();
        });
        item.setPersistentChangeHandler(markModified);
        this._items.push(item);
        this._states.set(item, state);
        if (state === ItemState.New) this.orderDirty = true;
        if (item.isBroken) this.removeItemInstance(item, item.count);
    }

    // -- Getters --

    get maxWeight() { return this._maxWeight; }
    set maxWeight(val: number) { this._maxWeight = val; }

    get items(): ReadonlyArray<Item> { return this._items; }

    /** 아이템 사용 중 여부 */
    get isUsingItem() { return this._usingItem; }

    get dirty(): boolean {
        if (this.orderDirty) return true;
        for (const state of this._states.values()) {
            if (state !== ItemState.Clean) return true;
        }
        return false;
    }

    /** 현재 총 무게 */
    get currentWeight(): number {
        let total = 0;
        for (const item of this._items) {
            total += item.weight * item.count;
        }
        return total;
    }

    /** 퀘스트 등 소유 기능이 아이템 변화 뒤 현재 보유 조건을 다시 검사할 때 사용한다. */
    subscribeChanges(handler: () => void): () => void {
        this.changeHandlers.add(handler);
        return () => { this.changeHandlers.delete(handler); };
    }

    // -- 조회 --

    /** 아이템 인스턴스 ID로 조회 */
    getItem(itemId: number): Item | undefined {
        return this._items.find(e => e.id === itemId);
    }

    getItemByIndex(idx: number): Item | undefined {
        return this._items[idx];
    }

    /** 명령 자동완성 등 인덱스 기반 UI를 위한 안정적인 아이템 목록 스냅샷. */
    getIndexedItems(): ReadonlyArray<{ index: number; item: Item }> {
        return this._items.map((item, index) => ({ index, item }));
    }

    /** 아이템 정의 ID와 일치하는 첫 인스턴스 조회 */
    getFirstItemByData(itemDataId: string): Item | undefined {
        return this._items.find(item => item.itemDataId === itemDataId);
    }

    /** 자동 장착 등 소유 기능이 내부 배열을 참조하지 않고 첫 일치 아이템을 찾는다. */
    findFirstItem(matches: (item: Item) => boolean): Item | undefined {
        return this._items.find(matches);
    }

    /** 아이템 정의 ID로 조회 (모든 인스턴스) */
    getItemsByData(itemDataId: string): Item[] {
        return this._items.filter(e => e.itemDataId === itemDataId);
    }

    /** 특정 아이템 정의의 총 수량 */
    getCount(itemDataId: string): number {
        return this.getItemsByData(itemDataId).reduce((sum, e) => sum + e.count, 0);
    }

    /**
     * 퀵 HUD용 사용 가능 아이템 정의 요약.
     * 슬롯·인스턴스 ID를 노출하지 않고 같은 마스터 데이터의 수량을 합산한다.
     */
    getUsableItemHudSnapshots(): readonly UsableItemHudData[] {
        const snapshots = new Map<string, UsableItemHudData>();
        for (const item of this._items) {
            if (!item.data?.onUse || item.count <= 0) continue;
            const previous = snapshots.get(item.itemDataId);
            if (previous) {
                snapshots.set(item.itemDataId, {
                    ...previous,
                    count: previous.count + item.count,
                    bundleEligible: previous.bundleEligible || isItemQuickBundleEligible(item),
                });
                continue;
            }
            snapshots.set(item.itemDataId, {
                itemDataId: item.itemDataId,
                name: item.data.name,
                icon: item.image,
                count: item.count,
                bundleEligible: isItemQuickBundleEligible(item),
            });
        }
        return [...snapshots.values()].sort((left, right) =>
            inventoryCollator.compare(left.name, right.name)
            || inventoryCollator.compare(left.itemDataId, right.itemDataId));
    }

    /** 퀵 사용처럼 정의 ID가 고정된 호출에서 사용할 수 있는 첫 인스턴스를 찾는다. */
    getFirstUsableItemByData(itemDataId: string): Item | undefined {
        return this._items.find(item =>
            item.itemDataId === itemDataId
            && item.count > 0
            && Boolean(item.data?.onUse));
    }

    /** 일괄 퀵 사용 정책까지 통과한 첫 인스턴스를 내부 순서대로 찾는다. */
    getFirstQuickBundleItemByData(itemDataId: string): Item | undefined {
        return this._items.find(item =>
            item.itemDataId === itemDataId
            && item.count > 0
            && isItemQuickBundleEligible(item));
    }

    /**
     * 아이템 표시 순서를 변경한다. 실제 아이템 상태는 건드리지 않고 Inventory가 순서 영속성을 소유한다.
     * 자동 정렬은 사용 가능 아이템, 일반 아이템, 내구도 아이템 순으로 묶은 뒤 종류·이름순을 적용한다.
     */
    sortItems(mode: InventorySortMode = InventorySortMode.AUTO): boolean {
        const before = [...this._items];
        const consolidated = this.consolidateStacks();
        const byName = (left: Item, right: Item) =>
            inventoryCollator.compare(left.name || left.itemDataId, right.name || right.itemDataId)
            || inventoryCollator.compare(left.itemDataId, right.itemDataId);
        const byCategoryThenName = (left: Item, right: Item) =>
            inventoryCollator.compare(left.category || '기타', right.category || '기타')
            || byName(left, right);
        const autoPriority = (item: Item) => {
            if (item.durability !== null) return 2;
            if (item.data?.onUse) return 0;
            return 1;
        };

        this._items.sort((left, right) => {
            if (mode === InventorySortMode.NAME) return byName(left, right);
            if (mode === InventorySortMode.AUTO) {
                return autoPriority(left) - autoPriority(right)
                    || byCategoryThenName(left, right);
            }
            return byCategoryThenName(left, right);
        });

        if (!consolidated && before.every((item, index) => item === this._items[index])) return false;
        this.orderDirty = true;
        this.notifyChange();
        return true;
    }

    /** raw items 배열을 노출하지 않고 predicate에 맞는 총 수량을 반환한다. */
    countMatching(matches: (item: Item) => boolean): number {
        return this._items.reduce((sum, item) => sum + (matches(item) ? item.count : 0), 0);
    }

    /** 상점 일괄 판매처럼 predicate에 맞는 아이템을 지정 수량만큼 안전하게 제거한다. */
    removeMatching(matches: (item: Item) => boolean, count = Number.POSITIVE_INFINITY): number {
        const requested = Number.isFinite(count)
            ? Math.max(0, Math.trunc(count))
            : Number.POSITIVE_INFINITY;
        if (requested <= 0) return 0;

        let remaining = requested;
        let removed = 0;
        this.beginChangeBatch();
        try {
            for (const item of [...this._items]) {
                if (remaining <= 0 || !matches(item)) continue;
                const amount = Math.min(item.count, remaining);
                if (!this.removeItemInstance(item, amount)) continue;
                removed += amount;
                remaining -= amount;
            }
        } finally {
            this.endChangeBatch();
        }
        return removed;
    }

    /** selectItems가 검증한 재료 배정을 결과물 없이 한 메모리 batch로 소비한다. */
    consumeSelectedItems(selections: readonly InventoryItemSelection[]): boolean {
        const totals = new Map<Item, number>();
        for (const selection of selections) {
            if (!Number.isSafeInteger(selection.count) || selection.count <= 0) return false;
            totals.set(selection.item, (totals.get(selection.item) ?? 0) + selection.count);
        }
        for (const [item, count] of totals) {
            if (!this._items.includes(item) || item.count < count) return false;
        }
        this.beginChangeBatch();
        try {
            for (const [item, count] of totals) {
                if (!this.removeItemInstance(item, count)) return false;
            }
        } finally {
            this.endChangeBatch();
        }
        return true;
    }

    /** 여러 필터 요구량에 실제 아이템 수량을 중복 없이 최대한 배정하고 부족량을 함께 반환한다. */
    planItemRequirements(requirements: readonly InventoryItemRequirement[]): InventoryItemSelectionPlan | null {
        if (requirements.some(requirement => !Number.isSafeInteger(requirement.count) || requirement.count <= 0)) {
            return null;
        }
        if (requirements.length === 0) {
            return { complete: true, selections: [], requirements: [] };
        }

        const itemCount = this._items.length;
        const source = 0;
        const itemOffset = 1;
        const requirementOffset = itemOffset + itemCount;
        const sink = requirementOffset + requirements.length;
        const size = sink + 1;
        const capacity = Array.from({ length: size }, () => Array<number>(size).fill(0));

        for (let itemIndex = 0; itemIndex < itemCount; itemIndex++) {
            const item = this._items[itemIndex];
            capacity[source][itemOffset + itemIndex] = item.count;
            for (let requirementIndex = 0; requirementIndex < requirements.length; requirementIndex++) {
                if (requirements[requirementIndex].matches(item)) {
                    capacity[itemOffset + itemIndex][requirementOffset + requirementIndex] = item.count;
                }
            }
        }
        for (let index = 0; index < requirements.length; index++) {
            capacity[requirementOffset + index][sink] = requirements[index].count;
        }

        const residual = capacity.map(row => [...row]);
        let totalFlow = 0;
        while (true) {
            const parent = Array<number>(size).fill(-1);
            parent[source] = source;
            const queue = [source];
            for (let cursor = 0; cursor < queue.length && parent[sink] === -1; cursor++) {
                const node = queue[cursor];
                for (let next = 0; next < size; next++) {
                    if (parent[next] !== -1 || residual[node][next] <= 0) continue;
                    parent[next] = node;
                    queue.push(next);
                }
            }
            if (parent[sink] === -1) break;

            let flow = Number.POSITIVE_INFINITY;
            for (let node = sink; node !== source; node = parent[node]) {
                flow = Math.min(flow, residual[parent[node]][node]);
            }
            for (let node = sink; node !== source; node = parent[node]) {
                const previous = parent[node];
                residual[previous][node] -= flow;
                residual[node][previous] += flow;
            }
            totalFlow += flow;
        }

        const selections: InventoryItemSelection[] = [];
        for (let itemIndex = 0; itemIndex < itemCount; itemIndex++) {
            for (let requirementIndex = 0; requirementIndex < requirements.length; requirementIndex++) {
                const count = residual[requirementOffset + requirementIndex][itemOffset + itemIndex];
                if (count > 0) selections.push({
                    requirementIndex,
                    item: this._items[itemIndex],
                    count,
                });
            }
        }
        const availability = requirements.map((requirement, requirementIndex) => {
            const selectedCount = selections.reduce(
                (sum, selection) => sum + (selection.requirementIndex === requirementIndex ? selection.count : 0),
                0,
            );
            return {
                requirementIndex,
                requiredCount: requirement.count,
                selectedCount,
                missingCount: requirement.count - selectedCount,
            };
        });
        const requiredTotal = requirements.reduce((sum, requirement) => sum + requirement.count, 0);
        return {
            complete: totalFlow === requiredTotal,
            selections,
            requirements: availability,
        };
    }

    /**
     * 여러 필터 요구량에 실제 아이템 수량을 중복 없이 배정한다.
     * 최대 유량으로 겹치는 필터도 가능한 조합이 있으면 찾아낸다.
     */
    selectItems(requirements: readonly InventoryItemRequirement[]): InventoryItemSelection[] | null {
        const plan = this.planItemRequirements(requirements);
        return plan?.complete ? [...plan.selections] : null;
    }

    /** 아이템 metadata override를 변경하고 dirty 상태로 표시한다. */
    setItemMetadata(itemId: number, key: string, value: unknown): boolean {
        const item = this.getItem(itemId);
        if (!item) return false;
        item.setMetadata(key, value);
        return true;
    }

    /** 인덱스 기반 관리자/UI 대상의 metadata delta를 변경한다. 아직 DB ID가 없는 신규 아이템도 정확히 지정한다. */
    setItemMetadataByIndex(index: number, key: string, value: unknown): boolean {
        const item = this.getItemByIndex(index);
        if (!item) return false;
        item.setMetadata(key, value);
        return true;
    }

    /** 아이템 metadata override를 제거해 최신 기본값을 다시 상속한다. */
    resetItemMetadata(itemId: number, key: string): boolean {
        return this.getItem(itemId)?.resetMetadata(key) ?? false;
    }

    resetItemMetadataByIndex(index: number, key: string): boolean {
        return this.getItemByIndex(index)?.resetMetadata(key) ?? false;
    }

    setItemDurability(itemId: number, value: number): number | null | undefined {
        return this.getItem(itemId)?.setDurability(value);
    }

    changeItemDurability(itemId: number, delta: number): number | null | undefined {
        return this.getItem(itemId)?.changeDurability(delta);
    }

    increaseItemDurability(itemId: number, amount = 1): number | null | undefined {
        return this.getItem(itemId)?.increaseDurability(amount);
    }

    increaseItemDurabilityByIndex(index: number, amount = 1): number | null | undefined {
        return this.getItemByIndex(index)?.increaseDurability(amount);
    }

    repairItemDurabilityByIndex(
        index: number,
        amount: number,
        maxDurabilityLossRate = 0,
    ): ItemDurabilityRepairResult | null | undefined {
        return this.getItemByIndex(index)?.repairDurability(amount, maxDurabilityLossRate);
    }

    decreaseItemDurability(itemId: number, amount = 1): number | null | undefined {
        return this.getItem(itemId)?.decreaseDurability(amount);
    }

    // -- 추가 --

    /** 무게 체크: 아이템 추가 가능 여부 */
    canAdd(itemDataId: string, count: number): boolean {
        const data = getItemData(itemDataId);
        if (!data) return false;
        return this.currentWeight + data.weight * count <= this._maxWeight;
    }

    canAddSnapshot(snapshot: ItemSnapshot): boolean {
        return this.canAddSnapshots([snapshot]);
    }

    /** 여러 아이템 스냅샷을 전부 추가할 수 있는지 원자적으로 검사 */
    canAddSnapshots(snapshots: readonly ItemSnapshot[]): boolean {
        let addedWeight = 0;
        for (const snapshot of snapshots) {
            const data = getItemData(snapshot.itemDataId);
            if (!data || snapshot.count <= 0
                || (data.baseDurability !== null && snapshot.durability !== null && snapshot.durability <= 0)) return false;
            addedWeight += data.weight * snapshot.count;
        }
        return this.currentWeight + addedWeight <= this._maxWeight;
    }

    /** 아이템 추가. 성공 시 true */
    addItem(
        itemDataId: string,
        count: number,
        metadataOverrides?: ItemMetadata | null,
        tags: readonly TagId[] = [],
    ): boolean {
        const data = getItemData(itemDataId);
        if (!data) return false;
        return this.addItemSnapshot({
            itemDataId,
            count,
            durability: data.baseDurability,
            metadataDelta: createItemMetadataDelta(itemDataId, metadataOverrides),
            tags: [...tags],
        });
    }

    /** 아이템 이동 시 metadata/내구도/영속 태그를 보존해 추가 */
    addItemSnapshot(snapshot: ItemSnapshot): boolean {
        return this.addItemSnapshotInternal(snapshot, true);
    }

    /**
     * 우편 첨부처럼 claim 상태와 Item 행 생성을 같은 DB transaction에서 처리할 기능을 위해
     * 중량 검증과 스택 분할을 Inventory가 소유한 영속 행 계획으로 변환한다.
     */
    preparePersistedGrant(snapshots: readonly ItemSnapshot[]): PersistedInventoryGrantPlan | null {
        if (snapshots.length === 0 || !this.canAddSnapshots(snapshots)) return null;
        const rows: PersistedInventoryGrantCreateRow[] = [];
        for (const snapshot of snapshots) {
            if (!Number.isSafeInteger(snapshot.count) || snapshot.count <= 0) return null;
            const data = getItemData(snapshot.itemDataId);
            if (!data) return null;
            let remaining = snapshot.count;
            while (remaining > 0) {
                const count = data.stackable ? Math.min(remaining, data.maxStack) : 1;
                if (rows.length >= MAX_PERSISTED_GRANT_ROWS) return null;
                const item = Item.fromSnapshot({ ...snapshot, count });
                if (item.isBroken) return null;
                rows.push(Object.freeze({
                    itemDataId: item.itemDataId,
                    count: item.count,
                    durability: item.durability,
                    metadata: item.getPersistedMetadata(),
                    tags: Object.freeze(item.tags.persistentValues()),
                }));
                remaining -= count;
            }
        }
        return Object.freeze({ rows: Object.freeze(rows) });
    }

    /**
     * 소유 기능의 transaction 안에서 계획된 Item 행을 생성한다. 우편 등 호출자는
     * items table 구조·정렬 순서·metadata 직렬화에 직접 접근하지 않는다.
     */
    async persistPreparedGrant(
        transaction: Prisma.TransactionClient,
        plan: PersistedInventoryGrantPlan,
    ): Promise<PersistedInventoryGrantRow[]> {
        if (plan.rows.length < 1 || plan.rows.length > MAX_PERSISTED_GRANT_ROWS) {
            throw new Error('영속 인벤토리 지급 행 수가 올바르지 않습니다.');
        }
        const aggregate = await transaction.item.aggregate({
            where: { playerId: this.playerId },
            _max: { sortOrder: true },
        });
        let sortOrder = (aggregate._max.sortOrder ?? -1) + 1;
        const persisted: PersistedInventoryGrantRow[] = [];
        for (const planned of plan.rows) {
            const row = await transaction.item.create({
                data: {
                    playerId: this.playerId,
                    itemDataId: planned.itemDataId,
                    count: planned.count,
                    durability: planned.durability,
                    metadata: planned.metadata as any,
                    tags: planned.tags as any,
                    sortOrder: sortOrder++,
                },
            });
            persisted.push({
                id: row.id,
                playerId: row.playerId,
                itemDataId: row.itemDataId,
                count: row.count,
                durability: row.durability,
                metadata: row.metadata,
                tags: (Array.isArray(row.tags) ? row.tags : []) as TagId[],
                sortOrder: row.sortOrder,
            });
        }
        return persisted;
    }

    /**
     * 외부 transaction에서 이미 생성된 Item 행만 Clean으로 흡수한다. 기존 dirty/revision과
     * 정렬 변경 상태는 절대 초기화하지 않으며 같은 DB id 재적용은 멱등적으로 무시한다.
     */
    adoptPersistedGrant(rows: readonly PersistedInventoryGrantRow[]): boolean {
        const knownIds = new Set(
            [...this._states.keys()].map(item => item.id).filter(id => id > 0),
        );
        const adopted: Item[] = [];
        for (const row of rows) {
            if (row.playerId !== this.playerId
                || !Number.isSafeInteger(row.id) || row.id <= 0
                || !Number.isSafeInteger(row.count) || row.count <= 0) return false;
            if (knownIds.has(row.id)) continue;
            knownIds.add(row.id);
            const data = getItemData(row.itemDataId);
            if (!data) return false;
            const tags = Array.isArray(row.tags) ? row.tags : [];
            const item = Item.fromPersistence(
                row.itemDataId,
                row.count,
                row.durability,
                row.metadata,
                row.id,
                tags,
            );
            if (item.isBroken) return false;
            adopted.push(item);
        }
        if (adopted.length === 0) return true;
        this.beginChangeBatch();
        try {
            for (const item of adopted) this.track(item, ItemState.Clean);
            this.notifyChange();
        } finally {
            this.endChangeBatch();
        }
        return true;
    }

    /** 거래 에스크로 취소처럼 소유자에게 반드시 돌려줘야 하는 아이템을 중량 초과 상태로도 복구한다. */
    restoreItemSnapshot(snapshot: ItemSnapshot): boolean {
        return this.addItemSnapshotInternal(snapshot, false);
    }

    private addItemSnapshotInternal(snapshot: ItemSnapshot, enforceWeight: boolean): boolean {
        const data = getItemData(snapshot.itemDataId);
        if (!data || snapshot.count <= 0) return false;
        if (enforceWeight && !this.canAddSnapshot(snapshot)) return false;

        let remaining = snapshot.count;

        // 스택 가능하면 기존 아이템에 먼저 채우기
        if (data.stackable) {
            for (const item of this._items) {
                if (!item.canStackWith(snapshot)) continue;
                const space = data.maxStack - item.count;
                if (space <= 0) continue;

                const toAdd = Math.min(remaining, space);
                item.count += toAdd;
                remaining -= toAdd;
                if (this._states.get(item) === ItemState.Clean) {
                    this._states.set(item, ItemState.Modified);
                }
                if (remaining <= 0) break;
            }
        }

        // 남은 수량으로 새 아이템 생성
        while (remaining > 0) {
            const qty = data.stackable ? Math.min(remaining, data.maxStack) : 1;
            const item = new Item(
                snapshot.itemDataId,
                qty,
                snapshot.durability,
                snapshot.metadataDelta,
                0,
                snapshot.tags,
            );
            this.track(item, ItemState.New);
            remaining -= qty;
        }

        this.notifyChange();
        return true;
    }

    private validateReplacement(
        selections: readonly InventoryItemSelection[],
        outputs: readonly ItemSnapshot[],
    ): Map<Item, number> | null {
        const totals = new Map<Item, number>();
        for (const selection of selections) {
            if (!Number.isSafeInteger(selection.count) || selection.count <= 0) return null;
            totals.set(selection.item, (totals.get(selection.item) ?? 0) + selection.count);
        }
        for (const [item, count] of totals) {
            if (!this._items.includes(item) || item.count < count) return null;
        }

        let outputWeight = 0;
        try {
            for (const output of outputs) {
                const data = getItemData(output.itemDataId);
                if (!data || !Number.isSafeInteger(output.count) || output.count <= 0) return null;
                Item.fromSnapshot(output);
                outputWeight += data.weight * output.count;
            }
        } catch {
            return null;
        }
        const selectedWeight = [...totals].reduce(
            (sum, [item, count]) => sum + item.weight * count,
            0,
        );
        if (this.currentWeight - selectedWeight + outputWeight > this._maxWeight) return null;
        return totals;
    }

    /** 재료를 실제로 소비하지 않고 같은 원자 교환 규칙으로 결과 수용 가능 여부를 검사한다. */
    canReplaceSelectedItems(
        selections: readonly InventoryItemSelection[],
        outputs: readonly ItemSnapshot[],
    ): boolean {
        return this.validateReplacement(selections, outputs) !== null;
    }

    /** 선택된 재료를 소비하고 결과 snapshot을 추가한다. 실패하면 아무것도 변경하지 않는다. */
    replaceSelectedItems(
        selections: readonly InventoryItemSelection[],
        outputs: readonly ItemSnapshot[],
    ): boolean {
        const totals = this.validateReplacement(selections, outputs);
        if (!totals) return false;

        this.beginChangeBatch();
        try {
            for (const [item, count] of totals) {
                if (!this.removeItemInstance(item, count)) return false;
            }
            for (const output of outputs) {
                if (!this.addItemSnapshot(output)) {
                    throw new Error(`검증된 제작 결과 추가 실패: ${output.itemDataId}`);
                }
            }
        } finally {
            this.endChangeBatch();
        }
        return true;
    }

    // -- 사용 --

    /** 아이템 사용. finish()가 호출되면 resolve되는 Promise 반환 */
    useItem(itemId: number): Promise<void> | null {
        const item = this.getItem(itemId);
        return item ? this.useItemInstance(item) : null;
    }

    /** 저장 전 id=0 아이템이 여러 개여도 선택한 인스턴스 자체를 정확히 사용한다. */
    useItemInstance(item: Item): Promise<void> | null {
        if (this._usingItem || !this._items.includes(item)) return null;

        const data = item.data;
        if (!data?.onUse) return null;

        this._usingItem = true;

        return new Promise<void>(resolve => {
            const finish = () => {
                this._usingItem = false;
                resolve();
            };

            if (!executeItemUse(data.onUse!, this, item, finish)) {
                this._usingItem = false;
                resolve();
            }
        });
    }

    // -- 제거 --

    /**
     * 표시 슬롯을 한 번만 해석해 snapshot 생성과 제거를 같은 동기 경계에서 수행한다.
     * 버리기처럼 외부 소유권으로 옮기는 기능은 조회 후 별도 remove하지 말고 이 API를 사용한다.
     */
    takeItemSnapshotByIndex(index: number, count: number): RemovedInventoryItemSnapshot | undefined {
        if (!Number.isInteger(index) || !Number.isInteger(count) || count < 1) return undefined;
        const item = this._items[index];
        if (!item || item.count < count) return undefined;
        const result = {
            name: item.name,
            snapshot: item.snapshot(count),
        };
        return this.removeItemInstance(item, count) ? result : undefined;
    }

    /** 아이템 인스턴스에서 수량 제거. 0이 되면 삭제 */
    removeItem(itemId: number, count: number): boolean {
        const idx = this._items.findIndex(e => e.id === itemId);
        if (idx === -1) return false;

        const item = this._items[idx];
        if (item.count < count) return false;

        item.count -= count;
        if (item.count <= 0) {
            this._items.splice(idx, 1);
            this.orderDirty = true;
            if (this._states.get(item) === ItemState.New) {
                this._states.delete(item);
            } else {
                this._states.set(item, ItemState.Deleted);
            }
        } else {
            if (this._states.get(item) === ItemState.Clean) {
                this._states.set(item, ItemState.Modified);
            }
        }
        this.notifyChange();
        return true;
    }

    /** DB ID가 아직 0인 신규 아이템도 안전하게 특정 인스턴스에서 제거한다. */
    removeItemInstance(item: Item, count: number): boolean {
        const idx = this._items.indexOf(item);
        if (idx === -1 || count <= 0 || item.count < count) return false;

        item.count -= count;
        if (item.count <= 0) {
            this._items.splice(idx, 1);
            this.orderDirty = true;
            if (this._states.get(item) === ItemState.New) this._states.delete(item);
            else this._states.set(item, ItemState.Deleted);
        } else if (this._states.get(item) === ItemState.Clean) {
            this._states.set(item, ItemState.Modified);
        }
        this.notifyChange();
        return true;
    }

    /** 아이템 정의 ID 기준으로 수량 제거 (여러 인스턴스에 걸쳐) */
    removeItemByData(itemDataId: string, count: number): boolean {
        if (this.getCount(itemDataId) < count) return false;

        let remaining = count;
        // 뒤에서부터 제거 (최근 아이템 우선)
        for (let i = this._items.length - 1; i >= 0 && remaining > 0; i--) {
            const item = this._items[i];
            if (item.itemDataId !== itemDataId) continue;

            const toRemove = Math.min(remaining, item.count);
            item.count -= toRemove;
            remaining -= toRemove;

            if (item.count <= 0) {
                this._items.splice(i, 1);
                this.orderDirty = true;
                if (this._states.get(item) === ItemState.New) {
                    this._states.delete(item);
                } else {
                    this._states.set(item, ItemState.Deleted);
                }
            } else {
                if (this._states.get(item) === ItemState.Clean) {
                    this._states.set(item, ItemState.Modified);
                }
            }
        }
        this.notifyChange();
        return true;
    }

    /** 관리자 초기화 등에서 모든 아이템을 영속 삭제 상태로 전환하고 제거 개수를 반환한다. */
    clear(): number {
        if (this._items.length === 0) return 0;
        const removedCount = this._items.reduce((sum, item) => sum + item.count, 0);
        for (const item of this._items) {
            if (this._states.get(item) === ItemState.New) this._states.delete(item);
            else this._states.set(item, ItemState.Deleted);
        }
        this._items = [];
        this.orderDirty = true;
        this.notifyChange();
        return removedCount;
    }

    private beginChangeBatch(): void { this.changeBatchDepth++; }

    private endChangeBatch(): void {
        this.changeBatchDepth = Math.max(0, this.changeBatchDepth - 1);
        if (this.changeBatchDepth !== 0 || !this.changePending) return;
        this.changePending = false;
        this.dispatchChange();
    }

    private notifyChange(): void {
        if (this.changeBatchDepth > 0) {
            this.changePending = true;
            return;
        }
        this.dispatchChange();
    }

    private dispatchChange(): void {
        this.changeRevision++;
        for (const handler of [...this.changeHandlers]) handler();
    }

    // -- DB 연동 --

    /**
     * 과거의 작은 maxStack 때문에 DB row가 나뉜 stackable 아이템을 현재 규칙에 맞춰 합친다.
     * 인스턴스 metadata·내구도·영속 태그가 다른 아이템은 별도 스택으로 유지한다.
     */
    private consolidateStacks(): boolean {
        let changed = false;
        for (let targetIndex = 0; targetIndex < this._items.length; targetIndex++) {
            const target = this._items[targetIndex];
            const data = getItemData(target.itemDataId);
            if (!data?.stackable || target.count >= data.maxStack) continue;

            for (let sourceIndex = targetIndex + 1; sourceIndex < this._items.length;) {
                const source = this._items[sourceIndex];
                if (!target.canStackWith(source.snapshot())) {
                    sourceIndex++;
                    continue;
                }

                const moved = Math.min(source.count, data.maxStack - target.count);
                if (moved <= 0) break;
                target.count += moved;
                source.count -= moved;
                changed = true;
                if (this._states.get(target) === ItemState.Clean) {
                    this._states.set(target, ItemState.Modified);
                }

                if (source.count > 0) {
                    if (this._states.get(source) === ItemState.Clean) {
                        this._states.set(source, ItemState.Modified);
                    }
                    sourceIndex++;
                    continue;
                }

                this._items.splice(sourceIndex, 1);
                if (this._states.get(source) === ItemState.New) this._states.delete(source);
                else this._states.set(source, ItemState.Deleted);
                this.orderDirty = true;
            }
        }
        return changed;
    }

    /** DB에서 인벤토리 로드 */
    static async load(playerId: number, maxWeight: number): Promise<Inventory> {
        const inv = new Inventory(playerId, maxWeight);
        const rows = await prisma.item.findMany({
            where: { playerId },
            orderBy: [
                { sortOrder: 'asc' },
                { id: 'asc' },
            ],
        });

        for (const row of rows) {
            const item = Item.fromPersistence(
                row.itemDataId,
                row.count,
                row.durability,
                row.metadata,
                row.id,
                (row.tags as TagId[] | null) ?? [],
            );
            inv.track(item, ItemState.Clean);
        }
        inv.consolidateStacks();
        return inv;
    }

    /** 변경된 아이템만 DB에 저장 */
    async save(): Promise<void> {
        if (!this.dirty) return;

        const revision = this.changeRevision;
        const persistOrder = this.orderDirty;
        const sortOrders = new Map(this._items.map((item, index) => [item, index]));
        const changes = [...this._states].map(([item, state]) => ({
            item,
            state,
            id: item.id,
            sortOrder: sortOrders.get(item),
            data: {
                itemDataId: item.itemDataId,
                count: item.count,
                durability: item.durability,
                metadata: item.getPersistedMetadata(),
                tags: item.tags.persistentValues(),
                sortOrder: sortOrders.get(item) ?? 0,
            },
        }));

        await prisma.$transaction(async transaction => {
            await Promise.all(changes.map(async change => {
                if (change.state === ItemState.Deleted) {
                    if (change.id > 0) {
                        // 이미 다른 성공한 저장에서 삭제된 행도 정상 완료로 취급한다.
                        await transaction.item.deleteMany({
                            where: { id: change.id, playerId: this.playerId },
                        });
                    }
                    return;
                }
                if (change.state === ItemState.Clean
                    && (!persistOrder || change.sortOrder === undefined)) return;

                if (change.id > 0) {
                    const updated = await transaction.item.updateMany({
                        where: { id: change.id, playerId: this.playerId },
                        data: change.data,
                    });
                    if (updated.count > 0) return;
                }

                // 이전 비원자 저장이 일부만 성공했거나 외부 정리로 행이 사라진 경우,
                // 메모리 aggregate를 권위로 삼아 새 행으로 복구한다.
                const row = await transaction.item.create({
                    data: {
                        playerId: this.playerId,
                        ...change.data,
                    },
                });
                change.item.id = row.id;
            }));
        });

        // 저장 중 들어온 변경을 Clean으로 덮어쓰지 않는다. 특히 아직 DB ID가 없던
        // New 아이템이 저장 도중 제거됐다면 방금 생성된 행을 다음 pass에서 삭제한다.
        if (revision !== this.changeRevision) {
            for (const change of changes) {
                if (change.state === ItemState.New && !this._states.has(change.item)) {
                    this._states.set(change.item, ItemState.Deleted);
                }
            }
            return;
        }

        // 상태 초기화
        this.orderDirty = false;
        this._states.clear();
        for (const item of this._items) {
            this._states.set(item, ItemState.Clean);
        }
    }
}
