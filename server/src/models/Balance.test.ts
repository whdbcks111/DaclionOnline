import assert from 'node:assert/strict';
import test from 'node:test';
import '../data/projectiles.js';
import '../data/items.js';
import '../data/jobs.js';
import '../data/statusEffects.js';
import '../data/skills.js';
import {
    analyzeAllFirstJobs,
    analyzeItemBalance,
    analyzeJobBalance,
    analyzeSkillBalance,
    createBalanceScenario,
} from './Balance.js';

test('projected profile uses the same eight stat points earned per level', () => {
    const report = analyzeJobBalance(50, 'career:warrior');
    const total = Object.values(report.stats).reduce((sum, value) => sum + value, 0);
    assert.equal(total, (50 - 1) * 8);
});

test('skill report uses real cooldown, resource and damage callbacks', () => {
    const scenario = createBalanceScenario(50, 'career:mage');
    const report = analyzeSkillBalance(scenario, 'magic_bolt', 5);
    assert.equal(report.cooldown, 3.2);
    assert.equal(report.manaCost, 10);
    assert.ok(report.rawDamage > 0);
    assert.ok(report.sustainableDpm > report.rawDamage);
    assert.equal(report.coverage, 'complete');
});

test('all first jobs produce finite offensive and defensive baselines', () => {
    const reports = analyzeAllFirstJobs(50);
    assert.equal(reports.length, 4);
    for (const report of reports) {
        assert.ok(Number.isFinite(report.basicPhysicalDps));
        assert.ok(report.physicalSurvivalSeconds > 0);
        assert.ok(report.magicSurvivalSeconds > 0);
    }
});

test('item report applies actual equipment modifiers and buff status effects', () => {
    const weapon = analyzeItemBalance(50, 'career:warrior', 'old_sword');
    // 전사 8% 직업 배율이 장비의 +5에도 적용되는 실제 Attribute 연산 순서를 따른다.
    assert.ok(Math.abs((weapon.after.attack - weapon.before.attack) - 5.4) < 0.0001);
    assert.ok(weapon.after.physicalBasicDps > weapon.before.physicalBasicDps);

    const tonic = analyzeItemBalance(50, 'career:warrior', 'battle_tonic');
    assert.equal(tonic.statusEffect?.id, 'strength_enhancement');
    assert.ok(tonic.after.attack > tonic.before.attack);
});
