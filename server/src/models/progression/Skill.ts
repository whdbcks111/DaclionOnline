import { isDeepStrictEqual } from 'node:util';
import type Entity from '../core/Entity.js';
import type Player from '../actors/Player.js';
import { GameTags, TagCollection, normalizeTag, normalizeTags } from '../../../../shared/tags.js';
import type { TagId, TagReadable } from '../../../../shared/tags.js';
import {
    cloneMetadata,
    cloneMetadataValue,
    createMetadataDelta,
    decodeMetadataDelta,
    encodeMetadataDelta,
} from '../core/Metadata.js';
import type { MetadataRecord, MetadataValue } from '../core/Metadata.js';
import { JobSlotType } from './Job.js';
import { AttributeType } from '../core/Attribute.js';
import { getTagEffectTagDisplay } from '../combat/TagEffect.js';

export type SkillMetadata = MetadataRecord;
export type SkillCalculatedValue = string | number | boolean;

export class SkillBalanceRole {
    private static readonly all: SkillBalanceRole[] = [];
    static readonly DAMAGE = new SkillBalanceRole('damage', '피해');
    static readonly DEFENSE = new SkillBalanceRole('defense', '방어');
    static readonly SUPPORT = new SkillBalanceRole('support', '보조');
    static readonly CONTROL = new SkillBalanceRole('control', '제어');
    private constructor(readonly key: string, readonly label: string) { SkillBalanceRole.all.push(this); }
    static values(): readonly SkillBalanceRole[] { return SkillBalanceRole.all; }
    static fromKey(key: string): SkillBalanceRole | undefined {
        return SkillBalanceRole.all.find(value => value.key === key);
    }
}

/** 고레벨 전투 기술의 고정 정신력 하한에 최대 정신력 비례 비용을 더하는 단계. */
export class SkillMentalityCostTier {
    private static readonly all: SkillMentalityCostTier[] = [];

    static readonly ADVANCED = new SkillMentalityCostTier('advanced', '상급', 0.01);
    static readonly EXPERT = new SkillMentalityCostTier('expert', '숙련', 0.015);
    static readonly MASTER = new SkillMentalityCostTier('master', '달인', 0.025);
    static readonly ULTIMATE = new SkillMentalityCostTier('ultimate', '극의', 0.04);

    private constructor(
        readonly key: string,
        readonly label: string,
        readonly maxMentalityRatio: number,
    ) {
        SkillMentalityCostTier.all.push(this);
    }

    static values(): readonly SkillMentalityCostTier[] { return SkillMentalityCostTier.all; }
    static fromKey(key: string): SkillMentalityCostTier | undefined {
        return SkillMentalityCostTier.all.find(value => value.key === key.trim().toLowerCase());
    }

    calculate(flatCost: number, maxMentality: number): number {
        if (!Number.isFinite(flatCost) || flatCost < 0) throw new Error('Skill mentality flat cost must be non-negative');
        if (!Number.isFinite(maxMentality) || maxMentality < 0) throw new Error('Skill max mentality must be non-negative');
        return Math.ceil(Math.max(flatCost, maxMentality * this.maxMentalityRatio));
    }
}

export class SkillCriticalMode {
    private static readonly all: SkillCriticalMode[] = [];
    static readonly NORMAL = new SkillCriticalMode('normal', '일반 치명타');
    static readonly GUARANTEED = new SkillCriticalMode('guaranteed', '확정 치명타');
    static readonly DISABLED = new SkillCriticalMode('disabled', '치명타 불가');
    private constructor(readonly key: string, readonly label: string) { SkillCriticalMode.all.push(this); }
    static values(): readonly SkillCriticalMode[] { return SkillCriticalMode.all; }
    static fromKey(key: string): SkillCriticalMode | undefined {
        return SkillCriticalMode.all.find(value => value.key === key);
    }
}

export interface SkillContext {
    /** 스킬을 실제로 발동하는 Entity. 플레이어와 몬스터가 같은 SkillData를 공유한다. */
    owner: Entity;
    /** 플레이어 소유자일 때만 존재하는 플레이어 전용 API 경계. */
    player: Player | null;
    skill: Skill;
}

export interface SkillMessageContext extends SkillContext {
    message: string;
}

export interface SkillUpdateContext extends SkillContext {
    state: Readonly<SkillMetadata>;
    elapsed: number;
    duration: number | null;
}

export type SkillCheckResult =
    | { accepted: true }
    | { accepted: false; reason: string };

export interface SkillStartResult {
    /** 0 또는 생략하면 즉시 종료, null이면 onUpdate가 종료할 때까지 유지 */
    duration?: number | null;
    state?: SkillMetadata;
}

export type SkillUpdateResult = 'continue' | 'finish';

