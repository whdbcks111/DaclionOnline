import { isDeepStrictEqual } from 'node:util';
import { GameTags, normalizeTag, normalizeTags } from '../../../shared/tags.js';
import type { TagId, TagReadable } from '../../../shared/tags.js';
import { sendNotificationToUser } from '../modules/message.js';
import {
    cloneMetadata,
    cloneMetadataValue,
} from './Metadata.js';
import type { MetadataRecord, MetadataValue } from './Metadata.js';
import type Entity from './Entity.js';
import { ActionType } from './Action.js';

export type StatusEffectMetadata = MetadataRecord;
export type StatusEffectCalculatedValue = string | number | boolean;
export type StatusEffectLifecycleResult = 'continue' | 'remove';

export interface StatusEffectContext {
    readonly target: Entity;
    readonly effect: StatusEffect;
}

export type StatusEffectCallback = (
    context: StatusEffectContext,
) => StatusEffectLifecycleResult | void;

export type StatusEffectUpdateCallback = (
    context: StatusEffectContext,
    dt: number,
) => StatusEffectLifecycleResult | void;

export interface StatusEffectTypeOptions {
    id: string;
    label: string;
    /** `client/public/icons` 아래 PNG 경로에서 확장자를 제외한 key. */
    icon?: string;
    maxLevel: number;
    descriptionTemplate: string;
    baseMetadata?: StatusEffectMetadata | null;
    calculatedFields?: Readonly<Record<string, (context: StatusEffectContext) => StatusEffectCalculatedValue>>;
    onStart?: StatusEffectCallback;
    onEarlyUpdate?: StatusEffectUpdateCallback;
    onUpdate?: StatusEffectUpdateCallback;
    onRemove?: (context: StatusEffectContext, reason: StatusEffectRemovalReason) => void;
    tags?: readonly TagId[];
    aliases?: readonly string[];
}

/** 상태효과 제거 사유를 나타내는 클래스형 enum. */
export class StatusEffectRemovalReason {
    private static readonly all: StatusEffectRemovalReason[] = [];

    static readonly EXPIRED = new StatusEffectRemovalReason('expired', '시간 만료');
    static readonly MANUAL = new StatusEffectRemovalReason('manual', '직접 제거');
    static readonly INVALID_TARGET = new StatusEffectRemovalReason('invalidTarget', '대상 조건 불충족');
    static readonly TARGET_DEFEATED = new StatusEffectRemovalReason('targetDefeated', '대상 제압');
    static readonly ERROR = new StatusEffectRemovalReason('error', '오류');

    private constructor(readonly key: string, readonly label: string) {
        StatusEffectRemovalReason.all.push(this);
    }

    static values(): readonly StatusEffectRemovalReason[] { return StatusEffectRemovalReason.all; }
    static fromKey(key: string): StatusEffectRemovalReason | undefined {
        return StatusEffectRemovalReason.all.find(reason => reason.key === key);
    }
}

/** 같은 타입 재적용 결과를 나타내는 클래스형 enum. */
export class StatusEffectApplyAction {
    private static readonly all: StatusEffectApplyAction[] = [];

    static readonly ADDED = new StatusEffectApplyAction('added', true);
    static readonly UPGRADED = new StatusEffectApplyAction('upgraded', true);
    static readonly REFRESHED = new StatusEffectApplyAction('refreshed', true);
    static readonly IGNORED = new StatusEffectApplyAction('ignored', false);
    static readonly REJECTED = new StatusEffectApplyAction('rejected', false);

    private constructor(readonly key: string, readonly changed: boolean) {
        StatusEffectApplyAction.all.push(this);
    }

    static values(): readonly StatusEffectApplyAction[] { return StatusEffectApplyAction.all; }
    static fromKey(key: string): StatusEffectApplyAction | undefined {
        return StatusEffectApplyAction.all.find(action => action.key === key);
    }
}

/** 데이터와 lifecycle callback을 함께 소유하는 확장 가능한 클래스형 enum. */
export class StatusEffectType implements TagReadable {
    private static readonly all: StatusEffectType[] = [];

