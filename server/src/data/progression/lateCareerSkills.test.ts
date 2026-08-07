import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import type Player from '../../models/actors/Player.js';
import Entity from '../../models/core/Entity.js';
import Equipment from '../../models/economy/Equipment.js';
import Inventory from '../../models/economy/Inventory.js';
import SkillBook from '../../models/progression/SkillBook.js';
import { createSkillContext, getSkillData, SkillCriticalMode } from '../../models/progression/Skill.js';
import { AttributeType } from '../../models/core/Attribute.js';
import { PlayerProgress } from '../../models/progression/Progress.js';
import CareerProfile, { CareerProgressIds } from '../../models/progression/Career.js';
import { JobSlotType } from '../../models/progression/Job.js';
import Stat from '../../models/core/Stat.js';
import Monster, { defineMonster } from '../../models/actors/Monster.js';
import { ControlCategory } from '../../models/combat/StatusEffect.js';
import { getIO, initSocket } from '../../modules/infrastructure/socket.js';
import { GameTags } from '../../../../shared/tags.js';
import { LegacyStatusEffects } from '../combat/statusEffects.js';
import { calculateFinaleExecutionDamage } from '../combat/skills.js';
import './progress.js';
import './jobs.js';
import '../economy/items.js';

const LATE_ROLE_TARGET_ID = 'late_career_role_target';

defineMonster({
    id: LATE_ROLE_TARGET_ID,
    name: '후반 직업 역할 시험체',
    description: '',
    level: 1,
    exp: 0,
    baseAttribute: {
        maxLife: 1_000_000,
        def: 100,
        magicDef: 100,
        speed: 0.5,
    },
    drops: [],
    expReward: 0,
    equipments: [],
    tags: [],
});

class LateCareerPlayer extends Entity {
    override readonly name = '후반 직업 시험 플레이어';
    readonly userId: number;
    readonly progress: PlayerProgress;
    readonly skills: SkillBook;
    readonly inventory: Inventory;
    readonly stat = new Stat();
    readonly career: CareerProfile;

    constructor(userId: number) {
        super(1, 0, 'late-career-test', {
            maxLife: 2_000,
            maxMentality: 1_000,
            atk: 200,
            def: 120,
            magicForce: 180,
            magicDef: 100,
            speed: 10,
        }, Equipment.createEmpty());
        this.userId = userId;
        this.progress = PlayerProgress.createEmpty(userId);
        this.skills = SkillBook.createEmpty(userId);
        this.inventory = Inventory.createEmpty(userId, 100);
        this.career = new CareerProfile(this as unknown as Player);
        this.skills.bindOwner(this as unknown as Player);
    }

    override get isPlayer(): boolean { return true; }
    override get playerUserId(): number { return this.userId; }

    canSpendMentality(amount: number): boolean {
        return Number.isFinite(amount) && amount >= 0 && this.mentality >= amount;
    }

    spendMentality(amount: number): boolean {
        if (!this.canSpendMentality(amount)) return false;
        this.mentality -= amount;
        return true;
    }

    gainExp(_amount: number): number[] { return []; }
}

const lateCareerSkills = [
    {
        jobId: 'career:warrior', passiveId: 'unyielding_constitution', activeId: 'vanguard_command',
        activeName: '선봉의 호령', groupTag: GameTags.SKILL_GROUP_WARRIOR,
        passiveProbe: AttributeType.MAX_LIFE,
    },
    {
        jobId: 'career:archer', passiveId: 'trajectory_analysis', activeId: 'armor_break_mark',
        activeName: '파갑 표식', groupTag: GameTags.SKILL_GROUP_ARCHER,
        passiveProbe: AttributeType.PROJECTILE_ACCELERATION,
    },
    {
        jobId: 'career:assassin', passiveId: 'slayers_breath', activeId: 'finale_execution',
        activeName: '종막', groupTag: GameTags.SKILL_GROUP_ASSASSIN,
        passiveProbe: AttributeType.SPEED,
    },
    {
        jobId: 'career:mage', passiveId: 'deep_mana_cycle', activeId: 'mana_rift',
        activeName: '마력 균열', groupTag: GameTags.SKILL_GROUP_MAGIC,
        passiveProbe: AttributeType.MAGIC_FORCE,
    },
    {
        jobId: 'career:blacksmith', passiveId: 'master_heat_treatment', activeId: 'structural_dismantling',
        activeName: '구조 해체', groupTag: GameTags.SKILL_GROUP_BLACKSMITH,
        passiveProbe: AttributeType.FORGING_PRECISION,
    },
] as const;

