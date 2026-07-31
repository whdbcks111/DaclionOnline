import { AttributeType } from "./Attribute.js";
import type { AttributeKey, AttributeModifier, ModifierOp } from "./Attribute.js";
import { GameTags, TagCollection, normalizeTags } from "../../../shared/tags.js";
import type { TagId, TagReadable } from "../../../shared/tags.js";
import { isDeepStrictEqual } from "node:util";
import {
    cloneMetadata,
    cloneMetadataValue,
    createMetadataDelta,
    decodeMetadataDelta,
    encodeMetadataDelta,
    isEncodedMetadataDelta,
} from './Metadata.js';
import type { MetadataRecord, MetadataValue } from './Metadata.js';
import type Entity from './Entity.js';
import type { DamageResult } from './Entity.js';
import { StatType, type StatKey } from './Stat.js';
import {
    applyItemAttackEffects,
    ItemAttackEffectType,
    normalizeItemAttackEffects,
    rollItemAttackDamageMultiplier,
    type ItemAttackEffectSnapshot,
} from './ItemAttackEffect.js';

export type ItemMetadataValue = MetadataValue;
export interface ItemMetadata extends MetadataRecord {}

/** 코드 레지스트리와 JSON metadata 사이의 직렬화 경계 key. */
export const ItemMetadataKeys = Object.freeze({
    BASIC_ATTACK_OVERRIDE: 'basicAttackOverride',
    PROJECTILE_ATTACK: 'projectileAttack',
    PROJECTILE: 'projectile',
    STATUS_EFFECT: 'statusEffect',
    CUSTOM_NAME: 'customName',
    CUSTOM_DESCRIPTION: 'customDescription',
    INSTANCE_MODIFIERS: 'instanceModifiers',
    MAX_DURABILITY: 'maxDurability',
    FORGE: 'forge',
    ENCHANTMENT: 'enchantment',
    ATTACK_EFFECTS: 'attackEffects',
    REINFORCEMENT: 'reinforcement',
    REQUIREMENTS: 'requirements',
} as const);

const METADATA_STORAGE_KEY = '__daclionItemMetadata';
const METADATA_STORAGE_VERSION = 1;

export interface PersistedItemMetadataDelta {
    [key: string]: ItemMetadataValue;
    [METADATA_STORAGE_KEY]: typeof METADATA_STORAGE_VERSION;
    values: ItemMetadata;
}

/** 밸런스 리포트에서 아이템의 용도를 구분하는 클래스형 enum. */
export class ItemBalanceRole {
    private static readonly all: ItemBalanceRole[] = [];

    static readonly WEAPON = new ItemBalanceRole('weapon', '무기');
    static readonly DEFENSE = new ItemBalanceRole('defense', '방어 장비');
    static readonly BUFF = new ItemBalanceRole('buff', '버프 소모품');
    static readonly RECOVERY = new ItemBalanceRole('recovery', '회복 소모품');
    static readonly UTILITY = new ItemBalanceRole('utility', '기능 아이템');

    private constructor(readonly key: string, readonly label: string) {
        ItemBalanceRole.all.push(this);
    }

    static values(): readonly ItemBalanceRole[] { return ItemBalanceRole.all; }
    static fromKey(key: string): ItemBalanceRole | undefined {
        return ItemBalanceRole.all.find(role => role.key === key);
    }
}

/** 아이템이 전투식에 기여하는 방식을 명시하는 진단용 메타데이터. */
export interface ItemBalanceProfile {
    readonly role: ItemBalanceRole;
    readonly attackType?: 'physical' | 'magic';
    readonly recommendedJobIds?: readonly string[];
    readonly notes?: readonly string[];
}

/**
 * Prisma `Int`로 안전하게 저장할 수 있는 범위 안에서 사용하는 공용 스택 상한.
 * 일반 플레이에서는 중량이 먼저 한계가 되므로 stackable 아이템에는 사실상 무제한이다.
 */
export const MAX_STACKABLE_ITEM_COUNT = 2_000_000_000;
/** 아이템 metadata와 장비 강화 규칙이 공유하는 영속 강화 단계 상한. */
export const MAX_ITEM_REINFORCEMENT_LEVEL = 15;
/** 후반 단조 장비 성장 공식을 저장한 metadata 버전. */
export const FORGED_ITEM_BALANCE_VERSION = 2;

