// ── AttributeType 클래스 열거형 ──

/** 능력치 종류 — Java 클래스 열거형 패턴 */
export class AttributeType {
    /** @internal 자기 등록용 레지스트리. 인스턴스 선언보다 먼저 초기화되어야 함 */
    private static _all: AttributeType[] = []

    static readonly MAX_LIFE     = new AttributeType(
        'maxLife',      
        '최대 생명력',  
        100
    )
    static readonly MAX_MENTALITY= new AttributeType(
        'maxMentality', 
        '최대 정신력',  
        100
    )
    static readonly LIFE_REGEN    = new AttributeType(
        'lifeRegen',
        '생명력 재생',
        1,
        v => `${v.toFixed(2)}/초`,
        v => `초당 생명력을 ${v.toFixed(2)} 회복합니다.`
    )
    static readonly MENTALITY_REGEN = new AttributeType(
        'mentalityRegen',
        '정신력 재생',
        1,
        v => `${v.toFixed(2)}/초`,
        v => `초당 정신력을 ${v.toFixed(2)} 회복합니다.`
    )
    static readonly HUNGER_DRAIN = new AttributeType(
        'hungerDrain',
        '배고픔 감소량',
        0.01,
        v => `${v.toFixed(2)}/초`,
        v => `초당 배고픔이 ${v.toFixed(2)} 감소합니다.`
    )
    static readonly THIRST_DRAIN = new AttributeType(
        'thirstDrain',
        '수분 감소량',
        0.02,
        v => `${v.toFixed(2)}/초`,
        v => `초당 수분이 ${v.toFixed(2)} 감소합니다.`
    )
    static readonly MAX_THIRSTY  = new AttributeType(
        'maxThirsty',   
        '최대 목마름',  
        100
    )
    static readonly MAX_HUNGRY   = new AttributeType(
        'maxHungry',    
        '최대 배고픔',  
        100
    )
    static readonly MAX_WEIGHT   = new AttributeType(
        'maxWeight',    
        '최대 중량',     
        50
    )
    static readonly ATK          = new AttributeType(
        'atk',          
        '공격력',        
        10,   
        undefined, 
        v => `기본 공격 시 ${v.toFixed(1)}의 피해를 줍니다.`
    )
    static readonly MAGIC_FORCE  = new AttributeType(
        'magicForce',   
        '마법력',        
        10,   
        undefined, 
        v => `마법 공격 시 ${v.toFixed(1)}의 피해를 줍니다.`
    )
    static readonly DEF          = new AttributeType(
        'def',          
        '방어력',         
        0,   
        undefined, 
        v => `물리 피해를 ${v.toFixed(1)} 감소시킵니다.`
    )
    static readonly MAGIC_DEF    = new AttributeType(
        'magicDef',     
        '마법 저항력',
        0,   
        undefined, 
        v => `마법 피해를 ${v.toFixed(1)} 감소시킵니다.`
    )
    static readonly ARMOR_PEN    = new AttributeType(
        'armorPen',     
        '물리 관통력',
        0,   
        undefined, 
        v => `대상의 방어력을 ${v.toFixed(1)} 무시합니다.`
    )
    static readonly MAGIC_PEN    = new AttributeType(
        'magicPen',     
        '마법 관통력',
        0,   
        undefined, 
        v => `대상의 마법저항을 ${v.toFixed(1)} 무시합니다.`
    )
    static readonly SPEED        = new AttributeType(
        'speed',        
        '이동속도',       
        1,   
        undefined, 
        v => `이동 속도가 ${v.toFixed(2)}배입니다.`
    )
    static readonly ATTACK_SPEED = new AttributeType(
        'attackSpeed',  
        '공격속도',       
        1,   
        undefined, 
        v => `공격 속도가 ${v.toFixed(2)}배입니다.`
    )
    static readonly PROJECTILE_ACCELERATION = new AttributeType(
        'projectileAcceleration',
        '투사체 가속',
        1,
        v => `${v.toFixed(2)}배`,
        v => `투사체 비행 시간을 기본 시간의 1/${v.toFixed(2)}로 단축하고 빠른 대상에 대한 적중률을 높입니다.`
    )
    static readonly CRIT_RATE    = new AttributeType(
        'critRate',     
        '치명타 확률',
        0.05, 
        v => `${(v * 100).toFixed(1)}%`,
        v => `${(v * 100).toFixed(1)}% 확률로 치명타가 발생합니다.`
    )
    static readonly CRIT_DMG     = new AttributeType(
        'critDmg',      
        '치명타 피해',
        1.5,  
        v => `${(v * 100).toFixed(0)}%`, 
        v => `치명타 시 ${(v * 100).toFixed(0)}%의 피해를 줍니다.`
    )
    static readonly FORGING_PRECISION = new AttributeType(
        'forgingPrecision',
        '제련 정밀도',
        0,
        v => `${(v * 100).toFixed(1)}%`,
        v => `단조 리듬 판정 범위와 마력 제련 처리량을 최대한 안정시킵니다. (현재 ${(v * 100).toFixed(1)}%)`
    )
    static readonly LUCK = new AttributeType(
        'luck',
        '행운',
        0,
        undefined,
        v => `희귀 보상을 만날 확률에 영향을 줍니다. (현재 ${v.toFixed(1)})`
    )
    static readonly FISHING_BITE_SPEED = new AttributeType(
        'fishingBiteSpeed',
        '입질 속도',
        1,
        v => `${v.toFixed(2)}배`,
        v => `낚시 입질 대기 시간을 ${v.toFixed(2)}배 빠르게 진행합니다.`
    )
    static readonly FISHING_NET_SIZE = new AttributeType(
        'fishingNetSize',
        '채집 영역 크기',
        18,
        v => v.toFixed(1),
        v => `낚시 미니게임 채집 영역의 기준 크기가 ${v.toFixed(1)}입니다.`
    )
    static readonly FISHING_NET_SPEED = new AttributeType(
        'fishingNetSpeed',
        '채집 영역 속도',
        34,
        v => v.toFixed(1),
        v => `낚시 미니게임 채집 영역의 초당 이동량이 ${v.toFixed(1)}입니다.`
    )
    static readonly FISHING_GAUGE_START = new AttributeType(
        'fishingGaugeStart',
        '낚시 시작 게이지',
        0.5,
        v => `${(v * 100).toFixed(0)}%`,
        v => `낚시 미니게임의 포획 게이지가 ${(v * 100).toFixed(0)}%에서 시작합니다.`
    )

