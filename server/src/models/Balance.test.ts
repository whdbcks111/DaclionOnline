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

test('Lv.200 elite profile applies its inherited passive without listing it as active DPM', () => {
    const scenario = createBalanceScenario(200, 'career:warrior', 'career:mage');
    const report = analyzeJobBalance(200, 'career:warrior', 'career:mage');

    assert.equal(scenario.effectiveJob.id, 'career:spellblade');
    assert.equal(scenario.entity.attribute.hasSource('skill:warrior_combat_instinct:passive'), true);
    assert.equal(scenario.entity.attribute.hasSource('skill:mage_mana_cycle:passive'), true);
    assert.equal(scenario.entity.attribute.hasSource('skill:spellblade_mastery:passive'), true);
    assert.equal(report.skillReports.some(skill => skill.skillId === 'spellblade_mastery'), false);
});

test('item report applies actual equipment modifiers and buff status effects', () => {
    const weapon = analyzeItemBalance(50, 'career:warrior', 'old_sword');
    // 전사 8% 직업 배율과 전투 본능 6% 패시브가 장비의 +5에도 적용되는 실제 연산 순서다.
    assert.ok(Math.abs((weapon.after.attack - weapon.before.attack) - (5 * 1.08 * 1.06)) < 0.0001);
    assert.ok(weapon.after.physicalBasicDps > weapon.before.physicalBasicDps);

    const tonic = analyzeItemBalance(50, 'career:warrior', 'battle_tonic');
    assert.equal(tonic.statusEffect?.id, 'strength_enhancement');
    assert.ok(tonic.after.attack > tonic.before.attack);
});
