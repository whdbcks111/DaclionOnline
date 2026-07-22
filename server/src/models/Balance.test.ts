import assert from 'node:assert/strict';
import test from 'node:test';
import '../data/projectiles.js';
import '../data/items.js';
import '../data/jobs.js';
import '../data/statusEffects.js';
import '../data/tagEffects.js';
import '../data/skills.js';
import '../data/monsters.js';
import {
    analyzeAllBalanceProfiles,
    analyzeBalanceProfile,
    analyzeCombatRotation,
    analyzeAllEliteJobs,
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
    assert.equal(reports.length, 5);
    for (const report of reports) {
        assert.ok(Number.isFinite(report.basicPhysicalDps));
        assert.ok(report.physicalSurvivalSeconds > 0);
        assert.ok(report.magicSurvivalSeconds > 0);
    }
});

test('Lv.200 elite profile applies its inherited passive and reports its active technique', () => {
    const scenario = createBalanceScenario(200, 'career:warrior', 'career:mage');
    const report = analyzeJobBalance(200, 'career:warrior', 'career:mage');

    assert.equal(scenario.effectiveJob.id, 'career:spellblade');
    assert.equal(scenario.entity.attribute.hasSource('skill:warrior_combat_instinct:passive'), true);
    assert.equal(scenario.entity.attribute.hasSource('skill:mage_mana_cycle:passive'), true);
    assert.equal(scenario.entity.attribute.hasSource('skill:spellblade_mastery:passive'), true);
    assert.equal(report.skillReports.some(skill => skill.skillId === 'spellblade_mastery'), false);
    assert.equal(report.skillReports.some(skill => skill.skillId === 'spellblade_technique'), true);
});

test('all twenty ordered elite combinations produce measurable balance reports', () => {
    const reports = analyzeAllEliteJobs(200);
    assert.equal(reports.length, 20);
    assert.equal(new Set(reports.map(report => report.jobId)).size, 20);
    assert.ok(reports.every(report => report.skillReports.some(skill => skill.skillId.endsWith('_technique'))));
    assert.ok(reports.every(report => report.skillReports.some(skill => skill.sustainableDpm > 0)));
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

test('high-level job weapons expose measurable role-specific gains', () => {
    const reports = [
        analyzeItemBalance(70, 'career:warrior', 'windsteel_sword'),
        analyzeItemBalance(70, 'career:archer', 'stormstring_bow'),
        analyzeItemBalance(90, 'career:assassin', 'nightglass_dagger'),
        analyzeItemBalance(120, 'career:mage', 'starwood_staff'),
    ];
    assert.ok(reports[0].after.attack > reports[0].before.attack);
    assert.ok(reports[1].after.physicalBasicDps > reports[1].before.physicalBasicDps);
    assert.ok(reports[2].after.physicalBasicDps > reports[2].before.physicalBasicDps);
    assert.ok(reports[3].after.magicForce > reports[3].before.magicForce);
    assert.ok(reports.every(report => report.notes.every(note => !note.includes('추정'))));
});

test('combat profiles share resources while mixing basics and every available job skill', () => {
    const profiles = analyzeAllBalanceProfiles(100);
    assert.equal(profiles.length, 5);
    for (const profile of profiles) {
        for (const rotation of [profile.monster, profile.boss]) {
            assert.ok(rotation.basicAttacks > 0);
            assert.ok(rotation.skillCasts > 0);
            assert.ok(rotation.basicDamageShare > 0 && rotation.basicDamageShare < 1);
            assert.ok(rotation.skills.every(skill => skill.casts > 0));
            assert.ok(rotation.endingMentality >= 0);
            assert.ok(rotation.dps > 0);
            assert.ok(rotation.evasionChance >= 0 && rotation.evasionChance <= 0.9);
            assert.equal(rotation.effectiveDefense, Math.max(0, rotation.targetDefense - rotation.penetration));
            assert.ok(rotation.currentSpeed > 0 && rotation.targetSpeed > 0);
        }
    }
});

test('combat rotation removes temporary balance modifiers after analysis', () => {
    const scenario = createBalanceScenario(100, 'career:mage');
    analyzeCombatRotation(scenario);
    assert.equal(scenario.entity.attribute.modifiers.some(modifier => modifier.source.startsWith('balance:rotation:')), false);
});

test('combat rotation applies tag-based shared cooldowns between magic skills', () => {
    const scenario = createBalanceScenario(100, 'career:mage');
    const report = analyzeCombatRotation(scenario, 5);
    // 마법 계열은 전체 1초 공유 쿨타임이므로 5초 창에서 5회를 초과해 발동할 수 없다.
    assert.ok(report.skillCasts <= 5);
    assert.ok(report.notes.some(note => note.includes('태그 공유')));
});

test('boss profile normalizes a real boss archetype to the requested level', () => {
    const profile = analyzeAllBalanceProfiles(100)[0];
    assert.equal(profile.boss.encounter.key, 'boss');
    assert.equal(profile.boss.targetLevel, 100);
    assert.notEqual(profile.boss.targetSourceLevel, 100);
    assert.equal(profile.boss.targetNormalized, true);
    assert.ok(profile.boss.targetMaxLife > profile.monster.targetMaxLife);
});

test('elite profile starts new elite technique at level one and keeps inherited skills', () => {
    const { boss } = analyzeBalanceProfile(200, 'career:mage', 'career:archer');
    const technique = boss.skills.find(skill => skill.skillId === 'star_weaver_technique');
    assert.equal(technique?.skillLevel, 1);
    assert.ok(boss.skills.some(skill => skill.skillId === 'magic_bolt' && skill.skillLevel === 5));
    assert.ok(boss.skills.some(skill => skill.skillId === 'arcane_arrow' && skill.skillLevel === 5));
});