    readonly key: AttributeKey
    readonly label: string
    /** 상태창과 스킬 계수 표시에 공통으로 쓰는 아이콘 key. */
    readonly icon: string
    readonly defaultValue: number
    /** 값을 표시용 문자열로 변환 */
    readonly format: (value: number) => string
    /** 값을 기반으로 능력치 설명 문자열 반환 */
    readonly getDescription: (value: number) => string

    private constructor(key: AttributeKey, label: string, defaultValue: number, format?: (v: number) => string, description?: (v: number) => string) {
        this.key = key
        this.label = label
        this.icon = `attributes/${key}`
        this.defaultValue = defaultValue
        this.format = format ?? (v => Number.isInteger(v) ? String(v) : v.toFixed(2))
        this.getDescription = description ?? (() => '')
        AttributeType._all.push(this)
    }

    /** 모든 AttributeType 목록 */
    static values(): readonly AttributeType[] { return AttributeType._all }

    /** key 문자열로 조회 */
    static fromKey(key: string): AttributeType | undefined {
        return AttributeType._all.find(a => a.key === key)
    }

    /** 스킬/상태 설명 포맷 문자열에 삽입 가능한 채팅 아이콘 문법. */
    get iconMarkup(): string { return `[icon=${this.icon}]` }

    toString(): string { return this.key }
}

// ── 내부 타입 (레코드 키, 모디파이어용) ──

/** 능력치 키 문자열 (AttributeRecord, AttributeModifier에 사용) */
export type AttributeKey =
    | 'maxLife' | 'maxMentality' | 'maxThirsty' | 'maxHungry'
    | 'lifeRegen' | 'mentalityRegen' | 'hungerDrain' | 'thirstDrain'
    | 'maxWeight'
    | 'atk' | 'magicForce'
    | 'def' | 'magicDef'
    | 'armorPen' | 'magicPen'
    | 'speed' | 'attackSpeed' | 'projectileAcceleration'
    | 'critRate' | 'critDmg'
    | 'forgingPrecision'
    | 'luck' | 'fishingBiteSpeed' | 'fishingNetSize' | 'fishingNetSpeed' | 'fishingGaugeStart'

/** Modifier 적용 방식 */
export type ModifierOp = 'add' | 'multiply'

/** 능력치 수정자 */
export interface AttributeModifier {
    attribute: AttributeKey
    op: ModifierOp
    value: number
    source: string  // "equip:42", "buff:화염강화", "skill:분노" 등
}

/** 같은 능력치의 고정·비율 modifier를 사용자 표시용 한 행으로 합친 값. */
export interface AttributeModifierSummary {
    attribute: AttributeKey
    additive: number
    multiplier: number
}

/** 실제 add 합산 → multiply 곱산 규칙을 보존하면서 modifier를 능력치별로 묶는다. */
export function summarizeAttributeModifiers(
    modifiers: readonly AttributeModifier[],
): readonly AttributeModifierSummary[] {
    const summaries = new Map<AttributeKey, AttributeModifierSummary>()
    for (const modifier of modifiers) {
        const summary = summaries.get(modifier.attribute) ?? {
            attribute: modifier.attribute,
            additive: 0,
            multiplier: 1,
        }
        if (modifier.op === 'add') summary.additive += modifier.value
        else summary.multiplier *= modifier.value
        summaries.set(modifier.attribute, summary)
    }
    return [...summaries.values()]
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