const allLateSkillIds = lateCareerSkills.flatMap(entry => [entry.passiveId, entry.activeId]);

const httpServer = createServer();
initSocket(httpServer, 'http://localhost');
test.after(() => { getIO().close(); });

test('5개 메인 직업은 Lv.240 패시브와 Lv.320 역할기 경계에서 자기 계열만 자동 습득한다', () => {
    for (const [index, definition] of lateCareerSkills.entries()) {
        const player = new LateCareerPlayer(95_000 + index);
        player.progress.setState(CareerProgressIds.MAIN, definition.jobId);

        player.level = 239;
        player.skills.update(0.5);
        assert.equal(player.skills.has(definition.passiveId), false, `${definition.jobId} Lv.239 passive`);
        const passiveBaseline = player.attribute.get(definition.passiveProbe);

        player.level = 240;
        player.skills.update(0.5);
        assert.equal(player.skills.has(definition.passiveId), true, `${definition.jobId} Lv.240 passive`);
        assert.equal(player.skills.get(definition.passiveId)?.acquisitionSource, 'automatic');
        assert.equal(player.skills.has(definition.activeId), false, `${definition.jobId} Lv.240 active`);
        const passiveApplied = player.attribute.get(definition.passiveProbe);
        assert.notEqual(passiveApplied, passiveBaseline, `${definition.passiveId} actual modifier`);

        player.level = 319;
        player.skills.update(0.5);
        assert.equal(player.skills.has(definition.activeId), false, `${definition.jobId} Lv.319 active`);

        player.level = 320;
        player.skills.update(0.5);
        assert.equal(player.skills.has(definition.activeId), true, `${definition.jobId} Lv.320 active`);
        assert.equal(player.skills.get(definition.activeId)?.acquisitionSource, 'automatic');

        for (const skillId of allLateSkillIds) {
            assert.equal(
                player.skills.has(skillId),
                skillId === definition.passiveId || skillId === definition.activeId,
                `${definition.jobId}/${skillId} isolation`,
            );
        }

        const active = player.skills.get(definition.activeId)!;
        assert.equal(active.data.jobRequirement?.slot, JobSlotType.MAIN);
        assert.equal(active.data.tags.includes(GameTags.SKILL_COMBAT), true);
        assert.equal(active.data.tags.includes(definition.groupTag), true);
        assert.ok(active.getMaxCooldown(player) >= 20 && active.getMaxCooldown(player) <= 30);
        assert.ok(active.data.sharedCooldowns?.some(rule => rule.targetTag === definition.groupTag));

        const passiveSource = `skill:${definition.passiveId}:passive`;
        assert.equal(player.attribute.hasSource(passiveSource), true, `${definition.passiveId} source`);
        player.skills.update(1);
        assert.equal(
            player.attribute.get(definition.passiveProbe),
            passiveApplied,
            `${definition.passiveId} duplicate guard`,
        );
        player.progress.setState(CareerProgressIds.MAIN, '');
        player.skills.update(0.5);
        assert.equal(player.attribute.hasSource(passiveSource), false, `${definition.passiveId} inactive cleanup`);
        assert.equal(player.attribute.get(definition.passiveProbe), passiveBaseline, `${definition.passiveId} value cleanup`);
    }
});