export class SkillFinishReason {
    private static readonly all: SkillFinishReason[] = [];

    static readonly COMPLETED = new SkillFinishReason('completed', '완료');
    static readonly CANCELLED = new SkillFinishReason('cancelled', '취소');
    static readonly OWNER_DEFEATED = new SkillFinishReason('ownerDefeated', '사용자 제압');
    static readonly UNLOADED = new SkillFinishReason('unloaded', '로그아웃');
    static readonly ERROR = new SkillFinishReason('error', '오류');

    private constructor(readonly key: string, readonly label: string) {
        SkillFinishReason.all.push(this);
    }

    static values(): readonly SkillFinishReason[] { return SkillFinishReason.all; }
    static fromKey(key: string): SkillFinishReason | undefined {
        return SkillFinishReason.all.find(reason => reason.key === key);
    }
}

export interface SkillFinishContext extends SkillUpdateContext {
    reason: SkillFinishReason;
}

export interface SkillAutoAcquire {
    watchedProgress: readonly string[];
    /** Progress key가 아닌 현재 상태(스탯 등)를 주기적으로 검사해야 할 때만 사용한다. */
    alwaysEvaluate?: boolean;
    check: (context: SkillContext) => boolean;
}

export interface SkillJobRequirement {
    anyOf: readonly string[];
    slot?: JobSlotType;
}

export interface SkillWeaponRequirement {
    mainHandAnyTags: readonly TagId[];
    description: string;
}

/** 발동한 스킬이 특정 표시 계열의 보유 스킬에 보장할 최소 재사용 대기시간. */
export interface SkillSharedCooldownRule {
    targetTag: TagId;
    seconds: number;
}

export interface SkillDisplayTagSnapshot {
    label: string;
    icon: string;
}

export interface SkillSharedCooldownDisplaySnapshot extends SkillDisplayTagSnapshot {
    seconds: number;
}

export interface SkillInformationTagsSnapshot {
    groups: SkillDisplayTagSnapshot[];
    affinities: SkillDisplayTagSnapshot[];
    sharedCooldowns: SkillSharedCooldownDisplaySnapshot[];
}

const skillTagDisplays = new Map<TagId, SkillDisplayTagSnapshot>();

/** 구현용 태그는 숨기고 스킬 정보에 공개할 기술 계열만 명시적으로 등록한다. */
export function defineSkillTagDisplay(tag: TagId, label: string, icon: string): void {
    const normalized = normalizeTag(tag);
    if (!label.trim()) throw new Error(`스킬 태그 표시 라벨은 비어 있을 수 없습니다: ${normalized}`);
    if (!icon.trim()) throw new Error(`스킬 태그 표시 아이콘은 비어 있을 수 없습니다: ${normalized}`);
    skillTagDisplays.set(normalized, { label: label.trim(), icon: icon.trim() });
}

