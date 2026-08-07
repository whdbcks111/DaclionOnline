import assert from 'node:assert/strict';
import test from 'node:test';
import CodexBook, {
    CodexCategory,
    CodexRank,
    createCodexEntryId,
    defineCodexEntry,
    freezeCodexRegistry,
    getAllCodexEntries,
    getCodexEntry,
    isCodexRegistryFrozen,
    reloadCodexRegistry,
    type CodexEntryDefinition,
} from './Codex.js';
import { getProgressDefinition, PlayerProgress, ProgressType } from './Progress.js';

function entry(
    id: string,
    category = CodexCategory.MONSTER,
    thresholds = { bronze: 2, silver: 4, gold: 6 },
): CodexEntryDefinition {
    return { id, category, name: id.split(':').at(-1)!, thresholds };
}

test.after(() => { reloadCodexRegistry([], false); });

test('CodexCategory와 CodexRank는 순회·key·한국어 입력과 보너스 메타데이터를 소유한다', () => {
    assert.deepEqual(CodexCategory.values().map(category => category.key), [
        'monster', 'boss', 'ore', 'exploration', 'cooking',
    ]);
    assert.equal(CodexCategory.fromKey('boss'), CodexCategory.BOSS);
    assert.equal(CodexCategory.fromInput('지역 탐험 도감'), CodexCategory.EXPLORATION);
    assert.equal(CodexCategory.fromInput('요리'), CodexCategory.COOKING);
    assert.deepEqual(CodexCategory.values().map(category => category.bonusDescription), [
        '개별 공격력·마법력 / 전체 관통력 보너스',
        '개별 공격력·마법력 / 전체·타임어택 관통력 보너스',
        '개별 방어력·마법 방어력 / 전체 관통력 보너스',
        '개별 이동속도 / 전체 관통력 보너스',
        '개별 최대 생명력·정신력 / 전체 관통력 보너스',
    ]);

    assert.deepEqual(CodexRank.values().map(rank => [rank.key, rank.score, rank.unlockRatio]), [
        ['bronze', 1, 0.10],
        ['silver', 2, 0.35],
        ['gold', 3, 0.70],
        ['platinum', 4, 1],
    ]);
    assert.equal(CodexRank.fromKey('silver'), CodexRank.SILVER);
    assert.equal(CodexRank.fromInput('금급'), CodexRank.GOLD);
    assert.equal(CodexRank.fromInput('플래티넘'), CodexRank.PLATINUM);
    assert.equal(Object.isFrozen(CodexCategory.values()), true);
    assert.equal(Object.isFrozen(CodexRank.values()), true);
    assert.equal(
        createCodexEntryId(CodexCategory.COOKING, 'codex-test:food-a'),
        'cooking:codex-test/food-a',
    );
});

test('도감 registry는 정의를 동결하고 전체 검증 뒤 원자적으로 재초기화한다', () => {
    reloadCodexRegistry([
        { ...entry('monster:test_slime'), name: '시험 슬라임' },
        { ...entry('ore:test_iron', CodexCategory.ORE), name: '시험 철광석' },
    ], false);
    const added = defineCodexEntry({
        ...entry('boss:test_king', CodexCategory.BOSS),
        name: '시험 왕',
    });
    assert.equal(Object.isFrozen(added), true);
    assert.equal(Object.isFrozen(added.thresholds), true);
    assert.equal(getCodexEntry('boss:test_king'), added);
    assert.deepEqual(getAllCodexEntries('광물').map(value => value.id), ['ore:test_iron']);
    assert.equal(Object.isFrozen(getAllCodexEntries()), true);
    assert.equal(getProgressDefinition('codex-entry:monster/test__slime')?.type, ProgressType.COUNTER);
    assert.equal(getProgressDefinition('codex-rank:monster/gold')?.type, ProgressType.FLAG);

    freezeCodexRegistry();
    assert.equal(isCodexRegistryFrozen(), true);
    assert.throws(() => defineCodexEntry(entry('monster:frozen')), /frozen/);

    assert.throws(() => reloadCodexRegistry([
        entry('monster:duplicate'),
        entry('monster:duplicate'),
    ]), /Duplicate codex entry/);
    assert.ok(getCodexEntry('monster:test_slime'));
    assert.equal(isCodexRegistryFrozen(), true);

    reloadCodexRegistry([entry('monster:reloaded')]);
    assert.equal(getCodexEntry('monster:test_slime'), undefined);
    assert.ok(getCodexEntry('monster:reloaded'));
    assert.equal(isCodexRegistryFrozen(), true);
});

