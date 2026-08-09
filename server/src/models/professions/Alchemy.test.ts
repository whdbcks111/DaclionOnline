import assert from 'node:assert/strict';
import test from 'node:test';
import '../../data/economy/items.js';
import '../../data/combat/statusEffects.js';
import '../../data/professions/alchemy.js';
import { GameTags } from '../../../../shared/tags.js';
import {
    ALCHEMY_WATER_BOTTLE_ITEM_ID,
    FAILED_ALCHEMY_POTION_ITEM_ID,
    AlchemyDelivery,
    AlchemyEffectType,
    AlchemyFailureProfile,
    AlchemyQuality,
    AlchemyReagentInsightTier,
    calculateAlchemyQualityScore,
    createAlchemyInventoryRequirements,
    createAlchemyPotionSnapshot,
    getAlchemyReagentExperimentProgressId,
    getAlchemyReagentInsight,
    getAllAlchemyFormulas,
    getAllAlchemyReagents,
    hasExperimentedAlchemyReagent,
    normalizeAlchemyPotionMetadata,
    resolveAlchemyPotionUse,
    resolveAlchemyFormula,
    recordAlchemyReagentExperiments,
} from './Alchemy.js';
import Inventory from '../economy/Inventory.js';
import { ItemMetadataKeys } from '../economy/Item.js';
import { PlayerProgress, ProgressType } from '../progression/Progress.js';
import { parseAlchemyCommandRemainder, parseAlchemyIngredientList } from '../../commands/economy/alchemy.js';
import { createAlchemyCompletionOutputs, createAlchemyTrackingConfig } from '../../modules/professions/alchemy.js';

test('지역 재료 reagent와 여러 목적의 조합식이 공개 레지스트리에 등록된다', () => {
    assert.ok(getAllAlchemyReagents().length >= 14);
    assert.ok(getAllAlchemyFormulas().length >= 9);
    const effectTypes = new Set(getAllAlchemyFormulas().map(formula => formula.effect.type.key));
    for (const type of ['restore_life', 'restore_mentality', 'beneficial_status', 'harmful_status']) {
        assert.equal(effectTypes.has(type), true, type);
    }
});

test('실제로 사용한 연금 재료는 PlayerProgress 영구 flag로 중복 없이 기록된다', () => {
    const progress = PlayerProgress.createEmpty(77_001);
    assert.equal(hasExperimentedAlchemyReagent(progress, 'mourning_lily'), false);
    assert.deepEqual(recordAlchemyReagentExperiments(progress, [
        'mourning_lily', 'oasis_date', 'mourning_lily', 'not-a-reagent',
    ]), ['mourning_lily', 'oasis_date']);
    assert.equal(hasExperimentedAlchemyReagent(progress, 'mourning_lily'), true);
    assert.equal(hasExperimentedAlchemyReagent(progress, 'oasis_date'), true);
    assert.deepEqual(recordAlchemyReagentExperiments(progress, ['mourning_lily']), []);
    const stored = progress.getSnapshots().find(snapshot =>
        snapshot.id === getAlchemyReagentExperimentProgressId('mourning_lily'));
    assert.equal(stored?.type, ProgressType.FLAG);
    assert.equal(stored?.value, true);
    assert.equal(progress.dirty, true);
});

test('연금 재료 정보는 감각 200·300·400·500 단계에서 허용된 정보만 연다', () => {
    const below = getAlchemyReagentInsight('mourning_lily', 199)!;
    const basic = getAlchemyReagentInsight('mourning_lily', 200)!;
    const traits = getAlchemyReagentInsight('mourning_lily', 300)!;
    const compatibility = getAlchemyReagentInsight('mourning_lily', 400)!;
    const formula = getAlchemyReagentInsight('mourning_lily', 500)!;

    assert.equal(below.tier, undefined);
    assert.equal(below.nextTier, AlchemyReagentInsightTier.BASIC);
    assert.deepEqual(below.traitLabels, []);
    assert.equal(basic.tier, AlchemyReagentInsightTier.BASIC);
    assert.deepEqual(basic.traitLabels, []);
    assert.deepEqual(basic.compatibleFormulas, []);
    assert.equal(traits.tier, AlchemyReagentInsightTier.TRAITS);
    assert.deepEqual(traits.traitLabels, ['생명', '정화']);
    assert.deepEqual(traits.compatibleFormulas, []);
    assert.equal(compatibility.tier, AlchemyReagentInsightTier.COMPATIBILITY);
    assert.deepEqual(compatibility.compatibleFormulas.map(value => value.id), [
        'life-restoration', 'preservation',
    ]);
    assert.deepEqual(compatibility.formulaDetails, []);
    assert.equal(formula.tier, AlchemyReagentInsightTier.FORMULA);
    assert.equal(formula.nextTier, undefined);
    assert.equal(formula.formulaDetails[0].difficulty, 3);
    assert.deepEqual(formula.formulaDetails[0].ingredients, [
        { itemDataId: 'mourning_lily', count: 2 },
        { itemDataId: 'oasis_date', count: 1 },
    ]);
    assert.equal(formula.formulaDetails[0].effect.basePower, 750);
});

