import type Entity from './Entity.js';
import type { AttackOptions, DamageResult, DamageType } from './Entity.js';
import logger from '../utils/logger.js';

export class CombatStage {
    private static readonly all: CombatStage[] = [];
    static readonly PREPARE = new CombatStage('prepare');
    static readonly EVADED = new CombatStage('evaded');
    static readonly BEFORE_DAMAGE = new CombatStage('before_damage');
    static readonly AFTER_DAMAGE = new CombatStage('after_damage');
    static readonly COMPLETE = new CombatStage('complete');

    private constructor(readonly key: string) { CombatStage.all.push(this); }
    static values(): readonly CombatStage[] { return [...CombatStage.all]; }
    static fromKey(key: string): CombatStage | undefined { return CombatStage.all.find(stage => stage.key === key); }
}

export interface CombatContext {
    readonly attacker: Entity
    readonly attackOwner: Entity
    readonly target: Entity
    damageType: DamageType
    amount: number
    readonly options: AttackOptions
    critical: boolean
    evasionChance: number
    result?: DamageResult
    cancelled: boolean
    cancelReason?: string
}

export interface CombatHook {
    key: string
    stage: CombatStage
    priority?: number
    filter?: (context: CombatContext) => boolean
    run: (context: CombatContext) => void
}

const hooks = new Map<string, CombatHook>();

export function registerCombatHook(hook: CombatHook): () => boolean {
    const key = hook.key.trim();
    if (!key) throw new Error('Combat hook key must not be empty');
    hooks.set(key, { ...hook, key });
    return () => unregisterCombatHook(key);
}

export function unregisterCombatHook(key: string): boolean {
    return hooks.delete(key.trim());
}

export function runCombatStage(stage: CombatStage, context: CombatContext): void {
    const stageHooks = [...hooks.values()]
        .filter(hook => hook.stage === stage)
        .sort((left, right) => (left.priority ?? 0) - (right.priority ?? 0) || left.key.localeCompare(right.key));
    for (const hook of stageHooks) {
        try {
            if (!hook.filter || hook.filter(context)) hook.run(context);
        } catch (error) {
            logger.error(`전투 pipeline hook 실패: ${stage.key}/${hook.key}`, error);
        }
    }
}

export function createCombatContext(
    attacker: Entity,
    target: Entity,
    damageType: DamageType,
    amount: number,
    options: AttackOptions,
): CombatContext {
    return {
        attacker,
        attackOwner: attacker.attackOwner,
        target,
        damageType,
        amount: Math.max(0, amount),
        options: { ...options },
        critical: false,
        evasionChance: 0,
        cancelled: false,
    };
}