    static readonly FIRE = StatusEffectType.define({
        id: 'fire',
        label: '화염',
        maxLevel: 10,
        descriptionTemplate: '1초마다 [color=orange]{{calc.damage}}[/color]의 불 속성 피해를 입습니다. 누적 {{calc.burnThreshold}}초 초과 시 화상을 입습니다.',
        baseMetadata: {
            tickInterval: 1,
            baseDamage: 2,
            damagePerLevel: 1.5,
            accumulatedDuration: 0,
            tickElapsed: 0,
            burnApplied: false,
        },
        calculatedFields: {
            damage: ({ effect }) => getFireDamage(effect),
            burnThreshold: ({ effect }) => getFireBurnThreshold(effect),
            burnLevel: ({ effect }) => getBurnLevelFromFire(effect.level),
            burnDuration: ({ effect }) => getBurnDurationFromFire(effect.level),
        },
        onUpdate: updateFireEffect,
        tags: [GameTags.PROPERTY_FIRE],
        aliases: ['화염', '불'],
    });

    static readonly BURN = StatusEffectType.define({
        id: 'burn',
        label: '화상',
        maxLevel: 20,
        descriptionTemplate: '받는 생명력 회복량이 [color=red]{{calc.healingReductionPercent}}%[/color] 감소합니다.',
        baseMetadata: {
            minHealingReduction: 0.05,
            maxHealingReduction: 0.5,
        },
        calculatedFields: {
            healingReduction: ({ effect }) => getBurnHealingReduction(effect),
            healingReductionPercent: ({ effect }) => Math.round(getBurnHealingReduction(effect) * 100),
        },
        onStart: updateBurnEffect,
        onUpdate: updateBurnEffect,
        onRemove: ({ target, effect }) => {
            target.removeHealingReceivedModifier(getStatusModifierSource(effect));
        },
        tags: [GameTags.PROPERTY_FIRE],
        aliases: ['화상'],
    });

    static readonly DEADLY_POISON = StatusEffectType.define({
        id: 'deadly_poison',
        label: '맹독',
        maxLevel: 20,
        descriptionTemplate: '0.5초마다 최대 생명력의 [color=purple]{{calc.damagePercent}}%[/color]만큼 맹독 피해를 입고, 받는 치유량이 50% 감소합니다.',
        baseMetadata: {
            tickInterval: 0.5,
            tickElapsed: 0,
            baseDamageRatio: 0.005,
            lostLifeScale: 0.02,
            damageRatioPerLevel: 0.001,
            healingReduction: 0.5,
        },
        calculatedFields: {
            damageRatio: ({ target, effect }) => getDeadlyPoisonDamageRatio(target, effect),
            damagePercent: ({ target, effect }) => Number((getDeadlyPoisonDamageRatio(target, effect) * 100).toFixed(2)),
            damage: ({ target, effect }) => target.maxLife * getDeadlyPoisonDamageRatio(target, effect),
        },
        onStart: updateDeadlyPoisonHealingModifier,
        onUpdate: updateDeadlyPoisonEffect,
        onRemove: ({ target, effect }) => {
            target.removeHealingReceivedModifier(getStatusModifierSource(effect));
        },
        tags: [GameTags.PROPERTY_POISON],
        aliases: ['맹독', '독'],
    });

    static readonly PARALYTIC_POISON = StatusEffectType.define({
        id: 'paralytic_poison',
        label: '마비독',
        maxLevel: 20,
        descriptionTemplate: '매 tick [color=purple]{{calc.disableChancePercent}}%[/color] 확률로 스킬·공격·이동 행동이 제한됩니다.',
        baseMetadata: {
            minDisableChance: 0.05,
            maxDisableChance: 0.5,
        },
        calculatedFields: {
            disableChance: ({ effect }) => getParalyticPoisonDisableChance(effect),
            disableChancePercent: ({ effect }) => Number((getParalyticPoisonDisableChance(effect) * 100).toFixed(1)),
        },
        onStart: ensureLivingTarget,
        onEarlyUpdate: updateParalyticPoisonEffect,
        tags: [GameTags.PROPERTY_POISON],
        aliases: ['마비독', '마비'],
    });

    static readonly HUNGER = StatusEffectType.define({
        id: 'hunger',
        label: '공복',
        icon: 'attributes/maxHungry',
        maxLevel: 10,
        descriptionTemplate: '배고픔이 고갈되었습니다. 생명력 재생이 중단되고 초당 최대 생명력의 [color=red]{{calc.damagePercent}}%[/color] 피해를 받습니다. 60초마다 효과 레벨이 상승합니다.',
        baseMetadata: { tickInterval: 1, tickElapsed: 0, levelElapsed: 0, damageScalePerLevel: 0.25 },
        calculatedFields: { damagePercent: getSurvivalDepletionDamagePercent },
        onStart: startSurvivalDepletionEffect,
        onUpdate: updateSurvivalDepletionEffect,
        onRemove: removeSurvivalDepletionEffect,
        aliases: ['공복', '배고픔'],
    });

