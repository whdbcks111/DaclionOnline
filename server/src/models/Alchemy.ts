import { ItemMetadataKeys, type ItemMetadata, type ItemSnapshot } from './Item.js';
import { cloneMetadataValue } from './Metadata.js';

export const ALCHEMY_WATER_BOTTLE_ITEM_ID = 'alchemy_water_bottle';
export const FAILED_ALCHEMY_POTION_ITEM_ID = 'failed_alchemy_potion';
export const ALCHEMIST_JOB_ID = 'career:alchemist';

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.max(minimum, Math.min(maximum, value));
}

function normalizeInput(value: string): string {
    return value.trim().toLocaleLowerCase('ko-KR').replace(/[\s_-]+/g, '');
}

/** 완성된 조제약을 섭취할지 현재 대상 중심으로 투척할지 나타내는 클래스형 enum. */
export class AlchemyDelivery {
    private static readonly all: AlchemyDelivery[] = [];

    static readonly DRINK = new AlchemyDelivery('drink', '음용', ['마시기', 'drink']);
    static readonly THROW = new AlchemyDelivery('throw', '투척', ['던지기', 'throw']);

    private constructor(
        readonly key: 'drink' | 'throw',
        readonly label: string,
        readonly aliases: readonly string[],
    ) {
        AlchemyDelivery.all.push(this);
    }

    static values(): readonly AlchemyDelivery[] { return AlchemyDelivery.all; }
    static fromKey(key: string): AlchemyDelivery | undefined {
        return AlchemyDelivery.all.find(value => value.key === key.trim().toLowerCase());
    }
    static fromInput(input: string): AlchemyDelivery | undefined {
        const normalized = normalizeInput(input);
        return AlchemyDelivery.all.find(value => [value.key, value.label, ...value.aliases]
            .some(candidate => normalizeInput(candidate) === normalized));
    }
}

/** 조제약이 서버에서 실행할 효과 분류. 문자열 key는 metadata 직렬화 경계에서만 사용한다. */
export class AlchemyEffectType {
    private static readonly all: AlchemyEffectType[] = [];

    static readonly RESTORE_LIFE = new AlchemyEffectType('restore_life', '생명력 회복', 'beneficial');
    static readonly RESTORE_MENTALITY = new AlchemyEffectType('restore_mentality', '정신력 회복', 'beneficial');
    static readonly BENEFICIAL_STATUS = new AlchemyEffectType('beneficial_status', '강화 효과', 'beneficial');
    static readonly HARMFUL_STATUS = new AlchemyEffectType('harmful_status', '공격 효과', 'harmful');
    static readonly FAILED = new AlchemyEffectType('failed', '변칙 효과', 'beneficial');

    private constructor(
        readonly key: string,
        readonly label: string,
        readonly audience: 'beneficial' | 'harmful',
    ) {
        AlchemyEffectType.all.push(this);
    }

    static values(): readonly AlchemyEffectType[] { return AlchemyEffectType.all; }
    static fromKey(key: string): AlchemyEffectType | undefined {
        return AlchemyEffectType.all.find(value => value.key === key.trim().toLowerCase());
    }
}

/** 기존 지역 재료를 연금술 목적에 연결하는 공개 reagent 분류. */
export class AlchemyReagentTrait {
    private static readonly all: AlchemyReagentTrait[] = [];

    static readonly LIFE = new AlchemyReagentTrait('life', '생명');
    static readonly MIND = new AlchemyReagentTrait('mind', '정신');
    static readonly GROWTH = new AlchemyReagentTrait('growth', '재생');
    static readonly MIGHT = new AlchemyReagentTrait('might', '전투');
    static readonly ARCANE = new AlchemyReagentTrait('arcane', '비전');
    static readonly MOTION = new AlchemyReagentTrait('motion', '신속');
    static readonly CLEANSE = new AlchemyReagentTrait('cleanse', '정화');
    static readonly WARD = new AlchemyReagentTrait('ward', '보존');
    static readonly TOXIN = new AlchemyReagentTrait('toxin', '독성');
    static readonly CATALYST = new AlchemyReagentTrait('catalyst', '촉매');

