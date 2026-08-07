import { GameTags } from '../../../../shared/tags.js';
import type { TagId, TagReadable } from '../../../../shared/tags.js';
import type Entity from '../core/Entity.js';
import type { DamageResult } from '../core/Entity.js';
import { spawnProjectileThroughGateway } from '../combat/ProjectileGateway.js';
import { ShieldType } from '../combat/Shield.js';
import { StatusEffectType } from '../combat/StatusEffect.js';

export interface ItemAttackEffectSnapshot {
    readonly type: string;
    readonly chance: number;
    readonly duration: number;
    readonly level: number;
    /** 효과별 피해·회복·보호막 비율. 과거 상태이상 각인은 0으로 복원된다. */
    readonly power: number;
}

export interface ItemAttackEffectContext {
    readonly attacker: Entity;
    readonly target: Entity;
    readonly result: DamageResult;
}

type ItemAttackEffectBehavior =
    | 'status'
    | 'bonus_damage'
    | 'life_siphon'
    | 'mentality_flow'
    | 'ward'
    | 'damage_variance'
    | 'echo_projectile'
    | 'current_life_burst';

/** 영속 metadata의 effect ID와 코드 callback을 연결하는 클래스형 enum. */
export class ItemAttackEffectType {
    private static readonly all: ItemAttackEffectType[] = [];

