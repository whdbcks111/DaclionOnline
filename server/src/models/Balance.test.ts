import assert from 'node:assert/strict';
import test from 'node:test';
import '../data/projectiles.js';
import '../data/items.js';
import '../data/jobs.js';
import '../data/statusEffects.js';
import '../data/tagEffects.js';
import { calculateFinaleExecutionDamage } from '../data/skills.js';
import '../data/monsters.js';
import {
    analyzeAllBalanceProfiles,
    analyzeBalanceProfile,
    analyzeCombatRotation,
    analyzeAllEliteJobs,
    analyzeAllFirstJobs,
    analyzeItemBalance,
    analyzeJobBalance,
    analyzeMonsterPressureDistribution,
    analyzeSkillBalance,
    BalanceEncounterType,
    BALANCE_PROFILE_LEVELS,
    calculateProjectedCombatDamage,
    createBalanceScenario,
    replayBalanceSurvival,
} from './Balance.js';
import { AttributeType } from './Attribute.js';
import { calculateProjectileEvasionSpeed } from './Projectile.js';
import { calculateEvasionChance } from './Combat.js';
import Skill, {
    createSkillContext,
    getSkillData,
    PLAYER_COMBAT_SKILL_CADENCE_SECONDS,
    SkillMentalityCostTier,
} from './Skill.js';
import { GameTags } from '../../../shared/tags.js';

test('projected profile uses the same eight stat points earned per level', () => {
    const report = analyzeJobBalance(50, 'career:warrior');
    const total = Object.values(report.stats).reduce((sum, value) => sum + value, 0);
    assert.equal(total, (50 - 1) * 8);
});

test('밸런스 프로필은 Lv.1000까지의 고레벨 회귀 구간을 포함한다', () => {
    assert.deepEqual(BALANCE_PROFILE_LEVELS, [20, 50, 75, 100, 140, 180, 200, 350, 500, 750, 1000]);
});

test('밸런스 피해 진단은 실제 Entity와 같은 양방향 레벨차 계산 경계를 사용한다', () => {
    const scenario = createBalanceScenario(100, 'career:warrior');
    const rawDamage = 1_000;
    const defense = 100;
    const sameLevel = calculateProjectedCombatDamage(
        rawDamage,
        scenario.entity,
        scenario.target,
        defense,
        0,
    );

    scenario.target.level = 400;
    const attackingHigherTarget = calculateProjectedCombatDamage(
        rawDamage,
        scenario.entity,
        scenario.target,
        defense,
        0,
    );
    const attackingLowerTarget = calculateProjectedCombatDamage(
        rawDamage,
        scenario.target,
        scenario.entity,
        defense,
        0,
    );

    assert.equal(
        attackingHigherTarget,
        scenario.target.calculateDefendedDamageFrom(rawDamage, defense, 0, scenario.entity),
    );
    assert.ok(attackingHigherTarget < sameLevel);
    assert.ok(attackingLowerTarget > sameLevel);
    assert.ok(Math.abs(attackingHigherTarget * attackingLowerTarget - sameLevel ** 2) < 1e-8);
});

test('후반 직업 패시브와 역할기는 Lv.240·320 경계 및 메인 계보만 밸런스 프로필에 반영한다', () => {
    const definitions = [
        ['career:warrior', 'unyielding_constitution', 'vanguard_command'],
        ['career:archer', 'trajectory_analysis', 'armor_break_mark'],
        ['career:assassin', 'slayers_breath', 'finale_execution'],
        ['career:mage', 'deep_mana_cycle', 'mana_rift'],
        ['career:blacksmith', 'master_heat_treatment', 'structural_dismantling'],
        ['career:cleric', 'unfading_devotion', 'dawn_covenant'],
    ] as const;

    for (const [jobId, passiveId, activeId] of definitions) {
        const beforePassive = createBalanceScenario(239, jobId);
        const afterPassive = createBalanceScenario(240, jobId);
        assert.equal(beforePassive.entity.attribute.hasSource(`skill:${passiveId}:passive`), false);
        assert.equal(afterPassive.entity.attribute.hasSource(`skill:${passiveId}:passive`), true);

        const beforeActive = analyzeCombatRotation(createBalanceScenario(319, jobId));
        const afterActive = analyzeCombatRotation(createBalanceScenario(320, jobId));
        assert.equal(beforeActive.skills.some(skill => skill.skillId === activeId), false, `${jobId} Lv.319`);
        const roleSkill = afterActive.skills.find(skill => skill.skillId === activeId);
        assert.ok(roleSkill, `${jobId} Lv.320`);
        assert.equal(roleSkill.skillLevel, 1, `${jobId} projected skill level`);
    }

    const elite = createBalanceScenario(320, 'career:warrior', 'career:mage');
    assert.equal(elite.entity.attribute.hasSource('skill:unyielding_constitution:passive'), true);
    assert.equal(elite.entity.attribute.hasSource('skill:deep_mana_cycle:passive'), false);
    const eliteRotation = analyzeCombatRotation(elite);
    assert.equal(eliteRotation.skills.some(skill => skill.skillId === 'vanguard_command'), true);
    assert.equal(eliteRotation.skills.some(skill => skill.skillId === 'mana_rift'), false);
});