    private constructor(readonly key: string, readonly label: string) {
        AlchemyReagentTrait.all.push(this);
    }

    static values(): readonly AlchemyReagentTrait[] { return AlchemyReagentTrait.all; }
    static fromKey(key: string): AlchemyReagentTrait | undefined {
        return AlchemyReagentTrait.all.find(value => value.key === key.trim().toLowerCase());
    }
}

export interface AlchemyReagentDefinition {
    readonly itemDataId: string;
    readonly traits: readonly AlchemyReagentTrait[];
}

export interface AlchemyReagentData {
    readonly itemDataId: string;
    readonly traits: readonly AlchemyReagentTrait[];
}

const reagentByItemDataId = new Map<string, Readonly<AlchemyReagentData>>();

export function defineAlchemyReagent(definition: AlchemyReagentDefinition): void {
    const itemDataId = definition.itemDataId.trim();
    if (!itemDataId || reagentByItemDataId.has(itemDataId)) {
        throw new Error(`중복되거나 비어 있는 연금술 재료입니다: ${itemDataId}`);
    }
    const traits = [...new Set(definition.traits)];
    if (traits.length === 0) throw new Error(`연금술 재료 성질이 비어 있습니다: ${itemDataId}`);
    reagentByItemDataId.set(itemDataId, Object.freeze({
        itemDataId,
        traits: Object.freeze(traits),
    }));
}

export function getAlchemyReagent(itemDataId: string): Readonly<AlchemyReagentData> | undefined {
    return reagentByItemDataId.get(itemDataId.trim());
}

export function getAllAlchemyReagents(): readonly Readonly<AlchemyReagentData>[] {
    return [...reagentByItemDataId.values()];
}

export interface AlchemyFormulaIngredient {
    readonly itemDataId: string;
    /** 물병 한 병당 필요한 수량. */
    readonly count: number;
}

export interface AlchemyFormulaEffectDefinition {
    readonly type: AlchemyEffectType;
    readonly basePower?: number;
    readonly baseDuration?: number;
    readonly statusEffectId?: string;
    readonly damageType?: 'physical' | 'magic' | 'absolute';
}

export interface AlchemyFormulaDefinition {
    readonly id: string;
    readonly name: string;
    readonly aliases?: readonly string[];
    readonly description: string;
    readonly resultItemDataId: string;
    readonly ingredients: readonly AlchemyFormulaIngredient[];
    readonly effect: AlchemyFormulaEffectDefinition;
    readonly difficulty: number;
}

export interface AlchemyFormulaData extends Omit<AlchemyFormulaDefinition, 'aliases' | 'ingredients' | 'effect'> {
    readonly aliases: readonly string[];
    readonly ingredients: readonly AlchemyFormulaIngredient[];
    readonly effect: Readonly<AlchemyFormulaEffectDefinition>;
}

const formulaById = new Map<string, Readonly<AlchemyFormulaData>>();

export function defineAlchemyFormula(definition: AlchemyFormulaDefinition): void {
    const id = definition.id.trim().toLowerCase();
    if (!id || formulaById.has(id)) throw new Error(`중복되거나 비어 있는 연금술 조합식입니다: ${id}`);
    if (!definition.name.trim() || !definition.resultItemDataId.trim()) {
        throw new Error(`연금술 조합식 이름 또는 결과가 비어 있습니다: ${id}`);
    }
    if (!Number.isFinite(definition.difficulty) || definition.difficulty < 1 || definition.difficulty > 10) {
        throw new Error(`연금술 조합식 난이도가 올바르지 않습니다: ${id}`);
    }
    const ingredients = definition.ingredients.map(ingredient => ({
        itemDataId: ingredient.itemDataId.trim(),
        count: ingredient.count,
    }));
    if (ingredients.length < 2 || ingredients.some(ingredient => !ingredient.itemDataId
        || !Number.isSafeInteger(ingredient.count) || ingredient.count <= 0
        || !getAlchemyReagent(ingredient.itemDataId))) {
        throw new Error(`연금술 조합식 재료가 올바르지 않습니다: ${id}`);
    }
    if (new Set(ingredients.map(ingredient => ingredient.itemDataId)).size !== ingredients.length) {
        throw new Error(`연금술 조합식에 같은 재료가 중복되었습니다: ${id}`);
    }
    if (definition.effect.type !== AlchemyEffectType.FAILED
        && definition.effect.type !== AlchemyEffectType.RESTORE_LIFE
        && definition.effect.type !== AlchemyEffectType.RESTORE_MENTALITY
        && !definition.effect.statusEffectId) {
        throw new Error(`연금술 상태효과가 비어 있습니다: ${id}`);
    }
    const formula: AlchemyFormulaData = {
        ...definition,
        id,
        name: definition.name.trim(),
        aliases: Object.freeze([...(definition.aliases ?? [])].map(value => value.trim()).filter(Boolean)),
        ingredients: Object.freeze(ingredients.map(ingredient => Object.freeze({ ...ingredient }))),
        effect: Object.freeze({ ...definition.effect }),
    };
    formulaById.set(id, Object.freeze(formula));
}