    static readonly FIRE = new ItemAttackEffectType({
        id: 'fire_brand', label: '화염 각인', effectLabel: '화염', behavior: 'status',
        summary: '불길을 남겨 지속 피해를 주고 오래 타오르면 화상을 일으킵니다.',
        propertyTag: GameTags.PROPERTY_FIRE, affinityTags: [GameTags.PROPERTY_FIRE], affinityWeight: 7,
        statusEffectId: 'fire',
    });
    static readonly VENOM = new ItemAttackEffectType({
        id: 'venom_edge', label: '맹독 칼날', effectLabel: '맹독', behavior: 'status',
        summary: '최대·잃은 생명력에 비례한 지속 피해를 주고 받는 치유량을 감소시킵니다.',
        propertyTag: GameTags.PROPERTY_POISON,
        affinityTags: [GameTags.PROPERTY_POISON, GameTags.PROPERTY_NATURAL], affinityWeight: 7,
        statusEffectId: 'deadly_poison',
    });
    static readonly SHOCK = new ItemAttackEffectType({
        id: 'shock_rune', label: '충격 룬', effectLabel: '기절', behavior: 'status',
        summary: '잠시 스킬·아이템·공격·이동·회피·장소 이동을 모두 막습니다.',
        propertyTag: GameTags.PROPERTY_ELECTRIC,
        affinityTags: [GameTags.PROPERTY_ELECTRIC, GameTags.PROPERTY_METAL], affinityWeight: 5,
        statusEffectId: 'stun',
    });
    static readonly FROST = new ItemAttackEffectType({
        id: 'frost_seal', label: '빙결 인장', effectLabel: '빙결', behavior: 'status',
        summary: '얼음 지속 피해와 이동·공격속도 감소를 주며 화염과 만나면 상쇄됩니다.',
        propertyTag: GameTags.PROPERTY_ICE,
        affinityTags: [GameTags.PROPERTY_ICE, GameTags.PROPERTY_WATER], affinityWeight: 6,
        statusEffectId: 'frozen',
    });
    static readonly SHADOW = new ItemAttackEffectType({
        id: 'shadow_hex', label: '암흑 주박', effectLabel: '실명', behavior: 'status',
        summary: '대상이 공격과 회피를 할 수 없게 만듭니다.',
        propertyTag: GameTags.PROPERTY_DARK, affinityTags: [GameTags.PROPERTY_DARK], affinityWeight: 6,
        statusEffectId: 'blindness',
    });
    static readonly ARCANE_BURST = new ItemAttackEffectType({
        id: 'arcane_burst', label: '비전 폭발', effectLabel: '추가 피해', behavior: 'bonus_damage',
        summary: '적중 피해의 일부를 방어와 상관없는 추가 피해로 한 번 더 터뜨립니다.',
        propertyTag: GameTags.PROPERTY_ELECTRIC,
        affinityTags: [GameTags.PROPERTY_ELECTRIC, GameTags.PROPERTY_FIRE], affinityWeight: 5,
    });
    static readonly LIFE_SIPHON = new ItemAttackEffectType({
        id: 'life_siphon', label: '생명 흡수', effectLabel: '생명력 회복', behavior: 'life_siphon',
        summary: '대상에게 실제로 입힌 생명력 피해 일부를 자신의 생명력으로 흡수합니다.',
        propertyTag: GameTags.PROPERTY_DARK,
        affinityTags: [GameTags.PROPERTY_DARK, GameTags.PROPERTY_POISON], affinityWeight: 5,
    });
    static readonly MENTALITY_FLOW = new ItemAttackEffectType({
        id: 'mentality_flow', label: '마력 환류', effectLabel: '정신력 회복', behavior: 'mentality_flow',
        summary: '적중할 때 자신의 최대 정신력에 비례해 정신력을 즉시 회복합니다.',
        propertyTag: GameTags.PROPERTY_LIGHT,
        affinityTags: [GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_HOLY], affinityWeight: 5,
    });
    static readonly WARD = new ItemAttackEffectType({
        id: 'impact_ward', label: '충격 결계', effectLabel: '보호막', behavior: 'ward',
        summary: '적중 피해와 자신의 최대 생명력에 비례한 일반 보호막을 잠시 얻습니다.',
        propertyTag: GameTags.PROPERTY_STONE,
        affinityTags: [GameTags.PROPERTY_STONE, GameTags.PROPERTY_METAL, GameTags.PROPERTY_EARTH], affinityWeight: 5,
    });
    static readonly UNSTABLE_RESONANCE = new ItemAttackEffectType({
        id: 'unstable_resonance', label: '불안정 공명', effectLabel: '변동 피해', behavior: 'damage_variance',
        summary: '공격할 때마다 피해 배율이 무작위로 흔들려 약타와 강타가 발생합니다.',
        propertyTag: GameTags.PROPERTY_ELECTRIC,
        affinityTags: [GameTags.PROPERTY_ELECTRIC, GameTags.PROPERTY_METAL], affinityWeight: 5,
    });
    static readonly ECHO_PROJECTILE = new ItemAttackEffectType({
        id: 'echo_projectile', label: '메아리 탄환', effectLabel: '추가 투사체', behavior: 'echo_projectile',
        summary: '적중한 대상을 향해 원래 피해 일부를 담은 추가 마력 투사체 1개를 발사합니다.',
        propertyTag: GameTags.PROPERTY_LIGHT,
        affinityTags: [GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_ELECTRIC], affinityWeight: 5,
    });
    static readonly CURRENT_LIFE_BURST = new ItemAttackEffectType({
        id: 'current_life_burst', label: '생명 균열', effectLabel: '현재 생명력 피해', behavior: 'current_life_burst',
        summary: '대상의 현재 생명력에 비례한 추가 피해를 주되 원래 적중 피해의 150%를 넘지 않습니다.',
        propertyTag: GameTags.PROPERTY_POISON,
        affinityTags: [GameTags.PROPERTY_POISON, GameTags.PROPERTY_DARK], affinityWeight: 5,
    });

    readonly id: string;
    readonly label: string;
    readonly effectLabel: string;
    readonly behavior: ItemAttackEffectBehavior;
    readonly summary: string;
    readonly propertyTag: TagId;
    readonly affinityTags: readonly TagId[];
    readonly affinityWeight: number;
    readonly statusEffectId?: string;

