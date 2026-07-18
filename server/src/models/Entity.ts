import Attribute, { AttributeType } from "./Attribute.js";
import type { AttributeRecord } from "./Attribute.js";
import Equipment, { EquipSlotType } from "./Equipment.js";
import Stat from "./Stat.js";
import type { StatRecord } from "./Stat.js";
import { sendBotMessageToUser, sendNotificationToUser } from "../modules/message.js";
import { chat } from "../utils/chatBuilder.js";
import { applyCritical, calculateEvasionChance, calculateFinalDamage, rollEvasion } from "./Combat.js";
import { applyTagEffectValue } from "./TagEffect.js";
import type { TagEffectReadable } from "./TagEffect.js";
import { GameTags, TagCollection } from "../../../shared/tags.js";
import type { TagId, TagReadable } from "../../../shared/tags.js";
import type Player from "./Player.js";
import { emitGameEvent, GameEventIds } from "./GameEvent.js";
import StatusEffect, {
    StatusEffectApplyAction,
    StatusEffectRemovalReason,
    StatusEffectType,
} from "./StatusEffect.js";
import logger from "../utils/logger.js";
import { ActionType } from "./Action.js";
import Shield, { ShieldType, type ShieldDisplaySnapshot } from './Shield.js';
import type { ShieldBarSegment } from '../../../shared/types.js';

/** 대미지 타입 */
export type DamageType = 'physical' | 'magic' | 'absolute';

/** 대미지 결과 */
export interface DamageResult {
    type: DamageType;
    rawAmount: number;
    modifiedAmount: number;
    finalDamage: number;
    lifeDamage: number;
    absorbedDamage: number;
    remainingLife: number;
    remainingShield: number;
    critical: boolean;
    evaded: boolean;
    fixedDamage: boolean;
    effectModifier: number;
    effectSourceTag?: TagId;
    effectTargetTag?: TagId;
}

/** 한 번의 직접 공격에만 적용할 수 있는 계산 옵션. */
export interface AttackOptions {
    /** 생략하면 공격자의 현재 치명타율을 사용한다. */
    criticalRate?: number;
    /** 생략하면 공격자의 현재 치명타 피해 배율을 사용한다. */
    criticalDamage?: number;
    /** 생략하면 물리 직접 공격에서만 주무기 내구도를 소모한다. */
    consumeMainHandDurability?: boolean;
    /** true이면 대상의 이동속도와 행동 가능 여부에 관계없이 회피할 수 없다. */
    unavoidable?: boolean;
    /** true이면 치명타·속성 상성·방어·관통을 적용하지 않고 지정한 피해량을 그대로 준다. */
    fixedDamage?: boolean;
    /** 생략하면 물리 직접 공격이 주무기의 적중 callback을 실행한다. */
    triggerMainHandHitEffects?: boolean;
}

export type DamageCauseType = 'void' | 'attack' | 'thirsty' | 'starvation' | 'fire' | 'poison' | 'suffocation'

export interface DamageCause {
    type: DamageCauseType;
    causeEntity: Entity | null;
    critical?: boolean;
    /** 고정 피해는 속성 상성·방어·관통을 거치지 않는다. */
    fixedDamage?: boolean;
    /** causeEntity가 없어도 속성 상성을 계산할 수 있는 효과원. */
    effectSource?: TagEffectReadable;
}

export interface HealingResult {
    rawAmount: number;
    modifiedAmount: number;
    healedAmount: number;
    remainingLife: number;
    modifier: number;
}

export interface StatusEffectApplyResult {
    action: StatusEffectApplyAction;
    effect?: StatusEffect;
}

export interface StatusEffectDisplaySnapshot {
    id: string;
    label: string;
    icon: string;
    level: number;
    duration: number;
    maxDuration: number;
    durationRatio: number;
    description: string;
}

export default abstract class Entity implements TagReadable {
    readonly attribute: Attribute;
    readonly equipment: Equipment;
    readonly stat: Stat;
    readonly tags: TagCollection;
    private readonly statusEffects = new Map<string, StatusEffect>();
    private readonly shields = new Map<string, Shield>();
    private readonly healingReceivedModifiers = new Map<string, number>();
    private readonly actionDisableSources = new Map<string, Set<string>>();
    private readonly tickActionDisableSources = new Map<string, Set<string>>();
    private readonly guaranteedEvasionSources = new Set<string>();

    protected _level: number;
    protected _exp: number;
    protected _locationId: string;
    protected _life: number;
    protected _mentality: number;
    protected _thirsty: number;
    protected _hungry: number;

    currentTarget: Entity | null = null;
    lastDamageCause: DamageCause | null = null;
    isDead: boolean = false;
    deathTimer: number = 0;

    protected _attackCooldown = 0;
    protected _maxAttackCooldown = 0;