export interface SkillData {
    id: string;
    name: string;
    icon: string;
    aliases?: readonly string[];
    maxLevel: number;
    /** 자동 획득·밸런스 프로파일에서 사용하는 권장 해금 레벨. 직접 지급 스킬은 생략할 수 있다. */
    unlockLevel?: number;
    descriptionTemplate: string;
    costTemplate: string;
    activationConditionTemplate: string;
    activationMessage?: string;
    /** 시전 메시지 상단에 표시할 4:1 배너. 생략 시 시전 메시지에는 이미지를 붙이지 않는다. */
    activationHeader?: string;
    /** 생략 시 activationMessage와 정확히 같은 `이름!` 메시지로 발동한다. */
    activationPhrase?: string;
    /** 발동 성공 뒤 플레이어 본인에게 채팅 상세 메시지와 알림으로 함께 보낼 내용. */
    activationFeedback?: (context: SkillContext) => string;
    baseMetadata: SkillMetadata | null;
    calculatedFields?: Readonly<Record<string, (context: SkillContext) => SkillCalculatedValue>>;
    /** 실제 전투식과 같은 callback을 사용하는 밸런스 진단 전용 수치. 임의 효용 점수는 만들지 않는다. */
    balance?: {
        role: SkillBalanceRole;
        damageType?: 'physical' | 'magic' | 'absolute';
        /** 직접 피해 자체에 적용할 속성 태그. 무기 태그나 후속 상태효과 태그는 넣지 않는다. */
        effectTags?: readonly TagId[];
        calculateDamage?: (context: SkillContext) => number;
        /** 스킬 공격 순간 실제로 적용되는 총 관통력. 생략하면 시전자 능력치를 사용한다. */
        calculatePenetration?: (context: SkillContext) => number;
        /**
         * 피격자의 이동속도 회피 판정에 사용할 실제 공격 측 속도.
         * 투사체 스킬은 발사체 가속·반영 계수·스킬 배율을 모두 적용한 값을 반환한다.
         */
        calculateEvasionAttackSpeed?: (context: SkillContext) => number;
        /** 실제 공격 옵션이 회피 불가일 때 밸런스 계산에서도 명중률을 100%로 고정한다. */
        unavoidable?: boolean;
        /** 지속시간 동안 받는 회피 가능한 공격을 모두 피하는 실제 방어 효과. */
        guaranteedEvasion?: boolean;
        criticalMode?: SkillCriticalMode;
        hitCount?: number;
        targetCount?: number;
        calculateManaCost?: (context: SkillContext) => number;
        calculateHealing?: (context: SkillContext) => number;
        calculateShield?: (context: SkillContext) => number;
        /** 로테이션 진단에서 실제 지속 버프의 능력치 변화를 재현한다. */
        calculateEffectDuration?: (context: SkillContext) => number;
        calculateRotationModifiers?: (context: SkillContext) => readonly Omit<import('../core/Attribute.js').AttributeModifier, 'source'>[];
        /** 로테이션에서 후속기 선행 조건으로 쓰는 상태 ID. */
        grantsRotationStatusEffectId?: string;
        /** 이 상태가 있어야 로테이션 시뮬레이터가 발동을 허용한다. */
        requiresRotationStatusEffectId?: string;
        /** 실제 후속기처럼 피해 snapshot 후 선행 상태를 소모한다. */
        consumesRequiredRotationStatusEffect?: boolean;
        notes?: readonly string[];
    };
    calculateMaxCooldown?: (context: SkillContext) => number;
    /** 발동 성공 시 targetTag를 가진 보유 스킬의 남은 쿨다운을 최소 seconds로 맞춘다. */
    sharedCooldowns?: readonly SkillSharedCooldownRule[];
    /** 생략 시 성공적인 플레이어 발동 1회마다 10 경험치를 획득한다. 0이면 자동 획득하지 않는다. */
    calculateExperienceGain?: (context: SkillContext) => number;
    /** 생략 시 다음 레벨 요구 경험치는 100 + (현재 레벨 - 1) * 50이다. */
    calculateRequiredExperience?: (context: SkillContext) => number;
    autoAcquire?: SkillAutoAcquire;
    autoActivate?: (context: SkillContext) => boolean;
    activateOnMessage?: (context: SkillMessageContext) => boolean;
    isVisible?: (context: SkillContext) => boolean;
    canUse?: (context: SkillContext) => SkillCheckResult;
    canActivate?: (context: SkillContext) => SkillCheckResult;
    jobRequirement?: SkillJobRequirement;
    weaponRequirement?: SkillWeaponRequirement;
    onAcquire?: (context: SkillContext) => void;
    onStart?: (context: SkillContext) => SkillStartResult | void;
    onUpdate?: (context: SkillUpdateContext, dt: number) => SkillUpdateResult | void;
    onFinish?: (context: SkillFinishContext) => void;
    onPassiveUpdate?: (context: SkillContext, dt: number) => void;
    /** 직업·무기 조건을 잃은 패시브가 자신의 runtime modifier를 정리한다. */
    onPassiveInactive?: (context: SkillContext) => void;
    tags: readonly TagId[];
}

const METADATA_STORAGE_KEY = '__daclionSkillMetadata';
const METADATA_STORAGE_VERSION = 1;
const MAX_LEVEL_BONUS_METADATA_KEY = 'progression.maxLevelBonus';
const ACTIVE_MAX_LEVEL_BONUS_CAP = 5;
const PASSIVE_MAX_LEVEL_BONUS_CAP = 2;
const DEFAULT_EXPERIENCE_GAIN = 10;
/** 액티브 돌파 레벨 하나가 기존 일반 레벨 계수 증가량 몇 단계로 계산되는지 나타낸다. */
export const ACTIVE_BREAKTHROUGH_COEFFICIENT_MULTIPLIER = 2;
/** 플레이어 전투 기술 사이에 보장하는 최소 발동 간격. 평타·아이템·생활 기술에는 적용하지 않는다. */
export const PLAYER_COMBAT_SKILL_CADENCE_SECONDS = 0.5;
const skillDataRegistry = new Map<string, Readonly<SkillData>>();

export interface SkillExperienceResult {
    gained: number;
    previousLevel: number;
    level: number;
    levelsGained: number;
    experience: number;
    requiredExperience: number;
}

export interface SkillMaxLevelBreakthroughSnapshot {
    id: string;
    name: string;
    icon: string;
    level: number;
    baseMaxLevel: number;
    maxLevel: number;
    maxLevelBonus: number;
    maxLevelBonusCap: number;
    remainingMaxLevelBonus: number;
    isPassive: boolean;
}