test('record는 확정 엔트리만 1씩 증가시키고 단계·카테고리 점수와 새 rank를 반환한다', () => {
    reloadCodexRegistry([entry('monster:training_dummy')]);
    const progress = PlayerProgress.createEmpty(7_001);
    const codex = new CodexBook(progress);

    assert.deepEqual(codex.record('monster:missing'), {
        recorded: false,
        reason: 'missing',
        newlyAchievedEntryRanks: [],
        newlyUnlockedRanks: [],
    });
    assert.equal(progress.dirty, false);

    assert.deepEqual(codex.record('monster:training_dummy').newlyUnlockedRanks, []);
    const bronze = codex.record('monster:training_dummy');
    assert.equal(bronze.recorded, true);
    if (!bronze.recorded) return;
    assert.equal(bronze.entry.count, 2);
    assert.equal(bronze.entry.rankKey, 'bronze');
    assert.equal(bronze.entry.score, 1);
    assert.deepEqual(bronze.entry.stages.map(stage => stage.achieved), [true, false, false]);
    assert.deepEqual(bronze.newlyUnlockedRanks, [CodexRank.BRONZE]);
    assert.equal(bronze.category.score, 1);
    assert.equal(bronze.category.maxScore, 3);

    codex.record('monster:training_dummy');
    const silver = codex.record('monster:training_dummy');
    assert.equal(silver.recorded && silver.entry.rankKey, 'silver');
    assert.deepEqual(silver.newlyUnlockedRanks, [CodexRank.SILVER]);

    codex.record('monster:training_dummy');
    const gold = codex.record('monster:training_dummy');
    assert.equal(gold.recorded && gold.entry.rankKey, 'gold');
    assert.deepEqual(gold.newlyUnlockedRanks, [CodexRank.GOLD]);
    assert.deepEqual(codex.getCategorySnapshot('몬스터')?.ranks.map(rank => rank.unlocked), [true, true, true]);
});

test('record amount는 제작 수량을 한 번에 누적하며 0은 완전한 no-op이다', () => {
    reloadCodexRegistry([entry(
        'cooking:test-kitchen:stew',
        CodexCategory.COOKING,
        { bronze: 2, silver: 5, gold: 10 },
    )]);
    const progress = PlayerProgress.createEmpty(7_004);
    const codex = new CodexBook(progress);

    const noOp = codex.record('cooking:test-kitchen:stew', 0);
    assert.equal(noOp.recorded && noOp.entry.count, 0);
    assert.deepEqual(noOp.newlyUnlockedRanks, []);
    assert.equal(progress.dirty, false);

    const result = codex.record('cooking:test-kitchen:stew', 5);
    assert.equal(result.recorded && result.entry.count, 5);
    assert.equal(result.recorded && result.entry.rankKey, 'silver');
    assert.deepEqual(result.newlyUnlockedRanks, [CodexRank.BRONZE, CodexRank.SILVER]);
    assert.equal(getProgressDefinition('codex-entry:cooking/test-kitchen_cstew')?.type, ProgressType.COUNTER);

    assert.throws(() => codex.record('cooking:test-kitchen:stew', -1), /non-negative safe integer/);
    assert.throws(() => codex.record('cooking:test-kitchen:stew', 1.5), /non-negative safe integer/);
    assert.throws(() => codex.record('cooking:test-kitchen:stew', Number.MAX_SAFE_INTEGER), /safe number range/);
});

test('탐험 엔트리의 1/1/1 threshold는 첫 방문 기록에서 즉시 gold가 된다', () => {
    reloadCodexRegistry([entry(
        'exploration:test_square',
        CodexCategory.EXPLORATION,
        { bronze: 1, silver: 1, gold: 1 },
    )]);
    const progress = PlayerProgress.createEmpty(7_002);
    const codex = new CodexBook(progress);

    const result = codex.record('exploration:test_square');

    assert.equal(result.recorded, true);
    if (!result.recorded) return;
    assert.equal(result.entry.rankKey, 'gold');
    let changes = 0;
    progress.subscribeChanges(() => { changes += 1; });
    assert.equal(codex.record('exploration:test_square', 100).recorded, true);
    assert.equal(codex.getEntrySnapshot('exploration:test_square')?.count, 1);
    assert.equal(changes, 0);
    assert.equal(result.entry.score, 3);
    assert.deepEqual(result.entry.stages.map(stage => stage.achieved), [true, true, true]);
    assert.deepEqual(result.newlyUnlockedRanks, [CodexRank.BRONZE, CodexRank.SILVER, CodexRank.GOLD]);
});

test('registry 교체는 같은 id의 progress 표시 정의도 최신 master로 갱신한다', () => {
    reloadCodexRegistry([{ ...entry('ore:replaceable', CodexCategory.ORE), name: '이전 광석' }]);
    assert.equal(getProgressDefinition('codex-entry:ore/replaceable')?.label, '이전 광석 도감 진행');

    reloadCodexRegistry([{ ...entry('ore:replaceable', CodexCategory.ORE), name: '새 광석' }]);

    assert.equal(getProgressDefinition('codex-entry:ore/replaceable')?.label, '새 광석 도감 진행');
});