    constructor(
        level: number,
        exp: number,
        locationId: string,
        baseAttribute: Partial<AttributeRecord>,
        equipment: Equipment,
        statPoints?: Partial<StatRecord>,
        definitionTags: readonly TagId[] = [],
        persistentTags: readonly TagId[] = [],
    ) {
        this._level = level;
        this._exp = exp;
        this._locationId = locationId;
        this.attribute = new Attribute(baseAttribute);
        this.equipment = equipment;
        this.stat = new Stat(statPoints);
        this.tags = new TagCollection({
            definition: definitionTags,
            persistent: persistentTags,
            onPersistentChange: () => this.onPersistentTagsChanged(),
        });

        // modifier 적용: 스탯 → 장비 순서
        this.stat.applyModifiers(this);
        this.equipment.applyModifiers(this.attribute);

        // 현재 생명력/정신력은 최대치로 초기화
        this._life = this.attribute.get(AttributeType.MAX_LIFE);
        this._mentality = this.attribute.get(AttributeType.MAX_MENTALITY);
        this._thirsty = this.attribute.get(AttributeType.MAX_THIRSTY);
        this._hungry = this.attribute.get(AttributeType.MAX_HUNGRY);
    }

    // -- Getters / Setters --

    abstract get name(): string;

    /** 이 엔티티가 플레이어인지 여부 (Player에서 override) */
    get isPlayer(): boolean { return false; }

    /** 플레이어 userId (Player에서 override, 비플레이어는 undefined) */
    get playerUserId(): number | undefined { return undefined; }

    /** 공격 보상·어그로를 귀속할 최종 소유자. Projectile은 owner를 반환한다. */
    get attackOwner(): Entity { return this; }

    /** lateUpdate의 사망 처리 전 life가 먼저 0이 된 프레임까지 포함한 제압 상태. */
    get isDefeated(): boolean { return this.isDead || this.life <= 0; }

    /** 사용자 출력에서 제압 상태를 설명하는 기본 라벨. */
    get defeatLabel(): string { return '사망'; }

    /** 상호작용 handler가 있는 월드 오브젝트에서 override한다. */
    get isInteractable(): boolean { return false; }

    interact(_player: Player): boolean { return false; }

    /** 공격 불가 사유. undefined이면 공격 가능하다. */
    getAttackDeniedReason(attacker: Entity): string | undefined {
        return attacker !== this && this.hasTag(GameTags.TRAIT_STEALTH) ? '대상이 은신 중이라 공격할 수 없습니다.' : undefined;
    }

    grantGuaranteedEvasion(source: string): void { if (source.trim()) this.guaranteedEvasionSources.add(source); }
    removeGuaranteedEvasion(source: string): boolean { return this.guaranteedEvasionSources.delete(source); }
    consumeGuaranteedEvasion(): boolean {
        const source = this.guaranteedEvasionSources.values().next().value as string | undefined;
        return source ? this.guaranteedEvasionSources.delete(source) : false;
    }

    get level() { return this._level; }
    set level(val: number) { this._level = val; }

    get exp() { return this._exp; }
    set exp(val: number) { this._exp = val; }

    get locationId() { return this._locationId; }
    set locationId(val: string) { this._locationId = val; }

    get maxExp() { return Entity.getMaxExpOfLevel(this._level); }

    static getMaxExpOfLevel(level: number): number {
        const normalizedLevel = Math.max(1, level);
        // Lv.1의 1배에서 Lv.50의 4배까지 레벨당 요구량 배율을 늘린다.
        // 동급 몬스터 기준 보상(level * 20)은 Lv.1에서 20%, Lv.50에서 5%가 된다.
        const growthMultiplier = 1 + 3 * Math.min(49, normalizedLevel - 1) / 49;
        return Math.max(1, Math.round(normalizedLevel * 100 * growthMultiplier));
    }

    get life() { return this._life; }
    set life(val: number) { this._life = val; }

    get mentality() { return this._mentality; }
    set mentality(val: number) { this._mentality = val; }

    get maxLife()     { return this.attribute.get(AttributeType.MAX_LIFE); }
    get maxMentality(){ return this.attribute.get(AttributeType.MAX_MENTALITY); }

    get thirsty() { return this._thirsty; }
    set thirsty(val: number) { this._thirsty = val; }

    get hungry() { return this._hungry; }
    set hungry(val: number) { this._hungry = val; }

    get maxThirsty() { return this.attribute.get(AttributeType.MAX_THIRSTY); }
    get maxHungry()  { return this.attribute.get(AttributeType.MAX_HUNGRY); }

    /** 최대 자원 modifier가 줄어든 뒤 현재값이 새 최대값을 넘지 않도록 보정한다. */
    clampVitals(): boolean {
        let changed = false;
        const clamp = (current: number, maximum: number, set: (value: number) => void): void => {
            if (!Number.isFinite(maximum)) return;
            const upperBound = Math.max(0, maximum);
            if (current <= upperBound) return;
            set(upperBound);
            changed = true;
        };
        clamp(this.life, this.maxLife, value => { this.life = value; });
        clamp(this.mentality, this.maxMentality, value => { this.mentality = value; });
        clamp(this.thirsty, this.maxThirsty, value => { this.thirsty = value; });
        clamp(this.hungry, this.maxHungry, value => { this.hungry = value; });
        return changed;
    }

