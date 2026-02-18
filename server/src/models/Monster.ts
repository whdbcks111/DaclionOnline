import prisma from "../config/prisma.js";
import Entity from "./Entity.js";
import Equipment from "./Equipment.js";
import { Item, getItemData } from "./Item.js";
import type { AttributeRecord } from "./Attribute.js";
import type { EquipSlot } from "./Equipment.js";

/** 드롭 아이템 정보 */
export interface DropInfo {
    itemDataId: number;
    minCount: number;
    maxCount: number;
    probability: number;  // 0.0 ~ 1.0
}

/** 몬스터 기본 장비 정보 */
export interface MonsterEquipInfo {
    slot: EquipSlot;
    slotIndex: number;
    itemDataId: number;
}

/** 몬스터 정의 (마스터 데이터, 서버 시작 시 캐싱) */
export interface MonsterData {
    id: number;
    name: string;
    level: number;
    exp: number;
    baseAttribute: Partial<AttributeRecord>;
    drops: DropInfo[];
    expReward: number;
    equipments: MonsterEquipInfo[];
}

export default class Monster extends Entity {
    readonly monsterDataId: number;
    override readonly name: string;
    readonly drops: DropInfo[];
    readonly expReward: number;

    constructor(monsterDataId: number) {
        const data = getMonsterData(monsterDataId);
        if (!data) throw new Error(`MonsterData not found: ${monsterDataId}`);

        const equipment = Equipment.createEmpty();
        super(data.level, data.exp, data.baseAttribute, equipment);

        this.monsterDataId = monsterDataId;
        this.name = data.name;
        this.drops = data.drops;
        this.expReward = data.expReward;

        // 기본 장비 장착
        for (const eq of data.equipments) {
            const itemData = getItemData(eq.itemDataId);
            if (!itemData) continue;
            const item = new Item(eq.itemDataId, 1, itemData.baseDurability, null);
            this.equipment.equip(eq.slot, item, this.attribute, eq.slotIndex);
        }
    }

    /** 드롭 테이블을 굴려 드롭 아이템 목록 반환 */
    rollDrops(): { itemDataId: number; count: number }[] {
        const result: { itemDataId: number; count: number }[] = [];
        for (const drop of this.drops) {
            if (Math.random() < drop.probability) {
                const count = Math.floor(
                    Math.random() * (drop.maxCount - drop.minCount + 1) + drop.minCount
                );
                if (count > 0) {
                    result.push({ itemDataId: drop.itemDataId, count });
                }
            }
        }
        return result;
    }
}

// -- MonsterData 캐시 --

const monsterDataCache = new Map<number, MonsterData>();

/** 몬스터 정의 캐시 로드 (서버 시작 시 1회 호출) */
export async function loadMonsterData(): Promise<void> {
    const rows = await prisma.monsterData.findMany();
    monsterDataCache.clear();
    for (const row of rows) {
        monsterDataCache.set(row.id, {
            id: row.id,
            name: row.name,
            level: row.level,
            exp: row.exp,
            baseAttribute: row.baseAttribute as Partial<AttributeRecord>,
            drops: (row.drops as unknown as DropInfo[]) ?? [],
            expReward: row.expReward,
            equipments: (row.equipments as unknown as MonsterEquipInfo[]) ?? [],
        });
    }
}

/** 몬스터 정의 조회 */
export function getMonsterData(id: number): MonsterData | undefined {
    return monsterDataCache.get(id);
}

/** 모든 몬스터 정의 조회 */
export function getAllMonsterData(): MonsterData[] {
    return Array.from(monsterDataCache.values());
}