test('영구 category rank flag는 신규 엔트리로 현재 비율이 낮아져도 유지된다', () => {
    const first = entry('monster:first', CodexCategory.MONSTER, { bronze: 1, silver: 1, gold: 1 });
    reloadCodexRegistry([first]);
    const progress = PlayerProgress.createEmpty(7_003);
    const codex = new CodexBook(progress);
    assert.deepEqual(codex.record(first.id).newlyUnlockedRanks, [
        CodexRank.BRONZE, CodexRank.SILVER, CodexRank.GOLD,
    ]);

    reloadCodexRegistry([
        first,
        ...Array.from({ length: 9 }, (_, index) => entry(`monster:later_${index}`)),
    ]);
    const expanded = codex.getCategorySnapshot(CodexCategory.MONSTER);

    assert.equal(expanded?.score, 3);
    assert.equal(expanded?.maxScore, 30);
    assert.equal(expanded?.completionRatio, 0.1);
    assert.deepEqual(expanded?.ranks.map(rank => [rank.key, rank.unlocked, rank.currentlyEligible]), [
        ['bronze', true, true],
        ['silver', true, false],
        ['gold', true, false],
    ]);
});

test('백금은 엔트리별 특수 조건만 제공하고 탐험에는 추가되지 않는다', () => {
    reloadCodexRegistry([
        {
            ...entry('monster:platinum_target', CodexCategory.MONSTER, { bronze: 1, silver: 2, gold: 3 }),
            platinum: { type: 'no-hit', description: '금 달성 후 무피격 처치' },
        },
        {
            ...entry('cooking:platinum_meal', CodexCategory.COOKING, { bronze: 1, silver: 2, gold: 3 }),
            platinum: { type: 'count', threshold: 30, description: '30회 요리' },
        },
        entry('exploration:no_platinum', CodexCategory.EXPLORATION, { bronze: 1, silver: 1, gold: 1 }),
    ]);
    const codex = new CodexBook(PlayerProgress.createEmpty(7_005));

    codex.record('monster:platinum_target', 2);
    assert.deepEqual(codex.recordPlatinum('monster:platinum_target').newlyAchievedEntryRanks, []);
    codex.record('monster:platinum_target');
    const platinum = codex.recordPlatinum('monster:platinum_target');
    assert.equal(platinum.recorded && platinum.entry.rankKey, 'platinum');
    assert.deepEqual(platinum.newlyAchievedEntryRanks, [CodexRank.PLATINUM]);
    assert.equal(getProgressDefinition('codex-entry:monster/platinum__target-rank/platinum')?.type, ProgressType.FLAG);

    const cooking = codex.record('cooking:platinum_meal', 30);
    assert.equal(cooking.recorded && cooking.entry.rankKey, 'platinum');
    assert.deepEqual(cooking.newlyAchievedEntryRanks, CodexRank.values());
    assert.equal(codex.getEntrySnapshot('exploration:no_platinum')?.stages.length, 3);
});

test('보스 타임어택은 최고 기록만 저장하고 달성 단계의 관통력만 적용한다', () => {
    reloadCodexRegistry([entry('boss:clockwork_king', CodexCategory.BOSS)]);
    const codex = new CodexBook(PlayerProgress.createEmpty(7_006));

    const first = codex.recordBossTimeAttack('boss:clockwork_king', 180);
    assert.equal(first.recorded && first.improved, true);
    assert.equal(first.recorded && first.snapshot.penetration, 0.1);
    assert.equal(first.recorded && first.newlyAchievedTiers.length, 1);

    const slower = codex.recordBossTimeAttack('boss:clockwork_king', 200);
    assert.equal(slower.recorded && slower.improved, false);
    assert.equal(slower.recorded && slower.snapshot.bestSeconds, 180);

    const faster = codex.recordBossTimeAttack('boss:clockwork_king', 59.876);
    assert.equal(faster.recorded && faster.snapshot.bestSeconds, 59.876);
    assert.equal(faster.recorded && faster.snapshot.penetration, 0.4);
    assert.deepEqual(faster.recorded && faster.newlyAchievedTiers.map(tier => tier.thresholdSeconds), [120, 60]);
    assert.equal(getProgressDefinition('codex-time:boss/clockwork__king')?.type, ProgressType.STATE);
});

test('threshold는 양의 안전 정수이며 동≤은≤금 순서를 지켜야 한다', () => {
    reloadCodexRegistry([], false);
    assert.throws(() => defineCodexEntry(entry(
        'monster:bad_order',
        CodexCategory.MONSTER,
        { bronze: 3, silver: 2, gold: 4 },
    )), /non-decreasing/);
    assert.throws(() => defineCodexEntry(entry(
        'monster:bad_zero',
        CodexCategory.MONSTER,
        { bronze: 0, silver: 1, gold: 1 },
    )), /threshold/);
    assert.throws(() => defineCodexEntry(entry(
        'monster:bad_fraction',
        CodexCategory.MONSTER,
        { bronze: 1, silver: 2.5, gold: 3 },
    )), /threshold/);
    assert.throws(() => defineCodexEntry(entry(
        'boss:wrong_namespace',
        CodexCategory.MONSTER,
    )), /category namespace/);
});
