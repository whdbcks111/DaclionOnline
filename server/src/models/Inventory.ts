import prisma from "../config/prisma.js";
import { executeItemUse } from "../modules/itemUse.js";
import { Item, getItemData } from "./Item.js";

export type { ItemData } from "./Item.js";
export { Item, loadItemData, getItemData, getAllItemData } from "./Item.js";

// 아이템 상태 추적
const enum ItemState { Clean, New, Modified, Deleted }

export default class Inventory {
    readonly playerId: number;
    private _maxWeight: number;
    private _items: Item[] = [];
    private _states: Map<Item, ItemState> = new Map();
    private _usingItem = false;

    private constructor(playerId: number, maxWeight: number) {
        this.playerId = playerId;
        this._maxWeight = maxWeight;
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

    // -- 조회 --

    /** 아이템 인스턴스 ID로 조회 */
    getItem(itemId: number): Item | undefined {
        return this._items.find(e => e.id === itemId);
    }

    /** 아이템 정의 ID로 조회 (모든 인스턴스) */
    getItemsByData(itemDataId: number): Item[] {
        return this._items.filter(e => e.itemDataId === itemDataId);
    }

    /** 특정 아이템 정의의 총 수량 */
    getCount(itemDataId: number): number {
        return this.getItemsByData(itemDataId).reduce((sum, e) => sum + e.count, 0);
    }

    // -- 추가 --

    /** 무게 체크: 아이템 추가 가능 여부 */
    canAdd(itemDataId: number, count: number): boolean {
        const data = getItemData(itemDataId);
        if (!data) return false;
        return this.currentWeight + data.weight * count <= this._maxWeight;
    }

    /** 아이템 추가. 성공 시 true */
    addItem(itemDataId: number, count: number, metadata?: Record<string, any> | null): boolean {
        const data = getItemData(itemDataId);
        if (!data) return false;
        if (!this.canAdd(itemDataId, count)) return false;

        let remaining = count;

        // 스택 가능하면 기존 아이템에 먼저 채우기
        if (data.stackable) {
            for (const item of this._items) {
                if (item.itemDataId !== itemDataId) continue;
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
                itemDataId,
                qty,
                data.baseDurability,
                metadata ?? (data.baseMetadata ? { ...data.baseMetadata } : null),
            );
            this._items.push(item);
            this._states.set(item, ItemState.New);
            remaining -= qty;
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
        return true;
    }

    /** 아이템 정의 ID 기준으로 수량 제거 (여러 인스턴스에 걸쳐) */
    removeItemByData(itemDataId: number, count: number): boolean {
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
        return true;
    }

    // -- DB 연동 --

    /** DB에서 인벤토리 로드 */
    static async load(playerId: number, maxWeight: number): Promise<Inventory> {
        const inv = new Inventory(playerId, maxWeight);
        const rows = await prisma.item.findMany({
            where: { playerId },
        });

        for (const row of rows) {
            const item = new Item(
                row.itemDataId,
                row.count,
                row.durability,
                row.metadata as Record<string, any> | null,
                row.id,
            );
            inv._items.push(item);
            inv._states.set(item, ItemState.Clean);
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
                                metadata: item.metadata ?? undefined,
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
                                metadata: item.metadata ?? undefined,
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