test('재료 순서와 무관하게 1~3병 배수만 정확한 조합으로 판정한다', () => {
    const one = resolveAlchemyFormula([
        { itemDataId: 'oasis_date', count: 1 },
        { itemDataId: 'mourning_lily', count: 2 },
    ], 1);
    const three = resolveAlchemyFormula([
        { itemDataId: 'mourning_lily', count: 6 },
        { itemDataId: 'oasis_date', count: 3 },
    ], 3);
    assert.equal(one?.id, 'life-restoration');
    assert.equal(three?.id, 'life-restoration');
    assert.equal(resolveAlchemyFormula([
        { itemDataId: 'mourning_lily', count: 6 },
        { itemDataId: 'oasis_date', count: 2 },
    ], 3), undefined);
    assert.equal(resolveAlchemyFormula(one!.ingredients, 0), undefined);
    assert.equal(resolveAlchemyFormula(one!.ingredients, 4), undefined);
});

test('정확도와 감각은 상한 안에서 품질·효율·지속·투척 대상 수를 함께 높인다', () => {
    const lowScore = calculateAlchemyQualityScore(0.5, 0);
    const highScore = calculateAlchemyQualityScore(0.92, 600);
    assert.ok(highScore > lowScore);
    const low = AlchemyQuality.fromScore(lowScore);
    const high = AlchemyQuality.fromScore(highScore);
    assert.ok(high.powerMultiplier > low.powerMultiplier);
    assert.ok(high.durationMultiplier > low.durationMultiplier);
    assert.ok(high.areaTargetCap > low.areaTargetCap);
    assert.equal(calculateAlchemyQualityScore(1, Number.POSITIVE_INFINITY), 0.9);
});

test('완성 스냅샷은 병 수와 전달 방식, 품질, 효과를 인스턴스 metadata에 영속화한다', () => {
    const formula = getAllAlchemyFormulas().find(value => value.id === 'toxic')!;
    const snapshot = createAlchemyPotionSnapshot({
        formula,
        delivery: AlchemyDelivery.THROW,
        bottleCount: 3,
        accuracy: 0.86,
        sensibility: 320,
    });
    const metadata = normalizeAlchemyPotionMetadata(snapshot.metadataDelta?.[ItemMetadataKeys.ALCHEMY]);
    assert.equal(snapshot.count, 3);
    assert.equal(snapshot.itemDataId, formula.resultItemDataId);
    assert.equal(metadata?.delivery, 'throw');
    assert.equal(metadata?.effect.audience, 'harmful');
    assert.ok((metadata?.areaTargetCap ?? 0) >= 3);
    assert.match(String(snapshot.metadataDelta?.[ItemMetadataKeys.CUSTOM_DESCRIPTION]), /연금 정확도/);
});

test('조제약 사용 해석은 결과 아이템과 조합식을 대조하고 canonical 효과만 반환한다', () => {
    const formula = getAllAlchemyFormulas().find(value => value.id === 'toxic')!;
    const snapshot = createAlchemyPotionSnapshot({
        formula,
        delivery: AlchemyDelivery.THROW,
        bottleCount: 1,
        accuracy: 0.86,
        sensibility: 320,
    });
    const raw = snapshot.metadataDelta?.[ItemMetadataKeys.ALCHEMY];
    const resolved = resolveAlchemyPotionUse(snapshot.itemDataId, raw);
    assert.equal(resolved?.formula?.id, formula.id);
    assert.equal(resolved?.effectType.key, 'harmful_status');
    assert.equal(resolved?.metadata.effect.statusEffectId, 'deadly_poison');
    assert.equal(resolved?.metadata.effect.damageType, 'magic');
    assert.equal(resolveAlchemyPotionUse('alchemy_life_draught', raw), undefined);
});

