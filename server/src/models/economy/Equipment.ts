import prisma from "../../config/prisma.js";
import { Item, getItemData } from "./Item.js";
import type { ItemDurabilityRepairResult } from "./Item.js";
import type Attribute from "../core/Attribute.js";
import type { AttributeValueChangeSnapshot } from '../core/Attribute.js';
import type Entity from '../core/Entity.js';
import type { DamageResult } from '../core/Entity.js';
import { GameTags } from "../../../../shared/tags.js";
import type { TagId, TagReadable } from "../../../../shared/tags.js";
import type { EquipmentDurabilityHudData } from '../../../../shared/types.js';
import logger from '../../utils/logger.js';

/** 장비 슬롯 키 */
export type EquipSlot = 'head' | 'body' | 'legs' | 'feet' | 'accessory' | 'mainHand' | 'offHand' | 'bag';

export type ArmorDurabilityDamageModeKey = 'single' | 'all';

/** 방어구 내구도 손상 범위 — 일반 공격은 SINGLE, 명시적 특수 공격만 ALL을 사용한다. */
export class ArmorDurabilityDamageMode {
    private static readonly all: ArmorDurabilityDamageMode[] = [];

    static readonly SINGLE = new ArmorDurabilityDamageMode(
        'single', '단일 부위', false, ['단일', '한부위', '일반'],
    );
    static readonly ALL = new ArmorDurabilityDamageMode(
        'all', '전 부위', true, ['전체', '전부위', '특수'],
    );

    private constructor(
        readonly key: ArmorDurabilityDamageModeKey,
        readonly label: string,
        /** true인 모드는 AttackOptions에서 명시한 공격에만 적용한다. */
        readonly explicitOnly: boolean,
        readonly aliases: readonly string[],
    ) {
        ArmorDurabilityDamageMode.all.push(this);
    }

    static values(): readonly ArmorDurabilityDamageMode[] { return [...ArmorDurabilityDamageMode.all]; }

    static fromKey(key: string): ArmorDurabilityDamageMode | undefined {
        const normalized = key.trim().toLowerCase();
        return ArmorDurabilityDamageMode.all.find(mode => mode.key === normalized);
    }

    static fromInput(input: string): ArmorDurabilityDamageMode | undefined {
        const normalized = input.trim().toLocaleLowerCase('ko-KR');
        return ArmorDurabilityDamageMode.all.find(mode => mode.key === normalized
            || mode.label.toLocaleLowerCase('ko-KR') === normalized
            || mode.aliases.some(alias => alias.toLocaleLowerCase('ko-KR') === normalized));
    }

    toString(): string { return this.key; }
}

export interface ArmorDurabilityDamageRandom {
    /** 손상 확률 판정용 0~1 난수. */
    readonly chance: () => number;
    /** 가중치 부위 선정용 0~1 난수. */
    readonly slot: () => number;
}

export interface ArmorDurabilityDamageSnapshot {
    readonly slot: EquipSlot;
    readonly slotIndex: number;
    readonly itemDataId: string;
    readonly itemName: string;
    readonly previousDurability: number;
    readonly durability: number;
    readonly broken: boolean;
}

/** 실제 장착과 미리보기가 공유하는 교체 대상 슬롯의 불변 스냅샷. */
export interface EquipTargetSnapshot {
    readonly slot: EquipSlot;
    readonly slotIndex: number;
    readonly slotLabel: string;
    readonly currentItemName: string | null;
}

/** 현재 최종 능력치에 장비 교체를 가상 적용한 감정용 불변 스냅샷. */
export interface EquipmentAttributePreviewSnapshot extends EquipTargetSnapshot {
    readonly changes: readonly AttributeValueChangeSnapshot[];
}

const DEFAULT_ARMOR_DURABILITY_DAMAGE_RANDOM: ArmorDurabilityDamageRandom = Object.freeze({
    chance: () => Math.random(),
    slot: () => Math.random(),
});

/** 실제 생명력 피해 비율을 방어구 단일 부위 손상 확률 10~70%로 환산한다. */
export function calculateArmorDurabilityDamageChance(lifeDamage: number, maxLife: number): number {
    const ratio = Number.isFinite(lifeDamage) && Number.isFinite(maxLife) && maxLife > 0
        ? Math.max(0, lifeDamage) / maxLife
        : 0;
    return Math.max(0.1, Math.min(0.7, 0.1 + 1.2 * ratio));
}

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
    static readonly BAG       = new EquipSlotType('bag',       '가방',   1, ['배낭'])

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