    private constructor(definition: {
        id: string;
        label: string;
        effectLabel: string;
        behavior: ItemAttackEffectBehavior;
        summary: string;
        propertyTag: TagId;
        affinityTags: readonly TagId[];
        affinityWeight: number;
        statusEffectId?: string;
    }) {
        this.id = definition.id;
        this.label = definition.label;
        this.effectLabel = definition.effectLabel;
        this.behavior = definition.behavior;
        this.summary = definition.summary;
        this.propertyTag = definition.propertyTag;
        this.affinityTags = definition.affinityTags;
        this.affinityWeight = definition.affinityWeight;
        this.statusEffectId = definition.statusEffectId;
        ItemAttackEffectType.all.push(this);
    }

    static values(): readonly ItemAttackEffectType[] { return ItemAttackEffectType.all; }
    static fromKey(key: string): ItemAttackEffectType | undefined {
        const normalized = key.trim().toLowerCase();
        return ItemAttackEffectType.all.find(type => type.id === normalized);
    }

    static fromInput(input: string): ItemAttackEffectType | undefined {
        const normalized = input.trim().toLowerCase().replace(/\s+/g, '');
        return ItemAttackEffectType.all.find(type =>
            type.id === normalized
            || type.label.replace(/\s+/g, '') === normalized
            || type.effectLabel.replace(/\s+/g, '') === normalized);
    }

    describe(effect: ItemAttackEffectSnapshot): string {
        const chance = `${round(effect.chance * 100, 1)}% 확률`;
        if (this.behavior === 'status') {
            return `${chance}로 Lv.${effect.level} ${this.effectLabel}을 ${round(effect.duration, 1)}초 부여`;
        }
        if (this.behavior === 'bonus_damage') {
            return `${chance}로 적중 피해의 ${round(effect.power * 100, 1)}% 추가 고정 피해`;
        }
        if (this.behavior === 'life_siphon') {
            return `${chance}로 생명력 피해의 ${round(effect.power * 100, 1)}% 회복`;
        }
        if (this.behavior === 'mentality_flow') {
            return `${chance}로 최대 정신력의 ${round(effect.power * 100, 1)}% 회복`;
        }
        if (this.behavior === 'damage_variance') {
            return `공격마다 ${round((1 - effect.power) * 100, 1)}~${round((1 + effect.power) * 100, 1)}% 변동 피해`;
        }
        if (this.behavior === 'echo_projectile') {
            return `${chance}로 적중 피해의 ${round(effect.power * 100, 1)}% 추가 투사체 1개 발사`;
        }
        if (this.behavior === 'current_life_burst') {
            return `${chance}로 대상 현재 생명력의 ${round(effect.power * 100, 2)}% 추가 고정 피해`
                + ' (원래 적중 피해의 150% 상한)';
        }
        return `${chance}로 적중 피해의 ${round(effect.power * 100, 1)}% + 최대 생명력의 `
            + `${round((0.003 + effect.level * 0.001) * 100, 1)}% 보호막을 ${round(effect.duration, 1)}초 획득`;
    }

