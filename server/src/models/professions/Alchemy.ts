import { ItemMetadataKeys, type ItemMetadata, type ItemSnapshot } from '../economy/Item.js';
import { cloneMetadataValue } from '../core/Metadata.js';
import { ProgressType, defineProgress } from '../progression/Progress.js';
import type { PlayerProgress } from '../progression/Progress.js';
import { GameTags } from '../../../../shared/tags.js';

export const ALCHEMY_WATER_BOTTLE_ITEM_ID = 'alchemy_water_bottle';
export const FAILED_ALCHEMY_POTION_ITEM_ID = 'failed_alchemy_potion';
export const ALCHEMIST_JOB_ID = 'career:alchemist';
export const ALCHEMY_FEATURE_SKILL_ID = 'cauldron_alchemy';
export const ALCHEMY_MAX_DISTINCT_REAGENTS = 5;
export const ALCHEMY_MAX_TOTAL_REAGENT_COUNT = 90;
export const ALCHEMY_HARMFUL_DAMAGE_SCALE = 80;
const ALCHEMY_REAGENT_EXPERIMENT_PREFIX = 'alchemy:reagent-experimented/';

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
    static readonly UNSTABLE = new AlchemyEffectType('unstable', '불안정 피해', 'harmful');
    /** profile 도입 전 저장된 실패약의 약한 회복 효과. 신규 실패약에는 사용하지 않는다. */
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

/** 감각으로 해석할 수 있는 영구 연금 재료 실험 기록의 깊이. */
export class AlchemyReagentInsightTier {
    private static readonly all: AlchemyReagentInsightTier[] = [];

    static readonly BASIC = new AlchemyReagentInsightTier('basic', '기초 감별', 200);
    static readonly TRAITS = new AlchemyReagentInsightTier('traits', '성질 분석', 300);
    static readonly COMPATIBILITY = new AlchemyReagentInsightTier('compatibility', '배합 추론', 400);
    static readonly FORMULA = new AlchemyReagentInsightTier('formula', '정밀 해석', 500);

    private constructor(
        readonly key: string,
        readonly label: string,
        readonly minimumSensibility: number,
    ) {
        AlchemyReagentInsightTier.all.push(this);
    }