    /** 엔티티 본체와 장착 아이템 태그를 합친 유효 태그 조회 */
    hasTag(tag: TagId): boolean {
        return this.tags.hasTag(tag) || this.equipment.hasTag(tag);
    }

    getTags(): TagId[] {
        return [...new Set([...this.tags.values(), ...this.equipment.getTags()])].sort();
    }

    /** 공격 효과: 본체 태그만 사용한다. 무기 속성은 별도 피해/적중 효과로 명시한다. */
    hasEffectSourceTag(tag: TagId): boolean {
        return this.tags.hasTag(tag);
    }

    /** 피격 효과: 본체의 정의·영속·런타임 태그만 사용한다. */
    hasEffectTargetTag(tag: TagId): boolean {
        return this.tags.hasTag(tag);
    }

    protected onPersistentTagsChanged(): void {}

    // -- 행동 제한 --

    canPerformAction(action: ActionType): boolean {
        return !this.actionDisableSources.get(action.key)?.size
            && !this.tickActionDisableSources.get(action.key)?.size;
    }

    disableAction(action: ActionType, source: string): void {
        addActionDisableSource(this.actionDisableSources, action, source);
    }

    disableActions(actions: readonly ActionType[], source: string): void {
        for (const action of actions) this.disableAction(action, source);
    }

    enableAction(action: ActionType, source: string): boolean {
        return removeActionDisableSource(this.actionDisableSources, action, source);
    }

    clearActionDisableSource(source: string): boolean {
        return clearActionDisableSource(this.actionDisableSources, source);
    }

    /** 현재 게임 tick에만 유지되고 다음 earlyUpdate 시작에서 자동 제거된다. */
    disableActionForTick(action: ActionType, source: string): void {
        addActionDisableSource(this.tickActionDisableSources, action, source);
    }

    disableActionsForTick(actions: readonly ActionType[], source: string): void {
        for (const action of actions) this.disableActionForTick(action, source);
    }

    clearTickActionDisableSource(source: string): boolean {
        return clearActionDisableSource(this.tickActionDisableSources, source);
    }

    releaseActionDisableSource(source: string): boolean {
        const persistentChanged = this.clearActionDisableSource(source);
        const tickChanged = this.clearTickActionDisableSource(source);
        return persistentChanged || tickChanged;
    }

    getActionDisableSources(action: ActionType): readonly string[] {
        return [...new Set([
            ...(this.actionDisableSources.get(action.key) ?? []),
            ...(this.tickActionDisableSources.get(action.key) ?? []),
        ])];
    }

    // -- 회복 --

    /** 현재 치유량 modifier를 적용해 생명력을 회복한다. */
    heal(rawAmount: number): HealingResult {
        if (!Number.isFinite(rawAmount) || rawAmount < 0) {
            throw new Error(`Healing amount must be a non-negative finite number: ${rawAmount}`);
        }
        const modifier = this.getHealingReceivedModifier();
        const modifiedAmount = rawAmount * modifier;
        const healedAmount = this.isDefeated
            ? 0
            : Math.max(0, Math.min(modifiedAmount, this.maxLife - this.life));
        this.life += healedAmount;
        return {
            rawAmount,
            modifiedAmount,
            healedAmount,
            remainingLife: this.life,
            modifier,
        };
    }

    /** 치유량 modifier와 별개로 정신력을 최대치 안에서 회복한다. */
    restoreMentality(rawAmount: number): number {
        if (!Number.isFinite(rawAmount) || rawAmount < 0) {
            throw new Error(`Mentality recovery must be a non-negative finite number: ${rawAmount}`);
        }
        this.mentality = Math.min(this.maxMentality, this.mentality + rawAmount);
        return this.mentality;
    }

    restoreHunger(rawAmount: number): number {
        if (!Number.isFinite(rawAmount) || rawAmount < 0) throw new Error('Hunger recovery must be non-negative');
        this.hungry = Math.min(this.maxHungry, this.hungry + rawAmount);
        return this.hungry;
    }

    restoreThirst(rawAmount: number): number {
        if (!Number.isFinite(rawAmount) || rawAmount < 0) throw new Error('Thirst recovery must be non-negative');
        this.thirsty = Math.min(this.maxThirsty, this.thirsty + rawAmount);
        return this.thirsty;
    }