    static readonly THIRST = StatusEffectType.define({
        id: 'thirst',
        label: '갈증',
        icon: 'attributes/maxThirsty',
        maxLevel: 10,
        descriptionTemplate: '수분이 고갈되었습니다. 생명력 재생이 중단되고 초당 최대 생명력의 [color=red]{{calc.damagePercent}}%[/color] 피해를 받습니다. 60초마다 효과 레벨이 상승합니다.',
        baseMetadata: { tickInterval: 1, tickElapsed: 0, levelElapsed: 0, damageScalePerLevel: 0.25 },
        calculatedFields: { damagePercent: getSurvivalDepletionDamagePercent },
        onStart: startSurvivalDepletionEffect,
        onUpdate: updateSurvivalDepletionEffect,
        onRemove: removeSurvivalDepletionEffect,
        aliases: ['갈증', '목마름'],
    });

    readonly id: string;
    readonly label: string;
    readonly icon: string;
    readonly maxLevel: number;
    readonly descriptionTemplate: string;
    readonly baseMetadata: Readonly<StatusEffectMetadata> | null;
    readonly calculatedFields: Readonly<Record<string, (context: StatusEffectContext) => StatusEffectCalculatedValue>>;
    readonly onStart?: StatusEffectCallback;
    readonly onEarlyUpdate?: StatusEffectUpdateCallback;
    readonly onUpdate?: StatusEffectUpdateCallback;
    readonly onRemove?: (context: StatusEffectContext, reason: StatusEffectRemovalReason) => void;
    readonly tags: readonly TagId[];
    readonly aliases: readonly string[];

    private constructor(options: StatusEffectTypeOptions) {
        this.id = normalizeStatusEffectId(options.id);
        this.label = options.label.trim();
        this.icon = normalizeStatusEffectIcon(options.icon ?? `status-effects/${this.id}`);
        this.maxLevel = options.maxLevel;
        this.descriptionTemplate = options.descriptionTemplate;
        this.baseMetadata = options.baseMetadata
            ? Object.freeze(cloneMetadata(options.baseMetadata) as StatusEffectMetadata)
            : null;
        this.calculatedFields = Object.freeze({ ...(options.calculatedFields ?? {}) });
        this.onStart = options.onStart;
        this.onEarlyUpdate = options.onEarlyUpdate;
        this.onUpdate = options.onUpdate;
        this.onRemove = options.onRemove;
        this.tags = Object.freeze(normalizeTags(options.tags ?? []));
        this.aliases = Object.freeze((options.aliases ?? []).map(alias => alias.trim()).filter(Boolean));
        if (!this.label) throw new Error(`StatusEffectType label must not be empty: ${this.id}`);
        if (!Number.isInteger(this.maxLevel) || this.maxLevel < 1) {
            throw new Error(`Invalid StatusEffectType max level: ${this.id}/${this.maxLevel}`);
        }
    }

    static define(options: StatusEffectTypeOptions): StatusEffectType {
        const id = normalizeStatusEffectId(options.id);
        if (StatusEffectType.all.some(type => type.id === id)) {
            throw new Error(`Duplicate StatusEffectType ID: ${id}`);
        }
        const type = new StatusEffectType({ ...options, id });
        StatusEffectType.all.push(type);
        return type;
    }

    static values(): readonly StatusEffectType[] { return StatusEffectType.all; }

    static fromKey(key: string): StatusEffectType | undefined {
        const normalized = key.trim().toLowerCase();
        return StatusEffectType.all.find(type => type.id === normalized);
    }

    static fromInput(input: string): StatusEffectType | undefined {
        const normalized = input.trim().toLowerCase();
        return StatusEffectType.all.find(type => type.id === normalized
            || type.label.toLowerCase() === normalized
            || type.aliases.some(alias => alias.toLowerCase() === normalized));
    }

    normalizeLevel(level: number): number {
        if (!Number.isInteger(level)) throw new Error(`StatusEffect level must be an integer: ${level}`);
        return Math.max(1, Math.min(this.maxLevel, level));
    }

    hasTag(tag: TagId): boolean {
        return this.tags.includes(normalizeTag(tag));
    }
}