test('미확인 조합 실패약은 독성 우선과 생명·정신 가중치로 제한된 profile을 정한다', () => {
    assert.equal(AlchemyFailureProfile.fromIngredients([
        { itemDataId: 'dune_scorpion_venom', count: 1 },
        { itemDataId: 'mourning_lily', count: 30 },
    ]), AlchemyFailureProfile.TOXIC);
    assert.equal(AlchemyFailureProfile.fromIngredients([
        { itemDataId: 'mourning_lily', count: 2 },
    ]), AlchemyFailureProfile.RESTORATIVE);
    assert.equal(AlchemyFailureProfile.fromIngredients([
        { itemDataId: 'mana_crystal', count: 3 },
        { itemDataId: 'mourning_lily', count: 1 },
    ]), AlchemyFailureProfile.MENTAL);
    assert.equal(AlchemyFailureProfile.fromIngredients([
        { itemDataId: 'mana_crystal', count: 1 },
        { itemDataId: 'mourning_lily', count: 1 },
    ]), AlchemyFailureProfile.UNSTABLE);
    assert.equal(AlchemyFailureProfile.fromIngredients([
        { itemDataId: 'wolf_pelt', count: 1 },
    ]), AlchemyFailureProfile.UNSTABLE);
});

test('신규 실패약은 profile별 약한 효과와 원재료 signature를 canonical metadata로 저장한다', () => {
    const createFailed = (itemDataId: string, count = 1) => createAlchemyPotionSnapshot({
        formula: undefined,
        ingredients: [{ itemDataId, count }],
        delivery: AlchemyDelivery.DRINK,
        bottleCount: 1,
        accuracy: 0.82,
        sensibility: 240,
    });
    const toxic = createFailed('dune_scorpion_venom');
    const restorative = createFailed('mourning_lily');
    const mental = createFailed('mana_crystal');
    const unstable = createFailed('wolf_pelt');
    const resolvedToxic = resolveAlchemyPotionUse(
        toxic.itemDataId,
        toxic.metadataDelta?.[ItemMetadataKeys.ALCHEMY],
    );
    const resolvedRestorative = resolveAlchemyPotionUse(
        restorative.itemDataId,
        restorative.metadataDelta?.[ItemMetadataKeys.ALCHEMY],
    );
    const resolvedMental = resolveAlchemyPotionUse(
        mental.itemDataId,
        mental.metadataDelta?.[ItemMetadataKeys.ALCHEMY],
    );
    const resolvedUnstable = resolveAlchemyPotionUse(
        unstable.itemDataId,
        unstable.metadataDelta?.[ItemMetadataKeys.ALCHEMY],
    );

    assert.equal(resolvedToxic?.failureProfile, AlchemyFailureProfile.TOXIC);
    assert.equal(resolvedToxic?.metadata.failureIngredientSignature, 'dune_scorpion_venom:1');
    assert.equal(resolvedToxic?.metadata.effect.audience, 'harmful');
    assert.equal(resolvedToxic?.metadata.effect.statusEffectId, 'poison');
    assert.equal(resolvedToxic?.metadata.effect.damageType, 'magic');
    assert.equal(toxic.tags.includes(GameTags.PROPERTY_POISON), true);
    assert.doesNotMatch(String(toxic.metadataDelta?.[ItemMetadataKeys.CUSTOM_DESCRIPTION]), /회복/);

    assert.equal(resolvedRestorative?.effectType, AlchemyEffectType.RESTORE_LIFE);
    assert.ok((resolvedRestorative?.metadata.effect.power ?? 750) < 750);
    assert.equal(resolvedMental?.effectType, AlchemyEffectType.RESTORE_MENTALITY);
    assert.ok((resolvedMental?.metadata.effect.power ?? 420) < 420);
    assert.equal(resolvedUnstable?.effectType, AlchemyEffectType.UNSTABLE);
    assert.equal(resolvedUnstable?.metadata.effect.audience, 'harmful');
    assert.equal(resolvedUnstable?.metadata.effect.statusEffectId, undefined);
    assert.equal(unstable.tags.includes(GameTags.PROPERTY_POISON), false);
});

