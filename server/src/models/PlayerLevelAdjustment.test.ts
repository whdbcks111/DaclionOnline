import assert from 'node:assert/strict';
import test from 'node:test';
import { calculatePlayerLevelAdjustment } from './Player.js';

test('관리자 레벨 상승 조정은 실제 레벨업처럼 모든 스탯과 가용 포인트를 지급한다', () => {
    const result = calculatePlayerLevelAdjustment(10, 13, {
        strength: 29,
        agility: 19,
        vitality: 9,
        sensibility: 101,
        mentality: 3,
    }, 4);

    assert.equal(result.levelDelta, 3);
    assert.deepEqual(result.stats, {
        strength: 32,
        agility: 22,
        vitality: 12,
        sensibility: 104,
        mentality: 6,
    });
    assert.deepEqual(result.statDeltas, {
        strength: 3,
        agility: 3,
        vitality: 3,
        sensibility: 3,
        mentality: 3,
    });
    assert.equal(result.statPoint, 13);
    assert.equal(result.statPointDelta, 9);
});

test('관리자 레벨 하락 조정은 자동 성장분과 분배 포인트를 기존 비율대로 회수한다', () => {
    const before = {
        strength: 29,
        agility: 19,
        vitality: 9,
        sensibility: 9,
        mentality: 9,
    };
    const result = calculatePlayerLevelAdjustment(10, 7, before, 2);
    const beforeBudget = Object.values(before).reduce((sum, value) => sum + value, 0) + 2;
    const afterBudget = Object.values(result.stats).reduce((sum, value) => sum + value, 0) + result.statPoint;

    assert.equal(result.levelDelta, -3);
    assert.equal(beforeBudget - afterBudget, 24, '레벨당 모든 스탯 5 + 분배 포인트 3을 회수해야 한다.');
    assert.equal(result.statPoint, 0);
    assert.ok(result.stats.strength > result.stats.agility, '기존 분배 성향을 유지해야 한다.');
    assert.ok(Object.values(result.stats).every(value => value >= 6), '새 레벨의 자동 성장 기준 아래로 내리지 않는다.');
});