    /** 능력치에 따라 배고픔과 수분을 감소시킨다. 플레이어 생존 틱에서 호출한다. */
    depleteSurvivalNeeds(dt: number): void {
        if (!Number.isFinite(dt) || dt < 0) {
            throw new Error(`Survival need delta time must be a non-negative finite number: ${dt}`);
        }
        if (this.isDefeated || dt === 0) return;
        const hungerDrain = Math.max(0, this.attribute.get(AttributeType.HUNGER_DRAIN));
        const thirstDrain = Math.max(0, this.attribute.get(AttributeType.THIRST_DRAIN));
        if (hungerDrain > 0 && this.hungry > 0) {
            this.hungry = Math.max(0, this.hungry - hungerDrain * dt);
        }
        if (thirstDrain > 0 && this.thirsty > 0) {
            this.thirsty = Math.max(0, this.thirsty - thirstDrain * dt);
        }
    }

    setHealingReceivedModifier(source: string, modifier: number): void {
        if (!source.trim()) throw new Error('Healing modifier source must not be empty');
        if (!Number.isFinite(modifier) || modifier < 0) {
            throw new Error(`Healing modifier must be a non-negative finite number: ${modifier}`);
        }
        this.healingReceivedModifiers.set(source, modifier);
    }

    removeHealingReceivedModifier(source: string): boolean {
        return this.healingReceivedModifiers.delete(source);
    }

    getHealingReceivedModifier(): number {
        let result = 1;
        for (const modifier of this.healingReceivedModifiers.values()) result *= modifier;
        return Math.max(0, result);
    }

    // -- 보호막 --

    /** 같은 key는 교체하고 다른 key는 독립적으로 중첩한다. */
    setShield(key: string, amount: number, type: ShieldType, duration: number): ShieldDisplaySnapshot | undefined {
        const normalizedKey = key.trim();
        if (!normalizedKey) throw new Error('Shield key must not be empty');
        if (!Number.isFinite(amount) || amount <= 0) throw new Error('Shield amount must be a positive finite number');
        if (!Number.isFinite(duration) || duration <= 0) throw new Error('Shield duration must be a positive finite number');
        if (this.isDefeated) return undefined;
        const shield = new Shield(normalizedKey, amount, type, duration);
        this.shields.set(normalizedKey, shield);
        return shield.toSnapshot();
    }

    getShield(key: string): ShieldDisplaySnapshot | undefined {
        return this.shields.get(key.trim())?.toSnapshot();
    }

    hasShield(key: string): boolean { return this.shields.has(key.trim()); }
    removeShield(key: string): boolean { return this.shields.delete(key.trim()); }
    clearShields(): void { this.shields.clear(); }

    /** 피해 흡수 순서와 UI 구간 순서를 일치시키기 위해 남은 시간이 짧은 순으로 반환한다. */
    getShieldDisplaySnapshots(): ShieldDisplaySnapshot[] {
        return [...this.shields.values()]
            .sort((left, right) => left.duration - right.duration || left.key.localeCompare(right.key))
            .map(shield => shield.toSnapshot());
    }

    getShieldBarSegments(): ShieldBarSegment[] {
        return [...this.shields.values()]
            .sort((left, right) => left.duration - right.duration || left.key.localeCompare(right.key))
            .map(shield => shield.toBarSegment());
    }

    getTotalShield(type?: DamageType): number {
        return [...this.shields.values()]
            .filter(shield => !type || shield.type.absorbs(type))
            .reduce((total, shield) => total + shield.amount, 0);
    }

    private absorbShieldDamage(amount: number, type: DamageType): number {
        let remaining = Math.max(0, amount);
        let absorbed = 0;
        const ordered = [...this.shields.values()]
            .filter(shield => shield.type.absorbs(type))
            .sort((left, right) => left.duration - right.duration || left.key.localeCompare(right.key));
        for (const shield of ordered) {
            const consumed = shield.absorb(remaining);
            absorbed += consumed;
            remaining -= consumed;
            if (shield.amount <= 0) this.shields.delete(shield.key);
            if (remaining <= 0) break;
        }
        return absorbed;
    }

    private updateShields(dt: number): void {
        if (this.isDefeated) {
            this.clearShields();
            return;
        }
        for (const shield of [...this.shields.values()]) {
            if (shield.advance(dt)) this.shields.delete(shield.key);
        }
    }

    // -- 상태효과 --

    getStatusEffects(): readonly StatusEffect[] {
        return [...this.statusEffects.values()];
    }

    /** 상태창과 HUD가 내부 effect Map을 읽지 않고 사용하는 표시 스냅샷. */
    getStatusEffectDisplaySnapshots(): StatusEffectDisplaySnapshot[] {
        return this.getStatusEffects().map(effect => ({
            id: effect.type.id,
            label: effect.type.label,
            icon: effect.type.icon,
            level: effect.level,
            duration: effect.duration,
            maxDuration: effect.maxDuration,
            durationRatio: effect.durationRatio,
            description: effect.formatDescription(this),
        }));
    }

