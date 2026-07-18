import type Entity from './Entity.js';

export type ThreatActionKey = 'attack' | 'damage' | 'healing' | 'shielding' | 'control' | 'taunt';

export class ThreatAction {
    private static readonly all: ThreatAction[] = [];
    static readonly ATTACK = new ThreatAction('attack', '공격 시도');
    static readonly DAMAGE = new ThreatAction('damage', '피해');
    static readonly HEALING = new ThreatAction('healing', '치유');
    static readonly SHIELDING = new ThreatAction('shielding', '보호막');
    static readonly CONTROL = new ThreatAction('control', '군중 제어');
    static readonly TAUNT = new ThreatAction('taunt', '도발');

    private constructor(readonly key: ThreatActionKey, readonly label: string) { ThreatAction.all.push(this); }
    static values(): readonly ThreatAction[] { return [...ThreatAction.all]; }
    static fromKey(key: string): ThreatAction | undefined { return ThreatAction.all.find(action => action.key === key); }
}

export class MonsterAiDisposition {
    private static readonly all: MonsterAiDisposition[] = [];
    /** 마지막 공격자만 기억하는 단순 AI. */
    static readonly LAST_ATTACKER = new MonsterAiDisposition('last_attacker', '마지막 공격자 추적');
    /** 누적 위협도와 대상 전환 임계값을 계산하는 AI. */
    static readonly THREAT = new MonsterAiDisposition('threat', '위협도 판단');

    private constructor(readonly key: string, readonly label: string) { MonsterAiDisposition.all.push(this); }
    static values(): readonly MonsterAiDisposition[] { return [...MonsterAiDisposition.all]; }
    static fromKey(key: string): MonsterAiDisposition | undefined { return MonsterAiDisposition.all.find(value => value.key === key); }
}

export interface MonsterAiProfileInput {
    intelligence?: number
    disposition?: MonsterAiDisposition | string
    weights?: Partial<Record<ThreatActionKey, number>>
    tauntResistance?: number
    switchThreshold?: number
    decayPerSecond?: number
}

export interface MonsterAiProfile {
    intelligence: number
    disposition: MonsterAiDisposition
    weights: Readonly<Record<ThreatActionKey, number>>
    tauntResistance: number
    switchThreshold: number
    decayPerSecond: number
}

export interface ThreatContributionSnapshot {
    actor: Entity
    damage: number
    healing: number
    shielding: number
    control: number
    total: number
}

interface ThreatEntry {
    actor: Entity
    score: number
    sequence: number
    damage: number
    healing: number
    shielding: number
    control: number
}

const activeTables = new Set<ThreatTable>();

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

export function normalizeMonsterAiProfile(input: MonsterAiProfileInput = {}): MonsterAiProfile {
    const intelligence = clamp(Number.isFinite(input.intelligence) ? input.intelligence! : 35, 0, 100);
    const disposition = input.disposition instanceof MonsterAiDisposition
        ? input.disposition
        : MonsterAiDisposition.fromKey(input.disposition ?? '') ?? MonsterAiDisposition.THREAT;
    const defaults: Record<ThreatActionKey, number> = {
        attack: 1,
        damage: 1,
        healing: 0.15 + intelligence * 0.0085,
        shielding: 0.1 + intelligence * 0.0065,
        control: 0.25 + intelligence * 0.008,
        taunt: 4,
    };
    const weights = Object.fromEntries(ThreatAction.values().map(action => [
        action.key,
        Math.max(0, input.weights?.[action.key] ?? defaults[action.key]),
    ])) as Record<ThreatActionKey, number>;
    return Object.freeze({
        intelligence,
        disposition,
        weights: Object.freeze(weights),
        tauntResistance: clamp(input.tauntResistance ?? intelligence * 0.004, 0, 0.95),
        switchThreshold: clamp(input.switchThreshold ?? 0.08 + intelligence * 0.0018, 0, 1),
        decayPerSecond: Math.max(0, input.decayPerSecond ?? 0.015),
    });
}

export class ThreatTable {
    private readonly entries = new Map<Entity, ThreatEntry>();
    private sequence = 0;

    constructor(readonly owner: Entity, readonly profile: MonsterAiProfile) {
        activeTables.add(this);
    }

    record(actor: Entity, action: ThreatAction, amount: number): void {
        const source = actor.attackOwner;
        if (source === this.owner || source.isDefeated || !Number.isFinite(amount) || amount <= 0) return;
        const entry = this.entries.get(source) ?? {
            actor: source,
            score: 0,
            sequence: 0,
            damage: 0,
            healing: 0,
            shielding: 0,
            control: 0,
        };
        const resistance = action === ThreatAction.TAUNT ? 1 - this.profile.tauntResistance : 1;
        entry.score += amount * this.profile.weights[action.key] * resistance;
        entry.sequence = ++this.sequence;
        if (action === ThreatAction.DAMAGE) entry.damage += amount;
        else if (action === ThreatAction.HEALING) entry.healing += amount;
        else if (action === ThreatAction.SHIELDING) entry.shielding += amount;
        else if (action === ThreatAction.CONTROL) entry.control += amount;
        this.entries.set(source, entry);
    }

    hasParticipant(entity: Entity): boolean {
        return this.entries.has(entity.attackOwner);
    }

    update(dt: number): void {
        const decay = Math.max(0, 1 - this.profile.decayPerSecond * dt);
        for (const [actor, entry] of this.entries) {
            if (actor.isDefeated || actor.locationId !== this.owner.locationId) this.entries.delete(actor);
            else entry.score *= decay;
        }
    }

    selectTarget(current: Entity | null): Entity | null {
        const valid = [...this.entries.values()].filter(entry => !entry.actor.isDefeated && entry.actor.locationId === this.owner.locationId);
        if (valid.length === 0) return null;
        if (this.profile.disposition === MonsterAiDisposition.LAST_ATTACKER) {
            return valid.reduce((latest, entry) => entry.sequence > latest.sequence ? entry : latest).actor;
        }
        valid.sort((left, right) => right.score - left.score || right.sequence - left.sequence);
        const best = valid[0];
        const currentEntry = current ? this.entries.get(current.attackOwner) : undefined;
        if (currentEntry && currentEntry.score * (1 + this.profile.switchThreshold) >= best.score) return currentEntry.actor;
        return best.actor;
    }

    getContributionSnapshots(): ThreatContributionSnapshot[] {
        return [...this.entries.values()]
            .map(entry => ({
                actor: entry.actor,
                damage: entry.damage,
                healing: entry.healing,
                shielding: entry.shielding,
                control: entry.control,
                total: entry.damage + entry.healing + entry.shielding + entry.control,
            }))
            .sort((left, right) => right.total - left.total || right.damage - left.damage);
    }

    getPrimaryContributor(): Entity | undefined {
        return this.getContributionSnapshots().find(entry => entry.actor.attackOwner.isPlayer)?.actor.attackOwner;
    }

    clear(): void { this.entries.clear(); }
    dispose(): void { this.clear(); activeTables.delete(this); }
}

/** 교전 중인 아군을 치유·보호한 행동을 관련 몬스터 테이블에 전파한다. */
export function reportSupportThreat(
    actor: Entity,
    supported: Entity,
    action: typeof ThreatAction.HEALING | typeof ThreatAction.SHIELDING,
    amount: number,
): void {
    for (const table of activeTables) {
        if (table.owner.locationId === supported.locationId && table.hasParticipant(supported)) {
            table.record(actor, action, amount);
        }
    }
}