export default class Skill implements TagReadable {
    readonly playerId: number | null;
    readonly skillDataId: string;
    readonly tags: TagCollection;
    readonly acquiredAt: Date;
    readonly acquisitionSource?: string;

    private _level: number;
    private _experience: number;
    private _cooldownEndsAt: number;
    private _metadataDelta: SkillMetadata;
    private persistentChangeHandler?: () => void;

    private _active = false;
    private _activeElapsed = 0;
    private _activeDuration: number | null = 0;
    private _activeState: SkillMetadata = {};

    constructor(options: {
        playerId: number | null;
        skillDataId: string;
        level?: number;
        experience?: number;
        cooldownEndsAt?: Date | number | null;
        metadataDelta?: SkillMetadata | null;
        persistentTags?: readonly TagId[];
        acquiredAt?: Date;
        acquisitionSource?: string;
    }) {
        const data = getSkillData(options.skillDataId);
        if (!data) throw new Error(`SkillData not found: ${options.skillDataId}`);
        this.playerId = options.playerId;
        this.skillDataId = data.id;
        this._metadataDelta = normalizeSkillMetadataDelta(options.metadataDelta, data);
        const maxLevel = data.maxLevel + getSkillMaxLevelBonus(this._metadataDelta, data);
        this._level = normalizeSkillLevel(options.level ?? 1, maxLevel);
        this._experience = this._level >= maxLevel
            ? 0
            : normalizeSkillExperience(options.experience ?? 0);
        this._cooldownEndsAt = normalizeCooldownEnd(options.cooldownEndsAt);
        this.tags = new TagCollection({
            definition: data.tags,
            persistent: options.persistentTags,
            onPersistentChange: () => this.persistentChangeHandler?.(),
        });
        this.acquiredAt = options.acquiredAt ?? new Date();
        this.acquisitionSource = options.acquisitionSource;
    }

    get data(): Readonly<SkillData> {
        const data = getSkillData(this.skillDataId);
        if (!data) throw new Error(`SkillData not found: ${this.skillDataId}`);
        return data;
    }

    get name(): string { return this.data.name; }
    get level(): number { return this._level; }
    get baseMaxLevel(): number { return this.data.maxLevel; }
    get maxLevelBonus(): number { return getSkillMaxLevelBonus(this._metadataDelta, this.data); }
    get maxLevelBonusCap(): number { return getSkillMaxLevelBonusCap(this.data); }
    get remainingMaxLevelBonus(): number { return this.maxLevelBonusCap - this.maxLevelBonus; }
    get maxLevel(): number { return this.baseMaxLevel + this.maxLevelBonus; }
    get experience(): number { return this._experience; }
    get isActive(): boolean { return this._active; }
    get activeElapsed(): number { return this._activeElapsed; }
    get activeDuration(): number | null { return this._activeDuration; }
    get isPassive(): boolean { return this.hasTag(GameTags.SKILL_PASSIVE); }
    /**
     * 실제 레벨·경험치와 분리된 효과 계산용 레벨이다.
     * 패시브와 원래 상한 구간은 그대로이며, 액티브의 돌파 후 레벨만 단계당 두 배로 계산한다.
     */
    get coefficientLevel(): number {
        if (this.isPassive || this.level <= this.baseMaxLevel) return this.level;
        return this.baseMaxLevel
            + (this.level - this.baseMaxLevel) * ACTIVE_BREAKTHROUGH_COEFFICIENT_MULTIPLIER;
    }

    hasTag(tag: TagId): boolean { return this.tags.hasTag(tag); }

    getMaxLevelBreakthroughSnapshot(): SkillMaxLevelBreakthroughSnapshot {
        return {
            id: this.skillDataId,
            name: this.name,
            icon: this.data.icon,
            level: this.level,
            baseMaxLevel: this.baseMaxLevel,
            maxLevel: this.maxLevel,
            maxLevelBonus: this.maxLevelBonus,
            maxLevelBonusCap: this.maxLevelBonusCap,
            remainingMaxLevelBonus: this.remainingMaxLevelBonus,
            isPassive: this.isPassive,
        };
    }

    /** 돌파 보상처럼 검증이 끝난 기능만 최대 레벨 상한을 늘리는 목적형 API. */
    increaseMaxLevelBonus(amount = 1): number {
        if (!Number.isSafeInteger(amount) || amount <= 0) {
            throw new Error('Skill max level bonus amount must be a positive safe integer');
        }
        const increased = Math.min(amount, this.remainingMaxLevelBonus);
        if (increased <= 0) return 0;
        this._metadataDelta[MAX_LEVEL_BONUS_METADATA_KEY] = this.maxLevelBonus + increased;
        this.persistentChangeHandler?.();
        return increased;
    }