test('실패약 profile·원재료 signature·효과 위변조는 거부하고 legacy 실패약은 기존 약한 회복을 유지한다', () => {
    const snapshot = createAlchemyPotionSnapshot({
        formula: undefined,
        ingredients: [{ itemDataId: 'dune_scorpion_venom', count: 1 }],
        delivery: AlchemyDelivery.DRINK,
        bottleCount: 1,
        accuracy: 0.71,
        sensibility: 200,
    });
    const raw = snapshot.metadataDelta?.[ItemMetadataKeys.ALCHEMY] as Record<string, unknown>;
    const mutate = (change: (candidate: Record<string, any>) => void) => {
        const candidate = JSON.parse(JSON.stringify(raw)) as Record<string, any>;
        change(candidate);
        return resolveAlchemyPotionUse(snapshot.itemDataId, candidate);
    };
    assert.equal(mutate(candidate => { candidate.failureProfile = 'restorative'; }), undefined);
    assert.equal(mutate(candidate => { candidate.failureIngredientSignature = 'mourning_lily:1'; }), undefined);
    assert.equal(mutate(candidate => { candidate.effect.power *= 100; }), undefined);

    const legacy = createAlchemyPotionSnapshot({
        formula: undefined,
        delivery: AlchemyDelivery.DRINK,
        bottleCount: 1,
        accuracy: 0.71,
        sensibility: 200,
    });
    const legacyResolved = resolveAlchemyPotionUse(
        legacy.itemDataId,
        legacy.metadataDelta?.[ItemMetadataKeys.ALCHEMY],
    );
    assert.equal(legacyResolved?.failureProfile, undefined);
    assert.equal(legacyResolved?.metadata.failureIngredientSignature, undefined);
    assert.equal(legacyResolved?.effectType, AlchemyEffectType.FAILED);
    assert.equal(legacyResolved?.metadata.effect.audience, 'beneficial');
});

test('효과·품질·전달 metadata 위변조는 포션 권한 해석 단계에서 거부된다', () => {
    const formula = getAllAlchemyFormulas().find(value => value.id === 'life-restoration')!;
    const snapshot = createAlchemyPotionSnapshot({
        formula,
        delivery: AlchemyDelivery.DRINK,
        bottleCount: 1,
        accuracy: 0.73,
        sensibility: 240,
    });
    const raw = snapshot.metadataDelta?.[ItemMetadataKeys.ALCHEMY] as Record<string, unknown>;
    const clone = () => JSON.parse(JSON.stringify(raw)) as Record<string, any>;
    const mutations: Array<[string, (candidate: Record<string, any>) => void]> = [
        ['power', candidate => { candidate.effect.power *= 100; }],
        ['duration', candidate => { candidate.effect.duration = 999; }],
        ['status', candidate => { candidate.effect.statusEffectId = 'deadly_poison'; }],
        ['audience', candidate => { candidate.effect.audience = 'harmful'; }],
        ['quality', candidate => { candidate.quality = 'masterwork'; }],
        ['score', candidate => { candidate.qualityScore = 1; }],
        ['cap', candidate => { candidate.areaTargetCap = 5; }],
        ['accuracy range', candidate => { candidate.accuracy = 2; }],
        ['sensibility range', candidate => { candidate.sensibility = Number.MAX_VALUE; }],
        ['formula', candidate => { candidate.formulaId = 'mind-restoration'; }],
        ['delivery', candidate => { candidate.delivery = 'teleport'; }],
    ];
    for (const [label, mutate] of mutations) {
        const candidate = clone();
        mutate(candidate);
        assert.equal(resolveAlchemyPotionUse(snapshot.itemDataId, candidate), undefined, label);
    }
    assert.equal(resolveAlchemyPotionUse(snapshot.itemDataId, raw)?.formula?.id, formula.id);
});

test('2병 조제는 재료와 정제수 물병을 정확한 배수로 한 번에 교환한다', () => {
    const inventory = Inventory.createEmpty(7710, 1_000);
    inventory.addItem('mourning_lily', 4);
    inventory.addItem('oasis_date', 2);
    inventory.addItem(ALCHEMY_WATER_BOTTLE_ITEM_ID, 2);
    const ingredients = [
        { itemDataId: 'mourning_lily', count: 4 },
        { itemDataId: 'oasis_date', count: 2 },
    ];
    const formula = resolveAlchemyFormula(ingredients, 2)!;
    const selections = inventory.selectItems(createAlchemyInventoryRequirements(ingredients, 2));
    assert.ok(selections);
    const output = createAlchemyPotionSnapshot({
        formula,
        delivery: AlchemyDelivery.DRINK,
        bottleCount: 2,
        accuracy: 0.8,
        sensibility: 200,
    });
    assert.equal(inventory.replaceSelectedItems(selections, [output]), true);
    assert.equal(inventory.getCount('mourning_lily'), 0);
    assert.equal(inventory.getCount('oasis_date'), 0);
    assert.equal(inventory.getCount(ALCHEMY_WATER_BOTTLE_ITEM_ID), 0);
    assert.equal(inventory.getCount(formula.resultItemDataId), 2);
});