test('Lv.500 밸런스 표준은 3차 완수를 가정하되 엘리트 스킬과 패시브를 함께 유지한다', () => {
    const before = createBalanceScenario(499, 'career:warrior', 'career:mage');
    const after = createBalanceScenario(500, 'career:warrior', 'career:mage');

    assert.equal(before.thirdJob, undefined);
    assert.equal(before.effectiveJob.id, 'career:spellblade');
    assert.equal(after.eliteJob?.id, 'career:spellblade');
    assert.equal(after.thirdJob?.id, 'career:ironblood_lord');
    assert.equal(after.effectiveJob.id, 'career:ironblood_lord');
    assert.equal(after.entity.attribute.hasSource('skill:spellblade_mastery:passive'), true);
    assert.equal(after.entity.attribute.hasSource('skill:ironblood_sovereignty:passive'), true);
    const rotation = analyzeCombatRotation(after);
    assert.equal(rotation.skills.some(skill => skill.skillId === 'spellblade_technique'), true);
    assert.equal(rotation.skills.some(skill => skill.skillId === 'vanguard_command'), true);
    assert.equal(rotation.skills.some(skill => skill.skillId === 'mana_rift'), false);
});

test('명시된 unlockLevel은 서브 직업 추론 시점보다 우선해 스킬 레벨을 계산한다', () => {
    const rotation = analyzeCombatRotation(createBalanceScenario(180, 'career:warrior', 'career:mage'));
    const skill = rotation.skills.find(entry => entry.skillId === 'constellation_rupture');

    assert.ok(skill);
    assert.equal(skill.skillLevel, 1);
});

test('종막 밸런스 metadata는 실제 잃은 생명·보너스·총 피해 상한 helper를 그대로 사용한다', () => {
    const scenario = createBalanceScenario(320, 'career:assassin', undefined, BalanceEncounterType.BOSS);
    scenario.target.life = scenario.target.maxLife * 0.1;
    const skill = new Skill({ playerId: null, skillDataId: 'finale_execution', level: 1 });
    const expected = calculateFinaleExecutionDamage(createSkillContext(scenario.entity, skill), scenario.target);
    const report = analyzeSkillBalance(scenario, 'finale_execution', 1);

    assert.equal(report.rawDamage, expected.totalDamage);
    assert.equal(expected.missingLifeBonus, expected.missingLifeBonusCap);
    assert.ok(expected.totalDamage <= expected.totalDamageCap);
    assert.ok(report.cooldown >= 20 && report.cooldown <= 30);
});

