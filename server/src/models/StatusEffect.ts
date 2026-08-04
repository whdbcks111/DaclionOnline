import { isDeepStrictEqual } from 'node:util';
import { GameTags, normalizeTag, normalizeTags } from '../../../shared/tags.js';
import type { TagId, TagReadable } from '../../../shared/tags.js';
import { sendNotificationToUser } from '../modules/message.js';
import {
    cloneMetadata,
    cloneMetadataValue,
    isMetadataRecord,
} from './Metadata.js';
import type { MetadataRecord, MetadataValue } from './Metadata.js';
import type Entity from './Entity.js';
import { ActionType } from './Action.js';

export type StatusEffectMetadata = MetadataRecord;
export type StatusEffectCalculatedValue = string | number | boolean;
export type StatusEffectCalculatedFieldTooltip = string | ((context: StatusEffectContext) => string);
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
    descriptionTemplate: string;
    baseMetadata?: StatusEffectMetadata | null;
    calculatedFields?: Readonly<Record<string, (context: StatusEffectContext) => StatusEffectCalculatedValue>>;
    /** 정보창에서 계산 결과에 표시할 사용자용 계수 설명. 내부 필드명 대신 게임 용어로 작성한다. */
    calculatedFieldTooltips?: Readonly<Record<string, StatusEffectCalculatedFieldTooltip>>;
    onStart?: StatusEffectCallback;
    onEarlyUpdate?: StatusEffectUpdateCallback;
    onUpdate?: StatusEffectUpdateCallback;
    onRemove?: (context: StatusEffectContext, reason: StatusEffectRemovalReason) => void;
    /** 전투 제어 점감 분류. 피해·지속 피해·일반 버프는 기본 NONE이다. */
    controlCategory?: ControlCategory;
    /** Player 저장 경계에서 이 효과를 다루는 방식. 일반 효과는 실제 시각 기준 영속이 기본이다. */
    persistencePolicy?: StatusEffectPersistencePolicy;
    /** DB snapshot에 포함해도 안전한 runtime metadata delta key. 생략하면 metadata를 저장하지 않는다. */
    persistenceMetadataKeys?: readonly string[];
    tags?: readonly TagId[];
    aliases?: readonly string[];
}

/** Player 상태효과의 재접속·영속 수명을 나타내는 클래스형 enum. */
export class StatusEffectPersistencePolicy {
    private static readonly all: StatusEffectPersistencePolicy[] = [];

    /** 오프라인 중에도 실제 시간이 흐르며 DB snapshot에 포함되는 일반 효과. */
    static readonly WALL_CLOCK = new StatusEffectPersistencePolicy('wallClock', '실제 시간 영속');
    /** 생존 수치·현재 장소처럼 다른 권위 상태에서 다시 만드는 효과. */
    static readonly DERIVED = new StatusEffectPersistencePolicy('derived', '조건 재생성');
    /** 시전·보호막 등 현재 전투 세션과 한 덩어리라 연결 종료 때 폐기하는 효과. */
    static readonly COMBAT_TRANSIENT = new StatusEffectPersistencePolicy('combatTransient', '전투 세션 한정');

    private constructor(readonly key: string, readonly label: string) {
        StatusEffectPersistencePolicy.all.push(this);
    }

    static values(): readonly StatusEffectPersistencePolicy[] { return [...StatusEffectPersistencePolicy.all]; }
    static fromKey(key: string): StatusEffectPersistencePolicy | undefined {
        const normalized = key.trim().toLowerCase();
        return StatusEffectPersistencePolicy.all.find(policy => policy.key.toLowerCase() === normalized);
    }

    static fromInput(input: string): StatusEffectPersistencePolicy | undefined {
        const normalized = input.trim().toLocaleLowerCase('ko-KR');
        return StatusEffectPersistencePolicy.all.find(policy => policy.key.toLocaleLowerCase('ko-KR') === normalized
            || policy.label.toLocaleLowerCase('ko-KR') === normalized);
    }
}

