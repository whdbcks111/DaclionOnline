import assert from 'node:assert/strict';
import test from 'node:test';
import { AttributeType } from './Attribute.js';
import {
    RankingCategory,
    RankingVisibility,
    createStoredPlayerRankingMetricRecord,
    parseRankingVisibility,
} from './Ranking.js';
import { StatType } from './Stat.js';
import { rankPlayerSnapshots } from '../modules/ranking.js';

test('순위 카테고리는 레벨·골드와 모든 스탯·능력치를 입력 이름으로 찾는다', () => {
    assert.equal(RankingCategory.fromInput('레벨'), RankingCategory.LEVEL);
    assert.equal(RankingCategory.fromInput('물리공격력')?.key, 'attribute:atk');
    assert.equal(RankingCategory.fromInput('민첩')?.key, 'stat:agility');
    assert.equal(
        RankingCategory.values().length,
        2 + StatType.values().length + AttributeType.values().length,
    );
});

test('전체 순위 공개 기준과 카테고리별 반대 예외는 직렬화 후에도 유지된다', () => {
    const visibility = new RankingVisibility();
    visibility.setAll(false);
    visibility.setCategory(RankingCategory.LEVEL, true);
    assert.equal(visibility.defaultPublic, false);
    assert.equal(visibility.isPublic(RankingCategory.LEVEL), true);
    assert.equal(visibility.isPublic(RankingCategory.GOLD), false);

    const restored = parseRankingVisibility(visibility.toPersistence());
    assert.deepEqual(restored, {
        defaultPublic: false,
        overrides: { level: true },
    });
});

test('저장 데이터 fallback도 스탯이 반영된 물리공격력과 이동속도를 계산한다', () => {
    const metrics = createStoredPlayerRankingMetricRecord({
        level: 10,
        gold: 2500,
        maxWeight: 75,
        stats: { strength: 8, agility: 4 },
        baseAttribute: { atk: 10, speed: 1, attackSpeed: 1 },
    });
    assert.equal(metrics.level, 10);
    assert.equal(metrics.gold, 2500);
    assert.equal(metrics['stat:strength'], 8);
    assert.equal(metrics['attribute:atk'], 26);
    assert.equal(metrics['attribute:speed'], 1.2);
});

test('동점은 공동 순위이며 비공개 플레이어도 순위는 유지하고 수치만 숨긴다', () => {
    const publicVisibility = { defaultPublic: true, overrides: {} };
    const entries = rankPlayerSnapshots(RankingCategory.LEVEL, [
        { userId: 3, nickname: '셋', metrics: { level: 5 }, visibility: publicVisibility },
        { userId: 1, nickname: '하나', metrics: { level: 10 }, visibility: publicVisibility },
        { userId: 2, nickname: '둘', metrics: { level: 10 }, visibility: { defaultPublic: false, overrides: {} } },
    ]);
    assert.deepEqual(entries.map(entry => [entry.rank, entry.nickname, entry.valuePublic]), [
        [1, '하나', true],
        [1, '둘', false],
        [3, '셋', true],
    ]);
});