/** 단계당 5%, +5/+10/+15에서 추가 5%를 적용해 +15에서 원래 긍정 능력치의 90%를 더한다. */
export function calculateItemReinforcementRate(level: number): number {
    const normalized = Math.max(0, Math.min(MAX_ITEM_REINFORCEMENT_LEVEL, Math.floor(level)));
    return normalized * 0.05 + Math.floor(normalized / 5) * 0.05;
}

export function calculateForgedWeaponPowerMultiplier(formKey: string, itemLevel: number): number {
    if (!['sword', 'axe', 'dagger', 'staff_frame', 'bow_limb'].includes(formKey)) return 1;
    return 1 + Math.min(0.28, Math.max(0, itemLevel - 350) * 0.0004);
}

export function calculateForgedPhysicalPenetration(itemLevel: number, dagger = false): number {
    const value = itemLevel * 0.16 + Math.max(0, itemLevel - 500) * 0.65;
    return roundReinforcementValue(value * (dagger ? 1.22 : 1));
}

export function calculateForgedProjectileAcceleration(itemLevel: number): number {
    return roundReinforcementValue(1 + itemLevel * 0.0025 + Math.max(0, itemLevel - 350) * 0.0015);
}

export function calculateForgedStaffMentalityRegen(itemLevel: number): number {
    return roundReinforcementValue(2 + itemLevel * 0.05 + Math.max(0, itemLevel - 500) * 0.05);
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
    /** 일반 stackable 아이템은 MAX_STACKABLE_ITEM_COUNT를 사용하고, 특별한 게임 규칙이 있을 때만 더 작게 제한한다. */
    maxStack: number;
    baseMetadata: ItemMetadata | null;
    onUse: string | null;
    equipSlot: string | null;
    modifiers: AttributeModifier[] | null;
    baseDurability: number | null;
    tags: TagId[];
    /** 실제 modifier/onUse 데이터로 계산할 밸런스 리포트의 분류 정보. */
    balance?: ItemBalanceProfile;
    /** 감정 화면에 내부 handler 이름 없이 그대로 노출할 가공된 고유 효과 설명. */
    gameplayEffects?: readonly string[];
    /** 직접 공격이 회피되지 않고 피해를 준 뒤 실행되는 무기별 후처리. */
    onBasicAttackHit?: (context: ItemBasicAttackHitContext) => void;
    /** 직접 공격 피해를 받은 뒤 보조 장비가 실행하는 방어 후처리. */
    onDamageTaken?: (context: ItemDamageTakenContext) => void;
    /** 장착 중 적용할 경험치 획득 배율. 여러 장비는 곱연산한다. */
    experienceGainMultiplier?: number;
    /** 장착자가 몬스터의 마지막 타격자로 확정되었을 때 실행하는 후처리. */
    onOwnerDefeatedEntity?: (context: ItemOwnerDefeatedEntityContext) => void;
    /** 장착 중 매 서버 tick 실행하는 지속 효과. */
    onOwnerUpdate?: (context: ItemOwnerUpdateContext) => void;
    /** 생명력이 0 이하가 된 순간 사망을 취소할 기회를 제공한다. */
    onOwnerFatalDamage?: (context: ItemOwnerFatalDamageContext) => boolean;
    /** 내구도 소진 또는 강화 실패로 아이템이 파괴되는 순간 당시 소유자에게 실행한다. */
    onOwnerItemDestroyed?: (context: ItemOwnerItemDestroyedContext) => void;
}

export interface ItemBasicAttackHitContext {
    attacker: Entity;
    target: Entity;
    weapon: Item;
    result: DamageResult;
}

export interface ItemDamageTakenContext {
    attacker: Entity;
    target: Entity;
    item: Item;
    result: DamageResult;
}

export interface ItemOwnerDefeatedEntityContext {
    owner: Entity;
    target: Entity;
    item: Item;
}

export interface ItemOwnerUpdateContext {
    owner: Entity;
    item: Item;
    dt: number;
}

export interface ItemOwnerFatalDamageContext {
    owner: Entity;
    item: Item;
}

export interface ItemOwnerItemDestroyedContext {
    owner: Entity;
    item: Item;
}

