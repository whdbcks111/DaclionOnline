import Entity from "./Entity.js";
import type { DamageResult, DamageType, DamageCause } from "./Entity.js";
import Equipment from "./Equipment.js";
import { Item, getItemData } from "./Item.js";
import type { AttributeRecord } from "./Attribute.js";
import type { EquipSlot } from "./Equipment.js";

/** 드롭 아이템 정보 */
export interface DropInfo {
    itemDataId: string;
    minCount: number;
    maxCount: number;
    chance: number;  // 0.0 ~ 1.0
}

/** 몬스터 기본 장비 정보 */
export interface MonsterEquipInfo {
    slot: EquipSlot;
    slotIndex: number;
    itemDataId: string;
}

/** 몬스터 정의 (마스터 데이터, 코드에서 직접 정의) */
export interface MonsterData {
    id: string;
    name: string;
    level: number;
    exp: number;
    baseAttribute: Partial<AttributeRecord>;
    drops: DropInfo[];
    expReward: number;
    equipments: MonsterEquipInfo[];
}

export default class Monster extends Entity {
    readonly monsterDataId: string;
    override readonly name: string;
    readonly drops: DropInfo[];
    readonly expReward: number;

    constructor(monsterDataId: string, locationId = '') {
        const data = getMonsterData(monsterDataId);
        if (!data) throw new Error(`MonsterData not found: ${monsterDataId}`);

        const equipment = Equipment.createEmpty();
        super(data.level, data.exp, locationId, data.baseAttribute, equipment);

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

    /** 피격 시 공격자를 자동 타게팅 (타겟 없을 때만) */
    override damage(rawAmount: number, type: DamageType = 'physical', cause: DamageCause | null = null): DamageResult {
        const result = super.damage(rawAmount, type, cause);
        if (cause?.causeEntity && !this.currentTarget) {
            this.currentTarget = cause.causeEntity;
        }
        return result;
    }

    /** 타겟 공격 AI */
    override update(_dt: number): void {
        const target = this.currentTarget;
        if (!target || target.life <= 0 || target.locationId !== this.locationId) {
            this.currentTarget = null;
            return;
        }
        this.attack(target);
    }

    /** 드롭 테이블을 굴려 드롭 아이템 목록 반환 */
    rollDrops(): { itemDataId: string; count: number }[] {
        const result: { itemDataId: string; count: number }[] = [];
        for (const drop of this.drops) {
            if (Math.random() < drop.chance) {
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

const monsterDataCache = new Map<string, MonsterData>();

/** 몬스터 정의 등록 (data/monsters.ts에서 호출) */
export function defineMonster(data: MonsterData): void {
    monsterDataCache.set(data.id, data);
}

/** 몬스터 정의 조회 */
export function getMonsterData(id: string): MonsterData | undefined {
    return monsterDataCache.get(id);
}

/** 모든 몬스터 정의 조회 */
export function getAllMonsterData(): MonsterData[] {
    return Array.from(monsterDataCache.values());
}
