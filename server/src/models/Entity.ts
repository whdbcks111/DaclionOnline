import Attribute, { AttributeType } from "./Attribute.js";
import type { AttributeRecord } from "./Attribute.js";
import Equipment, { EquipSlotType } from "./Equipment.js";
import Stat from "./Stat.js";
import type { StatRecord } from "./Stat.js";
import { sendBotMessageToUser, sendNotificationFiltered, sendNotificationToUser } from "../modules/message.js";
import { chat } from "../utils/chatBuilder.js";
import { isOnlinePlayerAtLocation } from "../modules/playerRegistry.js";
import { applyCritical, calculateFinalDamage } from "./Combat.js";
import { applyTagEffectValue } from "./TagEffect.js";
import { TagCollection } from "../../../shared/tags.js";
import type { TagId, TagReadable } from "../../../shared/tags.js";
import type Player from "./Player.js";

/** 대미지 타입 */
export type DamageType = 'physical' | 'magic' | 'absolute';

/** 대미지 결과 */
export interface DamageResult {
    type: DamageType;
    rawAmount: number;
    modifiedAmount: number;
    finalDamage: number;
    remainingLife: number;
    critical: boolean;
    effectModifier: number;
    effectSourceTag?: TagId;
    effectTargetTag?: TagId;
}

export type DamageCauseType = 'void' | 'attack' | 'thirsty' | 'starvation' | 'fire' | 'poison' | 'suffocation'

export interface DamageCause {
    type: DamageCauseType;
    causeEntity: Entity | null;
    critical?: boolean;
}

export default abstract class Entity implements TagReadable {
    readonly attribute: Attribute;
    readonly equipment: Equipment;
    readonly stat: Stat;
    readonly tags: TagCollection;

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
    getAttackDeniedReason(_attacker: Entity): string | undefined { return undefined; }

    get level() { return this._level; }
    set level(val: number) { this._level = val; }

    get exp() { return this._exp; }
    set exp(val: number) { this._exp = val; }

    get locationId() { return this._locationId; }
    set locationId(val: string) { this._locationId = val; }

    get maxExp() { return Entity.getMaxExpOfLevel(this._level); }

