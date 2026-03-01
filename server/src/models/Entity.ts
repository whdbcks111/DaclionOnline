import Attribute from "./Attribute.js";
import type { AttributeRecord } from "./Attribute.js";
import Equipment from "./Equipment.js";
import Stat from "./Stat.js";
import type { StatRecord } from "./Stat.js";
import { broadcastNotification, sendBotMessageToUser, sendNotificationFiltered } from "../modules/message.js";
import { chat } from "../utils/chatBuilder.js";
import { getPlayerByUserId } from "../modules/player.js";

/** 대미지 타입 */
export type DamageType = 'physical' | 'magic' | 'absolute';

/** 대미지 결과 */
export interface DamageResult {
    type: DamageType;
    rawAmount: number;
    finalDamage: number;
    remainingLife: number;
}

export type DamageCauseType = 'void' | 'attack' | 'thirsty' | 'starvation' | 'fire' | 'poison' | 'suffocation'

export interface DamageCause {
    type: DamageCauseType;
    causeEntity: Entity | null;
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

export default abstract class Entity {
    readonly attribute: Attribute;
    readonly equipment: Equipment;
    readonly stat: Stat;

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
    ) {
        this._level = level;
        this._exp = exp;
        this._locationId = locationId;
        this.attribute = new Attribute(baseAttribute);
        this.equipment = equipment;
        this.stat = new Stat(statPoints);

        // modifier 적용: 스탯 → 장비 순서
        this.stat.applyModifiers(this.attribute);
        this.equipment.applyModifiers(this.attribute);

        // 현재 생명력/정신력은 최대치로 초기화
        this._life = this.attribute.get('maxLife');
        this._mentality = this.attribute.get('maxMentality');
        this._thirsty = this.attribute.get('maxThirsty');
        this._hungry = this.attribute.get('maxHungry');
    }

    // -- Getters / Setters --

    abstract get name(): string;

    /** 이 엔티티가 플레이어인지 여부 (Player에서 override) */
    get isPlayer(): boolean { return false; }

    /** 플레이어 userId (Player에서 override, 비플레이어는 undefined) */
    get playerUserId(): number | undefined { return undefined; }

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

    get maxLife() { return this.attribute.get('maxLife'); }
    get maxMentality() { return this.attribute.get('maxMentality'); }

    get thirsty() { return this._thirsty; }
    set thirsty(val: number) { this._thirsty = val; }

    get hungry() { return this._hungry; }
    set hungry(val: number) { this._hungry = val; }

    get maxThirsty() { return this.attribute.get('maxThirsty'); }
    get maxHungry() { return this.attribute.get('maxHungry'); }

    // -- 전투 --

    damage(rawAmount: number, type: DamageType = 'physical', cause: DamageCause | null = null): DamageResult {

        let defense = 0;
        let penetration = 0;

        if(type === 'physical') {
            defense = this.attribute.get('def');
            penetration = this.attribute.get('armorPen');
        }
        else if(type === 'magic') {
            defense = this.attribute.get('magicDef');
            penetration = this.attribute.get('magicPen');
        }

        const effectiveDefense = Math.max(0, defense - penetration);
        const finalDamage = Math.max(0, rawAmount - effectiveDefense);

        // Life 차감
        this.life = this.life - finalDamage;
        const remainingLife = this.life;

        if(cause) this.lastDamageCause = cause;

        return { type, rawAmount, finalDamage, remainingLife };
    }

    get attackCooldown(): number { return this._attackCooldown; }
    get maxAttackCooldown(): number { return this._maxAttackCooldown; }

    /** 대상 엔티티를 공격 */
    attack(target: Entity, type: DamageType = 'physical', amount?: number): DamageResult | null {
        if (this.isDead) return null;

        if (target.isDead) {
            if (this.isPlayer && this.playerUserId) {
                sendBotMessageToUser(this.playerUserId, '죽은 대상은 공격할 수 없습니다.');
            }
            return null;
        }

        if (this._attackCooldown > 0) {
            if(this.isPlayer && this.playerUserId) {
                sendBotMessageToUser(this.playerUserId, `아직 공격할 수 없습니다. (${this.attackCooldown.toFixed(1)}초 후 가능)`);
            }
            return null;
        }

        // 기본 공격력: 물리 → atk, 마법 → magicForce
        const rawAmount = amount ?? (type === 'physical'
            ? this.attribute.get('atk')
            : this.attribute.get('magicForce'));

        const damageResult = target.damage(rawAmount, type, { type: 'attack', causeEntity: this });
        const { finalDamage } = damageResult;

        // 공격 쿨다운 설정
        const attackSpeed = this.attribute.get('attackSpeed');
        this._maxAttackCooldown = 1 / Math.max(0.01, attackSpeed);
        this._attackCooldown = this._maxAttackCooldown;

        const lifeRatio = target.maxLife > 0 ? Math.max(0, target.life) / target.maxLife : 0;
        const pct = Math.floor(lifeRatio * 100);

        // 플레이어 관련 알림 + 채팅 메시지
        if (this.isPlayer || target.isPlayer) {
            const locId = this.locationId;
            sendNotificationFiltered(userId => {
                const p = getPlayerByUserId(userId);
                return p?.locationId === locId;
            }, {
                key: 'attack',
                message: chat()
                    .text(`${this.name}이(가) ${target.name}에게 ${finalDamage.toFixed(1)} 피해를 입혔습니다.\n`)
                    .progress({ value: lifeRatio, length: 150, color: this.isPlayer ? '$enemy' : '$life', thickness: 6 })
                    .text(` ${pct}%`)
                    .build(),
            });

            const nodes = chat()
                .color('orange', b => b.text('[공격] '))
                .text(`${this.name}이(가) ${target.name}에게 `)
                .color('red', b => b.text(finalDamage.toFixed(1)))
                .text(' 피해\n')
                .progress({ value: lifeRatio, length: 150, color: this.isPlayer ? '$enemy' : '$life', thickness: 6 })
                .text(` ${pct}%`)
                .build();

            const uids = new Set<number>();
            const attackerUid = this.playerUserId;
            const targetUid = target.playerUserId;
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

        if(this.isDead && this.deathTimer > 0) {
            this.deathTimer -= dt;

            if(this.deathTimer <= 0) {
                this.respawn();
            }
        }
    }
    update(dt: number): void {}
    lateUpdate(dt: number): void {

        if(this.life <= 0 && !this.isDead) {
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
