import { GameTags } from '../../../shared/tags.js';
import type { TagId, TagReadable } from '../../../shared/tags.js';
import type Entity from './Entity.js';
import { StatusEffectType } from './StatusEffect.js';

export interface ItemAttackEffectSnapshot {
    readonly type: string;
    readonly chance: number;
    readonly duration: number;
    readonly level: number;
}

/** 영속 metadata의 effect ID와 코드 callback을 연결하는 클래스형 enum. */
export class ItemAttackEffectType {
    private static readonly all: ItemAttackEffectType[] = [];

    static readonly FIRE = new ItemAttackEffectType(
        'fire_brand', '화염 각인', 'fire', GameTags.PROPERTY_FIRE,
        [GameTags.PROPERTY_FIRE], 7,
    );
    static readonly VENOM = new ItemAttackEffectType(
        'venom_edge', '맹독 칼날', 'deadly_poison', GameTags.PROPERTY_POISON,
        [GameTags.PROPERTY_POISON, GameTags.PROPERTY_NATURAL], 7,
    );
    static readonly SHOCK = new ItemAttackEffectType(
        'shock_rune', '충격 룬', 'stun', GameTags.PROPERTY_ELECTRIC,
        [GameTags.PROPERTY_ELECTRIC, GameTags.PROPERTY_METAL], 5,
    );
    static readonly FROST = new ItemAttackEffectType(
        'frost_seal', '빙결 인장', 'frozen', GameTags.PROPERTY_ICE,
        [GameTags.PROPERTY_ICE, GameTags.PROPERTY_WATER], 6,
    );
    static readonly SHADOW = new ItemAttackEffectType(
        'shadow_hex', '암흑 주박', 'blindness', GameTags.PROPERTY_DARK,
        [GameTags.PROPERTY_DARK], 6,
    );

    private constructor(
        readonly id: string,
        readonly label: string,
        readonly statusEffectId: string,
        readonly propertyTag: TagId,
        readonly affinityTags: readonly TagId[],
        readonly affinityWeight: number,
    ) { ItemAttackEffectType.all.push(this); }

    static values(): readonly ItemAttackEffectType[] { return ItemAttackEffectType.all; }
    static fromKey(key: string): ItemAttackEffectType | undefined {
        const normalized = key.trim().toLowerCase();
        return ItemAttackEffectType.all.find(type => type.id === normalized);
    }
}

export function normalizeItemAttackEffects(value: unknown): ItemAttackEffectSnapshot[] {
    if (!Array.isArray(value)) return [];
    const normalized: ItemAttackEffectSnapshot[] = [];
    for (const entry of value) {
        if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue;
        const record = entry as Record<string, unknown>;
        const type = typeof record.type === 'string' ? ItemAttackEffectType.fromKey(record.type) : undefined;
        if (!type || !Number.isFinite(record.chance) || !Number.isFinite(record.duration) || !Number.isFinite(record.level)) continue;
        normalized.push(Object.freeze({
            type: type.id,
            chance: clamp(Number(record.chance), 0, 1),
            duration: clamp(Number(record.duration), 0.1, 60),
            level: Math.max(1, Math.min(100, Math.floor(Number(record.level)))),
        }));
    }
    return normalized;
}

export interface GeneratedItemEnchantment {
    readonly effect: ItemAttackEffectSnapshot;
    readonly type: ItemAttackEffectType;
}

/** 장비 태그와 안정적인 장비 signature가 후보를 편향하고, 최종 종류·강도는 서버 난수로 결정한다. */
export function generateItemEnchantment(
    item: TagReadable,
    signature: string,
    skillLevel: number,
    sensibility: number,
    random: () => number = Math.random,
): GeneratedItemEnchantment {
    const types = ItemAttackEffectType.values();
    const signatureIndex = stableHash(signature) % types.length;
    const weights = types.map((type, index) => 1
        + (type.affinityTags.some(tag => item.hasTag(tag)) ? type.affinityWeight : 0)
        + (index === signatureIndex ? 3 : 0));
    const type = weightedPick(types, weights, random());
    const level = Math.max(1, Math.min(10,
        1 + Math.floor(Math.max(1, skillLevel) / 2) + Math.floor(Math.max(0, sensibility) / 500)
        + (random() > 0.7 ? 1 : 0)));
    const chance = clamp(0.16 + skillLevel * 0.035 + sensibility * 0.00008 + random() * 0.14, 0.18, 0.68);
    const baseDuration = type === ItemAttackEffectType.SHOCK ? 0.8
        : type === ItemAttackEffectType.FROST ? 2.2
            : type === ItemAttackEffectType.SHADOW ? 2.5 : 6;
    const duration = Math.round(baseDuration * (0.85 + random() * 0.5) * 10) / 10;
    return {
        type,
        effect: Object.freeze({ type: type.id, chance: round(chance, 4), duration, level }),
    };
}

/** Item 소유 API에서 전달한 정규화 효과만 실행한다. */
export function applyItemAttackEffects(
    effects: readonly ItemAttackEffectSnapshot[],
    target: Entity,
    random: () => number = Math.random,
): ItemAttackEffectType[] {
    const applied: ItemAttackEffectType[] = [];
    for (const effect of effects) {
        const type = ItemAttackEffectType.fromKey(effect.type);
        if (!type || random() >= effect.chance) continue;
        const status = StatusEffectType.fromKey(type.statusEffectId);
        if (!status) continue;
        target.applyStatusEffect(status, effect.duration, effect.level);
        applied.push(type);
    }
    return applied;
}

function weightedPick<T>(values: readonly T[], weights: readonly number[], roll: number): T {
    const total = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
    let cursor = clamp(roll, 0, 0.999999) * total;
    for (let index = 0; index < values.length; index++) {
        cursor -= Math.max(0, weights[index]);
        if (cursor < 0) return values[index];
    }
    return values.at(-1)!;
}

function stableHash(value: string): number {
    let hash = 2166136261;
    for (const char of value) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function round(value: number, digits: number): number {
    const scale = 10 ** digits;
    return Math.round(value * scale) / scale;
}
