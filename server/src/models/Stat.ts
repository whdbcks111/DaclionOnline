import type Attribute from "./Attribute.js";
import type { AttributeType, ModifierOp } from "./Attribute.js";

/** 스탯 종류 */
export type StatType = 'strength' | 'agility' | 'vitality' | 'sensibility' | 'mentality';

/** 모든 스탯 종류 목록 */
export const STAT_TYPES: StatType[] = ['strength', 'agility', 'vitality', 'sensibility', 'mentality'];

/** 스탯 레코드 */
export type StatRecord = Record<StatType, number>;

/** 스탯 1포인트당 능력치 변환 테이블 */
const STAT_CONVERSION: Record<StatType, { attribute: AttributeType; op: ModifierOp; value: number }[]> = {
    strength:    [{ attribute: 'atk', op: 'add', value: 2 }],
    agility:     [{ attribute: 'speed', op: 'add', value: 0.05 }, { attribute: 'attackSpeed', op: 'add', value: 0.01 }],
    vitality:    [{ attribute: 'maxLife', op: 'add', value: 10 }, { attribute: 'def', op: 'add', value: 1 }],
    sensibility: [{ attribute: 'critRate', op: 'add', value: 0.001 }, { attribute: 'critDmg', op: 'add', value: 0.01 }],
    mentality:   [{ attribute: 'maxMentality', op: 'add', value: 5 }, { attribute: 'magicForce', op: 'add', value: 2 }],
};

function createStatRecord(defaultValue = 0): StatRecord {
    const record = {} as StatRecord;
    for (const type of STAT_TYPES) {
        record[type] = defaultValue;
    }
    return record;
}

export default class Stat {
    private _points: StatRecord;

    constructor(initial?: Partial<StatRecord>) {
        this._points = { ...createStatRecord(), ...initial };
    }

    /** 특정 스탯 포인트 조회 */
    get(stat: StatType): number {
        return this._points[stat];
    }

    /** 특정 스탯 포인트 설정 */
    set(stat: StatType, value: number): void {
        this._points[stat] = value;
    }

    /** 스탯 포인트 증가 */
    add(stat: StatType, amount: number): void {
        this._points[stat] += amount;
    }

    /** 전체 스탯 레코드 반환 */
    get points(): Readonly<StatRecord> {
        return this._points;
    }

    /** 스탯 기반 modifier를 attribute에 적용 (기존 stat modifier 제거 후 재적용) */
    applyModifiers(attribute: Attribute): void {
        // 기존 스탯 modifier 전부 제거
        for (const statType of STAT_TYPES) {
            attribute.removeBySource(`stat:${statType}`);
        }

        // 현재 스탯에 따라 modifier 추가
        for (const statType of STAT_TYPES) {
            const points = this._points[statType];
            if (points <= 0) continue;

            const conversions = STAT_CONVERSION[statType];
            for (const conv of conversions) {
                attribute.addModifier({
                    attribute: conv.attribute,
                    op: conv.op,
                    value: conv.value * points,
                    source: `stat:${statType}`,
                });
            }
        }
    }
}
