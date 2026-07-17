import type { ShieldBarSegment, ShieldTypeKey } from '../../../shared/types.js';
import type { DamageType } from './Entity.js';

export class ShieldType {
    private static readonly all: ShieldType[] = [];

    static readonly GENERAL = new ShieldType(
        'general', '일반 보호막', '#f1f3f5', ['physical', 'magic', 'absolute'], ['일반', '공용', 'all'],
    );
    static readonly PHYSICAL = new ShieldType(
        'physical', '물리 보호막', '#e58a3a', ['physical'], ['물리', 'physical'],
    );
    static readonly MAGIC = new ShieldType(
        'magic', '마법 보호막', '#a56de2', ['magic'], ['마법', 'magic'],
    );

    private constructor(
        readonly key: ShieldTypeKey,
        readonly label: string,
        readonly color: string,
        private readonly damageTypes: readonly DamageType[],
        private readonly aliases: readonly string[],
    ) {
        ShieldType.all.push(this);
    }

    static values(): readonly ShieldType[] { return ShieldType.all; }
    static fromKey(key: string): ShieldType | undefined { return ShieldType.all.find(type => type.key === key); }
    static fromInput(input: string): ShieldType | undefined {
        const normalized = input.trim().toLowerCase();
        return ShieldType.all.find(type => type.key === normalized
            || type.label === input.trim()
            || type.aliases.some(alias => alias.toLowerCase() === normalized));
    }

    absorbs(damageType: DamageType): boolean { return this.damageTypes.includes(damageType); }
}

export interface ShieldDisplaySnapshot {
    key: string
    type: ShieldType
    amount: number
    maxAmount: number
    duration: number
    maxDuration: number
}

export default class Shield {
    amount: number;
    duration: number;

    constructor(
        readonly key: string,
        amount: number,
        readonly type: ShieldType,
        duration: number,
    ) {
        this.amount = amount;
        this.duration = duration;
        this.maxAmount = amount;
        this.maxDuration = duration;
    }

    readonly maxAmount: number;
    readonly maxDuration: number;

    advance(dt: number): boolean {
        this.duration = Math.max(0, this.duration - dt);
        return this.duration <= 0 || this.amount <= 0;
    }

    absorb(amount: number): number {
        const absorbed = Math.min(this.amount, Math.max(0, amount));
        this.amount -= absorbed;
        return absorbed;
    }

    toSnapshot(): ShieldDisplaySnapshot {
        return {
            key: this.key,
            type: this.type,
            amount: this.amount,
            maxAmount: this.maxAmount,
            duration: this.duration,
            maxDuration: this.maxDuration,
        };
    }

    toBarSegment(): ShieldBarSegment {
        return { type: this.type.key, amount: this.amount, color: this.type.color };
    }
}