export function getAlchemyFormula(id: string): Readonly<AlchemyFormulaData> | undefined {
    return formulaById.get(id.trim().toLowerCase());
}

export function getAllAlchemyFormulas(): readonly Readonly<AlchemyFormulaData>[] {
    return [...formulaById.values()];
}

export function findAlchemyFormulaByInput(input: string): Readonly<AlchemyFormulaData> | undefined {
    const normalized = normalizeInput(input);
    if (!normalized) return undefined;
    const exact = getAllAlchemyFormulas().find(formula => [formula.id, formula.name, ...formula.aliases]
        .some(candidate => normalizeInput(candidate) === normalized));
    if (exact) return exact;
    const partial = getAllAlchemyFormulas().filter(formula => normalizeInput(formula.name).includes(normalized));
    return partial.length === 1 ? partial[0] : undefined;
}

export interface AlchemyIngredientSelectionInput {
    readonly itemDataId: string;
    readonly count: number;
}

function ingredientKey(ingredients: readonly AlchemyIngredientSelectionInput[]): string | undefined {
    const totals = new Map<string, number>();
    for (const ingredient of ingredients) {
        const itemDataId = ingredient.itemDataId.trim();
        if (!itemDataId || !Number.isSafeInteger(ingredient.count) || ingredient.count <= 0) return undefined;
        totals.set(itemDataId, (totals.get(itemDataId) ?? 0) + ingredient.count);
    }
    return [...totals]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([itemDataId, count]) => `${itemDataId}:${count}`)
        .join('|');
}

/** 사용자가 고른 총 재료가 병 수에 맞는 정확한 조합인지 순서와 무관하게 판정한다. */
export function resolveAlchemyFormula(
    ingredients: readonly AlchemyIngredientSelectionInput[],
    bottleCount: number,
): Readonly<AlchemyFormulaData> | undefined {
    if (!Number.isSafeInteger(bottleCount) || bottleCount < 1 || bottleCount > 3) return undefined;
    const selectedKey = ingredientKey(ingredients);
    if (!selectedKey) return undefined;
    return getAllAlchemyFormulas().find(formula => ingredientKey(formula.ingredients.map(ingredient => ({
        itemDataId: ingredient.itemDataId,
        count: ingredient.count * bottleCount,
    }))) === selectedKey);
}

export function createAlchemyInventoryRequirements(
    ingredients: readonly AlchemyIngredientSelectionInput[],
    bottleCount: number,
): Array<{ count: number; matches: (item: { itemDataId: string }) => boolean }> {
    return [
        ...ingredients.map(ingredient => ({
            count: ingredient.count,
            matches: (item: { itemDataId: string }) => item.itemDataId === ingredient.itemDataId,
        })),
        {
            count: bottleCount,
            matches: (item: { itemDataId: string }) => item.itemDataId === ALCHEMY_WATER_BOTTLE_ITEM_ID,
        },
    ];
}

/** 조제 정확도와 감각을 합성하되 감각 보너스는 최대 15%p에 점근한다. */
export function calculateAlchemyQualityScore(accuracy: number, sensibility: number): number {
    const normalizedAccuracy = clamp(Number.isFinite(accuracy) ? accuracy : 0, 0, 1);
    const normalizedSensibility = Math.max(0, Number.isFinite(sensibility) ? sensibility : 0);
    const sensibilityBonus = 0.15 * (1 - Math.exp(-normalizedSensibility / 450));
    return clamp(normalizedAccuracy * 0.9 + sensibilityBonus, 0, 1);
}