function normalizeStatusEffectIcon(icon: string): string {
    const normalized = icon.trim().replace(/^\/+|\.png$/gi, '');
    if (!/^[a-z0-9][a-z0-9/_-]*$/i.test(normalized) || normalized.includes('..')) {
        throw new Error(`Invalid StatusEffectType icon: ${icon}`);
    }
    return normalized;
}

/** Entity 한 개에 붙어 갱신되는 비영속 상태효과 인스턴스. */
export default class StatusEffect implements TagReadable {
    readonly type: StatusEffectType;
    private _duration: number;
    private _maxDuration: number;
    private _level: number;
    private _metadataDelta: StatusEffectMetadata = {};

    constructor(type: StatusEffectType, duration: number, level: number) {
        this.type = type;
        this._duration = normalizeDuration(duration);
        this._maxDuration = this._duration;
        this._level = type.normalizeLevel(level);
    }

    get duration(): number { return this._duration; }
    get maxDuration(): number { return this._maxDuration; }
    get level(): number { return this._level; }
    get durationRatio(): number { return this._maxDuration > 0 ? this._duration / this._maxDuration : 0; }

    hasTag(tag: TagId): boolean { return this.type.hasTag(tag); }
    hasEffectSourceTag(tag: TagId): boolean { return this.hasTag(tag); }

    getMetadata<T extends MetadataValue = MetadataValue>(key: string): T | undefined {
        if (Object.hasOwn(this._metadataDelta, key)) {
            return cloneMetadataValue(this._metadataDelta[key]) as T;
        }
        const value = this.type.baseMetadata?.[key];
        return value === undefined ? undefined : cloneMetadataValue(value) as T;
    }

    getMetadataSnapshot(): Readonly<StatusEffectMetadata> | null {
        const merged = { ...(this.type.baseMetadata ?? {}), ...this._metadataDelta };
        return Object.keys(merged).length > 0 ? cloneMetadata(merged) as StatusEffectMetadata : null;
    }

    getMetadataDeltaSnapshot(): StatusEffectMetadata | null {
        return Object.keys(this._metadataDelta).length > 0
            ? cloneMetadata(this._metadataDelta) as StatusEffectMetadata
            : null;
    }

    setMetadata(key: string, value: unknown): void {
        if (!key.trim()) throw new Error('StatusEffect metadata key must not be empty');
        if (value === undefined) {
            this.resetMetadata(key);
            return;
        }
        const normalized = cloneMetadataValue(value);
        const baseValue = this.type.baseMetadata?.[key];
        if (isDeepStrictEqual(normalized, baseValue)) {
            this.resetMetadata(key);
            return;
        }
        this._metadataDelta[key] = normalized;
    }

    resetMetadata(key: string): boolean {
        if (!Object.hasOwn(this._metadataDelta, key)) return false;
        delete this._metadataDelta[key];
        return true;
    }

    getCalculatedField(key: string, target: Entity): StatusEffectCalculatedValue | undefined {
        return this.type.calculatedFields[key]?.({ target, effect: this });
    }