export const STATUS_EFFECT_PERSISTENCE_VERSION = 1 as const;
export const MAX_PERSISTED_STATUS_EFFECTS = 64;
export const MAX_PERSISTED_STATUS_EFFECT_DURATION_SECONDS = 30 * 24 * 60 * 60;
export const MAX_PERSISTED_STATUS_EFFECT_LEVEL = 1_000_000;
const MAX_PERSISTED_STATUS_EFFECT_METADATA_KEYS = 16;
const MAX_PERSISTED_STATUS_EFFECT_METADATA_LENGTH = 4 * 1024;
const MAX_PERSISTED_STATUS_EFFECT_SNAPSHOT_LENGTH = 64 * 1024;

export interface PersistedStatusEffectSnapshot {
    readonly id: string;
    readonly level: number;
    /** 서버 Unix epoch millisecond 기준 만료 시각. */
    readonly expiresAtMs: number;
    /** HUD 진행률과 시간 기반 계산을 복원하기 위한 최초/최대 지속시간. */
    readonly maxDuration: number;
    readonly metadata?: Readonly<StatusEffectMetadata>;
    /** raw Entity 대신 보관하는 최종 Player 공격 소유자 ID. */
    readonly sourcePlayerId?: number;
}

export interface StatusEffectPersistenceSnapshot {
    readonly version: typeof STATUS_EFFECT_PERSISTENCE_VERSION;
    readonly effects: readonly PersistedStatusEffectSnapshot[];
}

export interface DecodedStatusEffectPersistenceSnapshot {
    readonly effects: readonly PersistedStatusEffectSnapshot[];
    readonly rejected: number;
    readonly expired: number;
}

const configuredPersistencePolicies = new Map<string, StatusEffectPersistencePolicy>();

/** 연속 적용 점감이 공유되는 전투 제어 분류. */
export class ControlCategory {
    private static readonly all: ControlCategory[] = [];

    static readonly NONE = new ControlCategory('none', '제어 아님');
    static readonly HARD = new ControlCategory('hard', '행동 불가');
    static readonly SOFT = new ControlCategory('soft', '행동 방해');

    private constructor(readonly key: string, readonly label: string) {
        ControlCategory.all.push(this);
    }

    static values(): readonly ControlCategory[] { return ControlCategory.all; }
    static fromKey(key: string): ControlCategory | undefined {
        return ControlCategory.all.find(category => category.key === key.trim().toLowerCase());
    }

    static fromInput(input: string): ControlCategory | undefined {
        const normalized = input.trim().toLocaleLowerCase('ko-KR');
        return ControlCategory.all.find(category => category.key === normalized
            || category.label.toLocaleLowerCase('ko-KR') === normalized);
    }
}

/** 상태효과 제거 사유를 나타내는 클래스형 enum. */
export class StatusEffectRemovalReason {
    private static readonly all: StatusEffectRemovalReason[] = [];