    setLevel(level: number): number {
        const normalized = normalizeSkillLevel(level, this.maxLevel);
        if (normalized === this._level) return normalized;
        this._level = normalized;
        if (normalized >= this.maxLevel) this._experience = 0;
        this.persistentChangeHandler?.();
        return normalized;
    }

    increaseLevel(amount = 1): number {
        if (!Number.isInteger(amount) || amount < 0) throw new Error('Skill level amount must be a non-negative integer');
        return this.setLevel(this._level + amount);
    }

    getExperienceGain(owner: Entity): number {
        if (this.level >= this.maxLevel) return 0;
        return normalizeExperienceAmount(
            this.data.calculateExperienceGain?.(createSkillContext(owner, this)) ?? DEFAULT_EXPERIENCE_GAIN,
            'gain',
        );
    }

    /** 자동 경험치가 꺼진 정적 패시브도 돌파 뒤 생활 수련으로 성장할 수 있다. */
    getPassiveTrainingExperienceGain(owner: Entity): number {
        if (!this.isPassive || this.level >= this.maxLevel) return 0;
        return Math.max(DEFAULT_EXPERIENCE_GAIN, this.getExperienceGain(owner));
    }

    getRequiredExperience(owner: Entity): number {
        if (this.level >= this.maxLevel) return 0;
        return normalizeRequiredExperience(
            this.data.calculateRequiredExperience?.(createSkillContext(owner, this))
                ?? 100 + (this.level - 1) * 50,
        );
    }

    /** 성공 발동 등 소유 기능이 확정한 경험치를 누적하고 여러 레벨 상승과 잔여 경험치를 처리한다. */
    addExperience(owner: Entity, amount: number): SkillExperienceResult {
        const gained = normalizeExperienceAmount(amount, 'gain');
        const previousLevel = this.level;
        if (gained === 0 || this.level >= this.maxLevel) {
            return this.createExperienceResult(0, previousLevel, owner);
        }

        this._experience += gained;
        while (this._level < this.maxLevel) {
            const required = this.getRequiredExperience(owner);
            if (this._experience < required) break;
            this._experience -= required;
            this._level += 1;
        }
        if (this._level >= this.maxLevel) this._experience = 0;
        this.persistentChangeHandler?.();
        return this.createExperienceResult(gained, previousLevel, owner);
    }

    getMetadata<T extends MetadataValue = MetadataValue>(key: string): T | undefined {
        if (key === MAX_LEVEL_BONUS_METADATA_KEY) return undefined;
        if (Object.hasOwn(this._metadataDelta, key)) {
            return cloneMetadataValue(this._metadataDelta[key]) as T;
        }
        const value = this.data.baseMetadata?.[key];
        return value === undefined ? undefined : cloneMetadataValue(value) as T;
    }

    getMetadataSnapshot(): Readonly<SkillMetadata> | null {
        const merged = { ...(this.data.baseMetadata ?? {}), ...this._metadataDelta };
        delete merged[MAX_LEVEL_BONUS_METADATA_KEY];
        return Object.keys(merged).length > 0 ? cloneMetadata(merged) : null;
    }

    getMetadataDeltaSnapshot(): SkillMetadata | null {
        const delta = { ...this._metadataDelta };
        delete delta[MAX_LEVEL_BONUS_METADATA_KEY];
        return Object.keys(delta).length > 0
            ? cloneMetadata(delta) as SkillMetadata
            : null;
    }

    setMetadata(key: string, value: unknown): void {
        if (!key.trim()) throw new Error('Skill metadata key must not be empty');
        if (key === MAX_LEVEL_BONUS_METADATA_KEY) {
            throw new Error('Skill max level bonus must be changed through its progression API');
        }
        if (value === undefined) {
            this.resetMetadata(key);
            return;
        }
        const normalized = cloneMetadataValue(value);
        const baseValue = this.data.baseMetadata?.[key];
        if (isDeepStrictEqual(normalized, baseValue)) {
            this.resetMetadata(key);
            return;
        }
        if (isDeepStrictEqual(this._metadataDelta[key], normalized)) return;
        this._metadataDelta[key] = normalized;
        this.persistentChangeHandler?.();
    }

    resetMetadata(key: string): boolean {
        if (key === MAX_LEVEL_BONUS_METADATA_KEY) {
            throw new Error('Skill max level bonus must be changed through its progression API');
        }
        if (!Object.hasOwn(this._metadataDelta, key)) return false;
        delete this._metadataDelta[key];
        this.persistentChangeHandler?.();
        return true;
    }

    getCalculatedField(key: string, owner: Entity): SkillCalculatedValue | undefined {
        if (key === 'maxCooldown') return this.getMaxCooldown(owner);
        return this.data.calculatedFields?.[key]?.(createSkillContext(owner, this));
    }

