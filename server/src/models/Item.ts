import type { AttributeModifier } from "./Attribute.js";
import { TagCollection, normalizeTags } from "../../../shared/tags.js";
import type { TagId, TagReadable } from "../../../shared/tags.js";
import { isDeepStrictEqual } from "node:util";

export type ItemMetadataValue = string | number | boolean | null
    | ItemMetadataValue[]
    | { [key: string]: ItemMetadataValue };
export interface ItemMetadata {
    [key: string]: ItemMetadataValue;
}

const METADATA_STORAGE_KEY = '__daclionItemMetadata';
const METADATA_STORAGE_VERSION = 1;

export interface PersistedItemMetadataDelta {
    [key: string]: ItemMetadataValue;
    [METADATA_STORAGE_KEY]: typeof METADATA_STORAGE_VERSION;
    values: ItemMetadata;
}

/** 아이템 정의 (마스터 데이터, 코드에서 직접 정의) */
export interface ItemData {
    id: string;
    name: string;
    description: string;
    /** /icons 아래의 확장자 없는 이미지 key. 생략하면 items/{id} */
    image?: string;
    category: string;
    weight: number;
    stackable: boolean;
    maxStack: number;
    baseMetadata: ItemMetadata | null;
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
    metadataDelta: ItemMetadata | null;
    tags: TagId[];
}

/** 아이템 인스턴스 (인벤토리/장비 공용) */
export class Item implements TagReadable {
    id: number;
    readonly itemDataId: string;
    count: number;
    readonly tags: TagCollection;
    private _durability: number | null;
    private _metadataDelta: ItemMetadata;
    private _persistentChangeHandler: (() => void) | null = null;