    getStatusEffect(type: StatusEffectType | string): StatusEffect | undefined {
        const resolved = typeof type === 'string' ? StatusEffectType.fromKey(type) : type;
        return resolved ? this.statusEffects.get(resolved.id) : undefined;
    }

    hasStatusEffect(type: StatusEffectType | string): boolean {
        return this.getStatusEffect(type) !== undefined;
    }

    applyStatusEffect(type: StatusEffectType, duration: number, level: number): StatusEffectApplyResult {
        if (!Number.isFinite(duration) || duration <= 0) {
            throw new Error(`StatusEffect duration must be a positive finite number: ${duration}`);
        }
        const normalizedLevel = type.normalizeLevel(level);
        const existing = this.statusEffects.get(type.id);
        if (existing) {
            let action = StatusEffectApplyAction.IGNORED;
            if (normalizedLevel > existing.level) {
                existing.upgrade(normalizedLevel, duration);
                action = StatusEffectApplyAction.UPGRADED;
            } else if (normalizedLevel === existing.level && existing.refreshDuration(duration)) {
                action = StatusEffectApplyAction.REFRESHED;
            }
            if (action.changed) {
                emitGameEvent(GameEventIds.STATUS_EFFECT_UPDATED, {
                    subject: this,
                    data: { effectId: type.id, level: existing.level, duration: existing.duration, action: action.key },
                });
            }
            return { action, effect: existing };
        }

        if (this.isDefeated) return { action: StatusEffectApplyAction.REJECTED };
        const effect = new StatusEffect(type, duration, normalizedLevel);
        this.statusEffects.set(type.id, effect);
        try {
            if (effect.start(this) === 'remove') {
                this.removeStatusEffect(type, StatusEffectRemovalReason.INVALID_TARGET);
                return { action: StatusEffectApplyAction.REJECTED };
            }
        } catch (error) {
            logger.error(`StatusEffect 시작 실패: ${type.id}/${this.name}`, error);
            this.removeStatusEffect(type, StatusEffectRemovalReason.ERROR);
            return { action: StatusEffectApplyAction.REJECTED };
        }
        emitGameEvent(GameEventIds.STATUS_EFFECT_APPLIED, {
            subject: this,
            data: { effectId: type.id, level: effect.level, duration: effect.duration },
        });
        return { action: StatusEffectApplyAction.ADDED, effect };
    }

    removeStatusEffect(
        type: StatusEffectType | string,
        reason = StatusEffectRemovalReason.MANUAL,
    ): boolean {
        const effect = this.getStatusEffect(type);
        if (!effect || this.statusEffects.get(effect.type.id) !== effect) return false;
        this.statusEffects.delete(effect.type.id);
        try {
            effect.remove(this, reason);
        } catch (error) {
            logger.error(`StatusEffect 제거 callback 실패: ${effect.type.id}/${this.name}`, error);
        }
        emitGameEvent(GameEventIds.STATUS_EFFECT_REMOVED, {
            subject: this,
            data: { effectId: effect.type.id, level: effect.level, reason: reason.key },
        });
        return true;
    }

    clearStatusEffects(reason = StatusEffectRemovalReason.MANUAL): void {
        for (const effect of [...this.statusEffects.values()]) {
            this.removeStatusEffect(effect.type, reason);
        }
    }

    updateStatusEffects(dt: number): void {
        if (this.isDefeated) {
            this.clearStatusEffects(StatusEffectRemovalReason.TARGET_DEFEATED);
            return;
        }
        for (const effect of [...this.statusEffects.values()]) {
            if (this.statusEffects.get(effect.type.id) !== effect) continue;
            try {
                const state = effect.advance(this, dt);
                if (this.isDefeated) {
                    this.clearStatusEffects(StatusEffectRemovalReason.TARGET_DEFEATED);
                    return;
                }
                if (state.result === 'remove') {
                    this.removeStatusEffect(effect.type, StatusEffectRemovalReason.INVALID_TARGET);
                } else if (state.expired) {
                    this.removeStatusEffect(effect.type, StatusEffectRemovalReason.EXPIRED);
                }
            } catch (error) {
                logger.error(`StatusEffect 업데이트 실패: ${effect.type.id}/${this.name}`, error);
                this.removeStatusEffect(effect.type, StatusEffectRemovalReason.ERROR);
            }
        }
    }

    // -- 전투 --

    /** 현재 대상이 비어 있으면 공격자의 최종 owner를 전투 대상으로 획득한다. */
    acquireCombatTarget(attacker: Entity): boolean {
        const owner = attacker.attackOwner;
        if (this.currentTarget || owner === this || owner.isDefeated) return false;
        this.currentTarget = owner;
        return true;
    }

