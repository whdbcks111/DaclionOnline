import Attribute from "./Attribute.js";
import type { AttributeRecord } from "./Attribute.js";
import Equipment from "./Equipment.js";
import Stat from "./Stat.js";
import type { StatRecord } from "./Stat.js";
import { broadcastNotification } from "../modules/message.js";

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
        this.life = Math.max(0, this.life - finalDamage);
        const remainingLife = this.life;

        return { type, rawAmount, finalDamage, remainingLife };
    }

    /** 대상 엔티티를 공격 */
    attack(target: Entity, type: DamageType = 'physical', amount?: number): DamageResult {
        // 기본 공격력: 물리 → atk, 마법 → magicForce
        const rawAmount = amount ?? (type === 'physical'
            ? this.attribute.get('atk')
            : this.attribute.get('magicForce'));

        const damageResult = target.damage(rawAmount, type, { type: 'attack', causeEntity: this });
        const { finalDamage, remainingLife } = damageResult;

        // 플레이어 관련 알림
        if (this.isPlayer || target.isPlayer) {
            broadcastNotification({
                key: 'attack',
                message: `${this.name}이(가) ${target.name}에게 ${finalDamage.toFixed(1)} 피해를 입혔습니다. (남은 Life: ${remainingLife.toFixed(1)})`,
            });
        }

        return damageResult;
    }

    // -- 게임 루프 라이프사이클 --

    earlyUpdate(dt: number): void {}
    update(dt: number): void {}
    lateUpdate(dt: number): void {}
}
