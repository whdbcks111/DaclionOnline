// ── AttributeType 클래스 열거형 ──

/** 능력치 종류 — Java 클래스 열거형 패턴 */
export class AttributeType {
    /** @internal 자기 등록용 레지스트리. 인스턴스 선언보다 먼저 초기화되어야 함 */
    private static _all: AttributeType[] = []

    static readonly MAX_LIFE     = new AttributeType('maxLife',      '최대 생명력',  100)
    static readonly MAX_MENTALITY= new AttributeType('maxMentality', '최대 정신력',  100)
    static readonly MAX_THIRSTY  = new AttributeType('maxThirsty',   '최대 목마름',  100)
    static readonly MAX_HUNGRY   = new AttributeType('maxHungry',    '최대 배고픔',  100)
    static readonly MAX_WEIGHT   = new AttributeType('maxWeight',    '최대 중량',     50)
    static readonly ATK          = new AttributeType('atk',          '공격력',        10)
    static readonly MAGIC_FORCE  = new AttributeType('magicForce',   '마법력',        10)
    static readonly DEF          = new AttributeType('def',          '방어력',         0)
    static readonly MAGIC_DEF    = new AttributeType('magicDef',     '마법저항',       0)
    static readonly ARMOR_PEN    = new AttributeType('armorPen',     '방어관통',       0)
    static readonly MAGIC_PEN    = new AttributeType('magicPen',     '마법관통',       0)
    static readonly SPEED        = new AttributeType('speed',        '이동속도',       1)
    static readonly ATTACK_SPEED = new AttributeType('attackSpeed',  '공격속도',       1)
    static readonly CRIT_RATE    = new AttributeType('critRate',     '치명타율',    0.05, v => `${(v * 100).toFixed(1)}%`)
    static readonly CRIT_DMG     = new AttributeType('critDmg',      '치명타피해', 1.5,  v => `${(v * 100).toFixed(0)}%`)

    readonly key: AttributeKey
    readonly label: string
    readonly defaultValue: number
    /** 값을 표시용 문자열로 변환 */
    readonly format: (value: number) => string

    private constructor(key: AttributeKey, label: string, defaultValue: number, format?: (v: number) => string) {
        this.key = key
        this.label = label
        this.defaultValue = defaultValue
        this.format = format ?? (v => Number.isInteger(v) ? String(v) : v.toFixed(2))
        AttributeType._all.push(this)
    }

    /** 모든 AttributeType 목록 */
    static values(): readonly AttributeType[] { return AttributeType._all }

    /** key 문자열로 조회 */
    static fromKey(key: string): AttributeType | undefined {
        return AttributeType._all.find(a => a.key === key)
    }

    toString(): string { return this.key }
}

// ── 내부 타입 (레코드 키, 모디파이어용) ──

/** 능력치 키 문자열 (AttributeRecord, AttributeModifier에 사용) */
export type AttributeKey =
    | 'maxLife' | 'maxMentality' | 'maxThirsty' | 'maxHungry'
    | 'maxWeight'
    | 'atk' | 'magicForce'
    | 'def' | 'magicDef'
    | 'armorPen' | 'magicPen'
    | 'speed' | 'attackSpeed'
    | 'critRate' | 'critDmg'

/** Modifier 적용 방식 */
export type ModifierOp = 'add' | 'multiply'

/** 능력치 수정자 */
export interface AttributeModifier {
    attribute: AttributeKey
    op: ModifierOp
    value: number
    source: string  // "equip:42", "buff:화염강화", "skill:분노" 등
}

/** 능력치 레코드 */
export type AttributeRecord = Record<AttributeKey, number>

// ── Attribute 클래스 ──

function createAttributeRecord(base?: Partial<AttributeRecord>): AttributeRecord {
    const record = {} as AttributeRecord
    for (const type of AttributeType.values()) {
        record[type.key] = type.defaultValue
    }
    return base ? { ...record, ...base } : record
}

export default class Attribute {
    private _base: AttributeRecord
    private _modifiers: AttributeModifier[] = []
    private _computed: AttributeRecord
    private _dirty = true

    constructor(base?: Partial<AttributeRecord>) {
        this._base = createAttributeRecord(base)
        this._computed = { ...this._base }
    }

    // -- 기본 능력치 --

    /** 기본 능력치 조회 */
    getBase(attr: AttributeType): number {
        return this._base[attr.key]
    }

    /** 기본 능력치 설정 */
    setBase(attr: AttributeType, value: number): void {
        this._base[attr.key] = value
        this._dirty = true
    }

    /** 기본 능력치 전체 반환 */
    get base(): Readonly<AttributeRecord> {
        return this._base
    }

    // -- Modifier --

    /** Modifier 추가 */
    addModifier(mod: AttributeModifier): void {
        this._modifiers.push(mod)
        this._dirty = true
    }

    /** Modifier 여러 개 추가 */
    addModifiers(mods: AttributeModifier[]): void {
        this._modifiers.push(...mods)
        this._dirty = true
    }

    /** source 기준 일괄 제거 (장비 해제, 버프 만료) */
    removeBySource(source: string): void {
        const before = this._modifiers.length
        this._modifiers = this._modifiers.filter(m => m.source !== source)
        if (this._modifiers.length !== before) {
            this._dirty = true
        }
    }

    /** 특정 source의 modifier 존재 여부 */
    hasSource(source: string): boolean {
        return this._modifiers.some(m => m.source === source)
    }

    /** 현재 적용 중인 모든 modifier 반환 */
    get modifiers(): ReadonlyArray<AttributeModifier> {
        return this._modifiers
    }

    // -- 최종 능력치 --

    /** 최종 능력치 조회 (캐싱) */
    get(attr: AttributeType): number {
        if (this._dirty) this.recalc()
        return this._computed[attr.key]
    }

    /** 최종 능력치 전체 반환 (캐싱) */
    get computed(): Readonly<AttributeRecord> {
        if (this._dirty) this.recalc()
        return this._computed
    }

    // -- 내부 --

    private recalc(): void {
        this._computed = { ...this._base }

        // 1단계: add 합산
        for (const mod of this._modifiers) {
            if (mod.op === 'add') {
                this._computed[mod.attribute] += mod.value
            }
        }

        // 2단계: multiply 곱산
        for (const mod of this._modifiers) {
            if (mod.op === 'multiply') {
                this._computed[mod.attribute] *= mod.value
            }
        }

        this._dirty = false
    }
}
