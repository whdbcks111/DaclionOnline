import type Attribute from "./Attribute.js"
import type { AttributeKey, ModifierOp } from "./Attribute.js"
import type Entity from "./Entity.js"

// ── StatType 클래스 열거형 ──

/** 스탯 modifier 추가 헬퍼 (source는 내부에서 자동 설정됨) */
export type StatAddMod = (attribute: AttributeKey, op: ModifierOp, value: number) => void

/** 스탯 → 능력치 변환 함수. add로 modifier를 추가하고 points로 투자 포인트를 받음 */
export type StatModifyFn = (add: StatAddMod, points: number, entity: Entity) => void

/** 스탯 종류 — Java 클래스 열거형 패턴 */
export class StatType {
    /** @internal 자기 등록용 레지스트리. 인스턴스 선언보다 먼저 초기화되어야 함 */
    private static _all: StatType[] = []

    static readonly STRENGTH = new StatType('strength', '근력', (add, points, _entity) => {
        add('atk', 'add', 2 * points)
    })

    static readonly AGILITY = new StatType('agility', '민첩', (add, points, _entity) => {
        add('speed', 'add', 0.05 * points)
        add('attackSpeed', 'add', 0.01 * points)
    })

    static readonly VITALITY = new StatType('vitality', '체력', (add, points, _entity) => {
        add('maxLife', 'add', 10 * points)
        add('def', 'add', 1 * points)
    })

    static readonly SENSIBILITY = new StatType('sensibility', '감각', (add, points, _entity) => {
        add('critRate', 'add', 0.001 * points)
        add('critDmg', 'add', 0.01 * points)
    })

    static readonly MENTALITY = new StatType('mentality', '정신력', (add, points, _entity) => {
        add('maxMentality', 'add', 5 * points)
        add('magicForce', 'add', 2 * points)
    })

    readonly key: StatKey
    readonly label: string
    readonly modify: StatModifyFn

    private constructor(key: StatKey, label: string, modify: StatModifyFn) {
        this.key = key
        this.label = label
        this.modify = modify
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
    applyModifiers(attribute: Attribute, entity: Entity): void {
        for (const stat of StatType.values()) {
            attribute.removeBySource(`stat:${stat.key}`)
        }

        for (const stat of StatType.values()) {
            const points = this._points[stat.key]
            if (points <= 0) continue

            const source = `stat:${stat.key}`
            const add: StatAddMod = (attr, op, value) => {
                attribute.addModifier({ attribute: attr, op, value, source })
            }
            stat.modify(add, points, entity)
        }
    }
}