    static readonly EXPIRED = new StatusEffectRemovalReason('expired', '시간 만료');
    static readonly MANUAL = new StatusEffectRemovalReason('manual', '직접 제거');
    static readonly INVALID_TARGET = new StatusEffectRemovalReason('invalidTarget', '대상 조건 불충족');
    static readonly TARGET_DEFEATED = new StatusEffectRemovalReason('targetDefeated', '대상 제압');
    static readonly DISCONNECTED = new StatusEffectRemovalReason('disconnected', '최종 연결 종료');
    static readonly ERROR = new StatusEffectRemovalReason('error', '오류');
    static readonly INTERACTION = new StatusEffectRemovalReason('interaction', '다른 효과와 상쇄');

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
        calculatedFieldTooltips: {
            damage: '기본 피해 2 + 효과 레벨 × 1.5',
            burnThreshold: '20초 - 효과 레벨 (최소 0초)',
        },
        onUpdate: updateFireEffect,
        persistenceMetadataKeys: ['tickElapsed', 'accumulatedDuration', 'burnApplied'],
        tags: [GameTags.PROPERTY_FIRE],
        aliases: ['화염', '불'],
    });

    static readonly BURN = StatusEffectType.define({
        id: 'burn',
        label: '화상',
        descriptionTemplate: '받는 생명력 회복량이 [color=red]{{calc.healingReductionPercent}}%[/color] 감소합니다.',
        baseMetadata: {
            minHealingReduction: 0.05,
            maxHealingReduction: 0.5,
            scalingLevelCap: 20,
        },
        calculatedFields: {
            healingReduction: ({ effect }) => getBurnHealingReduction(effect),
            healingReductionPercent: ({ effect }) => Math.round(getBurnHealingReduction(effect) * 100),
        },
        calculatedFieldTooltips: {
            healingReductionPercent: '5% + (효과 레벨 - 1) × 45% ÷ 19 (20레벨에서 최대 50%)',
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
        calculatedFieldTooltips: {
            damagePercent: '0.5% + 잃은 생명력 비율 × 2% + (효과 레벨 - 1) × 0.1%p',
        },
        onStart: updateDeadlyPoisonHealingModifier,
        onUpdate: updateDeadlyPoisonEffect,
        onRemove: ({ target, effect }) => {
            target.removeHealingReceivedModifier(getStatusModifierSource(effect));
        },
        persistenceMetadataKeys: ['tickElapsed'],
        tags: [GameTags.PROPERTY_POISON],
        aliases: ['맹독', '독'],
    });

    static readonly PARALYTIC_POISON = StatusEffectType.define({
        id: 'paralytic_poison',
        label: '마비독',
        descriptionTemplate: '매 tick [color=purple]{{calc.disableChancePercent}}%[/color] 확률로 스킬·공격·이동 행동이 제한됩니다.',
        baseMetadata: {
            minDisableChance: 0.05,
            maxDisableChance: 0.5,
            scalingLevelCap: 20,
        },
        calculatedFields: {
            disableChance: ({ effect }) => getParalyticPoisonDisableChance(effect),
            disableChancePercent: ({ effect }) => Number((getParalyticPoisonDisableChance(effect) * 100).toFixed(1)),
        },
        calculatedFieldTooltips: {
            disableChancePercent: '5% + (효과 레벨 - 1) × 45% ÷ 19 (20레벨에서 최대 50%)',
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
        descriptionTemplate: '배고픔이 고갈되었습니다. 생명력 재생이 중단되고 초당 최대 생명력의 [color=red]{{calc.damagePercent}}%[/color] 피해를 받습니다. 60초마다 효과 레벨이 상승합니다.',
        baseMetadata: { tickInterval: 1, tickElapsed: 0, levelElapsed: 0, damageScalePerLevel: 0.25 },
        calculatedFields: { damagePercent: getSurvivalDepletionDamagePercent },
        calculatedFieldTooltips: {
            damagePercent: '(100% ÷ 60초) × (1 + (효과 레벨 - 1) × 0.25) ÷ 동시 고갈 효과 수',
        },
        onStart: startSurvivalDepletionEffect,
        onUpdate: updateSurvivalDepletionEffect,
        onRemove: removeSurvivalDepletionEffect,
        persistencePolicy: StatusEffectPersistencePolicy.DERIVED,
        aliases: ['공복', '배고픔'],
    });

    static readonly THIRST = StatusEffectType.define({
        id: 'thirst',
        label: '갈증',
        icon: 'attributes/maxThirsty',
        descriptionTemplate: '수분이 고갈되었습니다. 생명력 재생이 중단되고 초당 최대 생명력의 [color=red]{{calc.damagePercent}}%[/color] 피해를 받습니다. 60초마다 효과 레벨이 상승합니다.',
        baseMetadata: { tickInterval: 1, tickElapsed: 0, levelElapsed: 0, damageScalePerLevel: 0.25 },
        calculatedFields: { damagePercent: getSurvivalDepletionDamagePercent },
        calculatedFieldTooltips: {
            damagePercent: '(100% ÷ 60초) × (1 + (효과 레벨 - 1) × 0.25) ÷ 동시 고갈 효과 수',
        },
        onStart: startSurvivalDepletionEffect,
        onUpdate: updateSurvivalDepletionEffect,
        onRemove: removeSurvivalDepletionEffect,
        persistencePolicy: StatusEffectPersistencePolicy.DERIVED,
        aliases: ['갈증', '목마름'],
    });

    readonly id: string;
    readonly label: string;
    readonly icon: string;
    readonly descriptionTemplate: string;
    readonly baseMetadata: Readonly<StatusEffectMetadata> | null;
    readonly calculatedFields: Readonly<Record<string, (context: StatusEffectContext) => StatusEffectCalculatedValue>>;
    readonly calculatedFieldTooltips: Readonly<Record<string, StatusEffectCalculatedFieldTooltip>>;
    readonly onStart?: StatusEffectCallback;
    readonly onEarlyUpdate?: StatusEffectUpdateCallback;
    readonly onUpdate?: StatusEffectUpdateCallback;
    readonly onRemove?: (context: StatusEffectContext, reason: StatusEffectRemovalReason) => void;
    readonly controlCategory: ControlCategory;
    readonly persistencePolicy: StatusEffectPersistencePolicy;
    readonly persistenceMetadataKeys: readonly string[];
    readonly tags: readonly TagId[];
    readonly aliases: readonly string[];

    private constructor(options: StatusEffectTypeOptions) {
        this.id = normalizeStatusEffectId(options.id);
        this.label = options.label.trim();
        this.icon = normalizeStatusEffectIcon(options.icon ?? `status-effects/${this.id}`);
        this.descriptionTemplate = options.descriptionTemplate;
        this.baseMetadata = options.baseMetadata
            ? Object.freeze(cloneMetadata(options.baseMetadata) as StatusEffectMetadata)
            : null;
        this.calculatedFields = Object.freeze({ ...(options.calculatedFields ?? {}) });
        this.calculatedFieldTooltips = Object.freeze({ ...(options.calculatedFieldTooltips ?? {}) });
        this.onStart = options.onStart;
        this.onEarlyUpdate = options.onEarlyUpdate;
        this.onUpdate = options.onUpdate;
        this.onRemove = options.onRemove;
        this.controlCategory = options.controlCategory ?? ControlCategory.NONE;
        this.persistencePolicy = options.persistencePolicy
            ?? configuredPersistencePolicies.get(this.id)
            ?? StatusEffectPersistencePolicy.WALL_CLOCK;
        this.persistenceMetadataKeys = Object.freeze(normalizePersistenceMetadataKeys(options.persistenceMetadataKeys));
        this.tags = Object.freeze(normalizeTags(options.tags ?? []));
        this.aliases = Object.freeze((options.aliases ?? []).map(alias => alias.trim()).filter(Boolean));
        if (!this.label) throw new Error(`StatusEffectType label must not be empty: ${this.id}`);
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

    /** 다른 data bootstrap보다 먼저 로드되는 파일이 이후 정의될 효과의 수명 정책을 등록한다. */
    static configurePersistencePolicy(id: string, policy: StatusEffectPersistencePolicy): void {
        const normalized = normalizeStatusEffectId(id);
        const existing = StatusEffectType.fromKey(normalized);
        if (existing) {
            if (existing.persistencePolicy !== policy) {
                throw new Error(`StatusEffect persistence policy is already fixed: ${normalized}`);
            }
            return;
        }
        configuredPersistencePolicies.set(normalized, policy);
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
        return Math.max(1, level);
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

function normalizePersistenceMetadataKeys(keys: readonly string[] | undefined): string[] {
    if (!keys) return [];
    if (keys.length > MAX_PERSISTED_STATUS_EFFECT_METADATA_KEYS) {
        throw new Error(`Too many StatusEffect persistence metadata keys: ${keys.length}`);
    }
    const normalized = [...new Set(keys.map(key => key.trim()))];
    for (const key of normalized) {
        if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63}$/.test(key)) {
            throw new Error(`Invalid StatusEffect persistence metadata key: ${key}`);
        }
    }
    return normalized;
}

/** DB JSON을 신뢰하지 않고 현재 master data와 정책에 맞는 효과만 복원 가능한 DTO로 정규화한다. */
export function decodeStatusEffectPersistenceSnapshot(
    value: unknown,
    nowMs = Date.now(),
): DecodedStatusEffectPersistenceSnapshot {
    if (!Number.isFinite(nowMs)) throw new Error(`Invalid StatusEffect persistence time: ${nowMs}`);
    let serialized: string;
    try {
        serialized = JSON.stringify(value);
    } catch {
        return { effects: [], rejected: 1, expired: 0 };
    }
    if (!serialized || serialized.length > MAX_PERSISTED_STATUS_EFFECT_SNAPSHOT_LENGTH
        || !isMetadataRecord(value)
        || value.version !== STATUS_EFFECT_PERSISTENCE_VERSION
        || !Array.isArray(value.effects)
        || value.effects.length > MAX_PERSISTED_STATUS_EFFECTS
        || Object.keys(value).some(key => key !== 'version' && key !== 'effects')) {
        return { effects: [], rejected: 1, expired: 0 };
    }

    const effects: PersistedStatusEffectSnapshot[] = [];
    const seenIds = new Set<string>();
    let rejected = 0;
    let expired = 0;
    for (const raw of value.effects) {
        const rawLevel = isMetadataRecord(raw) ? raw.level : undefined;
        const rawExpiresAtMs = isMetadataRecord(raw) ? raw.expiresAtMs : undefined;
        const rawMaxDuration = isMetadataRecord(raw) ? raw.maxDuration : undefined;
        const rawSourcePlayerId = isMetadataRecord(raw) ? raw.sourcePlayerId : undefined;
        if (!isMetadataRecord(raw)
            || Object.keys(raw).some(key => ![
                'id', 'level', 'expiresAtMs', 'maxDuration', 'metadata', 'sourcePlayerId',
            ].includes(key))
            || typeof raw.id !== 'string'
            || typeof rawLevel !== 'number'
            || !Number.isInteger(rawLevel)
            || rawLevel < 1
            || rawLevel > MAX_PERSISTED_STATUS_EFFECT_LEVEL
            || typeof rawExpiresAtMs !== 'number'
            || !Number.isSafeInteger(rawExpiresAtMs)
            || typeof rawMaxDuration !== 'number'
            || !Number.isFinite(rawMaxDuration)
            || rawMaxDuration <= 0
            || rawMaxDuration > MAX_PERSISTED_STATUS_EFFECT_DURATION_SECONDS) {
            rejected++;
            continue;
        }
        const type = StatusEffectType.fromKey(raw.id);
        if (!type
            || type.persistencePolicy !== StatusEffectPersistencePolicy.WALL_CLOCK
            || seenIds.has(type.id)) {
            rejected++;
            continue;
        }
        const remainingMs = rawExpiresAtMs - nowMs;
        if (remainingMs <= 0) {
            expired++;
            seenIds.add(type.id);
            continue;
        }
        if (remainingMs > rawMaxDuration * 1_000 + 1) {
            rejected++;
            continue;
        }
        if (rawSourcePlayerId !== undefined
            && (typeof rawSourcePlayerId !== 'number'
                || !Number.isSafeInteger(rawSourcePlayerId)
                || rawSourcePlayerId <= 0)) {
            rejected++;
            continue;
        }
        let metadata: StatusEffectMetadata | undefined;
        if (raw.metadata !== undefined) {
            if (!isMetadataRecord(raw.metadata)
                || Object.keys(raw.metadata).some(key => !type.persistenceMetadataKeys.includes(key))
                || !isSafePersistenceMetadata(raw.metadata)) {
                rejected++;
                continue;
            }
            metadata = cloneMetadata(raw.metadata);
        }
        seenIds.add(type.id);
        effects.push({
            id: type.id,
            level: rawLevel,
            expiresAtMs: rawExpiresAtMs,
            maxDuration: rawMaxDuration,
            ...(metadata ? { metadata } : {}),
            ...(typeof rawSourcePlayerId === 'number' ? { sourcePlayerId: rawSourcePlayerId } : {}),
        });
    }
    return { effects, rejected, expired };
}

function isSafePersistenceMetadata(metadata: MetadataRecord): boolean {
    let serialized: string;
    try {
        serialized = JSON.stringify(metadata);
    } catch {
        return false;
    }
    return serialized.length <= MAX_PERSISTED_STATUS_EFFECT_METADATA_LENGTH
        && isSafePersistenceValue(metadata, 0);
}

function isSafePersistenceValue(value: unknown, depth: number): boolean {
    if (depth > 5) return false;
    if (value === null || typeof value === 'boolean') return true;
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value === 'string') return value.length <= 512;
    if (Array.isArray(value)) {
        return value.length <= 32 && value.every(entry => isSafePersistenceValue(entry, depth + 1));
    }
    if (!isMetadataRecord(value) || Object.keys(value).length > 32) return false;
    return Object.entries(value).every(([key, entry]) => /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63}$/.test(key)
        && isSafePersistenceValue(entry, depth + 1));
}