/** 품질은 결과 이름·효율·지속시간·투척 대상 수가 함께 사용하는 클래스형 enum. */
export class AlchemyQuality {
    private static readonly all: AlchemyQuality[] = [];

    static readonly CLOUDY = new AlchemyQuality('cloudy', '탁한', 0, 0.72, 0.75, 2);
    static readonly STABLE = new AlchemyQuality('stable', '안정된', 0.45, 0.9, 0.92, 2);
    static readonly REFINED = new AlchemyQuality('refined', '정제된', 0.62, 1.05, 1.08, 3);
    static readonly EXCELLENT = new AlchemyQuality('excellent', '우수한', 0.78, 1.2, 1.22, 4);
    static readonly MASTERWORK = new AlchemyQuality('masterwork', '명인의', 0.92, 1.35, 1.38, 5);

    private constructor(
        readonly key: string,
        readonly label: string,
        readonly minimumScore: number,
        readonly powerMultiplier: number,
        readonly durationMultiplier: number,
        readonly areaTargetCap: number,
    ) {
        AlchemyQuality.all.push(this);
    }

    static values(): readonly AlchemyQuality[] { return AlchemyQuality.all; }
    static fromKey(key: string): AlchemyQuality | undefined {
        return AlchemyQuality.all.find(value => value.key === key.trim().toLowerCase());
    }
    static fromScore(score: number): AlchemyQuality {
        const normalized = clamp(Number.isFinite(score) ? score : 0, 0, 1);
        return [...AlchemyQuality.all].reverse().find(value => normalized >= value.minimumScore)
            ?? AlchemyQuality.CLOUDY;
    }
}

export interface AlchemyPotionEffectSnapshot {
    readonly type: string;
    readonly audience: 'beneficial' | 'harmful';
    readonly power: number;
    readonly duration: number;
    readonly statusEffectId?: string;
    readonly damageType?: 'physical' | 'magic' | 'absolute';
}

export interface AlchemyPotionMetadataSnapshot {
    readonly formulaId: string;
    readonly delivery: 'drink' | 'throw';
    readonly quality: string;
    readonly qualityScore: number;
    readonly accuracy: number;
    readonly sensibility: number;
    readonly areaTargetCap: number;
    readonly effect: AlchemyPotionEffectSnapshot;
}

/** 아이템 사용 경계가 raw metadata 대신 받는 서버 재구성 결과. */
export interface ResolvedAlchemyPotionUse {
    readonly metadata: AlchemyPotionMetadataSnapshot;
    readonly formula?: Readonly<AlchemyFormulaData>;
    readonly delivery: AlchemyDelivery;
    readonly quality: AlchemyQuality;
    readonly effectType: AlchemyEffectType;
}

function roundPotionValue(value: number): number {
    return Math.round(Math.max(0, value) * 100) / 100;
}