    static getMaxExpOfLevel(level: number): number {
        return Math.max(1, level * 100);
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

    /** 엔티티 본체와 장착 아이템 태그를 합친 유효 태그 조회 */
    hasTag(tag: TagId): boolean {
        return this.tags.hasTag(tag) || this.equipment.hasTag(tag);
    }

    getTags(): TagId[] {
        return [...new Set([...this.tags.values(), ...this.equipment.getTags()])].sort();
    }

    /** 공격 효과: 본체 태그 + 무기 태그 */
    hasEffectSourceTag(tag: TagId): boolean {
        return this.tags.hasTag(tag) || this.equipment.hasEffectSourceTag(tag);
    }

    /** 피격 효과: 본체의 정의·영속·런타임 태그만 사용한다. */
    hasEffectTargetTag(tag: TagId): boolean {
        return this.tags.hasTag(tag);
    }

    protected onPersistentTagsChanged(): void {}

    // -- 전투 --

    damage(rawAmount: number, type: DamageType = 'physical', cause: DamageCause | null = null): DamageResult {
        let defense = 0;
        let penetration = 0;
        const attacker = cause?.type === 'attack' ? cause.causeEntity : null;
        const effect = attacker
            ? applyTagEffectValue(rawAmount, attacker, this)
            : { value: rawAmount, modifier: 1, sourceTag: '', targetTag: '', effective: true };

        if (type === 'physical') {
            defense    = this.attribute.get(AttributeType.DEF);
            penetration = attacker?.attribute.get(AttributeType.ARMOR_PEN) ?? 0;
        } else if (type === 'magic') {
            defense    = this.attribute.get(AttributeType.MAGIC_DEF);
            penetration = attacker?.attribute.get(AttributeType.MAGIC_PEN) ?? 0;
        }

        const finalDamage = calculateFinalDamage(effect.value, defense, penetration);

        this.life = this.life - finalDamage;
        const remainingLife = this.life;

        if (cause) this.lastDamageCause = cause;

        return {
            type,
            rawAmount,
            modifiedAmount: effect.value,
            finalDamage,
            remainingLife,
            critical: cause?.critical === true,
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
            this.equipment.decreaseItemDurability(EquipSlotType.MAIN_HAND.key, 0, 1);
        }
    }

    /** 대상 엔티티를 직접 공격 */
    attack(target: Entity, type: DamageType = 'physical', amount?: number): DamageResult | null {
        if (!this.canAttack(target)) return null;

        // 기본 공격력: 물리 → atk, 마법 → magicForce
        const baseAmount = amount ?? (type === 'physical'
            ? this.attribute.get(AttributeType.ATK)
            : this.attribute.get(AttributeType.MAGIC_FORCE));
        const { rawAmount, critical } = applyCritical(
            baseAmount,
            this.attribute.get(AttributeType.CRIT_RATE),
            this.attribute.get(AttributeType.CRIT_DMG),
        );

        const damageResult = target.damage(rawAmount, type, { type: 'attack', causeEntity: this, critical });
        // 즉시 피해를 적용하는 물리 직접 공격은 근접 공격으로 취급한다.
        this.commitAttack(type === 'physical');
        const { finalDamage, effectModifier } = damageResult;
        const effectLabel = effectModifier === 0
            ? '효과 없음! '
            : effectModifier !== 1 ? `상성 x${effectModifier}! ` : '';

        const lifeRatio = target.maxLife > 0 ? Math.max(0, target.life) / target.maxLife : 0;
        const pct = Math.floor(lifeRatio * 100);

        const attackerUid = this.playerUserId;
        const targetUid = target.playerUserId;

        // 플레이어가 직접 또는 소유한 엔티티를 통해 관여한 전투 알림
        if (attackerUid !== undefined || targetUid !== undefined) {
            const locId = this.locationId;
            sendNotificationFiltered(userId => isOnlinePlayerAtLocation(userId, locId), {
                key: 'attack',
                message: chat()
                    .text(`${critical ? '치명타! ' : ''}${effectLabel}${this.name}이(가) ${target.name}에게 ${finalDamage.toFixed(1)} 피해를 입혔습니다.\n`)
                    .progress({ value: lifeRatio, length: 150, color: attackerUid !== undefined ? '$enemy' : '$life', thickness: 6 })
                    .text(` ${pct}%`)
                    .build(),
            });

            const nodes = chat()
                .color(effectModifier === 0 ? 'gray' : critical ? 'gold' : 'orange', b => b.text(
                    effectModifier === 0 ? '[면역] ' : critical ? '[치명타] ' : effectModifier > 1 ? '[상성 우세] ' : effectModifier < 1 ? '[상성 저항] ' : '[공격] '
                ))
                .text(`${this.name}이(가) ${target.name}에게 `)
                .color('red', b => b.text(finalDamage.toFixed(1)))
                .text(' 피해\n')
                .progress({ value: lifeRatio, length: 150, color: attackerUid !== undefined ? '$enemy' : '$life', thickness: 6 })
                .text(` ${pct}%`)
                .build();

            const uids = new Set<number>();
            if (attackerUid !== undefined) uids.add(attackerUid);
            if (targetUid !== undefined) uids.add(targetUid);
            for (const uid of uids) {
                sendBotMessageToUser(uid, nodes);
            }
        }

        return damageResult;
    }

    // -- 게임 루프 라이프사이클 --

    earlyUpdate(dt: number): void {
        if (this._attackCooldown > 0) {
            this._attackCooldown = Math.max(0, this._attackCooldown - dt);
        }

        if (!this.isDead && this.life < this.maxLife) {
            this.life += dt * 1; // TODO: change value
        }

        if (this.isDead && this.deathTimer > 0) {
            this.deathTimer -= dt;

            if (this.deathTimer <= 0) {
                this.respawn();
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
    }

    respawn(): void {
        this.isDead = false;
        this.deathTimer = 0;
        this.life = this.maxLife;
        this.currentTarget = null;
        this.lastDamageCause = null;
    }
}