/** Entity 한 개에 붙어 갱신되며 Player 소유 시 정책에 따라 snapshot할 수 있는 상태효과 인스턴스. */
export default class StatusEffect implements TagReadable {
    readonly type: StatusEffectType;
    private _duration: number;
    private _maxDuration: number;
    private _level: number;
    private _source?: Entity;
    private _sourcePlayerId?: number;
    private _metadataDelta: StatusEffectMetadata = {};

    constructor(type: StatusEffectType, duration: number, level: number, source?: Entity) {
        this.type = type;
        this._duration = normalizeDuration(duration);
        this._maxDuration = this._duration;
        this._level = type.normalizeLevel(level);
        this._source = source?.attackOwner;
        this._sourcePlayerId = this._source?.playerUserId;
    }

    static fromPersistenceSnapshot(
        type: StatusEffectType,
        snapshot: PersistedStatusEffectSnapshot,
        remainingDuration: number,
    ): StatusEffect {
        const effect = new StatusEffect(type, remainingDuration, snapshot.level);
        effect._maxDuration = snapshot.maxDuration;
        effect._sourcePlayerId = snapshot.sourcePlayerId;
        effect.restorePersistenceMetadata(snapshot.metadata);
        return effect;
    }

    get duration(): number { return this._duration; }
    get maxDuration(): number { return this._maxDuration; }
    get level(): number { return this._level; }
    /** 지속 피해·치유·제어의 보상 귀속에만 쓰는 비영속 최종 소유자. */
    get source(): Entity | undefined { return this._source; }
    /** 영속 경계가 raw Entity 대신 보존하는 최종 Player 공격 소유자 ID. */
    get sourcePlayerId(): number | undefined { return this._sourcePlayerId; }
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