/** 소유 계층 사이에서 아이템 상태를 손실 없이 이동하는 불변 스냅샷 */
export interface ItemSnapshot {
    itemDataId: string;
    count: number;
    durability: number | null;
    metadataDelta: ItemMetadata | null;
    tags: TagId[];
}

/** 인스턴스 metadata를 합친 이름·아이콘만 UI 계층에 노출하는 경량 표시 스냅샷. */
export interface ItemDisplaySnapshot {
    readonly name: string;
    readonly image: string;
}

export type ItemRequirementSource = 'shop' | 'treasure' | 'forge';

export interface ItemRequirementSnapshot {
    readonly level: number;
    readonly stats: Readonly<Partial<Record<StatKey, number>>>;
    readonly source: ItemRequirementSource;
}

function normalizeItemRequirements(value: unknown): ItemRequirementSnapshot | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const candidate = value as { level?: unknown; stats?: unknown; source?: unknown };
    const level = typeof candidate.level === 'number' && Number.isFinite(candidate.level)
        ? Math.max(1, Math.floor(candidate.level))
        : 1;
    const stats: Partial<Record<StatKey, number>> = {};
    if (candidate.stats && typeof candidate.stats === 'object' && !Array.isArray(candidate.stats)) {
        for (const stat of StatType.values()) {
            const amount = (candidate.stats as Record<string, unknown>)[stat.key];
            if (typeof amount === 'number' && Number.isFinite(amount) && amount > 0) {
                stats[stat.key] = Math.floor(amount);
            }
        }
    }
    const source: ItemRequirementSource = candidate.source === 'treasure' || candidate.source === 'forge'
        ? candidate.source
        : 'shop';
    return { level, stats, source };
}

function requirementStatForItem(data: ItemData): StatType | undefined {
    const category = data.category.replace(/\s+/g, '');
    if (data.tags.includes(GameTags.TOOL_FISHING)) return StatType.SENSIBILITY;
    if (data.tags.includes(GameTags.ITEM_BAIT)) return undefined;
    if (data.tags.includes('weapon:staff')) return StatType.MENTALITY;
    if (data.tags.includes('weapon:bow') || data.tags.includes('weapon:dagger')) return StatType.AGILITY;
    if (data.equipSlot === 'mainHand') return StatType.STRENGTH;
    if (data.equipSlot === 'body' || data.equipSlot === 'head'
        || data.equipSlot === 'legs' || data.equipSlot === 'feet'
        || category.includes('방패') || data.equipSlot === 'offHand') return StatType.VITALITY;
    return undefined;
}

/**
 * 획득처의 권장 레벨에서 실제 사용·장착 조건을 만든다.
 * 보물 장비는 상점 장비보다 레벨·스탯 요구치를 낮춰 조기 획득 보상을 유지한다.
 */
export function createAcquisitionRequirements(
    itemDataId: string,
    recommendedLevel: number,
    source: Exclude<ItemRequirementSource, 'forge'>,
): MetadataRecord | null {
    const data = getItemData(itemDataId);
    if (!data || (!data.equipSlot && !data.onUse)) return null;
    const progressionLevel = Math.max(1, Math.floor(recommendedLevel));
    const isEquipment = Boolean(data.equipSlot);
    const levelFactor = source === 'treasure'
        ? (isEquipment ? 0.5 : 0.35)
        : (isEquipment ? 0.72 : 0.55);
    const level = Math.max(1, Math.floor(progressionLevel * levelFactor));
    const stats: Partial<Record<StatKey, number>> = {};
    const stat = isEquipment ? requirementStatForItem(data) : undefined;
    if (stat && progressionLevel >= 20) {
        stats[stat.key] = Math.max(1, Math.floor(
            progressionLevel * (source === 'treasure' ? 0.12 : 0.2),
        ));
    }
    return { level, stats: stats as MetadataRecord, source };
}

/** 인벤토리·장비·바닥이 같은 규칙으로 두 아이템 스냅샷의 스택 호환성을 검사한다. */
export function canStackItemSnapshots(left: ItemSnapshot, right: ItemSnapshot): boolean {
    return left.itemDataId === right.itemDataId
        && left.durability === right.durability
        && isDeepStrictEqual(left.metadataDelta ?? {}, right.metadataDelta ?? {})
        && JSON.stringify(normalizeTags(left.tags)) === JSON.stringify(normalizeTags(right.tags));
}

