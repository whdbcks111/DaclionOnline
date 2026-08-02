import type Attribute from './Attribute.js'

interface AttributeOwner { attribute: Attribute }

/** 감각에서 파생되는 치명타율 기여 상한. 장비·스킬·기본 치명타율에는 적용하지 않는다. */
export const SENSIBILITY_CRIT_RATE_CAP = 0.5
/** 0 근처에서 기존 1포인트당 0.1%p 기울기를 유지하는 지수 포화 척도. */
export const SENSIBILITY_CRIT_RATE_SCALE = SENSIBILITY_CRIT_RATE_CAP / 0.001
/** 정신력 스탯 1포인트가 제공하는 최대 정신력. */
export const MENTALITY_MAX_MENTALITY_PER_POINT = 5.25
/** 정신력 스탯 1포인트가 제공하는 마법 저항력. */
export const MENTALITY_MAGIC_DEF_PER_POINT = 0.5
/** 낮은 구간에서 체력 1포인트가 제공하는 초당 생명력 재생량. */
export const VITALITY_LIFE_REGEN_PER_POINT = 0.025
/** 낮은 구간에서 정신력 1포인트가 제공하는 초당 정신력 재생량. */
export const MENTALITY_REGEN_PER_POINT = 0.0125
/** 재생 기여 효율이 완만하게 감소하기 시작하는 공통 스탯 척도. */
export const STAT_REGEN_DIMINISHING_SCALE = 2_000
/** 생명력·정신력 재생이 기존 점감분을 다시 회복하기 시작하는 스탯 수치. */
export const STAT_REGEN_RECOVERY_START = 300
/** 고스탯 재생 효율 회복의 부드러움을 결정하는 가우스 곡선 척도. */
export const STAT_REGEN_RECOVERY_SCALE = 600

/** 감각이 높아질수록 한 포인트의 효율이 감소하며 50%p에 점근하는 치명타율 기여분. */
export function calculateSensibilityCritRateBonus(points: number): number {
    if (points === Number.POSITIVE_INFINITY) return SENSIBILITY_CRIT_RATE_CAP
    if (!Number.isFinite(points) || points <= 0) return 0
    return SENSIBILITY_CRIT_RATE_CAP * (1 - Math.exp(-points / SENSIBILITY_CRIT_RATE_SCALE))
}

function calculateDiminishingStatBonus(points: number, perPoint: number): number {
    if (!Number.isFinite(points) || points <= 0) return 0
    return perPoint * points / (1 + points / STAT_REGEN_DIMINISHING_SCALE)
}

/** 낮은 구간의 점감 기울기를 유지하고 300 이후 선형값과의 차이를 부드럽게 회복한다. */
function calculateRecoveredStatRegenBonus(points: number, perPoint: number): number {
    if (!Number.isFinite(points) || points <= 0) return 0
    const linearBonus = perPoint * points
    const diminishedBonus = calculateDiminishingStatBonus(points, perPoint)
    const recoveryDistance = Math.max(0, points - STAT_REGEN_RECOVERY_START)
    const recoveryRatio = 1 - Math.exp(-Math.pow(recoveryDistance / STAT_REGEN_RECOVERY_SCALE, 2))
    return diminishedBonus + (linearBonus - diminishedBonus) * recoveryRatio
}

/** 체력 스탯이 제공하는 초당 생명력 재생량. 300 이후에는 점감분을 가우스 곡선으로 회복한다. */
export function calculateVitalityLifeRegenBonus(points: number): number {
    return calculateRecoveredStatRegenBonus(points, VITALITY_LIFE_REGEN_PER_POINT)
}

/** 정신력 스탯이 제공하는 초당 정신력 재생량. 기존 회복 곡선을 유지한다. */
export function calculateMentalityRegenBonus(points: number): number {
    return calculateRecoveredStatRegenBonus(points, MENTALITY_REGEN_PER_POINT)
}

// ── StatType 클래스 열거형 ──

/** 스탯 → 능력치 변환 함수. entity의 attribute에 직접 접근해 modifier를 추가함 */
export type StatModifyFn = (entity: AttributeOwner, points: number, source: string) => void

/** 스탯 종류 — Java 클래스 열거형 패턴 */
export class StatType {
    /** @internal 자기 등록용 레지스트리. 인스턴스 선언보다 먼저 초기화되어야 함 */
    private static _all: StatType[] = []

    static readonly STRENGTH = new StatType('strength', '근력',
        (entity, points, source) => {
            entity.attribute.addModifier({ attribute: 'atk', op: 'add', value: 2 * points, source })
            entity.attribute.addModifier({ attribute: 'armorPen', op: 'add', value: 0.5 * points, source })
            entity.attribute.addModifier({ attribute: 'maxWeight', op: 'add', value: 0.2 * points, source })
        },
        p => `근력 1 → 공격력 +2, 물리 관통력 +0.5, 최대 중량 +0.2kg\n현재 근력 ${p}: 공격력 +${2 * p}, 물리 관통력 +${0.5 * p}, 최대 중량 +${0.2 * p}kg`
    )