test('엘리트 직업은 원래 메인 계보의 후반 스킬만 유지하고 서브 계열은 추가로 얻지 않는다', () => {
    const cases = [
        ['career:warrior', 'career:mage', 'career:spellblade'],
        ['career:archer', 'career:mage', 'career:elemental_marksman'],
        ['career:assassin', 'career:mage', 'career:arcane_reaper'],
        ['career:mage', 'career:warrior', 'career:battle_magus'],
        ['career:blacksmith', 'career:warrior', 'career:battle_smith'],
    ] as const;

    for (const [index, [mainJobId, subJobId, eliteJobId]] of cases.entries()) {
        const player = new LateCareerPlayer(95_100 + index);
        player.progress.setState(CareerProgressIds.MAIN, mainJobId);
        player.progress.setState(CareerProgressIds.SUB, subJobId);
        player.progress.setState(CareerProgressIds.ELITE, eliteJobId);
        player.level = 320;
        player.skills.update(0.5);

        const main = lateCareerSkills.find(entry => entry.jobId === mainJobId)!;
        const sub = lateCareerSkills.find(entry => entry.jobId === subJobId)!;
        assert.equal(player.skills.has(main.passiveId), true, `${eliteJobId} main passive`);
        assert.equal(player.skills.has(main.activeId), true, `${eliteJobId} main active`);
        assert.equal(player.skills.has(sub.passiveId), false, `${eliteJobId} sub passive`);
        assert.equal(player.skills.has(sub.activeId), false, `${eliteJobId} sub active`);
    }
});

function createRolePlayer(jobId: string, userId: number): LateCareerPlayer {
    const player = new LateCareerPlayer(userId);
    player.progress.setState(CareerProgressIds.MAIN, jobId);
    player.level = 320;
    player.skills.update(0.5);
    return player;
}

const thirdRoleLineages = {
    warrior: { main: 'career:warrior', sub: 'career:mage', elite: 'career:spellblade', third: 'career:ironblood_lord' },
    archer: { main: 'career:archer', sub: 'career:mage', elite: 'career:elemental_marksman', third: 'career:starseal_tracker' },
    assassin: { main: 'career:assassin', sub: 'career:mage', elite: 'career:arcane_reaper', third: 'career:moonshadow_executor' },
    mage: { main: 'career:mage', sub: 'career:warrior', elite: 'career:battle_magus', third: 'career:astral_sage' },
    blacksmith: { main: 'career:blacksmith', sub: 'career:warrior', elite: 'career:battle_smith', third: 'career:mythic_artisan' },
} as const;

function createAdvancedRolePlayer(
    lineage: keyof typeof thirdRoleLineages,
    userId: number,
    third = false,
): LateCareerPlayer {
    const jobs = thirdRoleLineages[lineage];
    const player = new LateCareerPlayer(userId);
    player.level = 500;
    player.progress.setState(CareerProgressIds.MAIN, jobs.main);
    player.progress.setState(CareerProgressIds.SUB, jobs.sub);
    player.progress.setState(CareerProgressIds.ELITE, jobs.elite);
    if (third) player.progress.setState(CareerProgressIds.THIRD, jobs.third);
    player.career.initialize();
    player.skills.update(0.5);
    return player;
}

function createRoleTarget(): Monster {
    return new Monster(LATE_ROLE_TARGET_ID, 'late-career-test');
}

test('선봉의 호령은 몬스터 교전을 선점해 도발하고 20~30초 쿨다운의 생존 보호막을 만든다', () => {
    const player = createRolePlayer('career:warrior', 95_200);
    const target = createRoleTarget();
    player.currentTarget = target;

    const result = player.skills.activateByInput('선봉의 호령');

    assert.equal(result.activated, true);
    assert.equal(target.currentTarget, player);
    assert.deepEqual(target.getCombatClaimUserIds(), [player.userId]);
    assert.ok(player.getShield('skill:vanguard_command')?.amount ?? 0 > 0);
    assert.ok(player.skills.get('vanguard_command')!.getRemainingCooldown() >= 20);
    assert.ok(player.skills.getPlayerCombatSkillCadenceRemaining() > 0);
    assert.equal(target.getStatusEffects().length, 0);
});