test('projected profiles follow the intended primary stat order for every first job', () => {
    const warrior = createBalanceScenario(200, 'career:warrior').stats;
    const archer = createBalanceScenario(200, 'career:archer').stats;
    const assassin = createBalanceScenario(200, 'career:assassin').stats;
    const mage = createBalanceScenario(200, 'career:mage').stats;
    const blacksmith = createBalanceScenario(200, 'career:blacksmith').stats;
    const cleric = createBalanceScenario(200, 'career:cleric').stats;

    assert.ok(warrior.strength > warrior.vitality && warrior.vitality > warrior.agility);
    assert.ok(archer.strength > archer.agility && archer.agility > archer.sensibility);
    assert.ok(assassin.agility > assassin.strength && assassin.strength > assassin.sensibility);
    assert.ok(mage.mentality > mage.sensibility && mage.sensibility > mage.vitality);
    assert.ok(blacksmith.sensibility > blacksmith.vitality && blacksmith.vitality > blacksmith.strength);
    assert.ok(cleric.mentality > cleric.sensibility && cleric.sensibility > cleric.vitality);
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

test('궁수는 같은 성장 구간의 검보다 추천 활 로테이션에서 우위를 유지한다', () => {
    const comparisons = [
        { level: 20, bow: 'silverweb_hunter_bow', sword: 'old_sword' },
        { level: 28, bow: 'requiem_bow', sword: 'oathiron_sword' },
        { level: 50, bow: 'stormstring_bow', sword: 'windsteel_sword' },
        { level: 75, bow: 'sunwire_bow', sword: 'dunebreaker_sword' },
        { level: 120, bow: 'icesilk_longbow', sword: 'rimecleaver_sword' },
        { level: 200, bow: 'photon_repeater', sword: 'paradox_edge' },
    ] as const;

    for (const { level, bow, sword } of comparisons) {
        const bowRotation = analyzeCombatRotation(createBalanceScenario(
            level, 'career:archer', undefined, BalanceEncounterType.BOSS, bow,
        ));
        const swordRotation = analyzeCombatRotation(createBalanceScenario(
            level, 'career:archer', undefined, BalanceEncounterType.BOSS, sword,
        ));

        assert.ok(
            bowRotation.dps >= swordRotation.dps * 1.05,
            `Lv.${level}: ${bowRotation.loadoutName} ${bowRotation.dps.toFixed(1)} < ${swordRotation.loadoutName} ${swordRotation.dps.toFixed(1)} × 1.05`,
        );
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

test('마력 검파는 이동속도 시너지를 유지하되 두 마궁 조합보다 과도하게 증폭되지 않는다', () => {
    const spellblade = createBalanceScenario(200, 'career:warrior', 'career:mage', BalanceEncounterType.BOSS);
    const speedBuffedSpellblade = createBalanceScenario(
        200, 'career:warrior', 'career:mage', BalanceEncounterType.BOSS,
    );
    const magicBuffedSpellblade = createBalanceScenario(
        200, 'career:warrior', 'career:mage', BalanceEncounterType.BOSS,
    );
    const elementalMarksman = createBalanceScenario(
        200, 'career:archer', 'career:mage', BalanceEncounterType.BOSS,
    );
    const starWeaver = createBalanceScenario(
        200, 'career:mage', 'career:archer', BalanceEncounterType.BOSS,
    );

    const base = analyzeSkillBalance(spellblade, 'spellblade_technique', 5);
    speedBuffedSpellblade.entity.attribute.addModifier({
        attribute: AttributeType.SPEED.key,
        op: 'multiply',
        value: 1.2,
        source: 'test:spellblade-speed-buff',
    });
    magicBuffedSpellblade.entity.attribute.addModifier({
        attribute: AttributeType.MAGIC_FORCE.key,
        op: 'multiply',
        value: 1.2,
        source: 'test:spellblade-magic-buff',
    });
    const speedBuffed = analyzeSkillBalance(speedBuffedSpellblade, 'spellblade_technique', 5);
    const magicBuffed = analyzeSkillBalance(magicBuffedSpellblade, 'spellblade_technique', 5);
    const elementalShot = analyzeSkillBalance(elementalMarksman, 'elemental_marksman_technique', 5);
    const fallingStar = analyzeSkillBalance(starWeaver, 'star_weaver_technique', 5);

    assert.ok(speedBuffed.rawDamage > base.rawDamage);
    assert.ok(speedBuffed.rawDamage - base.rawDamage < magicBuffed.rawDamage - base.rawDamage);
    assert.ok(base.expectedTotalDamage <= elementalShot.expectedTotalDamage);
    assert.ok(base.sustainableDpm <= elementalShot.sustainableDpm * 1.2);
    assert.ok(base.sustainableDpm < fallingStar.sustainableDpm);
});

test('낙성은 마법력 주계수를 유지하면서 활의 공격력도 피해에 반영한다', () => {
    const baseline = createBalanceScenario(200, 'career:mage', 'career:archer');
    const attackBuffed = createBalanceScenario(200, 'career:mage', 'career:archer');
    const baseDamage = analyzeSkillBalance(baseline, 'star_weaver_technique', 5).rawDamage;

    attackBuffed.entity.attribute.addModifier({
        attribute: AttributeType.ATK.key,
        op: 'add',
        value: 100,
        source: 'test:falling-star-attack',
    });

    const gained = analyzeSkillBalance(attackBuffed, 'star_weaver_technique', 5).rawDamage - baseDamage;
    assert.ok(gained > 0);
    assert.ok(gained < baseDamage * 0.25);
});

test('성물지기는 패시브와 전용기 모두 최대 생명력 투자를 직접 계승한다', () => {
    const scenario = createBalanceScenario(200, 'career:cleric', 'career:blacksmith');
    const mastery = new Skill({ playerId: null, skillDataId: 'relic_keeper_mastery', level: 1 });
    assert.match(mastery.formatDescription(scenario.entity), /최대 생명력/);

    const base = analyzeSkillBalance(scenario, 'relic_keeper_technique', 1);
    const previousMaxLife = scenario.entity.maxLife;
    scenario.entity.attribute.addModifier({
        attribute: AttributeType.MAX_LIFE.key,
        op: 'add',
        value: 1_000,
        source: 'test:relic-keeper-life',
    });
    const lifeBuffed = analyzeSkillBalance(scenario, 'relic_keeper_technique', 1);
    const maxLifeGain = scenario.entity.maxLife - previousMaxLife;

    assert.ok(Math.abs(lifeBuffed.rawDamage - base.rawDamage - maxLifeGain * 0.03 * 4.6) < 1e-8);
    assert.ok(lifeBuffed.shield > base.shield);
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

test('고레벨 전투 기술 정신력 비용은 고정 하한과 최대 정신력 비례 단계를 함께 사용한다', () => {
    assert.equal(SkillMentalityCostTier.fromKey('ultimate'), SkillMentalityCostTier.ULTIMATE);
    assert.deepEqual(
        SkillMentalityCostTier.values().map(tier => tier.maxMentalityRatio),
        [0.01, 0.015, 0.025, 0.04],
    );

    const mage = createBalanceScenario(200, 'career:mage', 'career:warrior');
    const maxMentality = mage.entity.maxMentality;
    const lowLevelSkill = analyzeSkillBalance(mage, 'mana_lance', 5);
    const constellation = analyzeSkillBalance(mage, 'constellation_rupture', 5);
    const elite = analyzeSkillBalance(mage, 'battle_magus_technique', 1);
    const lateRole = analyzeSkillBalance(mage, 'mana_rift', 1);

    assert.equal(lowLevelSkill.manaCost, 24);
    assert.equal(constellation.manaCost, Math.ceil(Math.max(76, maxMentality * 0.04)));
    assert.equal(elite.manaCost, Math.ceil(Math.max(30, maxMentality * 0.025)));
    assert.equal(lateRole.manaCost, Math.ceil(Math.max(42, maxMentality * 0.04)));

    const skill = new Skill({ playerId: null, skillDataId: 'constellation_rupture', level: 5 });
    assert.match(skill.formatCost(mage.entity), new RegExp(`정신력 ${constellation.manaCost}`));
});

test('고레벨 마법사 보호막은 마법력과 최대 정신력 성장에 맞춰 보스 기술을 받아낸다', () => {
    const mage = createBalanceScenario(200, 'career:mage');
    const barrier = analyzeSkillBalance(mage, 'mana_barrier', 5);
    const constellation = analyzeSkillBalance(mage, 'constellation_rupture', 5);
    const battleMage = createBalanceScenario(200, 'career:mage', 'career:warrior');
    const armorCharge = analyzeSkillBalance(battleMage, 'battle_magus_technique', 5);

    assert.ok(barrier.shield >= mage.entity.maxLife * 2);
    assert.ok(constellation.shield >= mage.entity.maxLife);
    assert.ok(armorCharge.shield >= battleMage.entity.maxLife);
});

test('성역의 가호 밸런스 정보는 같은 장소 파티원 최대 3명의 회복과 보호막을 함께 보고한다', () => {
    const scenario = createBalanceScenario(50, 'career:cleric');
    const report = analyzeSkillBalance(scenario, 'sanctuary_aegis', 3);
    assert.equal(getSkillData('sanctuary_aegis')?.balance?.targetCount, 3);
    assert.ok(report.healing > 0);
    assert.ok(report.shield > 0);
});

test('성직자 성장기는 광휘 공격·파티 회복·메인 계보 역할기를 같은 밸런스 공식으로 보고한다', () => {
    const scenario = createBalanceScenario(320, 'career:cleric');
    const benediction = analyzeSkillBalance(scenario, 'benediction_wave', 5);
    const descent = analyzeSkillBalance(scenario, 'seraphic_descent', 5);
    const covenant = analyzeSkillBalance(scenario, 'dawn_covenant', 1);

    assert.ok(benediction.rawDamage > 0);
    assert.ok(benediction.healing > 0);
    assert.ok(descent.rawDamage > benediction.rawDamage);
    assert.ok(descent.shield > 0);
    assert.equal(getSkillData('dawn_covenant')?.balance?.targetCount, 3);
    assert.ok(covenant.healing > 0);
    assert.ok(covenant.shield > 0);
    assert.ok(covenant.cooldown >= 20 && covenant.cooldown <= 30);
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

test('Lv.50 그림자 단검은 회피 오탐 없이 이전 암살자 공격보다 높은 단발 티어를 유지한다', () => {
    const scenario = createBalanceScenario(50, 'career:assassin', undefined, BalanceEncounterType.BOSS);
    const rupture = analyzeSkillBalance(scenario, 'rupture_cut', 1);
    const dagger = analyzeSkillBalance(scenario, 'shadow_dagger', 1);

    assert.equal(dagger.evasionChance, 0);
    assert.equal(dagger.manaCost, 18);
    assert.equal(dagger.cooldown, 9);
    assert.ok(
        dagger.expectedTotalDamage > rupture.expectedTotalDamage,
        `그림자 단검 ${dagger.expectedTotalDamage.toFixed(1)} / 혈맥 절단 ${rupture.expectedTotalDamage.toFixed(1)}`,
    );
});

test('all first jobs produce finite offensive and defensive baselines', () => {
    const reports = analyzeAllFirstJobs(50);
    assert.equal(reports.length, 6);
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

test('all thirty ordered elite combinations produce measurable balance reports', () => {
    const reports = analyzeAllEliteJobs(200);
    assert.equal(reports.length, 30);
    assert.equal(new Set(reports.map(report => report.jobId)).size, 30);
    assert.ok(reports.every(report => report.skillReports.some(skill => skill.skillId.endsWith('_technique'))));
    assert.ok(reports.every(report => report.skillReports.some(skill => skill.sustainableDpm > 0)));
});

test('Lv.1 엘리트 전용기는 이미 성장한 일반 직업 공격 기술보다 티어상 약하지 않다', () => {
    for (const report of analyzeAllEliteJobs(200)) {
        const elite = report.skillReports.find(skill => skill.skillId.endsWith('_technique'));
        const inherited = report.skillReports
            .filter(skill => !skill.skillId.endsWith('_technique')
                && skill.coverage === 'complete'
                && skill.rawDamage > 0)
            .sort((left, right) => right.rawDamage - left.rawDamage)[0];

        assert.ok(elite, `${report.name}: 엘리트 전용기 누락`);
        assert.ok(inherited, `${report.name}: 비교할 일반 공격 기술 누락`);
        // 보호막·확정 치명타·회피 불가·지속 상태효과를 점수로 더하지 않은 보수적 직접 피해 기준이다.
        assert.ok(
            elite.rawDamage >= inherited.rawDamage * 0.68,
            `${report.name}: ${elite.name} ${elite.rawDamage.toFixed(1)} < ${inherited.name} ${inherited.rawDamage.toFixed(1)}`,
        );
    }
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
        analyzeItemBalance(120, 'career:mage', 'auroraprism_staff'),
    ];
    assert.ok(reports[0].after.attack > reports[0].before.attack);
    assert.ok(reports[1].after.physicalBasicDps > reports[1].before.physicalBasicDps);
    assert.ok(reports[2].after.physicalBasicDps > reports[2].before.physicalBasicDps);
    assert.ok(reports[3].after.magicForce > reports[3].before.magicForce);
    assert.ok(reports.every(report => report.notes.every(note => !note.includes('추정'))));
});

test('combat profiles share resources while mixing basics and every available job skill', () => {
    const profiles = analyzeAllBalanceProfiles(100);
    assert.equal(profiles.length, 6);
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
            assert.ok(rotation.basicAttackEvasionSpeed > 0);
            assert.ok(rotation.playerMaxLife > 0 && rotation.targetMaxLife > 0);
            assert.ok(rotation.simulatedKillSeconds > 0);
            assert.ok(rotation.maxOpeningActionDamage > 0);
            assert.ok(rotation.openingBurstDamage > 0);
            assert.ok(rotation.incomingBasicDamage > 0);
            assert.ok(rotation.defenderEvasionChance >= 0 && rotation.defenderEvasionChance <= 0.9);
            assert.ok(rotation.evasionSurvivalSeconds >= rotation.rawSurvivalSeconds);
            assert.ok(rotation.effectiveSurvivalSeconds >= rotation.evasionSurvivalSeconds);
            assert.ok(rotation.expectedIncomingHitsBeforeKill >= 0);
            assert.ok(rotation.expectedIncomingDamageBeforeKill >= 0);
            assert.ok(rotation.expectedLifeAfterKill >= 0
                && rotation.expectedLifeAfterKill <= rotation.playerMaxLife);
        }
    }
});

test('생존 replay는 같은 시각의 피해를 회복·보호막보다 먼저 확정한다', () => {
    const report = replayBalanceSurvival(
        100,
        [{ at: 1, expectedDamage: 100, rawDamage: 100, expectedHits: 1 }],
        [{ at: 1, sourceId: 'skill:test_aegis', healing: 100, shield: 100, shieldDuration: 10 }],
    );

    assert.equal(report.expected.endingLife, 0);
    assert.equal(report.expected.diedAt, 1);
    assert.equal(report.expected.effectiveSupport, 0);
});

test('생존 replay는 같은 source 보호막을 교체하고 만료 뒤 남은 피해만 생명력에 적용한다', () => {
    const report = replayBalanceSurvival(
        100,
        [{ at: 2, expectedDamage: 60, rawDamage: 60, expectedHits: 1 }],
        [
            { at: 0, sourceId: 'skill:test_aegis', healing: 0, shield: 80, shieldDuration: 10 },
            { at: 1, sourceId: 'skill:test_aegis', healing: 0, shield: 30, shieldDuration: 10 },
            { at: 1, sourceId: 'skill:expiring_aegis', healing: 0, shield: 20, shieldDuration: 1 },
        ],
    );

    assert.equal(report.expected.effectiveSupport, 30);
    assert.equal(report.expected.endingLife, 70);
    assert.equal(report.expected.diedAt, undefined);
});

test('생존 replay는 평타·패턴 피격을 시간순으로 섞고 회복을 최대 생명력까지만 반영한다', () => {
    const report = replayBalanceSurvival(
        100,
        [
            { at: 3, expectedDamage: 90, rawDamage: 90, expectedHits: 1 },
            { at: 1, expectedDamage: 40, rawDamage: 40, expectedHits: 1 },
        ],
        [{ at: 2, sourceId: 'skill:test_heal', healing: 50, shield: 0, shieldDuration: 0 }],
    );

    assert.equal(report.expectedHits, 2);
    assert.equal(report.expectedDamage, 130);
    assert.equal(report.expected.effectiveSupport, 40);
    assert.equal(report.expected.endingLife, 10);
    assert.equal(report.expected.diedAt, undefined);
});

test('opening burst reports a real one-action kill before the target can counterattack', () => {
    const scenario = createBalanceScenario(100, 'career:warrior', undefined, BalanceEncounterType.BOSS);
    scenario.entity.attribute.addModifier({
        attribute: AttributeType.ATK.key,
        op: 'multiply',
        value: 200,
        source: 'test:nuking',
    });
    const report = analyzeCombatRotation(scenario);

    assert.equal(report.oneActionKill, true);
    assert.equal(report.killsBeforeCounterattack, true);
    assert.ok(report.openingBurstKillSeconds < report.counterattackDelay);
});

test('guaranteed evasion is measured as defensive uptime instead of arbitrary damage', () => {
    const report = analyzeBalanceProfile(200, 'career:archer').boss;
    assert.ok(report.skills.some(skill => skill.skillId === 'wind_evasion' && skill.damage === 0));
    assert.ok(report.guaranteedEvasionCoverage > 0);
    assert.ok(report.effectiveSurvivalSeconds >= report.evasionSurvivalSeconds);
});

test('바람 회피의 성장 구간별 확정 회피 점유율은 20%를 넘지 않는다', () => {
    for (const level of BALANCE_PROFILE_LEVELS) {
        const report = analyzeBalanceProfile(level, 'career:archer').boss;
        assert.ok(
            report.guaranteedEvasionCoverage <= 0.2 + 0.0001,
            `Lv.${level} 확정 회피 점유율 ${(report.guaranteedEvasionCoverage * 100).toFixed(2)}%`,
        );
    }
});

test('boss survival profile uses the real monster skill pattern and reports lethal pressure separately', () => {
    const report = analyzeBalanceProfile(200, 'career:warrior').boss;
    assert.ok(report.strongestIncomingSkillName);
    assert.ok(report.strongestIncomingSkillDamage > 0);
    assert.equal(
        report.strongestIncomingSkillOneShots,
        report.strongestIncomingSkillDamage >= report.playerMaxLife,
    );
});

test('recommended mage equipment follows the actual early-to-late staff progression', () => {
    assert.equal(analyzeBalanceProfile(20, 'career:mage').boss.loadoutName, '성휘목 지팡이');
    assert.equal(analyzeBalanceProfile(50, 'career:mage').boss.loadoutName, '애도목 지팡이');
    assert.equal(analyzeBalanceProfile(120, 'career:mage').boss.loadoutName, '극광분광 지팡이');
    assert.equal(analyzeBalanceProfile(200, 'career:mage').boss.loadoutName, '논리핵 지팡이');
});

test('projectile balance reports use flight acceleration instead of owner movement speed for evasion', () => {
    const mage = analyzeBalanceProfile(50, 'career:mage').boss;
    assert.notEqual(mage.basicAttackEvasionSpeed, mage.currentSpeed);
    assert.ok(mage.basicAttackEvasionSpeed > mage.currentSpeed);
    assert.ok(mage.evasionChance < 0.15);
});

test('전투 로테이션은 추천 무기로 실제 사용할 수 있는 스킬만 포함한다', () => {
    const archer = analyzeBalanceProfile(50, 'career:archer').boss;
    const warrior = analyzeBalanceProfile(50, 'career:warrior').boss;

    assert.equal(archer.skills.some(skill => skill.skillId === 'power_strike'), false);
    assert.equal(warrior.skills.some(skill => skill.skillId === 'power_strike'), true);
});

test('advanced first-job 60-second damage baselines stay within the measured 1.55x boss DPS band', () => {
    for (const level of [75, 100, 140, 180]) {
        const profiles = ['warrior', 'archer', 'assassin', 'mage', 'blacksmith'].map(job =>
            analyzeCombatRotation(createBalanceScenario(
                level, `career:${job}`, undefined, BalanceEncounterType.BOSS,
            ), 60));
        const bossDps = profiles.map(profile => profile.dps);
        const spread = Math.max(...bossDps) / Math.min(...bossDps);
        assert.ok(spread <= 1.55, `Lv.${level} spread=${spread.toFixed(3)}`);
        assert.ok(profiles.every(profile =>
            profile.basicDamageShare >= 0.15 && profile.basicDamageShare <= 0.75));
    }
});

test('single-loadout elite combinations stay within the measured 1.7x boss DPS band', () => {
    const profiles = [];
    for (const main of ['warrior', 'archer', 'assassin', 'mage', 'blacksmith', 'cleric']) {
        for (const sub of ['warrior', 'archer', 'assassin', 'mage', 'blacksmith', 'cleric']) {
            if (main === sub) continue;
            profiles.push(analyzeBalanceProfile(200, `career:${main}`, `career:${sub}`));
        }
    }
    const bossDps = profiles.map(profile => profile.boss.dps);
    const weakest = [...profiles].sort((left, right) => left.boss.dps - right.boss.dps)[0]!;
    const strongest = [...profiles].sort((left, right) => right.boss.dps - left.boss.dps)[0]!;
    const spread = Math.max(...bossDps) / Math.min(...bossDps);
    assert.ok(
        spread <= 1.7,
        `${weakest.name} ${weakest.boss.dps.toFixed(1)} [${weakest.boss.skills.map(skill => `${skill.skillId}:${skill.casts}/${skill.damage.toFixed(0)}`).join(', ')}]`
            + ` → ${strongest.name} ${strongest.boss.dps.toFixed(1)} (${spread.toFixed(3)}x)`,
    );
    assert.ok(profiles.every(profile => profile.boss.basicDamageShare >= 0.13));
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

test('암살자 로테이션은 은신 뒤에만 암습을 사용하고 피해 snapshot 뒤 은신 보정을 소모한다', () => {
    const scenario = createBalanceScenario(100, 'career:assassin', undefined, BalanceEncounterType.BOSS);
    const report = analyzeCombatRotation(scenario, 90);
    const stealth = report.skills.find(skill => skill.skillId === 'stealth');
    const ambush = report.skills.find(skill => skill.skillId === 'ambush');

    assert.ok(stealth && stealth.casts > 0);
    assert.ok(ambush && ambush.casts > 0);
    assert.ok(ambush.casts <= stealth.casts);
    let previousAmbushAt = Number.NEGATIVE_INFINITY;
    for (const ambushAt of ambush.castTimes) {
        const precedingStealthAt = stealth.castTimes.find(stealthAt =>
            stealthAt > previousAmbushAt && stealthAt < ambushAt);
        assert.notEqual(precedingStealthAt, undefined, `암습 ${ambushAt}초의 선행 은신`);
        previousAmbushAt = ambushAt;
    }
    const standalone = analyzeSkillBalance(scenario, 'ambush', ambush.skillLevel);
    assert.ok(ambush.damage / ambush.casts > standalone.expectedDamagePerTarget);
    assert.equal(ambush.manaSpent, ambush.casts * 10);
    assert.equal(stealth.manaSpent, stealth.casts * 16);
    assert.notEqual(report.maxOpeningActionName, '암습');
    assert.equal(scenario.entity.attribute.modifiers.some(modifier => modifier.source.startsWith('balance:rotation:')), false);
});

test('combat rotation applies tag-based shared cooldowns between magic skills', () => {
    const scenario = createBalanceScenario(100, 'career:mage');
    const report = analyzeCombatRotation(scenario, 5);
    // 마법 계열은 전체 0.5초 공유 쿨타임이므로 5초 창에서 10회를 초과해 발동할 수 없다.
    assert.ok(report.skillCasts <= 10);
    assert.ok(report.notes.some(note => note.includes('태그 공유')));
});

test('전투 로테이션은 평타를 막지 않으면서 모든 전투 기술 발동을 0.9초 이상 벌린다', () => {
    const scenario = createBalanceScenario(200, 'career:mage', 'career:archer');
    const report = analyzeCombatRotation(scenario, 10);
    const combatCastTimes = report.skills.flatMap(skill =>
        getSkillData(skill.skillId)?.tags.includes(GameTags.SKILL_COMBAT) ? skill.castTimes : [],
    ).sort((left, right) => left - right);

    assert.ok(combatCastTimes.length >= 2);
    for (let index = 1; index < combatCastTimes.length; index++) {
        assert.ok(
            combatCastTimes[index]! - combatCastTimes[index - 1]!
                >= PLAYER_COMBAT_SKILL_CADENCE_SECONDS - 0.0001,
            `${combatCastTimes[index - 1]} → ${combatCastTimes[index]}`,
        );
    }
    assert.ok(report.basicAttacks > 0);
});

test('boss profile normalizes a real boss archetype to the requested level', () => {
    const profile = analyzeAllBalanceProfiles(100)[0];
    assert.equal(profile.boss.encounter.key, 'boss');
    assert.equal(profile.boss.targetLevel, 100);
    assert.notEqual(profile.boss.targetSourceLevel, 100);
    assert.equal(profile.boss.targetNormalized, true);
    assert.ok(profile.boss.targetMaxLife > profile.monster.targetMaxLife);
});

test('고레벨 대상 투영은 몬스터 공식과 authored 보정만 사용한다', () => {
    const jobIds = ['career:warrior', 'career:archer', 'career:assassin', 'career:mage', 'career:blacksmith', 'career:cleric'];
    const monsters = jobIds.map(jobId => createBalanceScenario(
        1000, jobId, undefined, BalanceEncounterType.MONSTER,
    ));
    const bosses = jobIds.map(jobId => createBalanceScenario(
        1000, jobId, undefined, BalanceEncounterType.BOSS,
    ));

    assert.ok(monsters.every(scenario => scenario.targetDataId === 'horizon_reaper'));
    assert.ok(bosses.every(scenario => scenario.targetDataId === 'last_constellation'));
    assert.deepEqual(new Set(monsters.map(scenario => scenario.target.maxLife)), new Set([4_738_734]));
    assert.deepEqual(new Set(bosses.map(scenario => scenario.target.maxLife)), new Set([30_178_842]));
});

test('일반전은 30초, 보스전은 240초 창에서 동레벨 전투 템포를 진단한다', () => {
    for (const level of BALANCE_PROFILE_LEVELS) {
        const profiles = analyzeAllBalanceProfiles(level);
        assert.ok(profiles.every(profile => profile.monster.duration === 30));
        assert.ok(profiles.every(profile => profile.boss.duration === 240));
        assert.ok(profiles.every(profile => profile.monster.simulatedKillSeconds >= 10));

        const bossKillSeconds = profiles
            .map(profile => profile.boss.simulatedKillSeconds)
            .sort((left, right) => left - right);
        const median = bossKillSeconds[Math.floor(bossKillSeconds.length / 2)]!;
        assert.ok(median >= 120, `Lv.${level} 보스 중앙값 ${median.toFixed(1)}초`);
    }
});

test('동레벨 일반 몬스터는 추천 성장 프로필의 생명력을 중앙 15~30% 소모시킨다', () => {
    const distributions = BALANCE_PROFILE_LEVELS.map(analyzeMonsterPressureDistribution);
    const losses = distributions.flatMap(distribution => [...distribution.lifeLossRatios])
        .sort((left, right) => left - right);
    const median = losses[Math.floor((losses.length - 1) * 0.5)]!;
    const p75 = losses[Math.floor((losses.length - 1) * 0.75)]!;
    const deaths = distributions.reduce((sum, distribution) => sum + distribution.deathProfiles, 0);

    assert.ok(median >= 0.15 && median <= 0.3, `전체 중앙 HP 소모 ${(median * 100).toFixed(2)}%`);
    assert.ok(p75 <= 0.5, `전체 p75 HP 소모 ${(p75 * 100).toFixed(2)}%`);
    assert.ok(deaths <= 2, `예상 사망 프로필 ${deaths}/${losses.length}`);
    for (const distribution of distributions) {
        assert.equal(distribution.profileCount, 6);
        assert.ok(distribution.p25LifeLossRatio <= distribution.medianLifeLossRatio);
        assert.ok(distribution.medianLifeLossRatio <= distribution.p75LifeLossRatio);
    }
});

test('elite profile starts its technique at level one and excludes inherited skills incompatible with its loadout', () => {
    const { boss } = analyzeBalanceProfile(200, 'career:mage', 'career:archer');
    const technique = boss.skills.find(skill => skill.skillId === 'star_weaver_technique');
    assert.equal(technique?.skillLevel, 1);
    assert.ok(boss.skills.some(skill => skill.skillId === 'magic_bolt' && skill.skillLevel === 5));
    assert.equal(boss.skills.some(skill => skill.skillId === 'arcane_arrow'), false);
});
