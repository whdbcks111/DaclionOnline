import type { AttributeModifier } from "./Attribute.js";
import { TagCollection, normalizeTags } from "../../../shared/tags.js";
import type { TagId, TagReadable } from "../../../shared/tags.js";

/** 아이템 정의 (마스터 데이터, 코드에서 직접 정의) */
export interface ItemData {
    id: string;
    name: string;
    description: string;
    category: string;
    weight: number;
    stackable: boolean;
    maxStack: number;
    baseMetadata: Record<string, any> | null;
    onUse: string | null;
    equipSlot: string | null;
    modifiers: AttributeModifier[] | null;
    baseDurability: number | null;
    tags: TagId[];
}

/** 소유 계층 사이에서 아이템 상태를 손실 없이 이동하는 불변 스냅샷 */
export interface ItemSnapshot {
    itemDataId: string;
    count: number;
    durability: number | null;
    metadata: Record<string, any> | null;
    tags: TagId[];
}

/** 아이템 인스턴스 (인벤토리/장비 공용) */
export class Item implements TagReadable {
    id: number;
    readonly itemDataId: string;
    count: number;
    durability: number | null;
    metadata: Record<string, any> | null;
    readonly tags: TagCollection;

    constructor(
        itemDataId: string,
        count: number,
        durability: number | null,
        metadata: Record<string, any> | null,
        id = 0,
        persistentTags: readonly TagId[] = [],
    ) {
        this.id = id;
        this.itemDataId = itemDataId;
        this.count = count;
        this.durability = durability;
        this.metadata = metadata;
        this.tags = new TagCollection({
            definition: getItemData(itemDataId)?.tags,
            persistent: persistentTags,
        });
    }

    /** 아이템 정의 데이터 */
    get data(): ItemData | undefined {
        return itemDataCache.get(this.itemDataId);
    }

    /** 아이템 이름 */
    get name(): string { return this.data?.name ?? ''; }

    /** 아이템 설명 */
    get description(): string { return this.data?.description ?? ''; }

    /** 아이템 카테고리 */
    get category(): string { return this.data?.category ?? ''; }

    /** 아이템 무게 */
    get weight(): number { return this.data?.weight ?? 0; }

    /** 장비 슬롯 */
    get equipSlot(): string | null { return this.data?.equipSlot ?? null; }

    /** 능력치 modifier 목록 */
    get modifiers(): AttributeModifier[] | null { return this.data?.modifiers ?? null; }

    /** 기본(최대) 내구도. null = 무한 */
    get baseDurability(): number | null { return this.data?.baseDurability ?? null; }

    hasTag(tag: TagId): boolean { return this.tags.hasTag(tag); }

    snapshot(count = this.count): ItemSnapshot {
        return {
            itemDataId: this.itemDataId,
            count,
            durability: this.durability,
            metadata: this.metadata ? { ...this.metadata } : null,
            tags: this.tags.persistentValues(),
        };
    }

    static fromSnapshot(snapshot: ItemSnapshot): Item {
        return new Item(
            snapshot.itemDataId,
            snapshot.count,
            snapshot.durability,
            snapshot.metadata ? { ...snapshot.metadata } : null,
            0,
            snapshot.tags,
        );
    }

    /** 스택 병합 시 인스턴스별 영속 데이터가 같은지 검사 */
    canStackWith(snapshot: ItemSnapshot): boolean {
        return this.itemDataId === snapshot.itemDataId
            && this.durability === snapshot.durability
            && JSON.stringify(this.metadata) === JSON.stringify(snapshot.metadata)
            && JSON.stringify(this.tags.persistentValues()) === JSON.stringify(normalizeTags(snapshot.tags));
    }
}

// 아이템 마스터 데이터 캐시
const itemDataCache = new Map<string, ItemData>();

/** 아이템 정의 등록 (data/items.ts에서 호출) */
export function defineItem(data: ItemData): void {
    itemDataCache.set(data.id, { ...data, tags: normalizeTags(data.tags) });
}

/** 아이템 정의 조회 */
export function getItemData(itemDataId: string): ItemData | undefined {
    return itemDataCache.get(itemDataId);
}

/** 모든 아이템 정의 조회 */
export function getAllItemData(): ItemData[] {
    return Array.from(itemDataCache.values());
}