    constructor(
        itemDataId: string,
        count: number,
        durability: number | null,
        metadataDelta: ItemMetadata | null,
        id = 0,
        persistentTags: readonly TagId[] = [],
    ) {
        this.id = id;
        this.itemDataId = itemDataId;
        this.count = count;
        const maxDurability = this.baseDurability;
        this._durability = maxDurability === null
            ? null
            : normalizeDurability(durability ?? maxDurability, maxDurability);
        this._metadataDelta = cloneMetadata(metadataDelta ?? {});
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

    /** metadata → 마스터 데이터 → ID 기반 기본 경로 순서로 결정한 이미지 key */
    get image(): string {
        return normalizeItemImage(this.getMetadata('image'))
            ?? normalizeItemImage(this.data?.image)
            ?? `items/${this.itemDataId}`;
    }

    /** 기본 metadata와 인스턴스 delta를 합친 단일 필드 조회 */
    getMetadata<T = unknown>(key: string): T | undefined {
        if (Object.hasOwn(this._metadataDelta, key)) {
            return cloneMetadataValue(this._metadataDelta[key]) as T;
        }
        const value = this.data?.baseMetadata?.[key];
        return value === undefined ? undefined : cloneMetadataValue(value) as T;
    }

    /** 기본 metadata와 delta를 합친 읽기 전용 스냅샷 */
    getMetadataSnapshot(): Readonly<ItemMetadata> | null {
        const merged = {
            ...(this.data?.baseMetadata ?? {}),
            ...this._metadataDelta,
        };
        return Object.keys(merged).length > 0 ? cloneMetadata(merged) : null;
    }

    /** 인스턴스에 실제 저장되는 delta 스냅샷 */
    getMetadataDeltaSnapshot(): ItemMetadata | null {
        return Object.keys(this._metadataDelta).length > 0
            ? cloneMetadata(this._metadataDelta)
            : null;
    }

    /** 인스턴스 metadata override 설정. 기본값과 같으면 불필요한 delta를 제거한다. */
    setMetadata(key: string, value: unknown): void {
        if (!key) throw new Error('Item metadata key must not be empty');
        if (value === undefined) {
            this.resetMetadata(key);
            return;
        }

        const normalized = cloneMetadataValue(value);
        const baseValue = this.data?.baseMetadata?.[key];
        if (isDeepStrictEqual(normalized, baseValue)) {
            this.resetMetadata(key);
            return;
        }
        if (Object.hasOwn(this._metadataDelta, key)
            && isDeepStrictEqual(this._metadataDelta[key], normalized)) return;

        this._metadataDelta[key] = normalized;
        this._persistentChangeHandler?.();
    }

    /** 인스턴스 override를 제거해 현재 ItemData.baseMetadata를 다시 상속한다. */
    resetMetadata(key: string): boolean {
        if (!Object.hasOwn(this._metadataDelta, key)) return false;
        delete this._metadataDelta[key];
        this._persistentChangeHandler?.();
        return true;
    }

    /** Inventory/Equipment가 영속 상태 변경을 dirty 상태로 연결할 때 사용한다. */
    setPersistentChangeHandler(handler: (() => void) | null): void {
        this._persistentChangeHandler = handler;
    }

    /** Prisma JSON 필드에 저장할 버전이 표시된 delta payload */
    getPersistedMetadata(): PersistedItemMetadataDelta {
        return encodeItemMetadataDelta(this._metadataDelta);
    }

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

    /** 현재 내구도. null이면 내구도 시스템을 사용하지 않는다. */
    get durability(): number | null { return this._durability; }

    /** UI에 바로 사용할 0~1 내구도 비율. 내구도가 없으면 null */
    get durabilityRatio(): number | null {
        const max = this.baseDurability;
        if (max === null || this._durability === null) return null;
        return max > 0 ? this._durability / max : 0;
    }

    get isBroken(): boolean { return this._durability !== null && this._durability <= 0; }

    /** 현재 내구도를 0~baseDurability 범위로 설정한다. */
    setDurability(value: number): number | null {
        const max = this.baseDurability;
        if (max === null || this._durability === null) return null;
        const next = normalizeDurability(value, max);
        if (next === this._durability) return next;
        this._durability = next;
        this._persistentChangeHandler?.();
        return next;
    }

    /** 양수/음수 delta만큼 내구도를 변경한다. */
    changeDurability(delta: number): number | null {
        if (!Number.isFinite(delta)) throw new Error('Durability delta must be finite');
        return this._durability === null ? null : this.setDurability(this._durability + delta);
    }

    increaseDurability(amount = 1): number | null {
        if (!Number.isFinite(amount) || amount < 0) throw new Error('Durability increase must be a non-negative number');
        return this.changeDurability(amount);
    }

    decreaseDurability(amount = 1): number | null {
        if (!Number.isFinite(amount) || amount < 0) throw new Error('Durability decrease must be a non-negative number');
        return this.changeDurability(-amount);
    }

    hasTag(tag: TagId): boolean { return this.tags.hasTag(tag); }

    snapshot(count = this.count): ItemSnapshot {
        return {
            itemDataId: this.itemDataId,
            count,
            durability: this._durability,
            metadataDelta: this.getMetadataDeltaSnapshot(),
            tags: this.tags.persistentValues(),
        };
    }

    static fromSnapshot(snapshot: ItemSnapshot): Item {
        return new Item(
            snapshot.itemDataId,
            snapshot.count,
            snapshot.durability,
            snapshot.metadataDelta,
            0,
            snapshot.tags,
        );
    }

    /** DB JSON payload를 delta로 해석해 Item을 복원한다. */
    static fromPersistence(
        itemDataId: string,
        count: number,
        durability: number | null,
        persistedMetadata: unknown,
        id = 0,
        persistentTags: readonly TagId[] = [],
    ): Item {
        return new Item(
            itemDataId,
            count,
            durability,
            decodeItemMetadataDelta(itemDataId, persistedMetadata),
            id,
            persistentTags,
        );
    }

    /** 스택 병합 시 인스턴스별 영속 데이터가 같은지 검사 */
    canStackWith(snapshot: ItemSnapshot): boolean {
        return this.itemDataId === snapshot.itemDataId
            && this._durability === snapshot.durability
            && isDeepStrictEqual(this._metadataDelta, snapshot.metadataDelta ?? {})
            && JSON.stringify(this.tags.persistentValues()) === JSON.stringify(normalizeTags(snapshot.tags));
    }
}

// 아이템 마스터 데이터 캐시
const itemDataCache = new Map<string, ItemData>();

function normalizeDurability(value: number, max: number): number {
    if (!Number.isFinite(value)) throw new Error('Durability must be finite');
    return Math.max(0, Math.min(max, Math.trunc(value)));
}

function cloneMetadataValue(value: unknown): ItemMetadataValue {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new Error('Item metadata value must be JSON serializable');
    return JSON.parse(serialized) as ItemMetadataValue;
}

function cloneMetadata(metadata: ItemMetadata): ItemMetadata {
    return cloneMetadataValue(metadata) as ItemMetadata;
}

function isMetadataRecord(value: unknown): value is ItemMetadata {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 기존 전체 metadata에서 현재 기본값과 다른 top-level 필드만 추린다. */
export function createItemMetadataDelta(itemDataId: string, metadata: unknown): ItemMetadata {
    if (!isMetadataRecord(metadata)) return {};
    const baseMetadata = getItemData(itemDataId)?.baseMetadata ?? {};
    const delta: ItemMetadata = {};
    for (const [key, value] of Object.entries(metadata)) {
        if (!isDeepStrictEqual(value, baseMetadata[key])) {
            delta[key] = cloneMetadataValue(value);
        }
    }
    return delta;
}

export function isPersistedItemMetadataDelta(value: unknown): value is PersistedItemMetadataDelta {
    return isMetadataRecord(value)
        && value[METADATA_STORAGE_KEY] === METADATA_STORAGE_VERSION
        && isMetadataRecord(value.values);
}

export function encodeItemMetadataDelta(delta: ItemMetadata): PersistedItemMetadataDelta {
    return {
        [METADATA_STORAGE_KEY]: METADATA_STORAGE_VERSION,
        values: cloneMetadata(delta),
    };
}

/** 새 payload는 그대로 읽고, 구형 전체 metadata는 현재 기본값 기준 delta로 변환한다. */
export function decodeItemMetadataDelta(itemDataId: string, persistedMetadata: unknown): ItemMetadata {
    if (isPersistedItemMetadataDelta(persistedMetadata)) {
        return cloneMetadata(persistedMetadata.values);
    }
    return createItemMetadataDelta(itemDataId, persistedMetadata);
}

/** 운영 데이터 마이그레이션에서 구형 payload를 버전이 표시된 delta로 변환한다. */
export function migratePersistedItemMetadata(
    itemDataId: string,
    persistedMetadata: unknown,
): PersistedItemMetadataDelta {
    return encodeItemMetadataDelta(decodeItemMetadataDelta(itemDataId, persistedMetadata));
}

/** 로컬 /icons 경로 밖으로 벗어나지 않는 이미지 key만 허용한다. */
function normalizeItemImage(value: unknown): string | undefined {
    if (typeof value !== 'string' || value.includes('..')) return undefined;
    return /^[a-zA-Z0-9][a-zA-Z0-9/_-]*$/.test(value) ? value : undefined;
}

/** 아이템 정의 등록 (data/items.ts에서 호출) */
export function defineItem(data: ItemData): void {
    if (data.image !== undefined && !normalizeItemImage(data.image)) {
        throw new Error(`Invalid item image key: ${data.image}`);
    }
    if (data.baseDurability !== null
        && (!Number.isInteger(data.baseDurability) || data.baseDurability < 0)) {
        throw new Error(`Invalid item base durability: ${data.baseDurability}`);
    }
    itemDataCache.set(data.id, {
        ...data,
        baseMetadata: data.baseMetadata ? cloneMetadata(data.baseMetadata) : null,
        tags: normalizeTags(data.tags),
    });
}

/** 아이템 정의 조회 */
export function getItemData(itemDataId: string): ItemData | undefined {
    return itemDataCache.get(itemDataId);
}

/** 모든 아이템 정의 조회 */
export function getAllItemData(): ItemData[] {
    return Array.from(itemDataCache.values());
}
