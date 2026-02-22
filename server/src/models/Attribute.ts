/** 능력치 종류 */
export type AttributeType =
    | 'maxLife' | 'maxMentality'
    | 'atk' | 'magicForce'
    | 'def' | 'magicDef'
    | 'armorPen' | 'magicPen'
    | 'speed' | 'attackSpeed'
    | 'critRate' | 'critDmg';

/** 모든 능력치 종류 목록 */
export const ATTRIBUTE_TYPES: AttributeType[] = [
    'maxLife', 'maxMentality',
    'atk', 'magicForce',
    'def', 'magicDef',
    'armorPen', 'magicPen',
    'speed', 'attackSpeed',
    'critRate', 'critDmg',
];

/** Modifier 적용 방식 */
export type ModifierOp = 'add' | 'multiply';

/** 능력치 수정자 */
export interface AttributeModifier {
    attribute: AttributeType;
    op: ModifierOp;
    value: number;
    source: string;  // "equip:42", "buff:화염강화", "skill:분노" 등
}

/** 능력치 레코드 */
export type AttributeRecord = Record<AttributeType, number>;

/** 능력치 종류별 기본값 */
export const DEFAULT_ATTRIBUTE: Readonly<AttributeRecord> = {
    maxLife:        100,
    maxMentality:   100,
    atk:         10,
    magicForce:  10,
    def:         0,
    magicDef:    0,
    armorPen:    0,
    magicPen:    0,
    speed:       1,
    attackSpeed: 1,
    critRate:    0.05,
    critDmg:     1.5,
};

function createAttributeRecord(): AttributeRecord {
    return { ...DEFAULT_ATTRIBUTE };
}

export default class Attribute {
    private _base: AttributeRecord;
    private _modifiers: AttributeModifier[] = [];
    private _computed: AttributeRecord;
    private _dirty = true;

    constructor(base?: Partial<AttributeRecord>) {
        this._base = { ...createAttributeRecord(), ...base };
        this._computed = { ...this._base };
    }

    // -- 기본 능력치 --

    /** 기본 능력치 조회 */
    getBase(attr: AttributeType): number {
        return this._base[attr];
    }

    /** 기본 능력치 설정 */
    setBase(attr: AttributeType, value: number): void {
        this._base[attr] = value;
        this._dirty = true;
    }

    /** 기본 능력치 전체 반환 */
    get base(): Readonly<AttributeRecord> {
        return this._base;
    }

    // -- Modifier --

    /** Modifier 추가 */
    addModifier(mod: AttributeModifier): void {
        this._modifiers.push(mod);
        this._dirty = true;
    }

    /** Modifier 여러 개 추가 */
    addModifiers(mods: AttributeModifier[]): void {
        this._modifiers.push(...mods);
        this._dirty = true;
    }

    /** source 기준 일괄 제거 (장비 해제, 버프 만료) */
    removeBySource(source: string): void {
        const before = this._modifiers.length;
        this._modifiers = this._modifiers.filter(m => m.source !== source);
        if (this._modifiers.length !== before) {
            this._dirty = true;
        }
    }

    /** 특정 source의 modifier 존재 여부 */
    hasSource(source: string): boolean {
        return this._modifiers.some(m => m.source === source);
    }

    /** 현재 적용 중인 모든 modifier 반환 */
    get modifiers(): ReadonlyArray<AttributeModifier> {
        return this._modifiers;
    }

    // -- 최종 능력치 --

    /** 최종 능력치 조회 (캐싱) */
    get(attr: AttributeType): number {
        if (this._dirty) this.recalc();
        return this._computed[attr];
    }

    /** 최종 능력치 전체 반환 (캐싱) */
    get computed(): Readonly<AttributeRecord> {
        if (this._dirty) this.recalc();
        return this._computed;
    }

    // -- 내부 --

    private recalc(): void {
        // base 복사
        this._computed = { ...this._base };

        // 1단계: add 합산
        for (const mod of this._modifiers) {
            if (mod.op === 'add') {
                this._computed[mod.attribute] += mod.value;
            }
        }

        // 2단계: multiply 곱산
        for (const mod of this._modifiers) {
            if (mod.op === 'multiply') {
                this._computed[mod.attribute] *= mod.value;
            }
        }

        this._dirty = false;
    }
}