test('물병이나 재료가 한 개라도 부족하면 조제 교환은 시작 전부터 거부된다', () => {
    const inventory = Inventory.createEmpty(7711, 1_000);
    inventory.addItem('mourning_lily', 6);
    inventory.addItem('oasis_date', 3);
    inventory.addItem(ALCHEMY_WATER_BOTTLE_ITEM_ID, 2);
    const ingredients = [
        { itemDataId: 'mourning_lily', count: 6 },
        { itemDataId: 'oasis_date', count: 3 },
    ];
    assert.equal(inventory.selectItems(createAlchemyInventoryRequirements(ingredients, 3)), null);
    assert.equal(inventory.getCount('mourning_lily'), 6);
    assert.equal(inventory.getCount(ALCHEMY_WATER_BOTTLE_ITEM_ID), 2);
});

test('연금 명령은 1~3병·음용/투척과 쉼표 재료 수량을 안전하게 해석한다', () => {
    assert.deepEqual(parseAlchemyIngredientList('애도의 백합x4, 오아시스 대추야자:2'), [
        { itemDataId: 'mourning_lily', count: 4 },
        { itemDataId: 'oasis_date', count: 2 },
    ]);
    const parsed = parseAlchemyCommandRemainder('2 투척 애도의 백합x4, 오아시스 대추야자x2');
    assert.equal(parsed?.bottleCount, 2);
    assert.equal(parsed?.delivery, AlchemyDelivery.THROW);
    assert.deepEqual(parseAlchemyCommandRemainder('3 음용 모래전갈 독수x1'), {
        bottleCount: 3,
        delivery: AlchemyDelivery.DRINK,
        ingredients: [{ itemDataId: 'dune_scorpion_venom', count: 1 }],
    });
    assert.deepEqual(parseAlchemyIngredientList('모래전갈 독수x1,'), [
        { itemDataId: 'dune_scorpion_venom', count: 1 },
    ]);
    assert.equal(parseAlchemyIngredientList('모래전갈 독수x1 모래전갈 독수x1'), undefined);
    assert.equal(parseAlchemyCommandRemainder('4 음용 애도의 백합x8, 오아시스 대추야자x4'), undefined);
    assert.equal(parseAlchemyIngredientList('존재하지 않음x1, 애도의 백합x1'), undefined);
});

test('조합식·재료 hash는 순서와 무관한 결정론 config와 유효한 추적 패턴을 만든다', () => {
    const formula = getAllAlchemyFormulas().find(value => value.id === 'life-restoration')!;
    const ingredients = [
        { itemDataId: 'mourning_lily', count: 2 },
        { itemDataId: 'oasis_date', count: 1 },
    ];
    const first = createAlchemyTrackingConfig(formula, ingredients, 1);
    const reordered = createAlchemyTrackingConfig(formula, [...ingredients].reverse(), 1);
    assert.deepEqual(reordered, first);
    assert.ok(['orbit', 'figure_eight', 'clover', 'spiral', 'zigzag'].includes(first.patternKey));
    assert.ok(['steady', 'pulse', 'surge'].includes(first.speedProfileKey));
    assert.ok(first.targetRadius >= 4.5 && first.targetRadius <= 6);
    assert.ok(first.reverseAtMs.every((value, index) => value > (first.reverseAtMs[index - 1] ?? 0)
        && value < first.durationMs));
    assert.notEqual(createAlchemyTrackingConfig(formula, ingredients.map(ingredient => ({
        ...ingredient,
        count: ingredient.count * 2,
    })), 2).seed, first.seed);
});

test('연금 결과 정책은 성공 조합·성공 미확인 조합·추적 실패를 구분한다', () => {
    const formula = getAllAlchemyFormulas().find(value => value.id === 'life-restoration')!;
    const base = {
        delivery: AlchemyDelivery.DRINK,
        bottleCount: 2,
        sensibility: 300,
    } as const;
    const normal = createAlchemyCompletionOutputs({
        ...base,
        formula,
        ingredients: formula.ingredients,
        result: { success: true, score: 0.84 },
    });
    const unknown = createAlchemyCompletionOutputs({
        ...base,
        formula: undefined,
        ingredients: [{ itemDataId: 'wolf_pelt', count: 1 }],
        result: { success: true, score: 0.84 },
    });
    const failed = createAlchemyCompletionOutputs({
        ...base,
        formula,
        ingredients: formula.ingredients,
        result: { success: false, score: 0.96 },
    });
    assert.equal(normal[0]?.itemDataId, formula.resultItemDataId);
    assert.equal(normal[0]?.count, 2);
    assert.equal(unknown[0]?.itemDataId, FAILED_ALCHEMY_POTION_ITEM_ID);
    assert.deepEqual(failed, []);
});
