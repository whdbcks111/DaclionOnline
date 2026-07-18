import assert from 'node:assert/strict';
import test from 'node:test';
import { RegionRiskPolicy } from './RegionRisk.js';

test('지역 위험도는 PVP 허용과 사망 손실을 단계별로 구분한다', () => {
    assert.equal(RegionRiskPolicy.SAFE.pvpAllowed, false);
    assert.equal(RegionRiskPolicy.NEUTRAL.pvpAllowed, true);
    assert.equal(RegionRiskPolicy.HOSTILE.pvpAllowed, true);
    assert.equal(RegionRiskPolicy.SAFE.calculateExperienceLoss(500, 1000, 20), 0);
    assert.equal(RegionRiskPolicy.NEUTRAL.calculateExperienceLoss(500, 1000, 20), 30);
    assert.equal(RegionRiskPolicy.HOSTILE.calculateExperienceLoss(500, 1000, 20), 70);
    assert.equal(RegionRiskPolicy.HOSTILE.calculateGoldLoss(1000, 20), 30);
});

test('10레벨 미만은 위험 지역에서도 사망 재화 손실을 받지 않는다', () => {
    assert.equal(RegionRiskPolicy.HOSTILE.calculateExperienceLoss(500, 1000, 9), 0);
    assert.equal(RegionRiskPolicy.HOSTILE.calculateGoldLoss(1000, 9), 0);
    assert.equal(RegionRiskPolicy.SAFE.calculateRespawnDuration(30), 15);
    assert.equal(RegionRiskPolicy.HOSTILE.calculateRespawnDuration(30), 45);
});

test('사망 경험치 손실은 현재 레벨 경험치를 초과하지 않는다', () => {
    assert.equal(RegionRiskPolicy.HOSTILE.calculateExperienceLoss(20, 1000, 20), 20);
    assert.equal(RegionRiskPolicy.HOSTILE.calculateExperienceLoss(-10, 1000, 20), 0);
    assert.equal(RegionRiskPolicy.HOSTILE.calculateGoldLoss(1, 20), 0);
});