/** 바닥·거래 등 Item 객체를 직접 보관하지 않는 소유 기능의 표시용 API. */
export function getItemSnapshotDisplay(snapshot: ItemSnapshot): ItemDisplaySnapshot {
    const item = Item.fromSnapshot(snapshot);
    return { name: item.name, image: item.image };
}

/** `/감정` 등 읽기 전용 UI가 Item 내부 상태를 직접 참조하지 않고 사용하는 스냅샷. */
export interface ItemInspectionSnapshot {
    readonly itemDataId: string;
    readonly name: string;
    readonly description: string;
    readonly image: string;
    readonly category: string;
    readonly count: number;
    readonly weight: number;
    readonly totalWeight: number;
    readonly stackable: boolean;
    readonly maxStack: number;
    readonly equipSlot: string | null;
    readonly durability: number | null;
    readonly maxDurability: number | null;
    readonly modifiers: readonly AttributeModifier[];
    readonly tags: readonly TagId[];
    readonly metadata: Readonly<ItemMetadata> | null;
    readonly metadataDelta: Readonly<ItemMetadata> | null;
    readonly attackEffects: readonly ItemAttackEffectSnapshot[];
    readonly requirements: ItemRequirementSnapshot | null;
}

export interface ItemDurabilityRepairResult {
    readonly durability: number;
    readonly maxDurability: number;
    readonly lostMaxDurability: number;
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
        this._metadataDelta = cloneMetadata(metadataDelta ?? {});
        const maxDurability = this.baseDurability;
        this._durability = maxDurability === null
            ? null
            : normalizeDurability(durability ?? maxDurability, maxDurability);
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
    get name(): string {
        const custom = this.getMetadata(ItemMetadataKeys.CUSTOM_NAME);
        const baseName = typeof custom === 'string' && custom.trim() ? custom.trim().slice(0, 40) : this.data?.name ?? '';
        return this.reinforcementLevel > 0 ? `${baseName} +${this.reinforcementLevel}` : baseName;
    }

    /** 아이템 설명 */
    get description(): string {
        const custom = this.getMetadata(ItemMetadataKeys.CUSTOM_DESCRIPTION);
        return typeof custom === 'string' && custom.trim() ? custom.trim().slice(0, 300) : this.data?.description ?? '';
    }

    /** 인벤토리·장비 이동 시 사용하는 스택 가능 여부. */
    get stackable(): boolean { return this.data?.stackable ?? false; }

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

    /** 장착 무기가 요청하는 기본 공격 오버라이드 레지스트리 key. */
    get basicAttackOverrideKey(): string | undefined {
        const value = this.getMetadata(ItemMetadataKeys.BASIC_ATTACK_OVERRIDE);
        return typeof value === 'string' && value.trim() ? value : undefined;
    }

    /** 인스턴스 metadata의 공격 효과를 검증·정규화한 불변 목록. */
    get attackEffects(): readonly ItemAttackEffectSnapshot[] {
        return normalizeItemAttackEffects(this.getMetadata(ItemMetadataKeys.ATTACK_EFFECTS));
    }

    /** Entity 공격 경계가 호출하는 인스턴스 적중 효과 실행 API. */
    triggerInstanceAttackEffects(
        context: Omit<ItemBasicAttackHitContext, 'weapon'>,
        random: () => number = Math.random,
    ): readonly ItemAttackEffectType[] {
        return applyItemAttackEffects(this.attackEffects, context, random);
    }