    getMaxCooldown(owner: Entity): number {
        const value = this.data.calculateMaxCooldown?.(createSkillContext(owner, this)) ?? 0;
        if (!Number.isFinite(value) || value < 0) {
            throw new Error(`Invalid skill cooldown: ${this.skillDataId}/${value}`);
        }
        return value;
    }

    getRemainingCooldown(now = Date.now()): number {
        return Math.max(0, (this._cooldownEndsAt - now) / 1000);
    }

    startCooldown(seconds: number, now = Date.now()): void {
        if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Skill cooldown must be non-negative');
        const next = seconds > 0 ? now + seconds * 1000 : 0;
        if (next === this._cooldownEndsAt) return;
        this._cooldownEndsAt = next;
        this.persistentChangeHandler?.();
    }

    /** 개인 쿨다운을 줄이지 않으면서 공유 쿨다운의 최소 남은 시간을 보장한다. */
    ensureCooldown(seconds: number, now = Date.now()): void {
        if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Skill cooldown must be non-negative');
        if (this.getRemainingCooldown(now) >= seconds) return;
        this.startCooldown(seconds, now);
    }

    /** 정보창이 raw tags를 참조하지 않고 표시 등록된 분류·속성·공유 쿨다운만 받는다. */
    getInformationTagsSnapshot(): SkillInformationTagsSnapshot {
        const tagValues = this.tags.values();
        const tagSet = new Set(tagValues);
        const groups = [...skillTagDisplays.entries()].flatMap(([tag, display]) =>
            tagSet.has(tag) ? [{ ...display }] : []);
        const affinities = tagValues.flatMap(tag => {
            const display = getTagEffectTagDisplay(tag);
            return display ? [{ ...display }] : [];
        });
        const sharedCooldowns = (this.data.sharedCooldowns ?? []).flatMap(rule => {
            const display = skillTagDisplays.get(rule.targetTag) ?? getTagEffectTagDisplay(rule.targetTag);
            return display ? [{ ...display, seconds: rule.seconds }] : [];
        });
        return { groups, affinities, sharedCooldowns };
    }

    getCooldownEndDate(): Date | null {
        return this._cooldownEndsAt > Date.now() ? new Date(this._cooldownEndsAt) : null;
    }

    isVisibleTo(owner: Entity): boolean {
        const context = createSkillContext(owner, this);
        if (this.data.jobRequirement) {
            if (!context.player?.career || !this.data.jobRequirement.anyOf.some(jobId =>
                context.player!.career.hasJob(jobId, this.data.jobRequirement?.slot))) return false;
        }
        return this.data.isVisible?.(context) ?? true;
    }

    checkUsable(owner: Entity): SkillCheckResult {
        const context = createSkillContext(owner, this);
        const weapon = this.data.weaponRequirement;
        if (weapon && (!context.player || !weapon.mainHandAnyTags.some(tag =>
            context.player!.equipment.hasEquippedItemTag('mainHand', tag)))) {
            return denySkill(weapon.description);
        }
        return this.data.canUse?.(context) ?? acceptSkill();
    }

    formatDescription(owner: Entity): string {
        return this.format(this.data.descriptionTemplate, owner);
    }

    formatCost(owner: Entity): string {
        return this.format(this.data.costTemplate, owner);
    }

    formatActivationCondition(owner: Entity): string {
        return this.format(this.data.activationConditionTemplate, owner);
    }