    apply(context: ItemAttackEffectContext, effect: ItemAttackEffectSnapshot): boolean {
        if (this.behavior === 'status') {
            const status = this.statusEffectId ? StatusEffectType.fromKey(this.statusEffectId) : undefined;
            if (!status) return false;
            context.target.applyStatusEffect(status, effect.duration, effect.level, context.attacker);
            return true;
        }
        if (this.behavior === 'bonus_damage') {
            context.target.damage(context.result.finalDamage * effect.power, 'absolute', {
                type: 'void',
                causeEntity: context.attacker,
                fixedDamage: true,
            });
            return true;
        }
        if (this.behavior === 'life_siphon') {
            context.attacker.heal(context.result.lifeDamage * effect.power, context.attacker);
            return true;
        }
        if (this.behavior === 'mentality_flow') {
            context.attacker.restoreMentality(context.attacker.maxMentality * effect.power);
            return true;
        }
        if (this.behavior === 'damage_variance') return false;
        if (this.behavior === 'echo_projectile') {
            return Boolean(spawnProjectileThroughGateway({
                owner: context.attacker,
                target: context.target,
                dataId: 'basic_magic_orb',
                overrides: {
                    name: '메아리 탄환',
                    damage: context.result.finalDamage * effect.power,
                    damageType: 'absolute',
                    travelTime: 0.35,
                    tags: [this.propertyTag],
                    attributeOverrides: { critRate: 0 },
                },
            }));
        }
        if (this.behavior === 'current_life_burst') {
            context.target.damage(
                Math.min(context.target.life * effect.power, context.result.finalDamage * 1.5),
                'absolute',
                { type: 'void', causeEntity: context.attacker, fixedDamage: true },
            );
            return true;
        }
        context.attacker.setShield(
            `item-enchantment:${this.id}`,
            context.result.finalDamage * effect.power
                + context.attacker.maxLife * (0.003 + effect.level * 0.001),
            ShieldType.GENERAL,
            effect.duration,
            context.attacker,
        );
        return true;
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
            power: Number.isFinite(record.power) ? clamp(Number(record.power), 0, 5) : 0,
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
    const rolledChance = clamp(0.16 + skillLevel * 0.035 + sensibility * 0.00008 + random() * 0.14, 0.18, 0.68);
    const chance = type === ItemAttackEffectType.UNSTABLE_RESONANCE ? 1 : rolledChance;
    const baseDuration = type === ItemAttackEffectType.SHOCK ? 0.8
        : type === ItemAttackEffectType.FROST ? 2.2
            : type === ItemAttackEffectType.SHADOW ? 2.5
                : type === ItemAttackEffectType.WARD ? 5 : 6;
    const duration = Math.round(baseDuration * (0.85 + random() * 0.5) * 10) / 10;
    const quality = clamp(skillLevel * 0.035 + sensibility * 0.00012 + random() * 0.25, 0, 1);
    const power = type === ItemAttackEffectType.ARCANE_BURST ? 0.18 + quality * 0.22
        : type === ItemAttackEffectType.LIFE_SIPHON ? 0.07 + quality * 0.13
            : type === ItemAttackEffectType.MENTALITY_FLOW ? 0.01 + quality * 0.035
                : type === ItemAttackEffectType.WARD ? 0.2 + quality * 0.4
                    : type === ItemAttackEffectType.UNSTABLE_RESONANCE ? 0.15 + quality * 0.35
                        : type === ItemAttackEffectType.ECHO_PROJECTILE ? 0.15 + quality * 0.25
                            : type === ItemAttackEffectType.CURRENT_LIFE_BURST ? 0.008 + quality * 0.022
                    : 0;
    return {
        type,
        effect: Object.freeze({ type: type.id, chance: round(chance, 4), duration, level, power: round(power, 4) }),
    };
}

/** Item 소유 API에서 전달한 정규화 효과만 실행한다. */
export function applyItemAttackEffects(
    effects: readonly ItemAttackEffectSnapshot[],
    context: ItemAttackEffectContext,
    random: () => number = Math.random,
): ItemAttackEffectType[] {
    const applied: ItemAttackEffectType[] = [];
    for (const effect of effects) {
        const type = ItemAttackEffectType.fromKey(effect.type);
        if (!type || random() >= effect.chance) continue;
        if (type.apply(context, effect)) applied.push(type);
    }
    return applied;
}

/** 불안정 공명 각인의 공격별 피해 배율을 뽑는다. 다른 각인은 항상 1을 반환한다. */
export function rollItemAttackDamageMultiplier(
    effects: readonly ItemAttackEffectSnapshot[],
    random: () => number = Math.random,
): number {
    const effect = effects.find(candidate =>
        ItemAttackEffectType.fromKey(candidate.type)?.behavior === 'damage_variance');
    if (!effect) return 1;
    const roll = clamp(random(), 0, 1);
    return Math.max(0.05, 1 + (roll * 2 - 1) * effect.power);
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
