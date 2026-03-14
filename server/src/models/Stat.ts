import type Entity from "./Entity.js"

// ── StatType 클래스 열거형 ──

/** 스탯 → 능력치 변환 함수. entity의 attribute에 직접 접근해 modifier를 추가함 */
export type StatModifyFn = (entity: Entity, points: number, source: string) => void

/** 스탯 종류 — Java 클래스 열거형 패턴 */
export class StatType {
    /** @internal 자기 등록용 레지스트리. 인스턴스 선언보다 먼저 초기화되어야 함 */
    private static _all: StatType[] = []

    static readonly STRENGTH = new StatType('strength', '근력', (entity, points, source) => {
        entity.attribute.addModifier({ attribute: 'atk', op: 'add', value: 2 * points, source })
    })

    static readonly AGILITY = new StatType('agility', '민첩', (entity, points, source) => {
        entity.attribute.addModifier({ attribute: 'speed', op: 'add', value: 0.05 * points, source })
        entity.attribute.addModifier({ attribute: 'attackSpeed', op: 'add', value: 0.01 * points, source })
    })

    static readonly VITALITY = new StatType('vitality', '체력', (entity, points, source) => {
        entity.attribute.addModifier({ attribute: 'maxLife', op: 'add', value: 10 * points, source })
        entity.attribute.addModifier({ attribute: 'def', op: 'add', value: 1 * points, source })
    })

    static readonly SENSIBILITY = new StatType('sensibility', '감각', (entity, points, source) => {
        entity.attribute.addModifier({ attribute: 'critRate', op: 'add', value: 0.001 * points, source })
        entity.attribute.addModifier({ attribute: 'critDmg', op: 'add', value: 0.01 * points, source })
    })

    static readonly MENTALITY = new StatType('mentality', '정신력', (entity, points, source) => {
        entity.attribute.addModifier({ attribute: 'maxMentality', op: 'add', value: 5 * points, source })
        entity.attribute.addModifier({ attribute: 'magicForce', op: 'add', value: 2 * points, source })
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
    applyModifiers(entity: Entity): void {
        for (const stat of StatType.values()) {
            entity.attribute.removeBySource(`stat:${stat.key}`)
        }

        for (const stat of StatType.values()) {
            const points = this._points[stat.key]
            if (points <= 0) continue

            stat.modify(entity, points, `stat:${stat.key}`)
        }
    }
}