    format(template: string, owner: Entity): string {
        return template.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (original, rawKey: string) => {
            const value = this.resolveTemplateValue(rawKey.trim(), owner);
            return value === undefined ? original : formatCalculatedValue(value);
        });
    }

    setPersistentChangeHandler(handler?: () => void): void {
        this.persistentChangeHandler = handler;
        this.tags.setPersistentChangeHandler(handler);
    }

    getPersistedMetadata(): MetadataRecord {
        return encodeMetadataDelta(METADATA_STORAGE_KEY, METADATA_STORAGE_VERSION, this._metadataDelta);
    }

    beginActive(result: SkillStartResult = {}): void {
        const duration = result.duration ?? 0;
        if (duration !== null && (!Number.isFinite(duration) || duration < 0)) {
            throw new Error(`Invalid skill duration: ${this.skillDataId}/${duration}`);
        }
        this._active = true;
        this._activeElapsed = 0;
        this._activeDuration = duration;
        this._activeState = cloneMetadata(result.state ?? {}) as SkillMetadata;
    }

    advanceActive(dt: number): boolean {
        if (!this._active) return false;
        this._activeElapsed += Math.max(0, dt);
        return this._activeDuration !== null && this._activeElapsed >= this._activeDuration;
    }

    getActiveStateSnapshot(): Readonly<SkillMetadata> {
        return cloneMetadata(this._activeState);
    }

    getActiveState<T extends MetadataValue = MetadataValue>(key: string): T | undefined {
        const value = this._activeState[key];
        return value === undefined ? undefined : cloneMetadataValue(value) as T;
    }

    setActiveState(key: string, value: unknown): void {
        if (!this._active) throw new Error(`Skill is not active: ${this.skillDataId}`);
        if (!key.trim()) throw new Error('Skill active state key must not be empty');
        if (value === undefined) delete this._activeState[key];
        else this._activeState[key] = cloneMetadataValue(value);
    }

    clearActive(): void {
        this._active = false;
        this._activeElapsed = 0;
        this._activeDuration = 0;
        this._activeState = {};
    }

    private resolveTemplateValue(key: string, owner: Entity): SkillCalculatedValue | MetadataValue | undefined {
        if (key === 'skill.name' || key === 'name') return this.name;
        if (key === 'skill.level' || key === 'level') return this.level;
        if (key === 'skill.coefficientLevel') return this.coefficientLevel;
        if (key === 'skill.maxLevel' || key === 'maxLevel') return this.maxLevel;
        if (key === 'skill.experience' || key === 'experience') return this.experience;
        if (key === 'skill.requiredExperience' || key === 'requiredExperience') {
            return this.getRequiredExperience(owner);
        }
        if (key === 'skill.remainingCooldown' || key === 'remainingCooldown') {
            return this.getRemainingCooldown();
        }
        if (key.startsWith('icon.')) return AttributeType.fromKey(key.slice(5))?.iconMarkup;
        if (key.startsWith('calc.')) return this.getCalculatedField(key.slice(5), owner);
        if (key.startsWith('meta.')) return this.getMetadata(key.slice(5));
        return this.getCalculatedField(key, owner) ?? this.getMetadata(key);
    }

    private createExperienceResult(gained: number, previousLevel: number, owner: Entity): SkillExperienceResult {
        return {
            gained,
            previousLevel,
            level: this.level,
            levelsGained: this.level - previousLevel,
            experience: this.experience,
            requiredExperience: this.getRequiredExperience(owner),
        };
    }

    static fromPersistence(options: {
        playerId: number;
        skillDataId: string;
        level: number;
        experience: number;
        cooldownEndsAt: Date | null;
        metadata: unknown;
        tags: readonly TagId[];
        acquiredAt: Date;
        acquisitionSource?: string;
    }): Skill {
        const baseMetadata = getSkillData(options.skillDataId)?.baseMetadata;
        const metadataDelta = decodeMetadataDelta(
            METADATA_STORAGE_KEY,
            METADATA_STORAGE_VERSION,
            baseMetadata,
            options.metadata,
        ) as SkillMetadata;
        return new Skill({
            ...options,
            metadataDelta,
            persistentTags: options.tags,
        });
    }
}

export function defineSkill(data: SkillData): void {
    const id = normalizeSkillId(data.id);
    const activationHeader = data.activationMessage ? (data.activationHeader ?? id) : data.activationHeader;
    if (!data.name.trim()) throw new Error(`Skill name must not be empty: ${id}`);
    if (!data.icon.trim()) throw new Error(`Skill icon must not be empty: ${id}`);
    if (activationHeader && !/^[a-z0-9][a-z0-9_-]*$/i.test(activationHeader)) {
        throw new Error(`Invalid skill activation header: ${id}/${activationHeader}`);
    }
    if (!Number.isInteger(data.maxLevel) || data.maxLevel < 1) {
        throw new Error(`Invalid skill max level: ${id}`);
    }
    if (data.unlockLevel !== undefined && (!Number.isInteger(data.unlockLevel) || data.unlockLevel < 1)) {
        throw new Error(`Invalid skill unlock level: ${id}/${data.unlockLevel}`);
    }
    const calculatedFields = Object.freeze({ ...(data.calculatedFields ?? {}) });
    const sharedCooldowns = (data.sharedCooldowns ?? []).map(rule => {
        const targetTag = normalizeTag(rule.targetTag);
        if (!Number.isFinite(rule.seconds) || rule.seconds <= 0) {
            throw new Error(`Invalid shared skill cooldown: ${id}/${targetTag}/${rule.seconds}`);
        }
        return Object.freeze({ targetTag, seconds: rule.seconds });
    });
    if (new Set(sharedCooldowns.map(rule => rule.targetTag)).size !== sharedCooldowns.length) {
        throw new Error(`Duplicate shared skill cooldown target: ${id}`);
    }
    skillDataRegistry.set(id, Object.freeze({
        ...data,
        id,
        activationHeader,
        aliases: Object.freeze([...(data.aliases ?? [])]),
        baseMetadata: data.baseMetadata ? Object.freeze(cloneMetadata(data.baseMetadata)) : null,
        calculatedFields,
        sharedCooldowns: Object.freeze(sharedCooldowns),
        balance: data.balance ? Object.freeze({
            ...data.balance,
            effectTags: Object.freeze([...(data.balance.effectTags ?? [])]),
            notes: Object.freeze([...(data.balance.notes ?? [])]),
        }) : undefined,
        autoAcquire: data.autoAcquire ? Object.freeze({
            ...data.autoAcquire,
            watchedProgress: Object.freeze([...data.autoAcquire.watchedProgress]),
        }) : undefined,
        jobRequirement: data.jobRequirement ? Object.freeze({
            ...data.jobRequirement,
            anyOf: Object.freeze([...data.jobRequirement.anyOf]),
        }) : undefined,
        weaponRequirement: data.weaponRequirement ? Object.freeze({
            ...data.weaponRequirement,
            mainHandAnyTags: Object.freeze(normalizeTags(data.weaponRequirement.mainHandAnyTags)),
        }) : undefined,
        tags: Object.freeze(normalizeTags(data.tags)),
    }));
}

