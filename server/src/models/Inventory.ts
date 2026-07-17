import prisma from "../config/prisma.js";
import { executeItemUse } from "../modules/itemUse.js";
import { Item, createItemMetadataDelta, getItemData } from "./Item.js";
import type { ItemMetadata, ItemSnapshot } from "./Item.js";
import type { TagId } from "../../../shared/tags.js";

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

// 아이템 상태 추적
const enum ItemState { Clean, New, Modified, Deleted }

export default class Inventory {
    readonly playerId: number;
    private _maxWeight: number;
    private _items: Item[] = [];
    private _states: Map<Item, ItemState> = new Map();
    private _usingItem = false;
    private readonly changeHandlers = new Set<() => void>();
    private changeBatchDepth = 0;
    private changePending = false;

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
        if (item.isBroken) this.removeItemInstance(item, item.count);
    }

    // -- Getters --

    get maxWeight() { return this._maxWeight; }
    set maxWeight(val: number) { this._maxWeight = val; }

    get items(): ReadonlyArray<Item> { return this._items; }

    /** 아이템 사용 중 여부 */
    get isUsingItem() { return this._usingItem; }

    get dirty(): boolean {
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

    /** raw items 배열을 노출하지 않고 predicate에 맞는 총 수량을 반환한다. */
    countMatching(matches: (item: Item) => boolean): number {
        return this._items.reduce((sum, item) => sum + (matches(item) ? item.count : 0), 0);
    }

    /**
     * 여러 필터 요구량에 실제 아이템 수량을 중복 없이 배정한다.
     * 최대 유량으로 겹치는 필터도 가능한 조합이 있으면 찾아낸다.
     */
    selectItems(requirements: readonly InventoryItemRequirement[]): InventoryItemSelection[] | null {
        if (requirements.some(requirement => !Number.isSafeInteger(requirement.count) || requirement.count <= 0)) {
            return null;
        }
        if (requirements.length === 0) return [];

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

        const requiredTotal = requirements.reduce((sum, requirement) => sum + requirement.count, 0);
        if (totalFlow !== requiredTotal) return null;

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
        return selections;
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
        const data = getItemData(snapshot.itemDataId);
        if (!data || snapshot.count <= 0) return false;
        if (!this.canAddSnapshot(snapshot)) return false;

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

    /** 선택된 재료를 소비하고 결과 snapshot을 추가한다. 실패하면 아무것도 변경하지 않는다. */
    replaceSelectedItems(
        selections: readonly InventoryItemSelection[],
        outputs: readonly ItemSnapshot[],
    ): boolean {
        const totals = new Map<Item, number>();
        for (const selection of selections) {
            if (!Number.isSafeInteger(selection.count) || selection.count <= 0) return false;
            totals.set(selection.item, (totals.get(selection.item) ?? 0) + selection.count);
        }
        for (const [item, count] of totals) {
            if (!this._items.includes(item) || item.count < count) return false;
        }

        let outputWeight = 0;
        try {
            for (const output of outputs) {
                const data = getItemData(output.itemDataId);
                if (!data || !Number.isSafeInteger(output.count) || output.count <= 0) return false;
                Item.fromSnapshot(output);
                outputWeight += data.weight * output.count;
            }
        } catch {
            return false;
        }
        const selectedWeight = [...totals].reduce(
            (sum, [item, count]) => sum + item.weight * count,
            0,
        );
        if (this.currentWeight - selectedWeight + outputWeight > this._maxWeight) return false;

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
        if (this._usingItem) return null;

        const item = this.getItem(itemId);
        if (!item) return null;

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

    /** 아이템 인스턴스에서 수량 제거. 0이 되면 삭제 */
    removeItem(itemId: number, count: number): boolean {
        const idx = this._items.findIndex(e => e.id === itemId);
        if (idx === -1) return false;

        const item = this._items[idx];
        if (item.count < count) return false;

        item.count -= count;
        if (item.count <= 0) {
            this._items.splice(idx, 1);
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
        for (const handler of [...this.changeHandlers]) handler();
    }

    // -- DB 연동 --

    /** DB에서 인벤토리 로드 */
    static async load(playerId: number, maxWeight: number): Promise<Inventory> {
        const inv = new Inventory(playerId, maxWeight);
        const rows = await prisma.item.findMany({
            where: { playerId },
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
        return inv;
    }

    /** 변경된 아이템만 DB에 저장 */
    async save(): Promise<void> {
        if (!this.dirty) return;

        const ops: any[] = [];

        for (const [item, state] of this._states) {
            switch (state) {
                case ItemState.New:
                    ops.push(
                        prisma.item.create({
                            data: {
                                playerId: this.playerId,
                                itemDataId: item.itemDataId,
                                count: item.count,
                                durability: item.durability,
                                metadata: item.getPersistedMetadata(),
                                tags: item.tags.persistentValues(),
                            },
                        }).then(row => { item.id = row.id; })
                    );
                    break;
                case ItemState.Modified:
                    ops.push(
                        prisma.item.update({
                            where: { id: item.id },
                            data: {
                                count: item.count,
                                durability: item.durability,
                                metadata: item.getPersistedMetadata(),
                                tags: item.tags.persistentValues(),
                            },
                        })
                    );
                    break;
                case ItemState.Deleted:
                    ops.push(
                        prisma.item.delete({
                            where: { id: item.id },
                        })
                    );
                    break;
            }
        }

        await Promise.all(ops);

        // 상태 초기화
        this._states.clear();
        for (const item of this._items) {
            this._states.set(item, ItemState.Clean);
        }
    }
}