    static readonly AGILITY = new StatType('agility', '민첩',
        (entity, points, source) => {
            entity.attribute.addModifier({ attribute: 'speed', op: 'add', value: 0.05 * points, source })
            entity.attribute.addModifier({ attribute: 'attackSpeed', op: 'add', value: 0.01 * points, source })
            entity.attribute.addModifier({ attribute: 'projectileAcceleration', op: 'add', value: 0.003 * points, source })
        },
        p => `민첩 1 → 이동속도 +0.05, 공격속도 +0.01, 투사체 가속 +0.003\n현재 민첩 ${p}: 이동속도 +${(0.05 * p).toFixed(2)}, 공격속도 +${(0.01 * p).toFixed(2)}, 투사체 가속 +${(0.003 * p).toFixed(3)}`
    )

    static readonly VITALITY = new StatType('vitality', '체력',
        (entity, points, source) => {
            entity.attribute.addModifier({ attribute: 'maxLife', op: 'add', value: 10 * points, source })
            entity.attribute.addModifier({ attribute: 'def', op: 'add', value: 1 * points, source })
            entity.attribute.addModifier({
                attribute: 'lifeRegen',
                op: 'add',
                value: calculateVitalityLifeRegenBonus(points),
                source,
            })
        },
        p => `체력 1 → 최대 생명력 +10, 방어력 +1, 생명력 재생 증가(고체력 구간에서 포인트 효율 회복)\n현재 체력 ${p}: 최대 생명력 +${10 * p}, 방어력 +${p}, 생명력 재생 +${calculateVitalityLifeRegenBonus(p).toFixed(2)}/초`
    )

    static readonly SENSIBILITY = new StatType('sensibility', '감각',
        (entity, points, source) => {
            entity.attribute.addModifier({ attribute: 'critRate', op: 'add', value: calculateSensibilityCritRateBonus(points), source })
            entity.attribute.addModifier({ attribute: 'critDmg', op: 'add', value: 0.01 * points, source })
            entity.attribute.addModifier({ attribute: 'forgingPrecision', op: 'add', value: 0.0015 * points, source })
        },
        p => `감각 치명타율 → 낮은 구간에서 1당 최대 +0.1%p, 높을수록 효율 감소, 최대 +${(SENSIBILITY_CRIT_RATE_CAP * 100).toFixed(0)}%p\n현재 감각 ${p}: 치명타율 +${(calculateSensibilityCritRateBonus(p) * 100).toFixed(1)}%p, 치명타 피해 +${p}%, 제련 정밀도 +${(0.15 * p).toFixed(1)}%`
    )

    static readonly MENTALITY = new StatType('mentality', '정신력',
        (entity, points, source) => {
            entity.attribute.addModifier({
                attribute: 'maxMentality',
                op: 'add',
                value: MENTALITY_MAX_MENTALITY_PER_POINT * points,
                source,
            })
            entity.attribute.addModifier({ attribute: 'magicForce', op: 'add', value: 2 * points, source })
            entity.attribute.addModifier({
                attribute: 'magicDef',
                op: 'add',
                value: MENTALITY_MAGIC_DEF_PER_POINT * points,
                source,
            })
            entity.attribute.addModifier({ attribute: 'projectileAcceleration', op: 'add', value: 0.002 * points, source })
            entity.attribute.addModifier({
                attribute: 'mentalityRegen',
                op: 'add',
                value: calculateMentalityRegenBonus(points),
                source,
            })
        },
        p => `정신력 1 → 최대 정신력 +${MENTALITY_MAX_MENTALITY_PER_POINT}, 마법력 +2, 마법 저항력 +${MENTALITY_MAGIC_DEF_PER_POINT}, 투사체 가속 +0.002, 정신력 재생 증가(고정신력 구간에서 포인트 효율 회복)\n현재 정신력 ${p}: 최대 정신력 +${MENTALITY_MAX_MENTALITY_PER_POINT * p}, 마법력 +${2 * p}, 마법 저항력 +${MENTALITY_MAGIC_DEF_PER_POINT * p}, 투사체 가속 +${(0.002 * p).toFixed(3)}, 정신력 재생 +${calculateMentalityRegenBonus(p).toFixed(2)}/초`
    )

    readonly key: StatKey
    readonly label: string
    readonly modify: StatModifyFn
    readonly getDescription: (points: number) => string

    private constructor(key: StatKey, label: string, modify: StatModifyFn, getDescription: (points: number) => string) {
        this.key = key
        this.label = label
        this.modify = modify
        this.getDescription = getDescription
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
    applyModifiers(entity: AttributeOwner): void {
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