test('파갑 표식·마력 균열·구조 해체는 10초 전술 약화만 적용하고 hard CC를 만들지 않는다', () => {
    const cases = [
        {
            jobId: 'career:archer', userId: 95_210, name: '파갑 표식',
            effects: [LegacyStatusEffects.DEFENSE_REDUCTION], level: 3,
        },
        {
            jobId: 'career:mage', userId: 95_211, name: '마력 균열',
            effects: [LegacyStatusEffects.MAGIC_DEFENSE_REDUCTION], level: 3,
        },
        {
            jobId: 'career:blacksmith', userId: 95_212, name: '구조 해체',
            effects: [LegacyStatusEffects.DEFENSE_REDUCTION, LegacyStatusEffects.MAGIC_DEFENSE_REDUCTION], level: 2,
        },
    ] as const;

    for (const definition of cases) {
        const player = createRolePlayer(definition.jobId, definition.userId);
        const target = createRoleTarget();
        player.currentTarget = target;
        const beforeDef = target.attribute.get(AttributeType.DEF);
        const beforeMagicDef = target.attribute.get(AttributeType.MAGIC_DEF);

        assert.equal(player.skills.activateByInput(definition.name).activated, true, definition.name);
        for (const type of definition.effects) {
            const effect = target.getStatusEffect(type);
            assert.ok(effect, `${definition.name}/${type.id}`);
            assert.equal(effect.level, definition.level);
            assert.equal(effect.duration, 10);
            assert.equal(type.controlCategory, ControlCategory.NONE);
        }
        if (definition.effects.includes(LegacyStatusEffects.DEFENSE_REDUCTION)) {
            assert.equal(target.attribute.get(AttributeType.DEF), beforeDef * Math.pow(0.95, definition.level));
        } else {
            assert.equal(target.attribute.get(AttributeType.DEF), beforeDef);
        }
        if (definition.effects.includes(LegacyStatusEffects.MAGIC_DEFENSE_REDUCTION)) {
            assert.equal(target.attribute.get(AttributeType.MAGIC_DEF), beforeMagicDef * Math.pow(0.95, definition.level));
        } else {
            assert.equal(target.attribute.get(AttributeType.MAGIC_DEF), beforeMagicDef);
        }
        assert.ok(player.skills.getPlayerCombatSkillCadenceRemaining() > 0);
    }
});

test('종막은 잃은 생명력에 따라 증가하지만 보너스·총 피해 상한을 공유하고 실제 공격에 CC를 붙이지 않는다', () => {
    const player = createRolePlayer('career:assassin', 95_220);
    const target = createRoleTarget();
    player.currentTarget = target;
    const skill = player.skills.get('finale_execution')!;
    const context = createSkillContext(player, skill);

    target.life = target.maxLife;
    const full = calculateFinaleExecutionDamage(context, target);
    target.life = target.maxLife / 2;
    const half = calculateFinaleExecutionDamage(context, target);
    target.life = 50_000;
    const low = calculateFinaleExecutionDamage(context, target);

    assert.equal(full.missingLifeBonus, 0);
    assert.ok(half.totalDamage > full.totalDamage);
    assert.ok(low.totalDamage >= half.totalDamage);
    assert.equal(low.missingLifeBonus, low.missingLifeBonusCap);
    assert.ok(low.totalDamage <= low.totalDamageCap);
    assert.equal(getSkillData('finale_execution')?.balance?.criticalMode, SkillCriticalMode.DISABLED);

    const before = target.life;
    assert.equal(player.skills.activateByInput('종막').activated, true);
    const dealt = before - target.life;
    assert.ok(dealt > 0);
    assert.ok(dealt <= low.totalDamageCap);
    assert.equal(target.getStatusEffects().length, 0);
});

