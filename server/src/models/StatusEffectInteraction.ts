import type Entity from './Entity.js';
import type { StatusEffectType } from './StatusEffect.js';
import { StatusEffectRemovalReason } from './StatusEffect.js';

export class StatusEffectInteractionMode {
    private static readonly all: StatusEffectInteractionMode[] = [];
    static readonly NEUTRALIZE = new StatusEffectInteractionMode('neutralize', '세기 상쇄');
    static readonly REJECT_INCOMING = new StatusEffectInteractionMode('rejectIncoming', '신규 효과 차단');
    static readonly REMOVE_EXISTING = new StatusEffectInteractionMode('removeExisting', '기존 효과 제거');
    private constructor(readonly key: string, readonly label: string) { StatusEffectInteractionMode.all.push(this); }
    static values(): readonly StatusEffectInteractionMode[] { return StatusEffectInteractionMode.all; }
    static fromKey(key: string): StatusEffectInteractionMode | undefined {
        return StatusEffectInteractionMode.all.find(value => value.key === key);
    }
}

interface StatusEffectInteractionRule {
    readonly incomingId: string;
    readonly existingId: string;
    readonly mode: StatusEffectInteractionMode;
}

export interface StatusEffectInteractionResolution {
    readonly accepted: boolean;
    readonly duration: number;
    readonly interactions: readonly string[];
}

const rules: StatusEffectInteractionRule[] = [];

export function defineStatusEffectInteraction(
    incoming: StatusEffectType,
    existing: StatusEffectType,
    mode: StatusEffectInteractionMode,
): void {
    const key = `${incoming.id}>${existing.id}`;
    if (rules.some(rule => `${rule.incomingId}>${rule.existingId}` === key)) {
        throw new Error(`Duplicate status effect interaction: ${key}`);
    }
    rules.push(Object.freeze({ incomingId: incoming.id, existingId: existing.id, mode }));
}

export function defineStatusEffectNeutralization(left: StatusEffectType, right: StatusEffectType): void {
    defineStatusEffectInteraction(left, right, StatusEffectInteractionMode.NEUTRALIZE);
    defineStatusEffectInteraction(right, left, StatusEffectInteractionMode.NEUTRALIZE);
}

export function resolveStatusEffectInteractions(
    target: Entity,
    incoming: StatusEffectType,
    duration: number,
    level: number,
): StatusEffectInteractionResolution {
    let remainingDuration = duration;
    const interactions: string[] = [];
    for (const rule of rules) {
        if (rule.incomingId !== incoming.id) continue;
        const existing = target.getStatusEffect(rule.existingId);
        if (!existing) continue;
        interactions.push(`${incoming.id}>${existing.type.id}:${rule.mode.key}`);
        if (rule.mode === StatusEffectInteractionMode.REJECT_INCOMING) {
            return { accepted: false, duration: 0, interactions: Object.freeze(interactions) };
        }
        if (rule.mode === StatusEffectInteractionMode.REMOVE_EXISTING) {
            target.removeStatusEffect(existing.type, StatusEffectRemovalReason.INTERACTION);
            continue;
        }

        const incomingPotency = level * remainingDuration;
        const existingPotency = existing.level * existing.duration;
        if (incomingPotency >= existingPotency) {
            target.removeStatusEffect(existing.type, StatusEffectRemovalReason.INTERACTION);
            remainingDuration = (incomingPotency - existingPotency) / Math.max(1, level);
            if (remainingDuration <= 0) {
                return { accepted: false, duration: 0, interactions: Object.freeze(interactions) };
            }
            continue;
        }
        existing.reduceDuration(incomingPotency / Math.max(1, existing.level));
        return { accepted: false, duration: 0, interactions: Object.freeze(interactions) };
    }
    return { accepted: true, duration: remainingDuration, interactions: Object.freeze(interactions) };
}

export function getStatusEffectInteractionSnapshots(): ReadonlyArray<Readonly<StatusEffectInteractionRule>> {
    return rules.map(rule => Object.freeze({ ...rule }));
}