    createPersistenceSnapshot(nowMs = Date.now()): PersistedStatusEffectSnapshot | undefined {
        if (this.type.persistencePolicy !== StatusEffectPersistencePolicy.WALL_CLOCK
            || !Number.isFinite(nowMs)
            || this._duration <= 0
            || this._duration > MAX_PERSISTED_STATUS_EFFECT_DURATION_SECONDS
            || this._maxDuration < this._duration
            || this._maxDuration > MAX_PERSISTED_STATUS_EFFECT_DURATION_SECONDS
            || this._level > MAX_PERSISTED_STATUS_EFFECT_LEVEL) return undefined;
        const expiresAtMs = Math.ceil(nowMs + this._duration * 1_000);
        if (!Number.isSafeInteger(expiresAtMs)) return undefined;
        const metadata = this.getSafePersistenceMetadata();
        return {
            id: this.type.id,
            level: this._level,
            expiresAtMs,
            maxDuration: this._maxDuration,
            ...(metadata ? { metadata } : {}),
            ...(this._sourcePlayerId !== undefined ? { sourcePlayerId: this._sourcePlayerId } : {}),
        };
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

    formatDescription(target: Entity, options: { calculationTooltips?: boolean } = {}): string {
        return this.type.descriptionTemplate.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (original, rawKey: string) => {
            const key = rawKey.trim();
            const value = this.resolveTemplateValue(key, target);
            if (value === undefined) return original;
            const formatted = formatTemplateValue(value);
            if (!options.calculationTooltips) return formatted;
            const calculatedKey = key.startsWith('calc.')
                ? key.slice(5)
                : Object.hasOwn(this.type.calculatedFields, key)
                    ? key
                    : undefined;
            if (!calculatedKey) return formatted;
            const definition = this.type.calculatedFieldTooltips[calculatedKey];
            if (!definition) return formatted;
            const context = { target, effect: this };
            const tooltip = (typeof definition === 'function' ? definition(context) : definition)
                .replace(/[\[\]]/g, '')
                .trim();
            return tooltip ? `[tooltip=${tooltip}]${formatted}[/tooltip]` : formatted;
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

    /** 실제 추가·강화·갱신이 확정된 경우에만 호출한다. */
    replaceSource(source?: Entity): void {
        if (!source) return;
        this._source = source.attackOwner;
        this._sourcePlayerId = this._source.playerUserId;
    }

    /** 상쇄 규칙이 인스턴스와 metadata를 유지한 채 남은 시간만 소모한다. */
    reduceDuration(duration: number): number {
        if (!Number.isFinite(duration) || duration < 0) {
            throw new Error(`StatusEffect duration reduction must be non-negative: ${duration}`);
        }
        this._duration = Math.max(0, this._duration - duration);
        return this._duration;
    }

    /** 접속하지 않은 실제 시간은 callback 피해·치유를 재생하지 않고 남은 시간에만 반영한다. */
    elapseWithoutUpdate(duration: number): number {
        return this.reduceDuration(duration);
    }

    start(target: Entity): StatusEffectLifecycleResult | void {
        return this.type.onStart?.({ target, effect: this });
    }

    earlyUpdate(target: Entity, dt: number): StatusEffectLifecycleResult | void {
        return this.type.onEarlyUpdate?.({ target, effect: this }, normalizeDeltaTime(dt));
    }

    advance(target: Entity, dt: number): {
        result?: StatusEffectLifecycleResult;
        expired: boolean;
        activeDuration: number;
    } {
        const activeDt = Math.min(normalizeDeltaTime(dt), this._duration);
        const callbackResult = activeDt > 0
            ? this.type.onUpdate?.({ target, effect: this }, activeDt)
            : undefined;
        const result = callbackResult === 'continue' || callbackResult === 'remove'
            ? callbackResult
            : undefined;
        this._duration = Math.max(0, this._duration - activeDt);
        return { result, expired: this._duration <= 0, activeDuration: activeDt };
    }

    remove(target: Entity, reason: StatusEffectRemovalReason): void {
        this.type.onRemove?.({ target, effect: this }, reason);
    }

    /** 복원 전후 onStart가 같은 key를 초기화해도 저장된 안전 delta를 우선한다. */
    restorePersistenceMetadata(metadata: Readonly<StatusEffectMetadata> | undefined): void {
        if (!metadata) return;
        for (const key of this.type.persistenceMetadataKeys) {
            if (Object.hasOwn(metadata, key)) this.setMetadata(key, metadata[key]);
        }
    }

    private getSafePersistenceMetadata(): StatusEffectMetadata | null {
        if (this.type.persistenceMetadataKeys.length === 0) return null;
        const snapshot: StatusEffectMetadata = {};
        for (const key of this.type.persistenceMetadataKeys) {
            if (Object.hasOwn(this._metadataDelta, key)) snapshot[key] = cloneMetadataValue(this._metadataDelta[key]);
        }
        if (Object.keys(snapshot).length === 0 || !isSafePersistenceMetadata(snapshot)) return null;
        return cloneMetadata(snapshot);
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
            causeEntity: effect.source ?? null,
            actorPlayerId: effect.sourcePlayerId,
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
            effect.source,
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
            causeEntity: effect.source ?? null,
            actorPlayerId: effect.sourcePlayerId,
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
        ActionType.EVASION,
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
    while (levelElapsed >= 60) {
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
    const cap = Math.max(2, effect.getMetadata<number>('scalingLevelCap') ?? 20);
    const ratio = Math.min(1, (effect.level - 1) / (cap - 1));
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
    const cap = Math.max(2, effect.getMetadata<number>('scalingLevelCap') ?? 20);
    const ratio = Math.min(1, (effect.level - 1) / (cap - 1));
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
