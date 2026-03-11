import type Attribute from "./Attribute.js"
import type { AttributeKey, ModifierOp } from "./Attribute.js"

// ── StatType 클래스 열거형 ──

interface StatConversion {
    attribute: AttributeKey
    op: ModifierOp
    value: number
}

/** 스탯 종류 — Java 클래스 열거형 패턴 */
export class StatType {
    /** @internal 자기 등록용 레지스트리. 인스턴스 선언보다 먼저 초기화되어야 함 */
    private static _all: StatType[] = []

    static readonly STRENGTH    = new StatType('strength',    '근력',   [{ attribute: 'atk', op: 'add', value: 2 }])
    static readonly AGILITY     = new StatType('agility',     '민첩',   [{ attribute: 'speed', op: 'add', value: 0.05 }, { attribute: 'attackSpeed', op: 'add', value: 0.01 }])
    static readonly VITALITY    = new StatType('vitality',    '체력',   [{ attribute: 'maxLife', op: 'add', value: 10 }, { attribute: 'def', op: 'add', value: 1 }])
    static readonly SENSIBILITY = new StatType('sensibility', '감각',   [{ attribute: 'critRate', op: 'add', value: 0.001 }, { attribute: 'critDmg', op: 'add', value: 0.01 }])
    static readonly MENTALITY   = new StatType('mentality',   '정신력', [{ attribute: 'maxMentality', op: 'add', value: 5 }, { attribute: 'magicForce', op: 'add', value: 2 }])

    readonly key: StatKey
    readonly label: string
    readonly conversions: ReadonlyArray<StatConversion>

    private constructor(key: StatKey, label: string, conversions: StatConversion[]) {
        this.key = key
        this.label = label
        this.conversions = conversions
        StatType._all.push(this)
    }

    /** 모든 StatType 목록 */
    static values(): readonly StatType[] { return StatType._all }

    /** key 문자열로 조회 */
    static fromKey(key: string): StatType | undefined {
        return StatType._all.find(s => s.key === key)
    }

    /** key 또는 label로 조회 (커맨드 입력 파싱용) */
    static fromInput(input: string): StatType | undefined {
        const lower = input.toLowerCase()
        return StatType._all.find(s => s.key === lower || s.label === input)
    }

    toString(): string { return this.key }
}

// ── 내부 타입 ──

/** 스탯 키 문자열 (StatRecord, DB 저장에 사용) */
export type StatKey = 'strength' | 'agility' | 'vitality' | 'sensibility' | 'mentality'

/** 스탯 레코드 */
export type StatRecord = Record<StatKey, number>

// ── Stat 클래스 ──

function createStatRecord(defaultValue = 0): StatRecord {
    const record = {} as StatRecord
    for (const type of StatType.values()) {
        record[type.key] = defaultValue
    }
    return record
}

export default class Stat {
    private _points: StatRecord
    private _dirty = false

    constructor(initial?: Partial<StatRecord>) {
        this._points = { ...createStatRecord(), ...initial }
    }

    get dirty(): boolean { return this._dirty }
    resetDirty(): void { this._dirty = false }

    /** 특정 스탯 포인트 조회 */
    get(stat: StatType): number {
        return this._points[stat.key]
    }

    /** 특정 스탯 포인트 설정 */
    set(stat: StatType, value: number): void {
        this._points[stat.key] = value
        this._dirty = true
    }

    /** 스탯 포인트 증가 */
    add(stat: StatType, amount: number): void {
        this._points[stat.key] += amount
        this._dirty = true
    }

    /** 전체 스탯 레코드 반환 */
    get points(): Readonly<StatRecord> {
        return this._points
    }

    /** 스탯 기반 modifier를 attribute에 적용 (기존 stat modifier 제거 후 재적용) */
    applyModifiers(attribute: Attribute): void {
        for (const stat of StatType.values()) {
            attribute.removeBySource(`stat:${stat.key}`)
        }

        for (const stat of StatType.values()) {
            const points = this._points[stat.key]
            if (points <= 0) continue

            for (const conv of stat.conversions) {
                attribute.addModifier({
                    attribute: conv.attribute,
                    op: conv.op,
                    value: conv.value * points,
                    source: `stat:${stat.key}`,
                })
            }
        }
    }
}
