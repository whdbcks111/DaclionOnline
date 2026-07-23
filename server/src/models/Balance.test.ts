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
    BalanceEncounterType,
    BALANCE_PROFILE_LEVELS,
    createBalanceScenario,
} from './Balance.js';
import { AttributeType } from './Attribute.js';
import { calculateProjectileEvasionSpeed } from './Projectile.js';
import { calculateEvasionChance } from './Combat.js';

test('projected profile uses the same eight stat points earned per level', () => {
    const report = analyzeJobBalance(50, 'career:warrior');
    const total = Object.values(report.stats).reduce((sum, value) => sum + value, 0);
    assert.equal(total, (50 - 1) * 8);
});

test('projected profiles follow the intended primary stat order for every first job', () => {
    const warrior = createBalanceScenario(200, 'career:warrior').stats;
    const archer = createBalanceScenario(200, 'career:archer').stats;
    const assassin = createBalanceScenario(200, 'career:assassin').stats;
    const mage = createBalanceScenario(200, 'career:mage').stats;
    const blacksmith = createBalanceScenario(200, 'career:blacksmith').stats;

    assert.ok(warrior.strength > warrior.vitality && warrior.vitality > warrior.agility);
    assert.ok(archer.strength > archer.agility && archer.agility > archer.sensibility);
    assert.ok(assassin.agility > assassin.strength && assassin.strength > assassin.sensibility);
    assert.ok(mage.mentality > mage.sensibility && mage.sensibility > mage.vitality);
    assert.ok(blacksmith.sensibility > blacksmith.vitality && blacksmith.vitality > blacksmith.strength);
});

test('궁수 투사체 가속 환산은 성장 구간에서 근접 명중률과 15%p 안으로 균형을 유지한다', () => {
    for (const level of BALANCE_PROFILE_LEVELS) {
        for (const encounter of [BalanceEncounterType.MONSTER, BalanceEncounterType.BOSS]) {
            const scenario = createBalanceScenario(level, 'career:archer', undefined, encounter);
            const acceleration = scenario.entity.attribute.get(AttributeType.PROJECTILE_ACCELERATION);
            const projectileSpeed = calculateProjectileEvasionSpeed(acceleration);
            const ownerSpeed = scenario.entity.attribute.get(AttributeType.SPEED);
            const targetSpeed = scenario.target.attribute.get(AttributeType.SPEED);
            const projectileEvasion = calculateEvasionChance(projectileSpeed, targetSpeed);
            const meleeEvasion = calculateEvasionChance(ownerSpeed, targetSpeed);

            assert.ok(projectileEvasion <= meleeEvasion + 0.15);
            if (level === 20) assert.ok(projectileEvasion <= 0.05);
        }
    }
});

test('archer and assassin combat skills gain real damage from movement speed buffs', () => {
    const archer = createBalanceScenario(200, 'career:archer');
    const assassin = createBalanceScenario(200, 'career:assassin');
    const arrowBefore = analyzeSkillBalance(archer, 'tracking_arrow', 5).rawDamage;
    const ambushBefore = analyzeSkillBalance(assassin, 'ambush', 5).rawDamage;

    archer.entity.attribute.addModifier({
        attribute: AttributeType.SPEED.key,
        op: 'multiply',
        value: 1.2,
        source: 'test:speed-buff',
    });
    assassin.entity.attribute.addModifier({
        attribute: AttributeType.SPEED.key,
        op: 'multiply',
        value: 1.2,
        source: 'test:speed-buff',
    });

    assert.ok(analyzeSkillBalance(archer, 'tracking_arrow', 5).rawDamage > arrowBefore);
    assert.ok(analyzeSkillBalance(assassin, 'ambush', 5).rawDamage > ambushBefore);
});

