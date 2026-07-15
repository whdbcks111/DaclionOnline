import { isDeepStrictEqual } from 'node:util';
import type Entity from './Entity.js';
import type Player from './Player.js';
import { TagCollection, normalizeTags } from '../../../shared/tags.js';
import type { TagId, TagReadable } from '../../../shared/tags.js';
import {
    cloneMetadata,
    cloneMetadataValue,
    createMetadataDelta,
    decodeMetadataDelta,
    encodeMetadataDelta,
} from './Metadata.js';
import type { MetadataRecord, MetadataValue } from './Metadata.js';

export type SkillMetadata = MetadataRecord;
export type SkillCalculatedValue = string | number | boolean;

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
    check: (context: SkillContext) => boolean;
}

export interface SkillData {
    id: string;
    name: string;
    icon: string;
    aliases?: readonly string[];
    maxLevel: number;
    descriptionTemplate: string;
    costTemplate: string;
    activationConditionTemplate: string;
    activationMessage?: string;
    baseMetadata: SkillMetadata | null;
    calculatedFields?: Readonly<Record<string, (context: SkillContext) => SkillCalculatedValue>>;
    calculateMaxCooldown?: (context: SkillContext) => number;
    autoAcquire?: SkillAutoAcquire;
    autoActivate?: (context: SkillContext) => boolean;
    activateOnMessage?: (context: SkillMessageContext) => boolean;
    isVisible?: (context: SkillContext) => boolean;
    canUse?: (context: SkillContext) => SkillCheckResult;
    canActivate?: (context: SkillContext) => SkillCheckResult;
    onAcquire?: (context: SkillContext) => void;
    onStart?: (context: SkillContext) => SkillStartResult | void;
    onUpdate?: (context: SkillUpdateContext, dt: number) => SkillUpdateResult | void;
    onFinish?: (context: SkillFinishContext) => void;
    onPassiveUpdate?: (context: SkillContext, dt: number) => void;
    tags: readonly TagId[];
}

const METADATA_STORAGE_KEY = '__daclionSkillMetadata';
const METADATA_STORAGE_VERSION = 1;
const skillDataRegistry = new Map<string, Readonly<SkillData>>();

export default class Skill implements TagReadable {
    readonly playerId: number | null;
    readonly skillDataId: string;
    readonly tags: TagCollection;
    readonly acquiredAt: Date;
    readonly acquisitionSource?: string;

    private _level: number;
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
        this._level = normalizeSkillLevel(options.level ?? 1, data.maxLevel);
        this._cooldownEndsAt = normalizeCooldownEnd(options.cooldownEndsAt);
        this._metadataDelta = cloneMetadata(options.metadataDelta ?? {}) as SkillMetadata;
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
    get maxLevel(): number { return this.data.maxLevel; }
    get isActive(): boolean { return this._active; }
    get activeElapsed(): number { return this._activeElapsed; }
    get activeDuration(): number | null { return this._activeDuration; }

    hasTag(tag: TagId): boolean { return this.tags.hasTag(tag); }

    setLevel(level: number): number {
        const normalized = normalizeSkillLevel(level, this.maxLevel);
        if (normalized === this._level) return normalized;
        this._level = normalized;
        this.persistentChangeHandler?.();
        return normalized;
    }

    increaseLevel(amount = 1): number {
        if (!Number.isInteger(amount) || amount < 0) throw new Error('Skill level amount must be a non-negative integer');
        return this.setLevel(this._level + amount);
    }

    getMetadata<T extends MetadataValue = MetadataValue>(key: string): T | undefined {
        if (Object.hasOwn(this._metadataDelta, key)) {
            return cloneMetadataValue(this._metadataDelta[key]) as T;
        }
        const value = this.data.baseMetadata?.[key];
        return value === undefined ? undefined : cloneMetadataValue(value) as T;
    }

    getMetadataSnapshot(): Readonly<SkillMetadata> | null {
        const merged = { ...(this.data.baseMetadata ?? {}), ...this._metadataDelta };
        return Object.keys(merged).length > 0 ? cloneMetadata(merged) : null;
    }

    getMetadataDeltaSnapshot(): SkillMetadata | null {
        return Object.keys(this._metadataDelta).length > 0
            ? cloneMetadata(this._metadataDelta) as SkillMetadata
            : null;
    }

    setMetadata(key: string, value: unknown): void {
        if (!key.trim()) throw new Error('Skill metadata key must not be empty');
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

    getCooldownEndDate(): Date | null {
        return this._cooldownEndsAt > Date.now() ? new Date(this._cooldownEndsAt) : null;
    }

    isVisibleTo(owner: Entity): boolean {
        return this.data.isVisible?.(createSkillContext(owner, this)) ?? true;
    }

    checkUsable(owner: Entity): SkillCheckResult {
        return this.data.canUse?.(createSkillContext(owner, this)) ?? acceptSkill();
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
        if (key === 'skill.maxLevel' || key === 'maxLevel') return this.maxLevel;
        if (key === 'skill.remainingCooldown' || key === 'remainingCooldown') {
            return this.getRemainingCooldown();
        }
        if (key.startsWith('calc.')) return this.getCalculatedField(key.slice(5), owner);
        if (key.startsWith('meta.')) return this.getMetadata(key.slice(5));
        return this.getCalculatedField(key, owner) ?? this.getMetadata(key);
    }

    static fromPersistence(options: {
        playerId: number;
        skillDataId: string;
        level: number;
        cooldownEndsAt: Date | null;
        metadata: unknown;
        tags: readonly TagId[];
        acquiredAt: Date;
        acquisitionSource?: string;
    }): Skill {
        const baseMetadata = getSkillData(options.skillDataId)?.baseMetadata;
        return new Skill({
            ...options,
            metadataDelta: decodeMetadataDelta(
                METADATA_STORAGE_KEY,
                METADATA_STORAGE_VERSION,
                baseMetadata,
                options.metadata,
            ) as SkillMetadata,
            persistentTags: options.tags,
        });
    }
}

export function defineSkill(data: SkillData): void {
    const id = normalizeSkillId(data.id);
    if (!data.name.trim()) throw new Error(`Skill name must not be empty: ${id}`);
    if (!data.icon.trim()) throw new Error(`Skill icon must not be empty: ${id}`);
    if (!Number.isInteger(data.maxLevel) || data.maxLevel < 1) {
        throw new Error(`Invalid skill max level: ${id}`);
    }
    const calculatedFields = Object.freeze({ ...(data.calculatedFields ?? {}) });
    skillDataRegistry.set(id, Object.freeze({
        ...data,
        id,
        aliases: Object.freeze([...(data.aliases ?? [])]),
        baseMetadata: data.baseMetadata ? Object.freeze(cloneMetadata(data.baseMetadata)) : null,
        calculatedFields,
        autoAcquire: data.autoAcquire ? Object.freeze({
            ...data.autoAcquire,
            watchedProgress: Object.freeze([...data.autoAcquire.watchedProgress]),
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
