import Attribute from "./Attribute.js";
import type { AttributeRecord } from "./Attribute.js";
import Equipment from "./Equipment.js";
import Stat from "./Stat.js";
import type { StatRecord } from "./Stat.js";
import { broadcastNotification } from "../modules/message.js";

/** 공격 타입 */
export type AttackType = 'physical' | 'magic';

/** 공격 결과 */
export interface AttackResult {
    type: AttackType;
    rawAmount: number;
    finalDamage: number;
    remainingLife: number;
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

    // -- 전투 --

    /** 대상 엔티티를 공격 */
    attack(target: Entity, type: AttackType = 'physical', amount?: number): AttackResult {
        // 기본 공격력: 물리 → atk, 마법 → magicForce
        const rawAmount = amount ?? (type === 'physical'
            ? this.attribute.get('atk')
            : this.attribute.get('magicForce'));

        // 방어/저항 및 관통
        const defense = type === 'physical'
            ? target.attribute.get('def')
            : target.attribute.get('magicDef');
        const penetration = type === 'physical'
            ? this.attribute.get('armorPen')
            : this.attribute.get('magicPen');

        const effectiveDefense = clamp(defense - penetration, 0, 1);
        const finalDamage = Math.max(0, rawAmount * (1 - effectiveDefense));

        // Life 차감
        target.life = Math.max(0, target.life - finalDamage);
        const remainingLife = target.life;

        // 플레이어 관련 알림
        if (this.isPlayer || target.isPlayer) {
            broadcastNotification({
                key: 'attack',
                message: `${this.name}이(가) ${target.name}에게 ${finalDamage.toFixed(1)} 피해를 입혔습니다. (남은 Life: ${remainingLife.toFixed(1)})`,
            });
        }

        return { type, rawAmount, finalDamage, remainingLife };
    }

    // -- 게임 루프 라이프사이클 --

    earlyUpdate(dt: number): void {}
    update(dt: number): void {}
    lateUpdate(dt: number): void {}
}