test('elite hybrid actives keep their main-job coefficient ahead of the sub-job coefficient', () => {
    const speedScenario = createBalanceScenario(200, 'career:assassin', 'career:mage');
    const magicScenario = createBalanceScenario(200, 'career:assassin', 'career:mage');
    const base = analyzeSkillBalance(speedScenario, 'arcane_reaper_technique', 5).rawDamage;

    speedScenario.entity.attribute.addModifier({
        attribute: AttributeType.SPEED.key,
        op: 'multiply',
        value: 1.2,
        source: 'test:main-stat',
    });
    magicScenario.entity.attribute.addModifier({
        attribute: AttributeType.MAGIC_FORCE.key,
        op: 'multiply',
        value: 1.2,
        source: 'test:sub-stat',
    });

    const speedGain = analyzeSkillBalance(speedScenario, 'arcane_reaper_technique', 5).rawDamage - base;
    const magicGain = analyzeSkillBalance(magicScenario, 'arcane_reaper_technique', 5).rawDamage - base;
    assert.ok(speedGain > magicGain);
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

test('skill report applies skill-specific penetration and unavoidable attacks', () => {
    const scenario = createBalanceScenario(220, 'career:mage', undefined, BalanceEncounterType.BOSS);
    const lock = analyzeSkillBalance(scenario, 'causality_lock', 5);
    const lance = analyzeSkillBalance(scenario, 'photon_lance', 5);

    assert.equal(lock.penetration, scenario.entity.attribute.get(AttributeType.MAGIC_PEN) + 62);
    assert.equal(lock.evasionChance, 0);
    assert.equal(lock.effectiveDefense, Math.max(0,
        scenario.target.attribute.get(AttributeType.MAGIC_DEF) - lock.penetration));
    assert.equal(lance.penetration, 74);
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

test('advanced first-job profiles stay within the measured 1.5x boss DPS band', () => {
    for (const level of [75, 100, 140, 180]) {
        const profiles = analyzeAllBalanceProfiles(level);
        const bossDps = profiles.map(profile => profile.boss.dps);
        const spread = Math.max(...bossDps) / Math.min(...bossDps);
        assert.ok(spread <= 1.5, `Lv.${level} spread=${spread.toFixed(3)}`);
        assert.ok(profiles.every(profile =>
            profile.boss.basicDamageShare >= 0.15 && profile.boss.basicDamageShare <= 0.75));
    }
});

test('all elite combinations stay within the measured 1.5x boss DPS band', () => {
    const profiles = [];
    for (const main of ['warrior', 'archer', 'assassin', 'mage', 'blacksmith']) {
        for (const sub of ['warrior', 'archer', 'assassin', 'mage', 'blacksmith']) {
            if (main === sub) continue;
            profiles.push(analyzeBalanceProfile(200, `career:${main}`, `career:${sub}`));
        }
    }
    const bossDps = profiles.map(profile => profile.boss.dps);
    assert.ok(Math.max(...bossDps) / Math.min(...bossDps) <= 1.5);
    assert.ok(profiles.every(profile => profile.boss.basicDamageShare >= 0.15));
});

test('blacksmith advanced attacks use forging precision in the real balance callback', () => {
    const scenario = createBalanceScenario(140, 'career:blacksmith');
    const before = analyzeSkillBalance(scenario, 'masterwork_break', 3).rawDamage;
    scenario.entity.attribute.addModifier({
        attribute: AttributeType.FORGING_PRECISION.key,
        op: 'add',
        value: 1,
        source: 'test:precision',
    });
    const after = analyzeSkillBalance(scenario, 'masterwork_break', 3).rawDamage;
    assert.ok(after > before);
});

test('blacksmith elite attacks also retain forging precision scaling', () => {
    const scenario = createBalanceScenario(200, 'career:blacksmith', 'career:mage');
    const before = analyzeSkillBalance(scenario, 'arcane_smith_technique', 5).rawDamage;
    scenario.entity.attribute.addModifier({
        attribute: AttributeType.FORGING_PRECISION.key,
        op: 'add',
        value: 0.2,
        source: 'test:elite-precision',
    });
    const after = analyzeSkillBalance(scenario, 'arcane_smith_technique', 5).rawDamage;
    assert.ok(after > before);
});

test('combat rotation removes temporary balance modifiers after analysis', () => {
    const scenario = createBalanceScenario(100, 'career:mage');
    analyzeCombatRotation(scenario);
    assert.equal(scenario.entity.attribute.modifiers.some(modifier => modifier.source.startsWith('balance:rotation:')), false);
});

test('combat rotation applies tag-based shared cooldowns between magic skills', () => {
    const scenario = createBalanceScenario(100, 'career:mage');
    const report = analyzeCombatRotation(scenario, 5);
    // 마법 계열은 전체 0.5초 공유 쿨타임이므로 5초 창에서 10회를 초과해 발동할 수 없다.
    assert.ok(report.skillCasts <= 10);
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