export function normalizeAlchemyPotionMetadata(value: unknown): AlchemyPotionMetadataSnapshot | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const candidate = value as Partial<AlchemyPotionMetadataSnapshot>;
    const delivery = typeof candidate.delivery === 'string' ? AlchemyDelivery.fromKey(candidate.delivery) : undefined;
    const quality = typeof candidate.quality === 'string' ? AlchemyQuality.fromKey(candidate.quality) : undefined;
    const effectCandidate = candidate.effect;
    const effectType = effectCandidate && typeof effectCandidate.type === 'string'
        ? AlchemyEffectType.fromKey(effectCandidate.type) : undefined;
    const hasStatusEffectId = effectCandidate !== undefined
        && Object.prototype.hasOwnProperty.call(effectCandidate, 'statusEffectId');
    const hasDamageType = effectCandidate !== undefined
        && Object.prototype.hasOwnProperty.call(effectCandidate, 'damageType');
    if (!delivery || !quality || !effectType || typeof candidate.formulaId !== 'string'
        || !candidate.formulaId || candidate.formulaId.length > 80
        || !effectCandidate || effectCandidate.audience !== effectType.audience
        || typeof effectCandidate.power !== 'number' || !Number.isFinite(effectCandidate.power)
        || effectCandidate.power < 0
        || typeof effectCandidate.duration !== 'number' || !Number.isFinite(effectCandidate.duration)
        || effectCandidate.duration < 0
        || typeof candidate.qualityScore !== 'number' || !Number.isFinite(candidate.qualityScore)
        || candidate.qualityScore < 0 || candidate.qualityScore > 1
        || typeof candidate.accuracy !== 'number' || !Number.isFinite(candidate.accuracy)
        || candidate.accuracy < 0 || candidate.accuracy > 1
        || typeof candidate.sensibility !== 'number' || !Number.isSafeInteger(candidate.sensibility)
        || candidate.sensibility < 0
        || typeof candidate.areaTargetCap !== 'number' || !Number.isSafeInteger(candidate.areaTargetCap)
        || candidate.areaTargetCap < 1 || candidate.areaTargetCap > 5
        || (hasStatusEffectId && (typeof effectCandidate.statusEffectId !== 'string'
            || !effectCandidate.statusEffectId))
        || (hasDamageType && effectCandidate.damageType !== 'physical'
            && effectCandidate.damageType !== 'magic' && effectCandidate.damageType !== 'absolute')) return undefined;
    return {
        formulaId: candidate.formulaId,
        delivery: delivery.key,
        quality: quality.key,
        qualityScore: candidate.qualityScore,
        accuracy: candidate.accuracy,
        sensibility: candidate.sensibility,
        areaTargetCap: candidate.areaTargetCap,
        effect: {
            type: effectType.key,
            audience: effectType.audience,
            power: effectCandidate.power,
            duration: effectCandidate.duration,
            ...(typeof effectCandidate.statusEffectId === 'string'
                ? { statusEffectId: effectCandidate.statusEffectId } : {}),
            ...(effectCandidate.damageType === 'physical' || effectCandidate.damageType === 'magic'
                || effectCandidate.damageType === 'absolute'
                ? { damageType: effectCandidate.damageType } : {}),
        },
    };
}

function createCanonicalAlchemyPotionMetadata(options: {
    readonly formula: Readonly<AlchemyFormulaData> | undefined;
    readonly delivery: AlchemyDelivery;
    readonly accuracy: number;
    readonly sensibility: number;
}): AlchemyPotionMetadataSnapshot {
    const accuracy = clamp(Number.isFinite(options.accuracy) ? options.accuracy : 0, 0, 1);
    const sensibility = Number.isSafeInteger(options.sensibility) && options.sensibility > 0
        ? options.sensibility
        : 0;
    const qualityScore = calculateAlchemyQualityScore(accuracy, sensibility);
    const quality = AlchemyQuality.fromScore(qualityScore);
    const formula = options.formula;
    const effectType = formula?.effect.type ?? AlchemyEffectType.FAILED;
    const basePower = formula?.effect.basePower ?? (formula ? 0 : 12);
    const baseDuration = formula?.effect.baseDuration ?? 0;
    return {
        formulaId: formula?.id ?? 'failed',
        delivery: options.delivery.key,
        quality: quality.key,
        qualityScore,
        accuracy,
        sensibility,
        areaTargetCap: quality.areaTargetCap,
        effect: {
            type: effectType.key,
            audience: effectType.audience,
            power: roundPotionValue(basePower * quality.powerMultiplier),
            duration: roundPotionValue(baseDuration * quality.durationMultiplier),
            ...(formula?.effect.statusEffectId ? { statusEffectId: formula.effect.statusEffectId } : {}),
            ...(formula?.effect.damageType ? { damageType: formula.effect.damageType } : {}),
        },
    };
}

function nearlyEqual(left: number, right: number): boolean {
    return Math.abs(left - right) <= 1e-9;
}

/**
 * 영속 metadata의 조합식·결과 item·품질 입력을 대조한 뒤 효과를 마스터 데이터에서 다시 만든다.
 * 호출자는 반환된 canonical metadata만 실행해야 하며, 불일치 시 아이템을 소비하지 않는다.
 */