test('3차 패시브는 한 소스로만 유지되고 선봉의 호령·종막의 상한을 정확히 강화한다', () => {
    const baseWarrior = createAdvancedRolePlayer('warrior', 95_300);
    const thirdWarrior = createAdvancedRolePlayer('warrior', 95_301, true);
    assert.equal(thirdWarrior.attribute.hasSource('skill:ironblood_sovereignty:passive'), true);
    const passiveLife = thirdWarrior.maxLife;
    thirdWarrior.skills.update(0.5);
    thirdWarrior.skills.update(0.5);
    assert.equal(thirdWarrior.maxLife, passiveLife);
    // 역할기 자체의 22% 계수만 비교하도록 별도 3차 패시브 증분을 제거한다.
    thirdWarrior.attribute.removeBySource('skill:ironblood_sovereignty:passive');
    const baseWarriorTarget = createRoleTarget();
    const thirdWarriorTarget = createRoleTarget();
    baseWarrior.currentTarget = baseWarriorTarget;
    thirdWarrior.currentTarget = thirdWarriorTarget;
    assert.equal(baseWarrior.skills.activateByInput('선봉의 호령').activated, true);
    assert.equal(thirdWarrior.skills.activateByInput('선봉의 호령').activated, true);
    const baseShield = baseWarrior.getShield('skill:vanguard_command')!.amount;
    const thirdShield = thirdWarrior.getShield('skill:vanguard_command')!.amount;
    assert.ok(Math.abs(thirdShield / baseShield - 1.22) < 1e-9);
    const baseThreat = baseWarriorTarget.getThreatContributions()[0]!.threat;
    const thirdThreat = thirdWarriorTarget.getThreatContributions()[0]!.threat;
    // 선봉의 호령이 교전 선점용 기본 위협도 1을 먼저 더하므로 그 값을 제외해 도발 분만 비교한다.
    assert.ok(Math.abs((thirdThreat - 1) / (baseThreat - 1) - 1.22) < 1e-9);

    const baseAssassin = createAdvancedRolePlayer('assassin', 95_302);
    const thirdAssassin = createAdvancedRolePlayer('assassin', 95_303, true);
    assert.equal(thirdAssassin.attribute.hasSource('skill:moonshadow_sentence:passive'), true);
    thirdAssassin.attribute.removeBySource('skill:moonshadow_sentence:passive');
    const baseTarget = createRoleTarget();
    const thirdTarget = createRoleTarget();
    baseTarget.life = thirdTarget.life = 1;
    const base = calculateFinaleExecutionDamage(
        createSkillContext(baseAssassin, baseAssassin.skills.get('finale_execution')!),
        baseTarget,
    );
    const strengthened = calculateFinaleExecutionDamage(
        createSkillContext(thirdAssassin, thirdAssassin.skills.get('finale_execution')!),
        thirdTarget,
    );
    assert.ok(Math.abs(strengthened.missingLifeBonusCap / base.missingLifeBonusCap - 1.18) < 1e-9);
    assert.ok(Math.abs(strengthened.totalDamageCap / base.totalDamageCap - 1.18) < 1e-9);
    assert.ok(strengthened.totalDamage <= strengthened.totalDamageCap);
});

test('3차 궁수·마법사·대장장이는 역할기의 non-CC 약화 레벨을 1씩 더 높인다', () => {
    const cases = [
        { lineage: 'archer', name: '파갑 표식', effect: LegacyStatusEffects.DEFENSE_REDUCTION },
        { lineage: 'mage', name: '마력 균열', effect: LegacyStatusEffects.MAGIC_DEFENSE_REDUCTION },
        { lineage: 'blacksmith', name: '구조 해체', effect: LegacyStatusEffects.DEFENSE_REDUCTION },
    ] as const;

    for (const [index, definition] of cases.entries()) {
        const base = createAdvancedRolePlayer(definition.lineage, 95_310 + index * 2);
        const third = createAdvancedRolePlayer(definition.lineage, 95_311 + index * 2, true);
        const baseTarget = createRoleTarget();
        const thirdTarget = createRoleTarget();
        base.currentTarget = baseTarget;
        third.currentTarget = thirdTarget;
        assert.equal(base.skills.activateByInput(definition.name).activated, true);
        assert.equal(third.skills.activateByInput(definition.name).activated, true);
        const baseEffect = baseTarget.getStatusEffect(definition.effect)!;
        const thirdEffect = thirdTarget.getStatusEffect(definition.effect)!;
        assert.equal(thirdEffect.level, baseEffect.level + 1);
        assert.equal(thirdEffect.duration, 10);
        assert.equal(definition.effect.controlCategory, ControlCategory.NONE);
    }
});