    formatDescription(target: Entity): string {
        return this.type.descriptionTemplate.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (original, rawKey: string) => {
            const value = this.resolveTemplateValue(rawKey.trim(), target);
            return value === undefined ? original : formatTemplateValue(value);
        });
    }

    /** 같은 인스턴스를 유지한 채 더 높은 레벨과 새 지속시간으로 교체한다. */
    upgrade(level: number, duration: number): void {
        const normalizedLevel = this.type.normalizeLevel(level);
        if (normalizedLevel <= this._level) throw new Error('StatusEffect upgrade level must be higher');
        this._level = normalizedLevel;
        this._duration = normalizeDuration(duration);
        this._maxDuration = this._duration;
    }

    /** 같은 레벨에서 현재 남은 시간보다 긴 지속시간만 반영한다. */
    refreshDuration(duration: number): boolean {
        const normalized = normalizeDuration(duration);
        if (normalized <= this._duration) return false;
        this._duration = normalized;
        this._maxDuration = Math.max(this._maxDuration, normalized);
        return true;
    }

    start(target: Entity): StatusEffectLifecycleResult | void {
        return this.type.onStart?.({ target, effect: this });
    }

    earlyUpdate(target: Entity, dt: number): StatusEffectLifecycleResult | void {
        return this.type.onEarlyUpdate?.({ target, effect: this }, normalizeDeltaTime(dt));
    }

    advance(target: Entity, dt: number): { result?: StatusEffectLifecycleResult; expired: boolean } {
        const activeDt = Math.min(normalizeDeltaTime(dt), this._duration);
        const callbackResult = activeDt > 0
            ? this.type.onUpdate?.({ target, effect: this }, activeDt)
            : undefined;
        const result = callbackResult === 'continue' || callbackResult === 'remove'
            ? callbackResult
            : undefined;
        this._duration = Math.max(0, this._duration - activeDt);
        return { result, expired: this._duration <= 0 };
    }

    remove(target: Entity, reason: StatusEffectRemovalReason): void {
        this.type.onRemove?.({ target, effect: this }, reason);
    }

    private resolveTemplateValue(
        key: string,
        target: Entity,
    ): StatusEffectCalculatedValue | MetadataValue | undefined {
        if (key === 'effect.id' || key === 'id') return this.type.id;
        if (key === 'effect.label' || key === 'label') return this.type.label;
        if (key === 'effect.level' || key === 'level') return this.level;
        if (key === 'effect.duration' || key === 'duration') return this.duration;
        if (key === 'effect.maxDuration' || key === 'maxDuration') return this.maxDuration;
        if (key.startsWith('calc.')) return this.getCalculatedField(key.slice(5), target);
        if (key.startsWith('meta.')) return this.getMetadata(key.slice(5));
        return this.getCalculatedField(key, target) ?? this.getMetadata(key);
    }
}

function updateFireEffect({ target, effect }: StatusEffectContext, dt: number): StatusEffectLifecycleResult | void {
    if (target.isDefeated) return 'remove';
    const interval = Math.max(0.05, effect.getMetadata<number>('tickInterval') ?? 1);
    let tickElapsed = (effect.getMetadata<number>('tickElapsed') ?? 0) + dt;
    const accumulatedDuration = (effect.getMetadata<number>('accumulatedDuration') ?? 0) + dt;

    while (tickElapsed >= interval && !target.isDefeated) {
        tickElapsed -= interval;
        const result = target.damage(getFireDamage(effect), 'absolute', {
            type: 'fire',
            causeEntity: null,
            effectSource: effect,
        });
        if (target.isPlayer && target.playerUserId !== undefined) {
            const shieldText = result.absorbedDamage > 0
                ? `, 보호막 ${result.absorbedDamage.toFixed(1)} 흡수`
                : '';
            sendNotificationToUser(target.playerUserId, {
                key: 'status-effect:fire',
                message: `당신은 불타고 있습니다. (-${result.lifeDamage.toFixed(1)}${shieldText})`,
                length: Math.round(interval * 1000),
                editExists: true,
            });
        }
    }

    effect.setMetadata('tickElapsed', tickElapsed);
    effect.setMetadata('accumulatedDuration', accumulatedDuration);

    if (!effect.getMetadata<boolean>('burnApplied')
        && accumulatedDuration > getFireBurnThreshold(effect)
        && !target.isDefeated) {
        effect.setMetadata('burnApplied', true);
        target.applyStatusEffect(
            StatusEffectType.BURN,
            getBurnDurationFromFire(effect.level),
            getBurnLevelFromFire(effect.level),
        );
    }
    return target.isDefeated ? 'remove' : undefined;
}

function updateBurnEffect({ target, effect }: StatusEffectContext): StatusEffectLifecycleResult | void {
    if (!target.hasEffectTargetTag(GameTags.TRAIT_LIVING)) return 'remove';
    target.setHealingReceivedModifier(
        getStatusModifierSource(effect),
        1 - getBurnHealingReduction(effect),
    );
}

function ensureLivingTarget({ target }: StatusEffectContext): StatusEffectLifecycleResult | void {
    return target.hasEffectTargetTag(GameTags.TRAIT_LIVING) ? undefined : 'remove';
}

function updateDeadlyPoisonHealingModifier(
    context: StatusEffectContext,
): StatusEffectLifecycleResult | void {
    if (ensureLivingTarget(context) === 'remove') return 'remove';
    const reduction = Math.max(0, Math.min(1, context.effect.getMetadata<number>('healingReduction') ?? 0.5));
    context.target.setHealingReceivedModifier(
        getStatusModifierSource(context.effect),
        1 - reduction,
    );
}