    /** 불안정 공명처럼 공격 전에 확정해야 하는 인스턴스 피해 배율을 반환한다. */
    rollInstanceAttackDamageMultiplier(random: () => number = Math.random): number {
        return rollItemAttackDamageMultiplier(this.attackEffects, random);
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

    /** 획득처 또는 단조 결과가 부여한 사용·장착 조건. */
    get requirements(): ItemRequirementSnapshot | null {
        return normalizeItemRequirements(this.getMetadata(ItemMetadataKeys.REQUIREMENTS));
    }

    /** 강화 계산의 기준이 되는 마스터/인스턴스 고유 능력치 snapshot. */
    getReinforcementBaseModifiers(): readonly AttributeModifier[] {
        const instance = normalizeInstanceModifiers(this.getMetadata(ItemMetadataKeys.INSTANCE_MODIFIERS));
        const base = instance ?? this.data?.modifiers ?? [];
        return [
            ...base.map(modifier => ({ ...modifier })),
            ...createLegacyForgedBalanceUpgradeModifiers(
                base,
                this.getMetadata(ItemMetadataKeys.FORGE),
            ),
        ];
    }

    /** 지정 강화 단계가 원래 긍정 능력치에 비례해 추가하는 modifier snapshot. */
    getReinforcementModifiersAtLevel(level: number): readonly AttributeModifier[] {
        return createProportionalReinforcementModifiers(this.getReinforcementBaseModifiers(), level);
    }

    /** 능력치 modifier 목록 */
    get modifiers(): AttributeModifier[] | null {
        const base = this.getReinforcementBaseModifiers();
        const reinforcement = this.getReinforcementModifiersAtLevel(this.reinforcementLevel);
        const combined = [...base, ...reinforcement];
        return combined.length > 0 ? combined : null;
    }

    /** 후가공 강화 단계. 잘못된 저장값은 안전하게 0으로 취급한다. */
    get reinforcementLevel(): number {
        const value = this.getMetadata<{ level?: unknown }>(ItemMetadataKeys.REINFORCEMENT)?.level;
        return typeof value === 'number' && Number.isFinite(value)
            ? Math.max(0, Math.min(MAX_ITEM_REINFORCEMENT_LEVEL, Math.floor(value)))
            : 0;
    }

    /** 기본(최대) 내구도. null = 무한 */
    get baseDurability(): number | null {
        const override = this.getMetadata(ItemMetadataKeys.MAX_DURABILITY);
        return typeof override === 'number' && Number.isFinite(override) && override > 0
            ? Math.min(10_000, Math.round(override))
            : this.data?.baseDurability ?? null;
    }

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

    /**
     * 손상 장비를 복구하면서 선택적으로 최대 내구도를 영구 감소시킨다.
     * 소유 계층의 dirty callback을 유지하기 위해 metadata와 현재 내구도 변경을 Item이 직접 소유한다.
     */
    repairDurability(amount: number, maxDurabilityLossRate = 0): ItemDurabilityRepairResult | null {
        if (!Number.isFinite(amount) || amount < 0) throw new Error('Durability repair amount must be a non-negative number');
        if (!Number.isFinite(maxDurabilityLossRate) || maxDurabilityLossRate < 0 || maxDurabilityLossRate >= 1) {
            throw new Error('Max durability loss rate must be between 0 and 1');
        }
        const previousMax = this.baseDurability;
        if (previousMax === null || this._durability === null) return null;
        const lostMaxDurability = maxDurabilityLossRate <= 0
            ? 0
            : Math.min(previousMax - 1, Math.max(1, Math.round(previousMax * maxDurabilityLossRate)));
        const maxDurability = previousMax - lostMaxDurability;
        if (lostMaxDurability > 0) {
            this.setMetadata(ItemMetadataKeys.MAX_DURABILITY, maxDurability);
        }
        const durability = this.setDurability(Math.min(this._durability, maxDurability) + amount);
        return durability === null ? null : { durability, maxDurability, lostMaxDurability };
    }

    decreaseDurability(amount = 1): number | null {
        if (!Number.isFinite(amount) || amount < 0) throw new Error('Durability decrease must be a non-negative number');
        return this.changeDurability(-amount);
    }

    hasTag(tag: TagId): boolean { return this.tags.hasTag(tag); }

    /** 현재 기본 데이터와 인스턴스 delta를 합친 감정용 불변 값 스냅샷. */
    getInspectionSnapshot(): ItemInspectionSnapshot {
        const data = this.data;
        return {
            itemDataId: this.itemDataId,
            name: this.name || '알 수 없는 아이템',
            description: this.description,
            image: this.image,
            category: this.category,
            count: this.count,
            weight: this.weight,
            totalWeight: this.weight * this.count,
            stackable: data?.stackable ?? false,
            maxStack: data?.maxStack ?? 1,
            equipSlot: this.equipSlot,
            durability: this.durability,
            maxDurability: this.baseDurability,
            modifiers: (this.modifiers ?? []).map(modifier => ({ ...modifier })),
            tags: this.tags.values(),
            metadata: this.getMetadataSnapshot(),
            metadataDelta: this.getMetadataDeltaSnapshot(),
            attackEffects: this.attackEffects,
            requirements: this.requirements,
        };
    }

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
        return canStackItemSnapshots(this.snapshot(), snapshot);
    }
}