const ARMOR_DURABILITY_SLOT_WEIGHTS = Object.freeze([
    Object.freeze({ slot: EquipSlotType.BODY, weight: 40 }),
    Object.freeze({ slot: EquipSlotType.LEGS, weight: 25 }),
    Object.freeze({ slot: EquipSlotType.HEAD, weight: 20 }),
    Object.freeze({ slot: EquipSlotType.FEET, weight: 15 }),
] as const);

const DURABILITY_HUD_SLOTS = Object.freeze([
    Object.freeze({ slot: EquipSlotType.MAIN_HAND, group: 'weapon' as const, tag: GameTags.ITEM_WEAPON }),
    Object.freeze({ slot: EquipSlotType.OFF_HAND, group: 'weapon' as const, tag: GameTags.ITEM_WEAPON }),
    Object.freeze({ slot: EquipSlotType.HEAD, group: 'armor' as const, tag: GameTags.ITEM_ARMOR }),
    Object.freeze({ slot: EquipSlotType.BODY, group: 'armor' as const, tag: GameTags.ITEM_ARMOR }),
    Object.freeze({ slot: EquipSlotType.LEGS, group: 'armor' as const, tag: GameTags.ITEM_ARMOR }),
    Object.freeze({ slot: EquipSlotType.FEET, group: 'armor' as const, tag: GameTags.ITEM_ARMOR }),
    Object.freeze({ slot: EquipSlotType.OFF_HAND, group: 'armor' as const, tag: GameTags.ITEM_ARMOR }),
] as const);