function updateDeadlyPoisonEffect(
    context: StatusEffectContext,
    dt: number,
): StatusEffectLifecycleResult | void {
    if (updateDeadlyPoisonHealingModifier(context) === 'remove') return 'remove';
    const { target, effect } = context;
    const interval = Math.max(0.05, effect.getMetadata<number>('tickInterval') ?? 0.5);
    let tickElapsed = (effect.getMetadata<number>('tickElapsed') ?? 0) + dt;
    while (tickElapsed >= interval && !target.isDefeated) {
        tickElapsed -= interval;
        const damage = target.maxLife * getDeadlyPoisonDamageRatio(target, effect);
        const result = target.damage(damage, 'absolute', {
            type: 'poison',
            causeEntity: null,
            effectSource: effect,
        });
        if (target.isPlayer && target.playerUserId !== undefined) {
            const shieldText = result.absorbedDamage > 0
                ? `, 보호막 ${result.absorbedDamage.toFixed(1)} 흡수`
                : '';
            sendNotificationToUser(target.playerUserId, {
                key: 'status-effect:deadly-poison',
                message: `당신은 맹독에 중독되어 있습니다. (-${result.lifeDamage.toFixed(1)}${shieldText})`,
                length: Math.round(interval * 1000),
                editExists: true,
            });
        }
    }
    effect.setMetadata('tickElapsed', tickElapsed);
    return target.isDefeated ? 'remove' : undefined;
}

function updateParalyticPoisonEffect(
    context: StatusEffectContext,
    _dt: number,
): StatusEffectLifecycleResult | void {
    if (ensureLivingTarget(context) === 'remove') return 'remove';
    const { target, effect } = context;
    if (Math.random() >= getParalyticPoisonDisableChance(effect)) return;
    target.disableActionsForTick([
        ActionType.SKILL,
        ActionType.ATTACK,
        ActionType.MOVEMENT,
        ActionType.LOCATION_TRAVEL,
    ], getStatusModifierSource(effect));
}

function startSurvivalDepletionEffect({ target, effect }: StatusEffectContext): StatusEffectLifecycleResult | void {
    if (!target.isPlayer) return 'remove';
    const valid = effect.type === StatusEffectType.HUNGER ? target.hungry <= 0 : target.thirsty <= 0;
    if (!valid) return 'remove';
    target.attribute.addModifiers([{
        attribute: 'lifeRegen',
        op: 'multiply',
        value: 0,
        source: getStatusModifierSource(effect),
    }]);
}

function removeSurvivalDepletionEffect({ target, effect }: StatusEffectContext): void {
    target.attribute.removeBySource(getStatusModifierSource(effect));
}

function updateSurvivalDepletionEffect(
    { target, effect }: StatusEffectContext,
    dt: number,
): StatusEffectLifecycleResult | void {
    const needEmpty = effect.type === StatusEffectType.HUNGER ? target.hungry <= 0 : target.thirsty <= 0;
    if (!target.isPlayer || !needEmpty) return 'remove';
    let levelElapsed = (effect.getMetadata<number>('levelElapsed') ?? 0) + dt;
    while (levelElapsed >= 60 && effect.level < effect.type.maxLevel) {
        levelElapsed -= 60;
        target.applyStatusEffect(effect.type, effect.duration, effect.level + 1);
    }
    effect.setMetadata('levelElapsed', levelElapsed);

    const interval = Math.max(0.05, effect.getMetadata<number>('tickInterval') ?? 1);
    let tickElapsed = (effect.getMetadata<number>('tickElapsed') ?? 0) + dt;
    while (tickElapsed >= interval && !target.isDefeated) {
        tickElapsed -= interval;
        const activeCount = Number(target.hasStatusEffect(StatusEffectType.HUNGER))
            + Number(target.hasStatusEffect(StatusEffectType.THIRST));
        const damageScale = 1 + (effect.level - 1)
            * Math.max(0, effect.getMetadata<number>('damageScalePerLevel') ?? 0.25);
        const damage = target.maxLife / 60 * damageScale / Math.max(1, activeCount);
        target.damage(damage, 'absolute', {
            type: effect.type === StatusEffectType.HUNGER ? 'starvation' : 'thirsty',
            causeEntity: null,
            effectSource: effect,
            fixedDamage: true,
        });

        const shouldNotify = effect.type === StatusEffectType.HUNGER
            || !target.hasStatusEffect(StatusEffectType.HUNGER);
        if (shouldNotify && target.playerUserId !== undefined) {
            const hungry = target.hasStatusEffect(StatusEffectType.HUNGER);
            const thirsty = target.hasStatusEffect(StatusEffectType.THIRST);
            const reason = hungry && thirsty ? '배고픔과 갈증' : hungry ? '배고픔' : '갈증';
            sendNotificationToUser(target.playerUserId, {
                key: 'status-effect:survival-depletion',
                message: `${reason}으로 인해 생명력이 고갈되고 있습니다.`,
                length: 1200,
                editExists: true,
            });
        }
    }
    effect.setMetadata('tickElapsed', tickElapsed);
    return target.isDefeated ? 'remove' : undefined;
}