// 아이템 마스터 데이터 캐시
const itemDataCache = new Map<string, ItemData>();

function normalizeInstanceModifiers(value: unknown): AttributeModifier[] | null {
    if (!Array.isArray(value)) return null;
    const modifiers: AttributeModifier[] = [];
    for (const entry of value) {
        if (!entry || typeof entry !== 'object') continue;
        const candidate = entry as { attribute?: unknown; op?: unknown; value?: unknown };
        if (typeof candidate.attribute !== 'string' || !AttributeType.fromKey(candidate.attribute)) continue;
        if (candidate.op !== 'add' && candidate.op !== 'multiply') continue;
        if (typeof candidate.value !== 'number' || !Number.isFinite(candidate.value)) continue;
        modifiers.push({
            attribute: candidate.attribute as AttributeKey,
            op: candidate.op as ModifierOp,
            value: candidate.value,
            source: '',
        });
    }
    return modifiers.length > 0 ? modifiers : null;
}

function createProportionalReinforcementModifiers(
    base: readonly AttributeModifier[],
    level: number,
): AttributeModifier[] {
    const rate = calculateItemReinforcementRate(level);
    if (rate <= 0) return [];
    const additive = new Map<AttributeKey, number>();
    const multiplicative = new Map<AttributeKey, number>();
    for (const modifier of base) {
        if (modifier.op === 'add' && modifier.value > 0) {
            additive.set(modifier.attribute, (additive.get(modifier.attribute) ?? 0) + modifier.value);
        } else if (modifier.op === 'multiply' && modifier.value > 1) {
            multiplicative.set(
                modifier.attribute,
                (multiplicative.get(modifier.attribute) ?? 1) * modifier.value,
            );
        }
    }
    const result: AttributeModifier[] = [];
    for (const [attribute, value] of additive) {
        result.push({
            attribute,
            op: 'add',
            value: roundReinforcementValue(value * rate),
            source: '',
        });
    }
    for (const [attribute, value] of multiplicative) {
        const strengthened = 1 + (value - 1) * (1 + rate);
        result.push({
            attribute,
            op: 'multiply',
            value: roundReinforcementValue(strengthened / value),
            source: '',
        });
    }
    return result;
}