function normalizeArmorDurabilityRandom(value: number, fallback: number): number {
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
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
const enum EquipState { Clean, New, Modified, Deleted }

interface EquipEntry {
    dbId: number;       // DB id (신규는 0)
    item: Item;
    slot: EquipSlot;
    slotIndex: number;
    state: EquipState;
}

export default class Equipment implements TagReadable {
    readonly playerId: number;
    private _slots = new Map<string, EquipEntry>();
    private ownerAttribute?: Attribute;
    private ownerEntity?: Entity;

    private constructor(playerId: number) {
        this.playerId = playerId;
    }

    private setEntry(key: string, entry: EquipEntry): void {
        const markModified = () => {
            if (entry.item.isBroken) {
                this.breakEntry(entry);
                return;
            }
            if (entry.state === EquipState.Clean) entry.state = EquipState.Modified;
            if (this.ownerAttribute) {
                const source = modSource(entry.slot, entry.slotIndex);
                this.ownerAttribute.removeBySource(source);
                const modifiers = entry.item.modifiers;
                if (modifiers) this.ownerAttribute.addModifiers(modifiers.map(modifier => ({ ...modifier, source })));
            }
            this.refreshOwnerEffects();
        };
        entry.item.tags.setPersistentChangeHandler(() => {
            markModified();
        });
        entry.item.setPersistentChangeHandler(markModified);
        this._slots.set(key, entry);
    }

    private breakEntry(entry: EquipEntry): boolean {
        const key = slotKey(entry.slot, entry.slotIndex);
        if (this._slots.get(key) !== entry || entry.state === EquipState.Deleted) return false;
        if (this.ownerEntity) {
            try {
                entry.item.data?.onOwnerItemDestroyed?.({ owner: this.ownerEntity, item: entry.item });
            } catch (error) {
                logger.error(`장착 아이템 파괴 효과 실패: ${entry.item.itemDataId}`, error);
            }
        }
        this.ownerAttribute?.removeBySource(modSource(entry.slot, entry.slotIndex));
        if (entry.state === EquipState.New) this._slots.delete(key);
        else entry.state = EquipState.Deleted;
        this.refreshOwnerEffects();
        return true;
    }

    private refreshOwnerEffects(): void {
        const owner = this.ownerEntity;
        if (!owner) return;
        for (const slot of EquipSlotType.values()) {
            for (let index = 0; index < slot.max; index++) {
                owner.removeExperienceGainModifier(`equipment:${slot.key}:${index}`);
            }
        }
        for (const entry of this._slots.values()) {
            if (entry.state === EquipState.Deleted || entry.item.isBroken) continue;
            const multiplier = entry.item.data?.experienceGainMultiplier;
            if (typeof multiplier === 'number' && Number.isFinite(multiplier) && multiplier >= 0) {
                owner.setExperienceGainModifier(`equipment:${entry.slot}:${entry.slotIndex}`, multiplier);
            }
        }
    }

    /** DB 연동 없이 인메모리 전용 Equipment 생성 (Monster 등) */
    static createEmpty(): Equipment {
        return new Equipment(0);
    }

    // -- 조회 --

    /** 특정 슬롯의 장착 아이템 조회 */
    getEquipped(slot: EquipSlot, slotIndex = 0): Item | undefined {
        const entry = this._slots.get(slotKey(slot, slotIndex));
        return entry && entry.state !== EquipState.Deleted ? entry.item : undefined;
    }

    /**
     * 인덱스가 없으면 첫 빈 슬롯, 모두 찼으면 마지막 점유 슬롯을 선택한다.
     * equipSwap과 Player 장착, 감정 미리보기가 같은 규칙을 재사용한다.
     */
    resolveEquipTarget(slot: EquipSlot, targetSlotIndex?: number): EquipTargetSnapshot | undefined {
        const type = EquipSlotType.fromKey(slot);
        if (!type) return undefined;
        let slotIndex = targetSlotIndex;
        if (slotIndex !== undefined) {
            if (!Number.isSafeInteger(slotIndex) || slotIndex < 0 || slotIndex >= type.max) return undefined;
        } else {
            let firstEmpty = -1;
            let lastOccupied = -1;
            for (let index = 0; index < type.max; index++) {
                if (this.getEquipped(slot, index)) lastOccupied = index;
                else if (firstEmpty === -1) firstEmpty = index;
            }
            slotIndex = firstEmpty !== -1 ? firstEmpty : lastOccupied;
        }
        if (slotIndex < 0) return undefined;
        return Object.freeze({
            slot,
            slotIndex,
            slotLabel: type.max > 1 ? `${type.label}${slotIndex + 1}` : type.label,
            currentItemName: this.getEquipped(slot, slotIndex)?.name ?? null,
        });
    }

    /** 파손·요구조건과 무관하게 실제 교체 슬롯의 최종 능력치 변화만 읽기 전용으로 계산한다. */
    previewItemAttributeChange(
        item: Item,
        attribute: Attribute,
        targetSlotIndex?: number,
    ): EquipmentAttributePreviewSnapshot | undefined {
        const slot = item.equipSlot as EquipSlot | null;
        if (!slot) return undefined;
        const target = this.resolveEquipTarget(slot, targetSlotIndex);
        if (!target) return undefined;
        const changes = attribute.previewModifierSourceReplacement(
            modSource(target.slot, target.slotIndex),
            item.modifiers ?? [],
        );
        return Object.freeze({ ...target, changes });
    }

    /** 특정 장비 슬롯 아이템의 태그를 내부 슬롯 Map 노출 없이 검사한다. */
    hasEquippedItemTag(slot: EquipSlot, tag: TagId, slotIndex = 0): boolean {
        return this.getEquipped(slot, slotIndex)?.hasTag(tag) ?? false;
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

    /** 상태 HUD가 내부 슬롯 Map을 보지 않고 무기·보호구 내구도만 고정 순서로 읽는다. */
    getDurabilityHudSnapshots(): readonly EquipmentDurabilityHudData[] {
        const snapshots: EquipmentDurabilityHudData[] = [];
        for (const definition of DURABILITY_HUD_SLOTS) {
            for (let slotIndex = 0; slotIndex < definition.slot.max; slotIndex++) {
                const item = this.getEquipped(definition.slot.key, slotIndex);
                if (!item || !item.hasTag(definition.tag)) continue;
                const current = item.durability;
                const max = item.baseDurability;
                if (current === null || max === null) continue;
                snapshots.push(Object.freeze({
                    group: definition.group,
                    slot: definition.slot.key,
                    slotLabel: definition.slot.max > 1
                        ? `${definition.slot.label}${slotIndex + 1}`
                        : definition.slot.label,
                    itemDataId: item.itemDataId,
                    name: item.name,
                    icon: item.image,
                    current,
                    max,
                    ratio: Math.max(0, Math.min(1, item.durabilityRatio ?? 0)),
                }));
            }
        }
        return Object.freeze(snapshots);
    }

    /** 장착 아이템 metadata override를 변경하고 dirty 상태로 표시한다. */
    setItemMetadata(slot: EquipSlot, slotIndex: number, metadataKey: string, value: unknown): boolean {
        const item = this.getEquipped(slot, slotIndex);
        if (!item) return false;
        item.setMetadata(metadataKey, value);
        return true;
    }

    /** 장착 아이템 metadata override를 제거해 최신 기본값을 다시 상속한다. */
    resetItemMetadata(slot: EquipSlot, slotIndex: number, metadataKey: string): boolean {
        return this.getEquipped(slot, slotIndex)?.resetMetadata(metadataKey) ?? false;
    }

    setItemDurability(slot: EquipSlot, slotIndex: number, value: number): number | null | undefined {
        return this.getEquipped(slot, slotIndex)?.setDurability(value);
    }

    changeItemDurability(slot: EquipSlot, slotIndex: number, delta: number): number | null | undefined {
        return this.getEquipped(slot, slotIndex)?.changeDurability(delta);
    }

    increaseItemDurability(slot: EquipSlot, slotIndex: number, amount = 1): number | null | undefined {
        return this.getEquipped(slot, slotIndex)?.increaseDurability(amount);
    }

    repairItemDurability(
        slot: EquipSlot,
        slotIndex: number,
        amount: number,
        maxDurabilityLossRate = 0,
    ): ItemDurabilityRepairResult | null | undefined {
        return this.getEquipped(slot, slotIndex)?.repairDurability(amount, maxDurabilityLossRate);
    }

    decreaseItemDurability(slot: EquipSlot, slotIndex: number, amount = 1): number | null | undefined {
        return this.getEquipped(slot, slotIndex)?.decreaseDurability(amount);
    }

    /**
     * 실제 생명력 피해가 발생한 피격의 방어구 내구도를 손상시킨다.
     * SINGLE은 피해 비율 확률과 부위 가중치를, ALL은 명시적 특수 공격의 전 부위 손상을 사용한다.
     * 공격 계산 계층은 슬롯 Map을 직접 순회하지 않고 이 API의 불변 결과만 사용한다.
     */
    damageArmorDurability(
        lifeDamage: number,
        maxLife: number,
        mode: ArmorDurabilityDamageMode = ArmorDurabilityDamageMode.SINGLE,
        random: ArmorDurabilityDamageRandom = DEFAULT_ARMOR_DURABILITY_DAMAGE_RANDOM,
    ): readonly ArmorDurabilityDamageSnapshot[] {
        if (!Number.isFinite(lifeDamage) || lifeDamage <= 0) return Object.freeze([]);

        const candidates: Array<{
            slot: EquipSlotType;
            slotIndex: number;
            item: Item;
            weight: number;
            durability: number;
        }> = [];
        for (const { slot, weight } of ARMOR_DURABILITY_SLOT_WEIGHTS) {
            const item = this.getEquipped(slot.key);
            const durability = item?.durability;
            if (!item || durability === null || durability === undefined || durability <= 0) continue;
            candidates.push({ slot, slotIndex: 0, item, weight, durability });
        }
        if (candidates.length === 0) return Object.freeze([]);

        const resolvedMode = mode === ArmorDurabilityDamageMode.ALL
            ? ArmorDurabilityDamageMode.ALL
            : ArmorDurabilityDamageMode.SINGLE;
        let damagedCandidates = candidates;
        if (resolvedMode === ArmorDurabilityDamageMode.SINGLE) {
            const chance = calculateArmorDurabilityDamageChance(lifeDamage, maxLife);
            const chanceRoll = normalizeArmorDurabilityRandom(random.chance(), 1);
            if (chanceRoll >= chance) return Object.freeze([]);

            const totalWeight = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
            const weightedRoll = normalizeArmorDurabilityRandom(random.slot(), 0) * totalWeight;
            let cumulativeWeight = 0;
            const selected = candidates.find((candidate, index) => {
                cumulativeWeight += candidate.weight;
                return weightedRoll < cumulativeWeight || index === candidates.length - 1;
            })!;
            damagedCandidates = [selected];
        }

        return Object.freeze(damagedCandidates.map(candidate => {
            const itemDataId = candidate.item.itemDataId;
            const itemName = candidate.item.name;
            const durability = candidate.item.decreaseDurability(1) ?? candidate.durability;
            return Object.freeze({
                slot: candidate.slot.key,
                slotIndex: candidate.slotIndex,
                itemDataId,
                itemName,
                previousDurability: candidate.durability,
                durability,
                broken: durability === 0,
            });
        }));
    }

    /** 장착 아이템의 정의/영속/런타임 태그를 엔티티 유효 태그로 제공 */
    hasTag(tag: TagId): boolean {
        for (const entry of this._slots.values()) {
            if (entry.state !== EquipState.Deleted && entry.item.hasTag(tag)) return true;
        }
        return false;
    }

    getTags(): TagId[] {
        const result = new Set<TagId>();
        for (const entry of this._slots.values()) {
            if (entry.state === EquipState.Deleted) continue;
            for (const tag of entry.item.tags.values()) result.add(tag);
        }
        return [...result].sort();
    }

    /** 공격 효과에는 무기 장비의 태그만 제공한다. */
    hasEffectSourceTag(tag: TagId): boolean {
        for (const entry of this._slots.values()) {
            if (entry.state === EquipState.Deleted) continue;
            if (entry.item.hasTag(GameTags.ITEM_WEAPON) && entry.item.hasTag(tag)) return true;
        }
        return false;
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
        if (!data || item.isBroken) return false;
        this.ownerAttribute = attribute;
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
        this.setEntry(key, {
            dbId: 0,
            item,
            slot,
            slotIndex,
            state: EquipState.New,
        });

        // modifier 적용
        if (item.modifiers) {
            const source = modSource(slot, slotIndex);
            attribute.addModifiers(item.modifiers.map(m => ({ ...m, source })));
        }
        this.refreshOwnerEffects();

        return true;
    }

    /** 아이템 장착 (슬롯이 가득 찰 경우 마지막 장착 아이템을 해제 후 장착). 해제된 아이템 반환 (빈 슬롯이었으면 null, 유효하지 않으면 undefined) */
    equipSwap(slot: EquipSlot, item: Item, attribute: Attribute, targetSlotIndex?: number): Item | null | undefined {
        const data = getItemData(item.itemDataId);
        if (!data || data.equipSlot !== slot || item.isBroken) return undefined;
        this.ownerAttribute = attribute;

        const target = this.resolveEquipTarget(slot, targetSlotIndex);
        if (!target) return undefined;
        const useIndex = target.slotIndex;

        const displaced = this.unequip(slot, useIndex, attribute);

        // unequip이 Clean 항목을 Deleted로 마킹하면 dbId가 남아있다 — 보존해서 save()에서 update로 처리
        const deletedEntry = this._slots.get(slotKey(slot, useIndex));
        const inheritDbId = deletedEntry?.state === EquipState.Deleted ? deletedEntry.dbId : 0;

        this.setEntry(slotKey(slot, useIndex), {
            dbId: inheritDbId,
            item,
            slot,
            slotIndex: useIndex,
            state: EquipState.New,
        });

        if (item.modifiers) {
            attribute.addModifiers(item.modifiers.map(m => ({ ...m, source: modSource(slot, useIndex) })));
        }
        this.refreshOwnerEffects();

        return displaced;
    }

    /** 아이템 해제. 해제된 Item 반환 (인벤토리 복귀용). 없으면 null */
    unequip(slot: EquipSlot, slotIndex: number, attribute: Attribute): Item | null {
        this.ownerAttribute = attribute;
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
        this.refreshOwnerEffects();

        return item;
    }

    /** 장착 스택에서 지정 수량을 소비하고 남은 수량은 같은 슬롯에 유지한다. */
    consumeEquippedItem(slot: EquipSlot, slotIndex: number, attribute: Attribute, count = 1): Item | null {
        if (!Number.isSafeInteger(count) || count <= 0) return null;
        const entry = this._slots.get(slotKey(slot, slotIndex));
        if (!entry || entry.state === EquipState.Deleted || entry.item.count < count) return null;
        if (entry.item.count === count) return this.unequip(slot, slotIndex, attribute);

        const consumed = Item.fromSnapshot(entry.item.snapshot(count));
        entry.item.count -= count;
        if (entry.state === EquipState.Clean) entry.state = EquipState.Modified;
        return consumed;
    }

    // -- Modifier 재적용 (서버 재시작 시) --

    /** 모든 장착 아이템의 modifier를 attribute에 적용 */
    applyModifiers(attribute: Attribute): void {
        this.ownerAttribute = attribute;
        for (const entry of [...this._slots.values()]) {
            if (entry.state === EquipState.Deleted) continue;
            if (entry.item.isBroken) {
                this.breakEntry(entry);
                continue;
            }

            const modifiers = entry.item.modifiers;
            if (!modifiers) continue;

            const source = modSource(entry.slot, entry.slotIndex);
            attribute.addModifiers(modifiers.map(m => ({ ...m, source })));
        }
    }

    /** Entity 생성 뒤 경험치 배율·처치 callback의 장착자를 연결한다. */
    applyOwnerEffects(owner: Entity): void {
        this.ownerEntity = owner;
        this.refreshOwnerEffects();
    }

    /** 내부 슬롯을 노출하지 않고 현재 장착 아이템의 몬스터 처치 효과를 실행한다. */
    triggerOwnerDefeatedEntity(owner: Entity, target: Entity): void {
        for (const entry of this._slots.values()) {
            if (entry.state === EquipState.Deleted || entry.item.isBroken) continue;
            entry.item.data?.onOwnerDefeatedEntity?.({ owner, target, item: entry.item });
        }
    }

    /** 피해가 확정된 뒤 현재 장착 장비 전체의 방어 후처리를 한 번씩 실행한다. */
    triggerDamageTakenEffects(attacker: Entity, target: Entity, result: DamageResult): void {
        for (const entry of this._slots.values()) {
            if (entry.state === EquipState.Deleted || entry.item.isBroken) continue;
            entry.item.data?.onDamageTaken?.({ attacker, target, item: entry.item, result });
        }
    }

    /** 내부 슬롯을 노출하지 않고 장착 아이템의 지속 효과를 갱신한다. */
    updateOwnerEffects(owner: Entity, dt: number): void {
        if (!Number.isFinite(dt) || dt <= 0) return;
        for (const entry of this._slots.values()) {
            if (entry.state === EquipState.Deleted || entry.item.isBroken) continue;
            entry.item.data?.onOwnerUpdate?.({ owner, item: entry.item, dt });
        }
    }

    /** 치명적 피해 순간 장착 효과를 순서대로 확인하고 하나가 사망을 취소하면 중단한다. */
    tryPreventFatalDamage(owner: Entity): boolean {
        for (const entry of this._slots.values()) {
            if (entry.state === EquipState.Deleted || entry.item.isBroken) continue;
            if (entry.item.data?.onOwnerFatalDamage?.({ owner, item: entry.item }) && owner.life > 0) {
                return true;
            }
        }
        return false;
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
            eq.setEntry(key, {
                dbId: row.id,
                item: Item.fromPersistence(
                    row.itemDataId,
                    row.count,
                    row.durability,
                    row.metadata,
                    0,
                    (row.tags as TagId[] | null) ?? [],
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
                                    count: entry.item.count,
                                    durability: entry.item.durability,
                                    metadata: entry.item.getPersistedMetadata(),
                                    tags: entry.item.tags.persistentValues(),
                                },
                            })
                        );
                    } else {
                        ops.push(
                            prisma.equipment.upsert({
                                where: {
                                    playerId_slot_slotIndex: {
                                        playerId: this.playerId,
                                        slot: entry.slot,
                                        slotIndex: entry.slotIndex,
                                    },
                                },
                                create: {
                                    playerId: this.playerId,
                                    itemDataId: entry.item.itemDataId,
                                    count: entry.item.count,
                                    slot: entry.slot,
                                    slotIndex: entry.slotIndex,
                                    durability: entry.item.durability,
                                    metadata: entry.item.getPersistedMetadata(),
                                    tags: entry.item.tags.persistentValues(),
                                },
                                update: {
                                    itemDataId: entry.item.itemDataId,
                                    count: entry.item.count,
                                    durability: entry.item.durability,
                                    metadata: entry.item.getPersistedMetadata(),
                                    tags: entry.item.tags.persistentValues(),
                                },
                            }).then(row => { entry.dbId = row.id; })
                        );
                    }
                    break;
                case EquipState.Modified:
                    ops.push(
                        prisma.equipment.update({
                            where: { id: entry.dbId },
                            data: {
                                count: entry.item.count,
                                durability: entry.item.durability,
                                metadata: entry.item.getPersistedMetadata(),
                                tags: entry.item.tags.persistentValues(),
                            },
                        })
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