function getSurvivalDepletionDamagePercent({ target, effect }: StatusEffectContext): number {
    const activeCount = Number(target.hasStatusEffect(StatusEffectType.HUNGER))
        + Number(target.hasStatusEffect(StatusEffectType.THIRST));
    const scale = 1 + (effect.level - 1)
        * Math.max(0, effect.getMetadata<number>('damageScalePerLevel') ?? 0.25);
    return Number((100 / 60 * scale / Math.max(1, activeCount)).toFixed(2));
}

function getFireDamage(effect: StatusEffect): number {
    const base = effect.getMetadata<number>('baseDamage') ?? 2;
    const perLevel = effect.getMetadata<number>('damagePerLevel') ?? 1.5;
    return Math.max(0, base + perLevel * effect.level);
}

function getFireBurnThreshold(effect: StatusEffect): number {
    return Math.max(0, 20 - effect.level);
}

function getBurnLevelFromFire(fireLevel: number): number {
    return 1 + Math.floor((Math.max(1, Math.min(10, fireLevel)) - 1) * 4 / 9);
}

function getBurnDurationFromFire(fireLevel: number): number {
    return 10 + Math.round((Math.max(1, Math.min(10, fireLevel)) - 1) * 10 / 9);
}

function getBurnHealingReduction(effect: StatusEffect): number {
    const min = effect.getMetadata<number>('minHealingReduction') ?? 0.05;
    const max = effect.getMetadata<number>('maxHealingReduction') ?? 0.5;
    const ratio = effect.type.maxLevel <= 1 ? 1 : (effect.level - 1) / (effect.type.maxLevel - 1);
    return Math.max(0, Math.min(1, min + (max - min) * ratio));
}

function getDeadlyPoisonDamageRatio(target: Entity, effect: StatusEffect): number {
    const base = effect.getMetadata<number>('baseDamageRatio') ?? 0.005;
    const lostLifeScale = effect.getMetadata<number>('lostLifeScale') ?? 0.02;
    const perLevel = effect.getMetadata<number>('damageRatioPerLevel') ?? 0.001;
    const lostLifeRatio = target.maxLife > 0
        ? Math.max(0, Math.min(1, 1 - target.life / target.maxLife))
        : 0;
    return Math.max(0.005, base + lostLifeRatio * lostLifeScale + (effect.level - 1) * perLevel);
}

function getParalyticPoisonDisableChance(effect: StatusEffect): number {
    const min = effect.getMetadata<number>('minDisableChance') ?? 0.05;
    const max = effect.getMetadata<number>('maxDisableChance') ?? 0.5;
    const ratio = effect.type.maxLevel <= 1 ? 1 : (effect.level - 1) / (effect.type.maxLevel - 1);
    return Math.max(0, Math.min(1, min + (max - min) * ratio));
}

function getStatusModifierSource(effect: StatusEffect): string {
    return `status-effect:${effect.type.id}`;
}

function normalizeStatusEffectId(id: string): string {
    const normalized = id.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(normalized)) {
        throw new Error(`Invalid StatusEffectType ID: ${id}`);
    }
    return normalized;
}

function normalizeDuration(duration: number): number {
    if (!Number.isFinite(duration) || duration <= 0) {
        throw new Error(`StatusEffect duration must be a positive finite number: ${duration}`);
    }
    return duration;
}

function normalizeDeltaTime(dt: number): number {
    if (!Number.isFinite(dt) || dt < 0) throw new Error(`StatusEffect dt must be non-negative: ${dt}`);
    return dt;
}

function formatTemplateValue(value: StatusEffectCalculatedValue | MetadataValue): string {
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new Error(`StatusEffect template value must be finite: ${value}`);
        return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
    }
    if (typeof value === 'string' || typeof value === 'boolean') return String(value);
    if (value === null) return '';
    return JSON.stringify(value);
}