    damage(rawAmount: number, type: DamageType = 'physical', cause: DamageCause | null = null): DamageResult {
        if (cause?.type === 'attack' && cause.causeEntity) {
            this.acquireCombatTarget(cause.causeEntity);
        }

        let defense = 0;
        let penetration = 0;
        const fixedDamage = cause?.fixedDamage === true;
        const attacker = cause?.type === 'attack' ? cause.causeEntity : null;
        const effectSource = cause?.effectSource ?? attacker;
        const effect = !fixedDamage && effectSource
            ? applyTagEffectValue(rawAmount, effectSource, this)
            : { value: rawAmount, modifier: 1, sourceTag: '', targetTag: '', effective: true };

        if (!fixedDamage && type === 'physical') {
            defense    = this.attribute.get(AttributeType.DEF);
            penetration = attacker?.attribute.get(AttributeType.ARMOR_PEN) ?? 0;
        } else if (!fixedDamage && type === 'magic') {
            defense    = this.attribute.get(AttributeType.MAGIC_DEF);
            penetration = attacker?.attribute.get(AttributeType.MAGIC_PEN) ?? 0;
        }

        const finalDamage = fixedDamage
            ? Math.max(0, rawAmount)
            : calculateFinalDamage(effect.value, defense, penetration);
        const absorbedDamage = this.absorbShieldDamage(finalDamage, type);
        const lifeDamage = Math.max(0, finalDamage - absorbedDamage);

        this.life = this.life - lifeDamage;
        if (this.life <= 0) this.clearShields();
        const remainingLife = this.life;

        if (cause) this.lastDamageCause = cause;

        return {
            type,
            rawAmount,
            modifiedAmount: effect.value,
            finalDamage,
            lifeDamage,
            absorbedDamage,
            remainingLife,
            remainingShield: this.getTotalShield(),
            critical: cause?.critical === true,
            evaded: false,
            fixedDamage,
            effectModifier: effect.modifier,
            effectSourceTag: effect.sourceTag || undefined,
            effectTargetTag: effect.targetTag || undefined,
        };
    }

    get attackCooldown(): number { return this._attackCooldown; }
    get maxAttackCooldown(): number { return this._maxAttackCooldown; }

    /** 공격 시작 가능 여부를 검사하고 플레이어라면 실패 이유를 안내한다. */
    canAttack(target: Entity): boolean {
        if (this.isDefeated) return false;

        if (!this.canPerformAction(ActionType.ATTACK)) {
            if (this.isPlayer && this.playerUserId) {
                sendNotificationToUser(this.playerUserId, {
                    key: 'action-disabled:attack',
                    message: '현재 공격할 수 없는 상태입니다.',
                });
            }
            return false;
        }

        if (target.isDefeated) {
            if (this.isPlayer && this.playerUserId) {
                sendBotMessageToUser(this.playerUserId, '이미 제압된 대상은 공격할 수 없습니다.');
            }
            return false;
        }

        if (this._attackCooldown > 0) {
            if (this.isPlayer && this.playerUserId) {
                sendBotMessageToUser(this.playerUserId, `아직 공격할 수 없습니다. (${this.attackCooldown.toFixed(1)}초 후 가능)`);
            }
            return false;
        }

        const attackOwner = this.attackOwner;
        const deniedReason = target.getAttackDeniedReason(attackOwner);
        if (deniedReason) {
            const userId = attackOwner.playerUserId;
            if (userId !== undefined) {
                sendNotificationToUser(userId, {
                    key: 'attack-denied',
                    message: deniedReason,
                });
            }
            return false;
        }

        return true;
    }

    /** 성공한 공격의 쿨다운과 선택적인 주무기 내구도 소모를 확정한다. */
    commitAttack(consumeMainHandDurability = false): void {
        const attackSpeed = this.attribute.get(AttributeType.ATTACK_SPEED);
        this._maxAttackCooldown = 1 / Math.max(0.01, attackSpeed);
        this._attackCooldown = this._maxAttackCooldown;
        if (consumeMainHandDurability) {
            const weapon = this.equipment.getEquipped(EquipSlotType.MAIN_HAND.key, 0);
            const durability = this.equipment.decreaseItemDurability(EquipSlotType.MAIN_HAND.key, 0, 1);
            if (weapon && durability === 0 && this.playerUserId !== undefined) {
                sendNotificationToUser(this.playerUserId, {
                    key: `item-broken:${weapon.itemDataId}`,
                    message: `${weapon.name}의 내구도가 다해 파괴되었습니다.`,
                    length: 3000,
                });
            }
        }
    }