function createLegacyForgedBalanceUpgradeModifiers(
    base: readonly AttributeModifier[],
    value: unknown,
): AttributeModifier[] {
    if (!value || typeof value !== 'object') return [];
    const forge = value as Record<string, unknown>;
    if (forge.balanceVersion === FORGED_ITEM_BALANCE_VERSION) return [];
    const form = typeof forge.form === 'string' ? forge.form : '';
    const itemLevel = typeof forge.itemLevel === 'number' && Number.isFinite(forge.itemLevel)
        ? Math.max(1, forge.itemLevel)
        : 1;
    const normalizedForm = form === 'staff' ? 'staff_frame' : form === 'bow' ? 'bow_limb' : form;
    const multiplier = calculateForgedWeaponPowerMultiplier(normalizedForm, itemLevel);
    const primaryAttribute: AttributeKey | undefined = normalizedForm === 'staff_frame'
        ? 'magicForce'
        : ['sword', 'axe', 'dagger', 'bow_limb'].includes(normalizedForm) ? 'atk' : undefined;
    const primary = primaryAttribute
        ? base.find(modifier => modifier.attribute === primaryAttribute && modifier.op === 'add' && modifier.value > 0)
        : undefined;
    const result: AttributeModifier[] = primary && multiplier > 1 ? [{
        attribute: primary.attribute,
        op: 'add',
        value: roundReinforcementValue(primary.value * (multiplier - 1)),
        source: '',
    }] : [];

    if (['sword', 'axe', 'dagger'].includes(normalizedForm)) {
        result.push({
            attribute: 'armorPen',
            op: 'add',
            value: calculateForgedPhysicalPenetration(itemLevel, normalizedForm === 'dagger'),
            source: '',
        });
    }
    if (normalizedForm === 'dagger') {
        const accuracy = typeof forge.accuracy === 'number' ? forge.accuracy : 0;
        const precision = typeof forge.forgingPrecision === 'number' ? forge.forgingPrecision : 0;
        const rawSpeed = 0.025 + itemLevel * 0.0007 + precision * 0.025 + accuracy * 0.045;
        const speedDelta = Math.min(0.7, rawSpeed) - Math.min(0.32, rawSpeed);
        if (speedDelta > 0) {
            result.push({ attribute: 'speed', op: 'add', value: roundReinforcementValue(speedDelta), source: '' });
        }
    }
    if (normalizedForm === 'bow_limb') {
        result.push({
            attribute: 'critRate',
            op: 'add',
            value: roundReinforcementValue(0.04 + itemLevel * 0.0002),
            source: '',
        });
    }
    if (form === 'bow') {
        const oldAcceleration = 1 + Math.min(0.9, 0.08 + itemLevel * 0.0025);
        result.push({
            attribute: 'projectileAcceleration',
            op: 'multiply',
            value: roundReinforcementValue(calculateForgedProjectileAcceleration(itemLevel) / oldAcceleration),
            source: '',
        });
    }
    if (form === 'staff') {
        const oldMagicForce = sumPositiveAdditiveModifiers(base, 'magicForce');
        const upgradedMagicForce = oldMagicForce + (primary?.value ?? 0) * (multiplier - 1);
        const oldPenetration = 6 + itemLevel * 0.12 + oldMagicForce * 0.04;
        const newPenetration = 6 + itemLevel * 0.17 + upgradedMagicForce * 0.04
            + Math.max(0, itemLevel - 500) * 0.8;
        result.push({
            attribute: 'magicPen',
            op: 'add',
            value: roundReinforcementValue(Math.max(0, newPenetration - oldPenetration)),
            source: '',
        });
        result.push({
            attribute: 'mentalityRegen',
            op: 'add',
            value: roundReinforcementValue(Math.max(
                0,
                calculateForgedStaffMentalityRegen(itemLevel) - (1 + Math.sqrt(itemLevel) * 0.35),
            )),
            source: '',
        });
        const oldAcceleration = 1 + Math.min(0.9, 0.08 + itemLevel * 0.0025);
        result.push({
            attribute: 'projectileAcceleration',
            op: 'multiply',
            value: roundReinforcementValue(calculateForgedProjectileAcceleration(itemLevel) / oldAcceleration),
            source: '',
        });
    }
    return result.filter(modifier => modifier.op === 'add' ? modifier.value > 0 : modifier.value > 1);
}

function sumPositiveAdditiveModifiers(base: readonly AttributeModifier[], attribute: AttributeKey): number {
    return base.filter(modifier =>
        modifier.attribute === attribute && modifier.op === 'add' && modifier.value > 0
    ).reduce((sum, modifier) => sum + modifier.value, 0);
}

function roundReinforcementValue(value: number): number {
    return Number(value.toFixed(6));
}

function normalizeDurability(value: number, max: number): number {
    if (!Number.isFinite(value)) throw new Error('Durability must be finite');
    return Math.max(0, Math.min(max, Math.trunc(value)));
}

/** 기존 전체 metadata에서 현재 기본값과 다른 top-level 필드만 추린다. */
export function createItemMetadataDelta(itemDataId: string, metadata: unknown): ItemMetadata {
    const baseMetadata = getItemData(itemDataId)?.baseMetadata ?? {};
    return createMetadataDelta(baseMetadata, metadata) as ItemMetadata;
}

export function isPersistedItemMetadataDelta(value: unknown): value is PersistedItemMetadataDelta {
    return isEncodedMetadataDelta(value, METADATA_STORAGE_KEY, METADATA_STORAGE_VERSION);
}

export function encodeItemMetadataDelta(delta: ItemMetadata): PersistedItemMetadataDelta {
    return encodeMetadataDelta(
        METADATA_STORAGE_KEY,
        METADATA_STORAGE_VERSION,
        delta,
    ) as PersistedItemMetadataDelta;
}

/** 새 payload는 그대로 읽고, 구형 전체 metadata는 현재 기본값 기준 delta로 변환한다. */
export function decodeItemMetadataDelta(itemDataId: string, persistedMetadata: unknown): ItemMetadata {
    return decodeMetadataDelta(
        METADATA_STORAGE_KEY,
        METADATA_STORAGE_VERSION,
        getItemData(itemDataId)?.baseMetadata,
        persistedMetadata,
    ) as ItemMetadata;
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
