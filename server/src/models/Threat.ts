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
    /** 도발·위협 가중치와 도발 저항을 모두 반영한 현재 AI 위협도. */
    threat: number
    damage: number
    healing: number
    shielding: number
    control: number
    total: number
}

/** 몬스터 처치 시 보상 계산에 넘기는 Entity 참조 없는 기여도 스냅샷. */
export interface DefeatContributionSnapshot {
    readonly userId: number
    readonly damage: number
    readonly healing: number
    readonly shielding: number
    readonly control: number
    readonly total: number
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

interface DefeatContributionEntry {
    userId: number
    damage: number
    healing: number
    shielding: number
    control: number
}

type ContributionGuard = (actor: Entity) => boolean;

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
    /** 대상 전환용 어그로와 분리해 이탈·사망 뒤에도 처치 시점까지 보존한다. */
    private readonly defeatContributions = new Map<number, DefeatContributionEntry>();
    private sequence = 0;

    constructor(
        readonly owner: Entity,
        readonly profile: MonsterAiProfile,
        private readonly canRecordContribution: ContributionGuard = () => true,
    ) {
        activeTables.add(this);
    }

    record(actor: Entity, action: ThreatAction, amount: number): void {
        const source = actor.attackOwner;
        if (source === this.owner || !Number.isFinite(amount) || amount <= 0) return;
        const contributesToDefeat = action === ThreatAction.DAMAGE
            || action === ThreatAction.HEALING
            || action === ThreatAction.SHIELDING
            || action === ThreatAction.CONTROL;
        if (contributesToDefeat && !this.canRecordContribution(source)) return;

        const userId = source.playerUserId;
        if (contributesToDefeat && userId !== undefined) {
            const contribution = this.defeatContributions.get(userId) ?? {
                userId,
                damage: 0,
                healing: 0,
                shielding: 0,
                control: 0,
            };
            if (action === ThreatAction.DAMAGE) contribution.damage += amount;
            else if (action === ThreatAction.HEALING) contribution.healing += amount;
            else if (action === ThreatAction.SHIELDING) contribution.shielding += amount;
            else if (action === ThreatAction.CONTROL) contribution.control += amount;
            this.defeatContributions.set(userId, contribution);
        }

        // 사망한 source의 지속 효과 기여는 보존하되 새 AI 공격 대상으로 되살리지는 않는다.
        if (source.isDefeated) return;
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

    /** 교전 선점자가 아직 같은 장소에서 유효한 위협도 참여자인지 확인한다. */
    hasActiveParticipantUserIds(userIds: ReadonlySet<number>): boolean {
        for (const entry of this.entries.values()) {
            const actor = entry.actor.attackOwner;
            const userId = actor.playerUserId;
            if (userId !== undefined && userIds.has(userId)
                && !actor.isDefeated && actor.locationId === this.owner.locationId) return true;
        }
        return false;
    }

    /** 선점 확정 시 해당 플레이어·파티 외 플레이어 위협도만 제거한다. */
    retainPlayerUserIds(userIds: ReadonlySet<number>): void {
        for (const [actor, entry] of this.entries) {
            const userId = entry.actor.attackOwner.playerUserId;
            if (userId !== undefined && !userIds.has(userId)) this.entries.delete(actor);
        }
        for (const userId of this.defeatContributions.keys()) {
            if (!userIds.has(userId)) this.defeatContributions.delete(userId);
        }
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
                threat: entry.score,
                damage: entry.damage,
                healing: entry.healing,
                shielding: entry.shielding,
                control: entry.control,
                total: entry.damage + entry.healing + entry.shielding + entry.control,
            }))
            .sort((left, right) => right.total - left.total || right.damage - left.damage);
    }

    /** 보상·도감·전직 진행이 Entity 수명과 무관하게 사용할 수 있는 불변 원장 복사본. */
    getDefeatContributionSnapshot(): readonly DefeatContributionSnapshot[] {
        return Object.freeze([...this.defeatContributions.values()]
            .map(entry => Object.freeze({
                userId: entry.userId,
                damage: entry.damage,
                healing: entry.healing,
                shielding: entry.shielding,
                control: entry.control,
                total: entry.damage + entry.healing + entry.shielding + entry.control,
            }))
            .sort((left, right) => right.total - left.total
                || right.damage - left.damage
                || left.userId - right.userId));
    }

    getPrimaryContributor(): Entity | undefined {
        return this.getContributionSnapshots().find(entry => entry.actor.attackOwner.isPlayer)?.actor.attackOwner;
    }

    clear(): void {
        this.entries.clear();
        this.defeatContributions.clear();
    }
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