export function resolveAlchemyPotionUse(
    itemDataId: string,
    value: unknown,
): ResolvedAlchemyPotionUse | undefined {
    const stored = normalizeAlchemyPotionMetadata(value);
    if (!stored) return undefined;
    const formula = stored.formulaId === 'failed' ? undefined : getAlchemyFormula(stored.formulaId);
    if ((!formula && (stored.formulaId !== 'failed' || itemDataId !== FAILED_ALCHEMY_POTION_ITEM_ID))
        || (formula && (stored.formulaId !== formula.id || itemDataId !== formula.resultItemDataId))) return undefined;
    const delivery = AlchemyDelivery.fromKey(stored.delivery);
    if (!delivery) return undefined;
    const canonical = createCanonicalAlchemyPotionMetadata({
        formula,
        delivery,
        accuracy: stored.accuracy,
        sensibility: stored.sensibility,
    });
    if (stored.quality !== canonical.quality
        || !nearlyEqual(stored.qualityScore, canonical.qualityScore)
        || stored.areaTargetCap !== canonical.areaTargetCap
        || stored.effect.type !== canonical.effect.type
        || stored.effect.audience !== canonical.effect.audience
        || !nearlyEqual(stored.effect.power, canonical.effect.power)
        || !nearlyEqual(stored.effect.duration, canonical.effect.duration)
        || stored.effect.statusEffectId !== canonical.effect.statusEffectId
        || stored.effect.damageType !== canonical.effect.damageType) return undefined;
    const quality = AlchemyQuality.fromKey(canonical.quality);
    const effectType = AlchemyEffectType.fromKey(canonical.effect.type);
    if (!quality || !effectType) return undefined;
    return { metadata: canonical, formula, delivery, quality, effectType };
}

export function createAlchemyPotionSnapshot(options: {
    readonly formula: Readonly<AlchemyFormulaData> | undefined;
    readonly delivery: AlchemyDelivery;
    readonly bottleCount: number;
    readonly accuracy: number;
    readonly sensibility: number;
}): ItemSnapshot {
    const formula = options.formula;
    const alchemy = createCanonicalAlchemyPotionMetadata(options);
    const quality = AlchemyQuality.fromKey(alchemy.quality)!;
    const failed = !formula;
    const effectType = AlchemyEffectType.fromKey(alchemy.effect.type)!;
    const power = alchemy.effect.power;
    const duration = alchemy.effect.duration;
    const deliveryLabel = options.delivery === AlchemyDelivery.THROW ? '투척형 ' : '';
    const resultName = failed ? '실패한 조제약' : formula.name;
    const audienceLabel = effectType.audience === 'beneficial' ? '아군' : '적';
    const effectText = effectType === AlchemyEffectType.RESTORE_LIFE ? `생명력 ${power} 회복`
        : effectType === AlchemyEffectType.RESTORE_MENTALITY ? `정신력 ${power} 회복`
            : effectType === AlchemyEffectType.FAILED ? `생명력 ${power} 회복`
                : `${formula?.effect.statusEffectId ?? effectType.label} Lv.${Math.max(1, Math.round(power))} · ${duration}초`;
    const areaText = options.delivery === AlchemyDelivery.THROW
        ? ` · 대상 중심 ${audienceLabel} 최대 ${quality.areaTargetCap}명`
        : '';
    const metadata: ItemMetadata = {
        [ItemMetadataKeys.ALCHEMY]: cloneMetadataValue(alchemy),
        [ItemMetadataKeys.CUSTOM_NAME]: `${quality.label} ${deliveryLabel}${resultName}`,
        [ItemMetadataKeys.CUSTOM_DESCRIPTION]: `연금 정확도 ${Math.round(alchemy.accuracy * 100)}%와 감각 ${alchemy.sensibility}로 완성된 ${quality.label} 조제약. ${effectText}${areaText}.`,
        thirst: options.delivery === AlchemyDelivery.DRINK ? 5 : 0,
    };
    return {
        itemDataId: formula?.resultItemDataId ?? FAILED_ALCHEMY_POTION_ITEM_ID,
        count: clamp(Math.floor(options.bottleCount), 1, 3),
        durability: null,
        metadataDelta: metadata,
        tags: [],
    };
}