    static values(): readonly AlchemyReagentInsightTier[] { return AlchemyReagentInsightTier.all; }
    static fromSensibility(sensibility: number): AlchemyReagentInsightTier | undefined {
        const normalized = Number.isFinite(sensibility) ? Math.max(0, Math.floor(sensibility)) : 0;
        return [...AlchemyReagentInsightTier.all].reverse()
            .find(tier => normalized >= tier.minimumSensibility);
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
    defineProgress({
        id: getAlchemyReagentExperimentProgressId(itemDataId),
        type: ProgressType.FLAG,
        label: `연금 재료 실험: ${itemDataId}`,
        description: '가마솥에 실제로 투입해 본 연금 재료의 영구 기록',
        visible: false,
        tags: ['progress:alchemy-reagent-experiment'],
    });
}

export function getAlchemyReagent(itemDataId: string): Readonly<AlchemyReagentData> | undefined {
    return reagentByItemDataId.get(itemDataId.trim());
}

export function getAllAlchemyReagents(): readonly Readonly<AlchemyReagentData>[] {
    return [...reagentByItemDataId.values()];
}

export function getAlchemyReagentExperimentProgressId(itemDataId: string): string {
    return `${ALCHEMY_REAGENT_EXPERIMENT_PREFIX}${itemDataId.trim()}`;
}

export function hasExperimentedAlchemyReagent(
    progress: PlayerProgress,
    itemDataId: string,
): boolean {
    return Boolean(getAlchemyReagent(itemDataId))
        && progress.getFlag(getAlchemyReagentExperimentProgressId(itemDataId));
}

/** 실제 ready 비용 확정 뒤 호출해 등록된 재료별 영구 실험 flag를 남긴다. */
export function recordAlchemyReagentExperiments(
    progress: PlayerProgress,
    itemDataIds: readonly string[],
): readonly string[] {
    const registered = [...new Set(itemDataIds.map(value => value.trim()))]
        .filter(itemDataId => Boolean(getAlchemyReagent(itemDataId)));
    const newlyRecorded: string[] = [];
    for (const itemDataId of registered) {
        if (!hasExperimentedAlchemyReagent(progress, itemDataId)) newlyRecorded.push(itemDataId);
        progress.setFlag(getAlchemyReagentExperimentProgressId(itemDataId));
    }
    return Object.freeze(newlyRecorded);
}

export function getExperimentedAlchemyReagents(
    progress: PlayerProgress,
): readonly Readonly<AlchemyReagentData>[] {
    return Object.freeze(getAllAlchemyReagents()
        .filter(reagent => hasExperimentedAlchemyReagent(progress, reagent.itemDataId)));
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

export interface AlchemyReagentFormulaCompatibilitySnapshot {
    readonly id: string;
    readonly name: string;
    readonly resultItemDataId: string;
    readonly partnerItemDataIds: readonly string[];
}

export interface AlchemyReagentFormulaDetailSnapshot {
    readonly id: string;
    readonly name: string;
    readonly resultItemDataId: string;
    readonly description: string;
    readonly difficulty: number;
    readonly ingredients: readonly Readonly<AlchemyFormulaIngredient>[];
    readonly effect: Readonly<AlchemyFormulaEffectDefinition>;
}

export interface AlchemyReagentInsightSnapshot {
    readonly itemDataId: string;
    readonly sensibility: number;
    readonly tier?: AlchemyReagentInsightTier;
    readonly nextTier?: AlchemyReagentInsightTier;
    readonly traitLabels: readonly string[];
    readonly compatibleFormulas: readonly AlchemyReagentFormulaCompatibilitySnapshot[];
    readonly formulaDetails: readonly AlchemyReagentFormulaDetailSnapshot[];
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

/** 명령이 감각 단계 밖의 원본 성질·조합 수치를 실수로 노출하지 않도록 가공한 불변 정보. */
export function getAlchemyReagentInsight(
    itemDataId: string,
    sensibility: number,
): AlchemyReagentInsightSnapshot | undefined {
    const reagent = getAlchemyReagent(itemDataId);
    if (!reagent) return undefined;
    const normalizedSensibility = Number.isFinite(sensibility) ? Math.max(0, Math.floor(sensibility)) : 0;
    const tier = AlchemyReagentInsightTier.fromSensibility(normalizedSensibility);
    const nextTier = AlchemyReagentInsightTier.values()
        .find(candidate => normalizedSensibility < candidate.minimumSensibility);
    const formulas = getAllAlchemyFormulas()
        .filter(formula => formula.ingredients.some(ingredient => ingredient.itemDataId === reagent.itemDataId));
    const revealTraits = tier !== undefined
        && tier.minimumSensibility >= AlchemyReagentInsightTier.TRAITS.minimumSensibility;
    const revealCompatibility = tier !== undefined
        && tier.minimumSensibility >= AlchemyReagentInsightTier.COMPATIBILITY.minimumSensibility;
    const revealFormula = tier !== undefined
        && tier.minimumSensibility >= AlchemyReagentInsightTier.FORMULA.minimumSensibility;
    return Object.freeze({
        itemDataId: reagent.itemDataId,
        sensibility: normalizedSensibility,
        ...(tier ? { tier } : {}),
        ...(nextTier ? { nextTier } : {}),
        traitLabels: Object.freeze(revealTraits ? reagent.traits.map(trait => trait.label) : []),
        compatibleFormulas: Object.freeze(revealCompatibility ? formulas.map(formula => Object.freeze({
            id: formula.id,
            name: formula.name,
            resultItemDataId: formula.resultItemDataId,
            partnerItemDataIds: Object.freeze(formula.ingredients
                .filter(ingredient => ingredient.itemDataId !== reagent.itemDataId)
                .map(ingredient => ingredient.itemDataId)),
        })) : []),
        formulaDetails: Object.freeze(revealFormula ? formulas.map(formula => Object.freeze({
            id: formula.id,
            name: formula.name,
            resultItemDataId: formula.resultItemDataId,
            description: formula.description,
            difficulty: formula.difficulty,
            ingredients: Object.freeze(formula.ingredients.map(ingredient => Object.freeze({ ...ingredient }))),
            effect: Object.freeze({ ...formula.effect }),
        })) : []),
    });
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

function normalizeFailureIngredients(
    ingredients: readonly AlchemyIngredientSelectionInput[],
): readonly AlchemyIngredientSelectionInput[] | undefined {
    const totals = new Map<string, number>();
    for (const ingredient of ingredients) {
        const itemDataId = ingredient.itemDataId.trim();
        if (!getAlchemyReagent(itemDataId) || !Number.isSafeInteger(ingredient.count)
            || ingredient.count <= 0 || ingredient.count > 99) return undefined;
        totals.set(itemDataId, (totals.get(itemDataId) ?? 0) + ingredient.count);
    }
    if (totals.size < 1 || totals.size > ALCHEMY_MAX_DISTINCT_REAGENTS) return undefined;
    const normalized = [...totals]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([itemDataId, count]) => Object.freeze({ itemDataId, count }));
    const totalCount = normalized.reduce((sum, ingredient) => sum + ingredient.count, 0);
    return totalCount <= ALCHEMY_MAX_TOTAL_REAGENT_COUNT
        && normalized.every(ingredient => ingredient.count <= 99)
        ? Object.freeze(normalized)
        : undefined;
}

/** 미확인 조합의 실제 재료 성질로만 결정되는 제한된 실패약 결과 프로필. */
export class AlchemyFailureProfile {
    private static readonly all: AlchemyFailureProfile[] = [];

    static readonly TOXIC = new AlchemyFailureProfile(
        'toxic', '독성', AlchemyEffectType.HARMFUL_STATUS, 1.25, 6, 'poison', 'magic',
    );
    static readonly RESTORATIVE = new AlchemyFailureProfile(
        'restorative', '회복성', AlchemyEffectType.RESTORE_LIFE, 75, 0,
    );
    static readonly MENTAL = new AlchemyFailureProfile(
        'mental', '정신성', AlchemyEffectType.RESTORE_MENTALITY, 42, 0,
    );
    static readonly UNSTABLE = new AlchemyFailureProfile(
        'unstable', '불안정', AlchemyEffectType.UNSTABLE, 1, 0, undefined, 'magic',
    );

    private constructor(
        readonly key: 'toxic' | 'restorative' | 'mental' | 'unstable',
        readonly label: string,
        readonly effectType: AlchemyEffectType,
        readonly basePower: number,
        readonly baseDuration: number,
        readonly statusEffectId?: string,
        readonly damageType?: 'physical' | 'magic' | 'absolute',
    ) {
        AlchemyFailureProfile.all.push(this);
    }

    static values(): readonly AlchemyFailureProfile[] { return AlchemyFailureProfile.all; }
    static fromKey(key: string): AlchemyFailureProfile | undefined {
        return AlchemyFailureProfile.all.find(value => value.key === key.trim().toLowerCase());
    }

    static fromIngredients(
        ingredients: readonly AlchemyIngredientSelectionInput[],
    ): AlchemyFailureProfile | undefined {
        const normalized = normalizeFailureIngredients(ingredients);
        if (!normalized) return undefined;
        let restorativeScore = 0;
        let mentalScore = 0;
        for (const ingredient of normalized) {
            const traits = getAlchemyReagent(ingredient.itemDataId)!.traits;
            if (traits.includes(AlchemyReagentTrait.TOXIN)) return AlchemyFailureProfile.TOXIC;
            if (traits.includes(AlchemyReagentTrait.LIFE) || traits.includes(AlchemyReagentTrait.GROWTH)) {
                restorativeScore += ingredient.count;
            }
            if (traits.includes(AlchemyReagentTrait.MIND)) mentalScore += ingredient.count;
        }
        if (restorativeScore > mentalScore) return AlchemyFailureProfile.RESTORATIVE;
        if (mentalScore > restorativeScore) return AlchemyFailureProfile.MENTAL;
        return AlchemyFailureProfile.UNSTABLE;
    }
}

/** 신규 실패약 metadata가 원재료 profile을 서버에서 재구성할 수 있는 정규 signature. */
export function createAlchemyFailureIngredientSignature(
    ingredients: readonly AlchemyIngredientSelectionInput[],
): string | undefined {
    return normalizeFailureIngredients(ingredients)
        ?.map(ingredient => `${ingredient.itemDataId}:${ingredient.count}`)
        .join('|');
}

function parseAlchemyFailureIngredientSignature(
    signature: string,
): readonly AlchemyIngredientSelectionInput[] | undefined {
    if (!signature || signature.length > 512) return undefined;
    const parsed = signature.split('|').map(entry => {
        const matched = entry.match(/^([a-z0-9_-]+):(\d+)$/);
        return matched ? { itemDataId: matched[1], count: Number(matched[2]) } : undefined;
    });
    if (parsed.some(ingredient => ingredient === undefined)) return undefined;
    const ingredients = normalizeFailureIngredients(parsed as AlchemyIngredientSelectionInput[]);
    return ingredients && createAlchemyFailureIngredientSignature(ingredients) === signature
        ? ingredients
        : undefined;
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

/** 품질은 결과 이름·효율·지속시간·투척 대상 수·조제 경험치가 함께 사용하는 클래스형 enum. */
export class AlchemyQuality {
    private static readonly all: AlchemyQuality[] = [];

    static readonly CLOUDY = new AlchemyQuality('cloudy', '탁한', 0, 0.72, 0.75, 2, 0.6);
    static readonly STABLE = new AlchemyQuality('stable', '안정된', 0.45, 0.9, 0.92, 2, 0.8);
    static readonly REFINED = new AlchemyQuality('refined', '정제된', 0.62, 1.05, 1.08, 3, 1);
    static readonly EXCELLENT = new AlchemyQuality('excellent', '우수한', 0.78, 1.2, 1.22, 4, 1.2);
    static readonly MASTERWORK = new AlchemyQuality('masterwork', '명인의', 0.92, 1.35, 1.38, 5, 1.4);

    private constructor(
        readonly key: string,
        readonly label: string,
        readonly minimumScore: number,
        readonly powerMultiplier: number,
        readonly durationMultiplier: number,
        readonly areaTargetCap: number,
        readonly experienceMultiplier: number,
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
    /** 신규 미확인 조합에만 존재한다. 둘 다 없으면 profile 도입 전 legacy 실패약이다. */
    readonly failureProfile?: string;
    readonly failureIngredientSignature?: string;
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
    readonly failureProfile?: AlchemyFailureProfile;
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
    const hasFailureProfile = Object.prototype.hasOwnProperty.call(candidate, 'failureProfile');
    const hasFailureSignature = Object.prototype.hasOwnProperty.call(candidate, 'failureIngredientSignature');
    const failureProfile = typeof candidate.failureProfile === 'string'
        ? AlchemyFailureProfile.fromKey(candidate.failureProfile)
        : undefined;
    if (!delivery || !quality || !effectType || typeof candidate.formulaId !== 'string'
        || !candidate.formulaId || candidate.formulaId.length > 80
        || hasFailureProfile !== hasFailureSignature
        || (hasFailureProfile && (!failureProfile
            || typeof candidate.failureIngredientSignature !== 'string'
            || !parseAlchemyFailureIngredientSignature(candidate.failureIngredientSignature)))
        || (candidate.formulaId !== 'failed' && hasFailureProfile)
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
        ...(failureProfile && typeof candidate.failureIngredientSignature === 'string' ? {
            failureProfile: failureProfile.key,
            failureIngredientSignature: candidate.failureIngredientSignature,
        } : {}),
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
    readonly ingredients?: readonly AlchemyIngredientSelectionInput[];
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
    const failureProfile = formula || options.ingredients === undefined
        ? undefined
        : AlchemyFailureProfile.fromIngredients(options.ingredients);
    const failureIngredientSignature = formula || options.ingredients === undefined
        ? undefined
        : createAlchemyFailureIngredientSignature(options.ingredients);
    if (!formula && options.ingredients !== undefined && (!failureProfile || !failureIngredientSignature)) {
        throw new Error('실패약 재료 profile을 만들 수 없습니다.');
    }
    const effectType = formula?.effect.type
        ?? failureProfile?.effectType
        ?? AlchemyEffectType.FAILED;
    const basePower = formula?.effect.basePower
        ?? failureProfile?.basePower
        ?? (formula ? 0 : 12);
    const baseDuration = formula?.effect.baseDuration
        ?? failureProfile?.baseDuration
        ?? 0;
    const statusEffectId = formula?.effect.statusEffectId ?? failureProfile?.statusEffectId;
    const damageType = formula?.effect.damageType ?? failureProfile?.damageType;
    return {
        formulaId: formula?.id ?? 'failed',
        ...(failureProfile && failureIngredientSignature ? {
            failureProfile: failureProfile.key,
            failureIngredientSignature,
        } : {}),
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
            ...(statusEffectId ? { statusEffectId } : {}),
            ...(damageType ? { damageType } : {}),
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
    const failureIngredients = stored.failureIngredientSignature
        ? parseAlchemyFailureIngredientSignature(stored.failureIngredientSignature)
        : undefined;
    const failureProfile = failureIngredients
        ? AlchemyFailureProfile.fromIngredients(failureIngredients)
        : undefined;
    if ((stored.failureProfile !== undefined || stored.failureIngredientSignature !== undefined)
        && (!failureProfile || stored.failureProfile !== failureProfile.key)) return undefined;
    const canonical = createCanonicalAlchemyPotionMetadata({
        formula,
        ...(failureIngredients ? { ingredients: failureIngredients } : {}),
        delivery,
        accuracy: stored.accuracy,
        sensibility: stored.sensibility,
    });
    if (stored.failureProfile !== canonical.failureProfile
        || stored.failureIngredientSignature !== canonical.failureIngredientSignature
        || stored.quality !== canonical.quality
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
    return {
        metadata: canonical,
        formula,
        ...(failureProfile ? { failureProfile } : {}),
        delivery,
        quality,
        effectType,
    };
}

export function createAlchemyPotionSnapshot(options: {
    readonly formula: Readonly<AlchemyFormulaData> | undefined;
    readonly ingredients?: readonly AlchemyIngredientSelectionInput[];
    readonly delivery: AlchemyDelivery;
    readonly bottleCount: number;
    readonly accuracy: number;
    readonly sensibility: number;
}): ItemSnapshot {
    const formula = options.formula;
    const alchemy = createCanonicalAlchemyPotionMetadata(options);
    const quality = AlchemyQuality.fromKey(alchemy.quality)!;
    const failed = !formula;
    const failureProfile = alchemy.failureProfile
        ? AlchemyFailureProfile.fromKey(alchemy.failureProfile)
        : undefined;
    const effectType = AlchemyEffectType.fromKey(alchemy.effect.type)!;
    const power = alchemy.effect.power;
    const duration = alchemy.effect.duration;
    const deliveryLabel = options.delivery === AlchemyDelivery.THROW ? '투척형 ' : '';
    const resultName = failed
        ? failureProfile ? `${failureProfile.label} 실패약` : '실패한 조제약'
        : formula.name;
    const audienceLabel = effectType.audience === 'beneficial' ? '아군' : '적';
    const effectText = effectType === AlchemyEffectType.RESTORE_LIFE ? `생명력 ${power} 회복`
        : effectType === AlchemyEffectType.RESTORE_MENTALITY ? `정신력 ${power} 회복`
            : effectType === AlchemyEffectType.FAILED ? `생명력 ${power} 회복`
                : effectType === AlchemyEffectType.UNSTABLE
                    ? `불안정 마법 피해 ${roundPotionValue(power * ALCHEMY_HARMFUL_DAMAGE_SCALE)}`
                    : failureProfile === AlchemyFailureProfile.TOXIC
                        ? `독성 마법 피해 ${roundPotionValue(power * ALCHEMY_HARMFUL_DAMAGE_SCALE)} · 독 ${duration}초`
                        : `${alchemy.effect.statusEffectId ?? effectType.label} Lv.${Math.max(1, Math.round(power))} · ${duration}초`;
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
        tags: failureProfile === AlchemyFailureProfile.TOXIC
            ? [GameTags.PROPERTY_POISON]
            : [],
    };
}
