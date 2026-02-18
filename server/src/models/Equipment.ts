import prisma from "../config/prisma.js";
import { Item, getItemData } from "./Item.js";
import type Attribute from "./Attribute.js";

/** 장비 슬롯 종류 */
export type EquipSlot = 'head' | 'body' | 'legs' | 'feet' | 'accessory' | 'mainHand' | 'offHand';

/** 슬롯별 최대 장착 수 */
const SLOT_MAX: Record<EquipSlot, number> = {
    head: 1,
    body: 1,
    legs: 1,
    feet: 1,
    accessory: 3,
    mainHand: 1,
    offHand: 1,
};

/** 슬롯 키 생성 */
function slotKey(slot: EquipSlot, index: number): string {
    return `${slot}:${index}`;
}

/** modifier source 생성 */
function modSource(slot: EquipSlot, index: number): string {
    return `equip:${slot}:${index}`;
}

// 장비 상태 추적
const enum EquipState { Clean, New, Deleted }

interface EquipEntry {
    dbId: number;       // DB id (신규는 0)
    item: Item;
    slot: EquipSlot;
    slotIndex: number;
    state: EquipState;
}

export default class Equipment {
    readonly playerId: number;
    private _slots = new Map<string, EquipEntry>();

    private constructor(playerId: number) {
        this.playerId = playerId;
    }

    /** DB 연동 없이 인메모리 전용 Equipment 생성 (Monster 등) */
    static createEmpty(): Equipment {
        return new Equipment(0);
    }

    // -- 조회 --

    /** 특정 슬롯의 장착 아이템 조회 */
    getEquipped(slot: EquipSlot, slotIndex = 0): Item | undefined {
        return this._slots.get(slotKey(slot, slotIndex))?.item;
    }

    /** 모든 장착 아이템 반환 */
    getAllEquipped(): ReadonlyArray<{ slot: EquipSlot; slotIndex: number; item: Item }> {
        const result: { slot: EquipSlot; slotIndex: number; item: Item }[] = [];
        for (const entry of this._slots.values()) {
            if (entry.state !== EquipState.Deleted) {
                result.push({ slot: entry.slot, slotIndex: entry.slotIndex, item: entry.item });
            }
        }
        return result;
    }

    get dirty(): boolean {
        for (const entry of this._slots.values()) {
            if (entry.state !== EquipState.Clean) return true;
        }
        return false;
    }

    // -- 장착/해제 --

    /** 아이템 장착. 성공 시 true. slotIndex 미지정 시 빈 슬롯 자동 탐색 (accessory) */
    equip(slot: EquipSlot, item: Item, attribute: Attribute, slotIndex?: number): boolean {
        const data = getItemData(item.itemDataId);
        if (!data) return false;
        if (data.equipSlot !== slot) return false;

        const max = SLOT_MAX[slot];

        // slotIndex 자동 탐색
        if (slotIndex === undefined) {
            let found = -1;
            for (let i = 0; i < max; i++) {
                const key = slotKey(slot, i);
                const existing = this._slots.get(key);
                if (!existing || existing.state === EquipState.Deleted) {
                    found = i;
                    break;
                }
            }
            if (found === -1) return false;
            slotIndex = found;
        }

        if (slotIndex < 0 || slotIndex >= max) return false;

        const key = slotKey(slot, slotIndex);
        const existing = this._slots.get(key);
        if (existing && existing.state !== EquipState.Deleted) return false;

        // 장착
        this._slots.set(key, {
            dbId: 0,
            item,
            slot,
            slotIndex,
            state: EquipState.New,
        });

        // modifier 적용
        if (data.modifiers) {
            const source = modSource(slot, slotIndex);
            attribute.addModifiers(data.modifiers.map(m => ({ ...m, source })));
        }

        return true;
    }

    /** 아이템 해제. 해제된 Item 반환 (인벤토리 복귀용). 없으면 null */
    unequip(slot: EquipSlot, slotIndex: number, attribute: Attribute): Item | null {
        const key = slotKey(slot, slotIndex);
        const entry = this._slots.get(key);
        if (!entry || entry.state === EquipState.Deleted) return null;

        // modifier 제거
        attribute.removeBySource(modSource(slot, slotIndex));

        const item = entry.item;

        if (entry.state === EquipState.New) {
            // DB에 저장된 적 없으면 그냥 제거
            this._slots.delete(key);
        } else {
            entry.state = EquipState.Deleted;
        }

        return item;
    }

    // -- Modifier 재적용 (서버 재시작 시) --

    /** 모든 장착 아이템의 modifier를 attribute에 적용 */
    applyModifiers(attribute: Attribute): void {
        for (const entry of this._slots.values()) {
            if (entry.state === EquipState.Deleted) continue;

            const data = getItemData(entry.item.itemDataId);
            if (!data?.modifiers) continue;

            const source = modSource(entry.slot, entry.slotIndex);
            attribute.addModifiers(data.modifiers.map(m => ({ ...m, source })));
        }
    }

    // -- DB 연동 --

    /** DB에서 장비 로드 */
    static async load(playerId: number): Promise<Equipment> {
        const eq = new Equipment(playerId);
        const rows = await prisma.equipment.findMany({
            where: { playerId },
        });

        for (const row of rows) {
            const key = slotKey(row.slot as EquipSlot, row.slotIndex);
            eq._slots.set(key, {
                dbId: row.id,
                item: new Item(
                    row.itemDataId,
                    1,
                    row.durability,
                    row.metadata as Record<string, any> | null,
                ),
                slot: row.slot as EquipSlot,
                slotIndex: row.slotIndex,
                state: EquipState.Clean,
            });
        }
        return eq;
    }

    /** 변경된 장비만 DB에 저장 */
    async save(): Promise<void> {
        if (!this.dirty) return;

        const ops: Promise<any>[] = [];

        for (const [key, entry] of this._slots) {
            switch (entry.state) {
                case EquipState.New:
                    ops.push(
                        prisma.equipment.create({
                            data: {
                                playerId: this.playerId,
                                itemDataId: entry.item.itemDataId,
                                slot: entry.slot,
                                slotIndex: entry.slotIndex,
                                durability: entry.item.durability,
                                metadata: entry.item.metadata ?? undefined,
                            },
                        }).then(row => { entry.dbId = row.id; })
                    );
                    break;
                case EquipState.Deleted:
                    if (entry.dbId > 0) {
                        ops.push(
                            prisma.equipment.delete({
                                where: { id: entry.dbId },
                            })
                        );
                    }
                    break;
            }
        }

        await Promise.all(ops);

        // 상태 초기화
        for (const [key, entry] of this._slots) {
            if (entry.state === EquipState.Deleted) {
                this._slots.delete(key);
            } else {
                entry.state = EquipState.Clean;
            }
        }
    }
}
