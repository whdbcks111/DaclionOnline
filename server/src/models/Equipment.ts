import prisma from "../config/prisma.js";
import { Item, getItemData } from "./Item.js";
import type Attribute from "./Attribute.js";

/** 장비 슬롯 키 */
export type EquipSlot = 'head' | 'body' | 'legs' | 'feet' | 'accessory' | 'mainHand' | 'offHand';

/** 장비 슬롯 종류 — Java 클래스 열거형 패턴 */
export class EquipSlotType {
    /** @internal 자기 등록용 레지스트리. 인스턴스 선언보다 먼저 초기화되어야 함 */
    private static _all: EquipSlotType[] = []

    static readonly HEAD      = new EquipSlotType('head',      '머리',   1)
    static readonly BODY      = new EquipSlotType('body',      '몸통',   1, ['몸'])
    static readonly LEGS      = new EquipSlotType('legs',      '다리',   1)
    static readonly FEET      = new EquipSlotType('feet',      '발',     1)
    static readonly MAIN_HAND = new EquipSlotType('mainHand',  '손',     1, ['주손', '주무기', 'mainhand'])
    static readonly OFF_HAND  = new EquipSlotType('offHand',   '보조',   1, ['보조무기', '보조손', 'offhand'])
    static readonly ACCESSORY = new EquipSlotType('accessory', '장신구', 3, ['악세사리'])

    readonly key: EquipSlot
    readonly label: string
    readonly max: number
    private readonly _aliases: string[]

    private constructor(key: EquipSlot, label: string, max: number, aliases: string[] = []) {
        this.key = key
        this.label = label
        this.max = max
        this._aliases = aliases
        EquipSlotType._all.push(this)
    }

    /** 모든 EquipSlotType 목록 */
    static values(): readonly EquipSlotType[] { return EquipSlotType._all }

    /** key 문자열로 조회 */
    static fromKey(key: string): EquipSlotType | undefined {
        return EquipSlotType._all.find(s => s.key === key)
    }

    /** key, label, aliases로 조회 (커맨드 입력 파싱용) */
    static fromInput(input: string): EquipSlotType | undefined {
        const lower = input.toLowerCase()
        return EquipSlotType._all.find(s =>
            s.key === lower || s.label === input || s._aliases.includes(input) || s._aliases.includes(lower)
        )
    }

    toString(): string { return this.key }
}

/** 슬롯별 최대 장착 수 (호환성 유지) */
export const SLOT_MAX: Record<EquipSlot, number> = Object.fromEntries(
    EquipSlotType.values().map(s => [s.key, s.max])
) as Record<EquipSlot, number>;

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

    /** 아이템 장착 (슬롯이 가득 찰 경우 마지막 장착 아이템을 해제 후 장착). 해제된 아이템 반환 (빈 슬롯이었으면 null, 유효하지 않으면 undefined) */
    equipSwap(slot: EquipSlot, item: Item, attribute: Attribute, targetSlotIndex?: number): Item | null | undefined {
        const data = getItemData(item.itemDataId);
        if (!data || data.equipSlot !== slot) return undefined;

        const max = SLOT_MAX[slot];
        let useIndex: number;

        if (targetSlotIndex !== undefined) {
            if (targetSlotIndex < 0 || targetSlotIndex >= max) return undefined;
            useIndex = targetSlotIndex;
        } else {
            let emptyIndex = -1;
            let lastOccupied = -1;
            for (let i = 0; i < max; i++) {
                const entry = this._slots.get(slotKey(slot, i));
                if (!entry || entry.state === EquipState.Deleted) {
                    if (emptyIndex === -1) emptyIndex = i;
                } else {
                    lastOccupied = i;
                }
            }
            useIndex = emptyIndex !== -1 ? emptyIndex : lastOccupied;
        }

        if (useIndex < 0) return undefined;

        const displaced = this.unequip(slot, useIndex, attribute);

        // unequip이 Clean 항목을 Deleted로 마킹하면 dbId가 남아있다 — 보존해서 save()에서 update로 처리
        const deletedEntry = this._slots.get(slotKey(slot, useIndex));
        const inheritDbId = deletedEntry?.state === EquipState.Deleted ? deletedEntry.dbId : 0;

        this._slots.set(slotKey(slot, useIndex), {
            dbId: inheritDbId,
            item,
            slot,
            slotIndex: useIndex,
            state: EquipState.New,
        });

        if (data.modifiers) {
            attribute.addModifiers(data.modifiers.map(m => ({ ...m, source: modSource(slot, useIndex) })));
        }

        return displaced;
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
                    if (entry.dbId > 0) {
                        // equipSwap으로 기존 DB 행 재사용 → update
                        ops.push(
                            prisma.equipment.update({
                                where: { id: entry.dbId },
                                data: {
                                    itemDataId: entry.item.itemDataId,
                                    durability: entry.item.durability,
                                    metadata: entry.item.metadata ?? undefined,
                                },
                            })
                        );
                    } else {
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
                    }
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