    /** 대상 엔티티를 직접 공격 */
    attack(
        target: Entity,
        type: DamageType = 'physical',
        amount?: number,
        options: AttackOptions = {},
    ): DamageResult | null {
        if (!this.canAttack(target)) return null;
        target.acquireCombatTarget(this);

        // 기본 공격력: 물리 → atk, 마법 → magicForce
        const baseAmount = amount ?? (type === 'physical'
            ? this.attribute.get(AttributeType.ATK)
            : this.attribute.get(AttributeType.MAGIC_FORCE));

        const guaranteedEvasion = !options.unavoidable && target.canPerformAction(ActionType.MOVEMENT)
            && target.consumeGuaranteedEvasion();
        const evasionChance = options.unavoidable || !target.canPerformAction(ActionType.MOVEMENT)
            ? 0
            : guaranteedEvasion ? 1 : calculateEvasionChance(
                this.attribute.get(AttributeType.SPEED),
                target.attribute.get(AttributeType.SPEED),
            );
        if (rollEvasion(evasionChance)) {
            this.commitAttack(options.consumeMainHandDurability ?? type === 'physical');
            const result: DamageResult = {
                type,
                rawAmount: Math.max(0, baseAmount),
                modifiedAmount: 0,
                finalDamage: 0,
                lifeDamage: 0,
                absorbedDamage: 0,
                remainingLife: target.life,
                remainingShield: target.getTotalShield(),
                critical: false,
                evaded: true,
                fixedDamage: options.fixedDamage === true,
                effectModifier: 1,
            };
            this.notifyEvadedAttack(target, evasionChance);
            emitGameEvent(GameEventIds.ATTACK_EVADED, {
                actor: this,
                subject: target,
                data: { evasionChance, damageType: type },
            });
            return result;
        }

        const criticalResult = options.fixedDamage
            ? { rawAmount: Math.max(0, baseAmount), critical: false }
            : applyCritical(
                baseAmount,
                options.criticalRate ?? this.attribute.get(AttributeType.CRIT_RATE),
                options.criticalDamage ?? this.attribute.get(AttributeType.CRIT_DMG),
            );
        const { rawAmount, critical } = criticalResult;

        const damageResult = target.damage(rawAmount, type, {
            type: 'attack',
            causeEntity: this,
            critical,
            fixedDamage: options.fixedDamage,
        });
        if (critical) {
            emitGameEvent(GameEventIds.CRITICAL_HIT, {
                actor: this,
                subject: target,
                data: {
                    damageType: type,
                    finalDamage: damageResult.finalDamage,
                },
            });
        }
        if (damageResult.finalDamage > 0 && (options.triggerMainHandHitEffects ?? type === 'physical')) {
            const weapon = this.equipment.getEquipped(EquipSlotType.MAIN_HAND.key);
            try {
                weapon?.data?.onBasicAttackHit?.({ attacker: this, target, weapon, result: damageResult });
            } catch (error) {
                logger.error(`아이템 공격 적중 효과 실패: ${weapon?.itemDataId ?? 'unknown'}`, error);
            }
        }
        // 즉시 피해를 적용하는 물리 직접 공격은 근접 공격으로 취급한다.
        this.commitAttack(options.consumeMainHandDurability ?? type === 'physical');
        const { finalDamage, effectModifier } = damageResult;
        const effectLabel = effectModifier === 0
            ? '효과 없음! '
            : effectModifier !== 1 ? `상성 x${effectModifier}! ` : '';

        const lifeRatio = target.maxLife > 0 ? Math.max(0, target.life) / target.maxLife : 0;
        const pct = Math.floor(lifeRatio * 100);
        const shieldSegments = target.getShieldBarSegments();
        const absorbedLabel = damageResult.absorbedDamage > 0
            ? ` (보호막 ${damageResult.absorbedDamage.toFixed(1)} 흡수)`
            : '';

        const attackerUid = this.playerUserId;
        const targetUid = target.playerUserId;

        // 플레이어가 직접 또는 소유한 엔티티를 통해 관여한 전투 알림
        if (attackerUid !== undefined || targetUid !== undefined) {
            const userIds = new Set<number>();
            if (attackerUid !== undefined) userIds.add(attackerUid);
            if (targetUid !== undefined) userIds.add(targetUid);

            const notification = {
                key: 'attack',
                message: chat()
                    .text(`${critical ? '치명타! ' : ''}${effectLabel}${this.name}이(가) ${target.name}에게 ${finalDamage.toFixed(1)} 피해를 입혔습니다.${absorbedLabel}\n`)
                    .health({ life: target.life, maxLife: target.maxLife, shields: shieldSegments, length: 150, color: attackerUid !== undefined ? '$enemy' : '$life', thickness: 6 })
                    .text(` ${pct}%`)
                    .build(),
            };

            const nodes = chat()
                .color(effectModifier === 0 ? 'gray' : critical ? 'gold' : 'orange', b => b.text(
                    damageResult.fixedDamage ? '[고정 피해] ' : effectModifier === 0 ? '[면역] ' : critical ? '[치명타] ' : effectModifier > 1 ? '[상성 우세] ' : effectModifier < 1 ? '[상성 저항] ' : '[공격] '
                ))
                .text(`${this.name}이(가) ${target.name}에게 `)
                .color('red', b => b.text(finalDamage.toFixed(1)))
                .text(` 피해${absorbedLabel}\n`)
                .health({ life: target.life, maxLife: target.maxLife, shields: shieldSegments, length: 150, color: attackerUid !== undefined ? '$enemy' : '$life', thickness: 6 })
                .text(` ${pct}%`)
                .build();

            for (const userId of userIds) {
                sendNotificationToUser(userId, notification);
                sendBotMessageToUser(userId, nodes);
            }
        }

        return damageResult;
    }