export function getSkillData(id: string): Readonly<SkillData> | undefined {
    return skillDataRegistry.get(normalizeSkillId(id));
}

export function getAllSkillData(): ReadonlyArray<Readonly<SkillData>> {
    return [...skillDataRegistry.values()];
}

export function acceptSkill(): SkillCheckResult { return { accepted: true }; }
export function denySkill(reason: string): SkillCheckResult { return { accepted: false, reason }; }

export function createSkillContext(owner: Entity, skill: Skill): SkillContext {
    return {
        owner,
        player: owner.isPlayer ? owner as Player : null,
        skill,
    };
}

function normalizeSkillId(id: string): string {
    const normalized = id.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(normalized)) {
        throw new Error(`Invalid skill ID: ${id}`);
    }
    return normalized;
}

function normalizeSkillLevel(level: number, maxLevel: number): number {
    if (!Number.isInteger(level)) throw new Error(`Skill level must be an integer: ${level}`);
    return Math.max(1, Math.min(maxLevel, level));
}

function getSkillMaxLevelBonusCap(data: Readonly<SkillData>): number {
    return data.tags.includes(GameTags.SKILL_PASSIVE)
        ? PASSIVE_MAX_LEVEL_BONUS_CAP
        : ACTIVE_MAX_LEVEL_BONUS_CAP;
}

function normalizeSkillMaxLevelBonus(value: unknown, cap: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(Math.trunc(value), cap));
}

function getSkillMaxLevelBonus(
    metadataDelta: Readonly<SkillMetadata>,
    data: Readonly<SkillData>,
): number {
    return normalizeSkillMaxLevelBonus(
        metadataDelta[MAX_LEVEL_BONUS_METADATA_KEY],
        getSkillMaxLevelBonusCap(data),
    );
}

function normalizeSkillMetadataDelta(
    metadataDelta: SkillMetadata | null | undefined,
    data: Readonly<SkillData>,
): SkillMetadata {
    const normalized = cloneMetadata(metadataDelta ?? {}) as SkillMetadata;
    const maxLevelBonus = getSkillMaxLevelBonus(normalized, data);
    if (maxLevelBonus > 0) normalized[MAX_LEVEL_BONUS_METADATA_KEY] = maxLevelBonus;
    else delete normalized[MAX_LEVEL_BONUS_METADATA_KEY];
    return normalized;
}

function normalizeSkillExperience(experience: number): number {
    return normalizeExperienceAmount(experience, 'stored experience');
}

function normalizeExperienceAmount(value: number, label: string): number {
    if (!Number.isFinite(value) || value < 0) {
        throw new Error(`Skill experience ${label} must be a non-negative finite number: ${value}`);
    }
    return Math.floor(value);
}

function normalizeRequiredExperience(value: number): number {
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`Skill required experience must be a positive finite number: ${value}`);
    }
    return Math.max(1, Math.floor(value));
}

function normalizeCooldownEnd(value: Date | number | null | undefined): number {
    if (value === null || value === undefined) return 0;
    const timestamp = value instanceof Date ? value.getTime() : value;
    return Number.isFinite(timestamp) && timestamp > Date.now() ? timestamp : 0;
}

function formatCalculatedValue(value: SkillCalculatedValue | MetadataValue): string {
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new Error(`Skill template value must be finite: ${value}`);
        return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
    }
    if (typeof value === 'string' || typeof value === 'boolean') return String(value);
    if (value === null) return '';
    return JSON.stringify(value);
}