    private notifyEvadedAttack(target: Entity, evasionChance: number): void {
        const attackerUid = this.playerUserId;
        const targetUid = target.playerUserId;
        if (attackerUid === undefined && targetUid === undefined) return;

        const message = `${target.name}이(가) ${this.name}의 공격을 회피했습니다!`;
        const nodes = chat()
            .tooltip(`${(evasionChance * 100).toFixed(1)}% 회피 확률`, b => b
                .color('cyan', b2 => b2.text('[회피] '))
                .text(message))
            .build();
        const userIds = new Set<number>();
        if (attackerUid !== undefined) userIds.add(attackerUid);
        if (targetUid !== undefined) userIds.add(targetUid);
        for (const userId of userIds) {
            sendNotificationToUser(userId, { key: 'attack-evaded', message });
            sendBotMessageToUser(userId, nodes);
        }
    }

    // -- 게임 루프 라이프사이클 --

    earlyUpdate(dt: number): void {
        this.tickActionDisableSources.clear();
        this.updateShields(dt);
        this.earlyUpdateStatusEffects(dt);
        this.updateStatusEffects(dt);
        this.clampVitals();

        if (this._attackCooldown > 0) {
            this._attackCooldown = Math.max(0, this._attackCooldown - dt);
        }

        if (!this.isDefeated && this.life < this.maxLife) {
            this.heal(dt * Math.max(0, this.attribute.get(AttributeType.LIFE_REGEN)));
        }
        if (!this.isDefeated && this.mentality < this.maxMentality) {
            this.restoreMentality(dt * Math.max(0, this.attribute.get(AttributeType.MENTALITY_REGEN)));
        }

        if (this.isDead && this.deathTimer > 0) {
            this.deathTimer -= dt;

            if (this.deathTimer <= 0) {
                this.respawn();
            }
        }
    }

    private earlyUpdateStatusEffects(dt: number): void {
        if (this.isDefeated) return;
        for (const effect of [...this.statusEffects.values()]) {
            if (this.statusEffects.get(effect.type.id) !== effect) continue;
            try {
                if (effect.earlyUpdate(this, dt) === 'remove') {
                    this.removeStatusEffect(effect.type, StatusEffectRemovalReason.INVALID_TARGET);
                }
            } catch (error) {
                logger.error(`StatusEffect earlyUpdate 실패: ${effect.type.id}/${this.name}`, error);
                this.removeStatusEffect(effect.type, StatusEffectRemovalReason.ERROR);
            }
        }
    }

    update(_dt: number): void {}

    lateUpdate(_dt: number): void {
        if (this.life <= 0 && !this.isDead) {
            this.onDeath();
        }
    }

    /** 사망 후 리스폰까지 걸리는 시간 (초). 하위 클래스에서 오버라이드 */
    get deathDuration(): number { return 10; }

    onDeath(): void {
        this.life = 0;
        this.isDead = true;
        this.deathTimer = this.deathDuration;
        emitGameEvent(GameEventIds.ENTITY_DEFEATED, {
            actor: this.lastDamageCause?.causeEntity ?? undefined,
            subject: this,
            data: { causeType: this.lastDamageCause?.type ?? 'unknown' },
        });
        this.clearStatusEffects(StatusEffectRemovalReason.TARGET_DEFEATED);
        this.clearShields();
    }

    respawn(): void {
        this.isDead = false;
        this.deathTimer = 0;
        this.life = this.maxLife;
        this.hungry = this.maxHungry;
        this.thirsty = this.maxThirsty;
        this.currentTarget = null;
        this.lastDamageCause = null;
    }
}

function addActionDisableSource(
    registry: Map<string, Set<string>>,
    action: ActionType,
    source: string,
): void {
    const normalizedSource = source.trim();
    if (!normalizedSource) throw new Error('Action disable source must not be empty');
    const sources = registry.get(action.key) ?? new Set<string>();
    sources.add(normalizedSource);
    registry.set(action.key, sources);
}

function removeActionDisableSource(
    registry: Map<string, Set<string>>,
    action: ActionType,
    source: string,
): boolean {
    const sources = registry.get(action.key);
    if (!sources?.delete(source.trim())) return false;
    if (sources.size === 0) registry.delete(action.key);
    return true;
}

function clearActionDisableSource(registry: Map<string, Set<string>>, source: string): boolean {
    const normalizedSource = source.trim();
    let changed = false;
    for (const [actionKey, sources] of registry) {
        if (!sources.delete(normalizedSource)) continue;
        changed = true;
        if (sources.size === 0) registry.delete(actionKey);
    }
    return changed;
}
