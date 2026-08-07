import Entity from '../core/Entity.js';
import Equipment from '../economy/Equipment.js';
import { AttributeType } from '../core/Attribute.js';
import type { AttributeModifier, AttributeRecord } from '../core/Attribute.js';
import { calculateEvasionChance } from '../combat/Combat.js';
import { DEFAULT_PLAYER_BASE_ATTRIBUTE } from '../actors/PlayerDefaults.js';
import {
    getAllJobs,
    getJob,
    isJobDescendant,
    JobSlotType,
    resolveEliteJob,
    resolveThirdJob,
    type JobData,
} from './Job.js';
import Skill, {
    PLAYER_COMBAT_SKILL_CADENCE_SECONDS,
    createSkillContext,
    getAllSkillData,
    getSkillData,
    SkillCriticalMode,
    type SkillData,
} from './Skill.js';
import { StatType, type StatKey, type StatRecord } from '../core/Stat.js';
import {
    getAllItemData,
    getItemData,
    ItemMetadataKeys,
    type ItemData,
} from '../economy/Item.js';
import { StatusEffectType } from '../combat/StatusEffect.js';
import { GameTags } from '../../../../shared/tags.js';
import Monster, { getAllMonsterData, getMonsterData, type MonsterData } from '../actors/Monster.js';
import { applyTagEffectValue } from '../combat/TagEffect.js';
import type { TagId } from '../../../../shared/tags.js';
import {
    calculateProjectileAcceleration,
    calculateProjectileEvasionSpeed,
    getProjectileData,
} from '../combat/Projectile.js';
import { calculateMonsterBaseAttributes } from '../actors/MonsterStats.js';

const BALANCE_SKILL_WINDOW_SECONDS = 60;
const BALANCE_MONSTER_WINDOW_SECONDS = 30;
const BALANCE_BOSS_WINDOW_SECONDS = 240;
const BALANCE_ACTION_FLOOR_SECONDS = 0.45;
const BALANCE_DEFAULT_SHIELD_DURATION_SECONDS = 8;
/** 1차 성장기·2차 전직 경계·Lv.1000 후반기를 포함하는 공용 밸런스 회귀 구간. */
export const BALANCE_PROFILE_LEVELS = Object.freeze([
    20, 50, 75, 100, 140, 180, 200, 350, 500, 750, 1000,
] as const);
const PROJECTED_SKILL_UNLOCK_LEVELS = new Map<string, number>([
    ['power_strike', 10],
    ['fireball', 40],
    ['frost_bolt', 70],
    ['lightning_orb', 100],
]);

export class BalanceEncounterType {
    private static readonly all: BalanceEncounterType[] = [];
    static readonly MONSTER = new BalanceEncounterType('monster', '일반 몬스터', false);
    static readonly BOSS = new BalanceEncounterType('boss', '보스 몬스터', true);
    private constructor(readonly key: string, readonly label: string, readonly boss: boolean) {
        BalanceEncounterType.all.push(this);
    }
    static values(): readonly BalanceEncounterType[] { return BalanceEncounterType.all; }
    static fromKey(key: string): BalanceEncounterType | undefined {
        return BalanceEncounterType.all.find(value => value.key === key);
    }
}

export interface BalanceStatAllocation {
    readonly label: string;
    readonly weights: Readonly<Partial<Record<StatKey, number>>>;
}

const DEFAULT_ALLOCATION: BalanceStatAllocation = Object.freeze({
    label: '균형',
    weights: Object.freeze({ strength: 1, agility: 1, vitality: 1, sensibility: 1, mentality: 1 }),
});

const JOB_ALLOCATIONS = new Map<string, BalanceStatAllocation>([
    ['career:warrior', freezeAllocation('전사 기준', { strength: 4, vitality: 3, agility: 2, sensibility: 1 })],
    ['career:archer', freezeAllocation('궁수 기준', { strength: 4, agility: 3, sensibility: 2, vitality: 1 })],
    ['career:assassin', freezeAllocation('암살자 기준', { agility: 4, strength: 3, sensibility: 2, vitality: 1 })],
    ['career:mage', freezeAllocation('마법사 기준', { mentality: 4, sensibility: 3, vitality: 2, agility: 1 })],
    ['career:blacksmith', freezeAllocation('대장장이 기준', { sensibility: 4, vitality: 3, strength: 2, mentality: 1 })],
    ['career:cleric', freezeAllocation('성직자 기준', { mentality: 4, sensibility: 3, vitality: 2, agility: 1 })],
]);

const BLACKSMITH_ELITE_ALLOCATIONS = new Map<string, BalanceStatAllocation>([
    ['career:warrior', freezeAllocation('대장장이·전사 기준', { sensibility: 4, strength: 3, vitality: 2, agility: 1 })],
    ['career:archer', freezeAllocation('대장장이·궁수 기준', { sensibility: 4, strength: 3, agility: 2, vitality: 1 })],
    ['career:assassin', freezeAllocation('대장장이·암살자 기준', { sensibility: 4, agility: 3, strength: 2, vitality: 1 })],
    ['career:mage', freezeAllocation('대장장이·마법사 기준', { sensibility: 4, mentality: 3, vitality: 2, agility: 1 })],
    ['career:cleric', freezeAllocation('대장장이·성직자 기준', { sensibility: 4, mentality: 3, vitality: 2, strength: 1 })],
]);

class BalanceEntity extends Entity {
    constructor(
        readonly balanceName: string,
        level: number,
        stats: Partial<StatRecord>,
        tags: readonly TagId[] = [],
    ) {
        super(level, 0, 'balance:void', DEFAULT_PLAYER_BASE_ATTRIBUTE, Equipment.createEmpty(), stats, tags);
    }
    get name(): string { return this.balanceName; }
}

class BalanceTargetEntity extends Entity {
    constructor(
        readonly balanceName: string,
        level: number,
        baseAttribute: Partial<AttributeRecord>,
        tags: readonly TagId[],
    ) {
        super(level, 0, 'balance:void', baseAttribute, Equipment.createEmpty(), undefined, tags);
    }
    get name(): string { return this.balanceName; }
}

export interface BalanceScenario {
    readonly level: number;
    readonly mainJob: Readonly<JobData>;
    readonly subJob?: Readonly<JobData>;
    readonly eliteJob?: Readonly<JobData>;
    readonly thirdJob?: Readonly<JobData>;
    readonly effectiveJob: Readonly<JobData>;
    readonly allocation: BalanceStatAllocation;
    readonly stats: Readonly<StatRecord>;
    readonly entity: Entity;
    readonly target: Entity;
    readonly encounter: BalanceEncounterType;
    readonly targetDataId: string;
    readonly targetName: string;
    readonly targetSourceLevel: number;
    readonly targetNormalized: boolean;
    readonly loadoutName: string;
    readonly mainHandTags: readonly TagId[];
    readonly basicAttackType: 'physical' | 'magic';
    readonly basicProjectileDataId?: string;
}

/**
 * 밸런스 진단에서 실제 Entity와 같은 피격자 기준 방어 계산을 적용한다.
 * 고정·환경 피해는 이 경계를 호출하지 않고 각각의 원래 계산을 유지한다.
 */
export function calculateProjectedCombatDamage(
    rawAmount: number,
    _attacker: Entity,
    defender: Entity,
    defense: number,
    penetration: number,
): number {
    return defender.calculateDefendedDamageFrom(rawAmount, defense, penetration);
}

export interface ProjectedCriticalDamage {
    readonly expected: number;
    readonly maximum: number;
}

/**
 * 일반타와 치명타를 각각 방어한 뒤 확률 합산한다.
 * 고정 방어가 있는 혼합식은 방어 전에 평균 치명타 배율을 곱하는 계산과 선형 동치가 아니다.
 */
export function calculateProjectedCriticalDamage(
    rawAmount: number,
    attacker: Entity,
    defender: Entity,
    defense: number,
    penetration: number,
    mode = SkillCriticalMode.NORMAL,
): ProjectedCriticalDamage {
    const normal = calculateProjectedCombatDamage(
        rawAmount,
        attacker,
        defender,
        defense,
        penetration,
    );
    if (mode === SkillCriticalMode.DISABLED) return { expected: normal, maximum: normal };

    const criticalMultiplier = Math.max(0, attacker.attribute.get(AttributeType.CRIT_DMG));
    const critical = calculateProjectedCombatDamage(
        rawAmount * criticalMultiplier,
        attacker,
        defender,
        defense,
        penetration,
    );
    if (mode === SkillCriticalMode.GUARANTEED) return { expected: critical, maximum: critical };

    const criticalRate = Math.max(0, Math.min(1, attacker.attribute.get(AttributeType.CRIT_RATE)));
    return {
        expected: normal * (1 - criticalRate) + critical * criticalRate,
        maximum: criticalRate === 0
            ? normal
            : criticalRate === 1 ? critical : Math.max(normal, critical),
    };
}

export interface RotationSkillReport {
    readonly skillId: string;
    readonly name: string;
    readonly skillLevel: number;
    readonly casts: number;
    /** 플레이어 전투 기술 공용 연계 간격까지 반영한 발동 시각. */
    readonly castTimes: readonly number[];
    readonly damage: number;
    readonly healing: number;
    readonly shield: number;
    readonly manaSpent: number;
}

export interface CombatRotationReport {
    readonly encounter: BalanceEncounterType;
    readonly targetDataId: string;
    readonly targetName: string;
    readonly targetLevel: number;
    readonly targetSourceLevel: number;
    readonly targetNormalized: boolean;
    readonly duration: number;
    readonly loadoutName: string;
    readonly basicAttackType: 'physical' | 'magic';
    readonly basicAttacks: number;
    readonly basicDamage: number;
    readonly skillCasts: number;
    readonly skillDamage: number;
    readonly totalDamage: number;
    readonly dps: number;
    readonly basicDamageShare: number;
    readonly playerMaxLife: number;
    readonly targetMaxLife: number;
    readonly estimatedKillSeconds: number;
    /** 로테이션 누적 피해가 실제 대상 최대 생명력을 처음 넘은 행동 종료 시각. */
    readonly simulatedKillSeconds: number;
    readonly maxOpeningActionName: string;
    readonly maxOpeningActionDamage: number;
    readonly oneActionKill: boolean;
    readonly counterattackDelay: number;
    readonly openingBurstActions: number;
    readonly openingBurstDamage: number;
    readonly openingBurstKillSeconds: number;
    readonly killsBeforeCounterattack: boolean;
    readonly currentSpeed: number;
    readonly targetSpeed: number;
    readonly basicAttackEvasionSpeed: number;
    readonly evasionChance: number;
    readonly evasionCapSpeed: number;
    readonly evasionCapAgility: number;
    readonly evasionCapReached: boolean;
    readonly penetration: number;
    readonly targetDefense: number;
    readonly effectiveDefense: number;
    readonly endingMentality: number;
    readonly totalHealing: number;
    readonly totalShield: number;
    /** 몬스터가 플레이어를 공격할 때 플레이어 이동속도로 발생하는 기본 회피율. */
    readonly defenderEvasionChance: number;
    readonly guaranteedEvasionCoverage: number;
    readonly incomingBasicDamage: number;
    readonly incomingBasicInterval: number;
    readonly strongestIncomingSkillName?: string;
    readonly strongestIncomingSkillDamage: number;
    readonly strongestIncomingSkillUnavoidable: boolean;
    readonly strongestIncomingSkillOneShots: boolean;
    readonly rawSurvivalSeconds: number;
    readonly evasionSurvivalSeconds: number;
    readonly effectiveSurvivalSeconds: number;
    readonly expectedIncomingHitsBeforeKill: number;
    readonly expectedIncomingDamageBeforeKill: number;
    readonly projectedSupportBeforeKill: number;
    readonly expectedLifeAfterKill: number;
    readonly survivesUntilKill: boolean;
    readonly evasionPreventsDeath: boolean;
    readonly skills: readonly RotationSkillReport[];
    readonly notes: readonly string[];
}

interface IncomingAttackSnapshot {
    readonly name: string;
    readonly damageOnHit: number;
    readonly expectedDamage: number;
    readonly evasionChance: number;
    readonly unavoidable: boolean;
}

interface OpeningBurstSnapshot {
    readonly maxActionName: string;
    readonly maxActionDamage: number;
    readonly actionCount: number;
    readonly damage: number;
    readonly killSeconds: number;
}

/** 밸런스 생존 진단이 한 시점에 적용할 피격 입력. */
export interface BalanceIncomingTimelineEvent {
    readonly at: number;
    readonly expectedDamage: number;
    readonly rawDamage: number;
    readonly expectedHits: number;
}

/** 밸런스 생존 진단이 한 시점에 적용할 직접 회복·보호막 입력. */
export interface BalanceSupportTimelineEvent {
    readonly at: number;
    readonly sourceId: string;
    readonly healing: number;
    readonly shield: number;
    readonly shieldDuration: number;
}

export interface BalanceSurvivalTimelineState {
    readonly endingLife: number;
    readonly effectiveSupport: number;
    readonly diedAt?: number;
}

export interface BalanceSurvivalTimelineReport {
    readonly expectedHits: number;
    readonly expectedDamage: number;
    readonly rawDamage: number;
    readonly expected: BalanceSurvivalTimelineState;
    readonly raw: BalanceSurvivalTimelineState;
}

export interface BalanceProfileReport {
    readonly level: number;
    readonly jobId: string;
    readonly name: string;
    readonly allocationLabel: string;
    readonly monster: CombatRotationReport;
    readonly boss: CombatRotationReport;
}

export interface MonsterPressureDistribution {
    readonly level: number;
    readonly p25LifeLossRatio: number;
    readonly medianLifeLossRatio: number;
    readonly p75LifeLossRatio: number;
    readonly deathProfiles: number;
    readonly profileCount: number;
    readonly lifeLossRatios: readonly number[];
}

export interface SkillBalanceReport {
    readonly skillId: string;
    readonly name: string;
    readonly skillLevel: number;
    readonly role: string;
    readonly coverage: 'complete' | 'partial' | 'unsupported';
    readonly cooldown: number;
    readonly manaCost: number;
    readonly rawDamage: number;
    readonly penetration: number;
    readonly effectiveDefense: number;
    readonly evasionChance: number;
    readonly evasionAttackSpeed: number;
    readonly expectedDamagePerTarget: number;
    readonly expectedTotalDamage: number;
    readonly cooldownLimitedCasts: number;
    readonly resourceLimitedCasts: number;
    readonly sustainableCasts: number;
    readonly sustainableDpm: number;
    readonly healing: number;
    readonly shield: number;
    readonly notes: readonly string[];
}

export interface JobBalanceReport {
    readonly jobId: string;
    readonly name: string;
    readonly level: number;
    readonly allocationLabel: string;
    readonly stats: Readonly<StatRecord>;
    readonly attack: number;
    readonly magicForce: number;
    readonly maxLife: number;
    readonly defense: number;
    readonly magicDefense: number;
    readonly speed: number;
    readonly attackSpeed: number;
    readonly basicPhysicalDps: number;
    readonly physicalSurvivalSeconds: number;
    readonly magicSurvivalSeconds: number;
    readonly skillReports: readonly SkillBalanceReport[];
}

export interface CombatBalanceSnapshot {
    readonly attack: number;
    readonly magicForce: number;
    readonly maxLife: number;
    readonly defense: number;
    readonly magicDefense: number;
    readonly speed: number;
    readonly attackSpeed: number;
    readonly physicalBasicDps: number;
    readonly magicBasicDps: number;
    readonly physicalSurvivalSeconds: number;
    readonly magicSurvivalSeconds: number;
}

export interface ItemBalanceReport {
    readonly itemId: string;
    readonly name: string;
    readonly role: string;
    readonly level: number;
    readonly jobId: string;
    readonly jobName: string;
    readonly recommendedJobNames: readonly string[];
    readonly attackType?: 'physical' | 'magic';
    readonly statusEffect?: { readonly id: string; readonly label: string; readonly level: number; readonly duration: number };
    readonly before: CombatBalanceSnapshot;
    readonly after: CombatBalanceSnapshot;
    readonly notes: readonly string[];
}

export function createBalanceScenario(
    level: number,
    mainJobId: string,
    subJobId?: string,
    encounter = BalanceEncounterType.MONSTER,
    loadoutItemDataId?: string,
): BalanceScenario {
    const normalizedLevel = normalizeLevel(level);
    const mainJob = getJob(mainJobId);
    if (!mainJob) throw new Error(`직업을 찾을 수 없습니다: ${mainJobId}`);
    const subJob = subJobId ? getJob(subJobId) : undefined;
    if (subJobId && !subJob) throw new Error(`서브 직업을 찾을 수 없습니다: ${subJobId}`);
    if (subJob?.id === mainJob.id) throw new Error('메인과 서브 직업은 달라야 합니다.');
    const eliteJob = normalizedLevel >= 200 && subJob
        ? resolveEliteJob(mainJob.id, subJob.id) ?? mainJob
        : mainJob;
    const thirdJob = normalizedLevel >= 500 && eliteJob !== mainJob
        ? resolveThirdJob(mainJob.id)
        : undefined;
    const effectiveJob = thirdJob ?? eliteJob;
    const allocation = mainJob.id === 'career:blacksmith' && subJob
        ? BLACKSMITH_ELITE_ALLOCATIONS.get(subJob.id) ?? JOB_ALLOCATIONS.get(mainJob.id) ?? DEFAULT_ALLOCATION
        : JOB_ALLOCATIONS.get(mainJob.id) ?? DEFAULT_ALLOCATION;
    const stats = createProjectedStats(normalizedLevel, allocation);
    const entity = new BalanceEntity(
        `${effectiveJob.name} 기준 공격자`,
        normalizedLevel,
        stats,
        [eliteJob !== mainJob ? eliteJob.id : undefined, thirdJob?.id]
            .filter((id): id is string => Boolean(id)),
    );
    // 대장장이 메인 엘리트는 서브 직업 방향에 맞는 무기를 쓰는 실제 운용을 기준으로 측정한다.
    const projectedLoadoutJobId = mainJob.id === 'career:blacksmith' && subJob ? subJob.id : mainJob.id;
    const loadout = applyProjectedLoadout(entity, projectedLoadoutJobId, normalizedLevel, loadoutItemDataId);
    // 진단상 Lv.500+는 장기 퀘스트를 완수해 3차를 계승한 표준 프로필로 간주한다.
    // 3차가 effective가 되어도 엘리트의 완성형 modifier와 스킬을 유지한다.
    applyJobModifiers(entity, eliteJob.mainModifiers, 'balance:main');
    if (thirdJob) applyJobModifiers(entity, thirdJob.mainModifiers, 'balance:third');
    if (subJob) applyJobModifiers(entity, subJob.subModifiers, 'balance:sub');
    applyJobPassives(entity, normalizedLevel, mainJob, subJob, eliteJob, thirdJob);
    const targetProfile = createEncounterTarget(normalizedLevel, encounter);
    entity.currentTarget = targetProfile.target;
    return {
        level: normalizedLevel,
        mainJob,
        subJob,
        eliteJob: eliteJob === mainJob ? undefined : eliteJob,
        thirdJob,
        effectiveJob,
        allocation,
        stats,
        entity,
        target: targetProfile.target,
        encounter,
        targetDataId: targetProfile.data.id,
        targetName: targetProfile.data.name,
        targetSourceLevel: targetProfile.data.level,
        targetNormalized: targetProfile.data.level !== normalizedLevel,
        loadoutName: loadout.name,
        mainHandTags: loadout.tags,
        basicAttackType: loadout.attackType,
        basicProjectileDataId: loadout.projectileDataId,
    };
}

export function analyzeSkillBalance(
    scenario: BalanceScenario,
    skillDataId: string,
    skillLevel: number,
): SkillBalanceReport {
    const data = getSkillData(skillDataId);
    if (!data) throw new Error(`스킬을 찾을 수 없습니다: ${skillDataId}`);
    const skill = new Skill({ playerId: null, skillDataId: data.id, level: Math.max(1, Math.min(data.maxLevel, Math.floor(skillLevel))) });
    const context = createSkillContext(scenario.entity, skill);
    const balance = data.balance;
    const cooldown = skill.getMaxCooldown(scenario.entity);
    const manaCost = finiteNonNegative(balance?.calculateManaCost?.(context) ?? 0);
    const rawDamage = finiteNonNegative(balance?.calculateDamage?.(context) ?? 0);
    const hitCount = positiveInteger(balance?.hitCount ?? 1);
    const targetCount = positiveInteger(balance?.targetCount ?? 1);
    const damageType = balance?.damageType ?? 'absolute';
    const defense = damageType === 'physical'
        ? scenario.target.attribute.get(AttributeType.DEF)
        : damageType === 'magic' ? scenario.target.attribute.get(AttributeType.MAGIC_DEF) : 0;
    const defaultPenetration = damageType === 'physical'
        ? scenario.entity.attribute.get(AttributeType.ARMOR_PEN)
        : damageType === 'magic' ? scenario.entity.attribute.get(AttributeType.MAGIC_PEN) : 0;
    const penetration = finiteNonNegative(balance?.calculatePenetration?.(context) ?? defaultPenetration);
    const effectiveDefense = Math.max(0, defense - penetration);
    const evasionAttackSpeed = finitePositive(
        balance?.calculateEvasionAttackSpeed?.(context)
            ?? scenario.entity.getEvasionAttackSpeed(),
    );
    const defendedDamage = calculateProjectedCriticalDamage(
        rawDamage,
        scenario.entity,
        scenario.target,
        defense,
        penetration,
        balance?.criticalMode,
    ).expected;
    const evasion = balance?.unavoidable
        ? 0
        : calculateEvasionChance(
            evasionAttackSpeed,
            scenario.target.attribute.get(AttributeType.SPEED),
        );
    const affinitySource = balance?.effectTags?.length ? {
        hasTag: (tag: TagId) => balance.effectTags!.includes(tag),
    } : scenario.entity;
    const affinityDamage = applyTagEffectValue(defendedDamage, affinitySource, scenario.target).value;
    const expectedDamagePerTarget = affinityDamage * hitCount * (1 - evasion);
    const expectedTotalDamage = expectedDamagePerTarget * targetCount;
    const cooldownLimitedCasts = cooldown > 0 ? Math.ceil(BALANCE_SKILL_WINDOW_SECONDS / cooldown) : 1;
    const availableMentality = scenario.entity.maxMentality
        + scenario.entity.attribute.get(AttributeType.MENTALITY_REGEN) * BALANCE_SKILL_WINDOW_SECONDS;
    const resourceLimitedCasts = manaCost > 0 ? Math.floor(availableMentality / manaCost) : cooldownLimitedCasts;
    const sustainableCasts = Math.max(0, Math.min(cooldownLimitedCasts, resourceLimitedCasts));
    const notes = [...(balance?.notes ?? [])];
    if (!balance) notes.push('밸런스 메타데이터가 없어 피해·보조 수치를 계산하지 못했습니다.');
    if (balance && !balance.calculateDamage && !balance.calculateHealing && !balance.calculateShield) {
        notes.push('수치로 환산하지 않는 제어·버프 효과입니다. 설명 수치를 별도로 비교해야 합니다.');
    }
    return {
        skillId: data.id,
        name: data.name,
        skillLevel: skill.level,
        role: balance?.role.label ?? '미분류',
        coverage: !balance ? 'unsupported'
            : balance.calculateDamage || balance.calculateHealing || balance.calculateShield ? 'complete' : 'partial',
        cooldown,
        manaCost,
        rawDamage,
        penetration,
        effectiveDefense,
        evasionChance: evasion,
        evasionAttackSpeed,
        expectedDamagePerTarget,
        expectedTotalDamage,
        cooldownLimitedCasts,
        resourceLimitedCasts,
        sustainableCasts,
        sustainableDpm: expectedTotalDamage * sustainableCasts,
        healing: finiteNonNegative(balance?.calculateHealing?.(context) ?? 0),
        shield: finiteNonNegative(balance?.calculateShield?.(context) ?? 0),
        notes: Object.freeze(notes),
    };
}

export function analyzeJobBalance(level: number, mainJobId: string, subJobId?: string): JobBalanceReport {
    const scenario = createBalanceScenario(level, mainJobId, subJobId);
    const entity = scenario.entity;
    const target = scenario.target;
    const physicalHit = calculateProjectedCriticalDamage(
        entity.attribute.get(AttributeType.ATK),
        entity,
        target,
        target.attribute.get(AttributeType.DEF),
        entity.attribute.get(AttributeType.ARMOR_PEN),
    ).expected;
    const hitChance = 1 - calculateEvasionChance(
        entity.attribute.get(AttributeType.SPEED),
        target.attribute.get(AttributeType.SPEED),
    );
    const skillReports = getRotationSkills(scenario)
        .map(data => analyzeSkillBalance(scenario, data.id, projectSkillLevel(level, data, scenario)))
        .sort((a, b) => b.sustainableDpm - a.sustainableDpm || a.name.localeCompare(b.name));
    const targetHitChance = 1 - calculateEvasionChance(
        target.attribute.get(AttributeType.SPEED),
        entity.attribute.get(AttributeType.SPEED),
    );
    const incomingPhysicalDps = calculateProjectedCriticalDamage(
        target.attribute.get(AttributeType.ATK),
        target,
        entity,
        entity.attribute.get(AttributeType.DEF),
        target.attribute.get(AttributeType.ARMOR_PEN),
    ).expected * targetHitChance * target.attribute.get(AttributeType.ATTACK_SPEED);
    const incomingMagicDps = calculateProjectedCriticalDamage(
        target.attribute.get(AttributeType.MAGIC_FORCE),
        target,
        entity,
        entity.attribute.get(AttributeType.MAGIC_DEF),
        target.attribute.get(AttributeType.MAGIC_PEN),
    ).expected * targetHitChance * target.attribute.get(AttributeType.ATTACK_SPEED);
    return {
        jobId: scenario.effectiveJob.id,
        name: scenario.effectiveJob.name,
        level: scenario.level,
        allocationLabel: scenario.allocation.label,
        stats: scenario.stats,
        attack: entity.attribute.get(AttributeType.ATK),
        magicForce: entity.attribute.get(AttributeType.MAGIC_FORCE),
        maxLife: entity.maxLife,
        defense: entity.attribute.get(AttributeType.DEF),
        magicDefense: entity.attribute.get(AttributeType.MAGIC_DEF),
        speed: entity.attribute.get(AttributeType.SPEED),
        attackSpeed: entity.attribute.get(AttributeType.ATTACK_SPEED),
        basicPhysicalDps: physicalHit * hitChance * entity.attribute.get(AttributeType.ATTACK_SPEED),
        physicalSurvivalSeconds: survivalSeconds(entity.maxLife, incomingPhysicalDps),
        magicSurvivalSeconds: survivalSeconds(entity.maxLife, incomingMagicDps),
        skillReports,
    };
}

/** 한 전투의 시간·정신력·쿨다운을 모든 스킬과 평타가 공유하는 결정론적 로테이션 진단. */
export function analyzeCombatRotation(
    scenario: BalanceScenario,
    duration = scenario.encounter.boss ? BALANCE_BOSS_WINDOW_SECONDS : BALANCE_MONSTER_WINDOW_SECONDS,
): CombatRotationReport {
    const fallbackWindow = scenario.encounter.boss ? BALANCE_BOSS_WINDOW_SECONDS : BALANCE_MONSTER_WINDOW_SECONDS;
    const window = Math.max(5, Math.min(600, finiteNonNegative(duration) || fallbackWindow));
    const entries = getRotationSkills(scenario).map(data => {
        const level = projectSkillLevel(scenario.level, data, scenario);
        return {
            data,
            skill: new Skill({ playerId: null, skillDataId: data.id, level }),
            cooldownEndsAt: 0,
            lastCastAt: Number.NEGATIVE_INFINITY,
            casts: 0,
            castTimes: [] as number[],
            damage: 0,
            healing: 0,
            shield: 0,
            manaSpent: 0,
            activeUntil: 0,
        };
    });
    const entity = scenario.entity;
    const target = scenario.target;
    const playerMaxLife = entity.maxLife;
    const actionInterval = Math.max(BALANCE_ACTION_FLOOR_SECONDS, 1 / Math.max(0.1, entity.attribute.get(AttributeType.ATTACK_SPEED)));
    const incomingBasic = calculateIncomingBasicAttack(scenario);
    const incomingBasicInterval = Math.max(
        BALANCE_ACTION_FLOOR_SECONDS,
        1 / Math.max(0.1, target.attribute.get(AttributeType.ATTACK_SPEED)),
    );
    const targetData = getMonsterData(scenario.targetDataId);
    const counterattackDelay = Math.min(
        incomingBasicInterval,
        Math.max(0, targetData?.skillPattern?.initialDelay ?? Number.POSITIVE_INFINITY),
    );
    const opening = calculateOpeningBurst(scenario, actionInterval, counterattackDelay);
    const incomingSkills = calculateIncomingSkillAttacks(scenario, targetData);
    const strongestIncomingSkill = [...incomingSkills.values()]
        .sort((left, right) => right.damageOnHit - left.damageOnHit)[0];
    // 회피 투자 기준은 로테이션 도중 우연히 남아 있는 짧은 버프가 아니라 상시 장비·직업 modifier로 계산한다.
    const currentSpeed = entity.attribute.get(AttributeType.SPEED);
    const targetSpeed = target.attribute.get(AttributeType.SPEED);
    const basicAttackEvasionSpeed = getBasicAttackEvasionSpeed(scenario);
    const evasionChance = calculateEvasionChance(basicAttackEvasionSpeed, targetSpeed);
    const evasionCapSpeed = targetSpeed * 2.8;
    const defenseAttribute = scenario.basicAttackType === 'magic' ? AttributeType.MAGIC_DEF : AttributeType.DEF;
    const penetrationAttribute = scenario.basicAttackType === 'magic' ? AttributeType.MAGIC_PEN : AttributeType.ARMOR_PEN;
    const targetDefense = target.attribute.get(defenseAttribute);
    const penetration = entity.attribute.get(penetrationAttribute);
    const effectiveDefense = Math.max(0, targetDefense - penetration);
    const speedMultipliers = entity.attribute.modifiers
        .filter(modifier => modifier.attribute === AttributeType.SPEED.key && modifier.op === 'multiply')
        .reduce((product, modifier) => product * modifier.value, 1);
    const fixedSpeed = entity.attribute.getBase(AttributeType.SPEED) + entity.attribute.modifiers
        .filter(modifier => modifier.attribute === AttributeType.SPEED.key
            && modifier.op === 'add' && modifier.source !== 'stat:agility')
        .reduce((sum, modifier) => sum + modifier.value, 0);
    const evasionCapAgility = Math.max(0, Math.ceil((evasionCapSpeed / Math.max(0.0001, speedMultipliers) - fixedSpeed) / 0.05));
    let time = 0;
    let mentality = entity.maxMentality;
    let basicAttacks = 0;
    let basicDamage = 0;
    let skillsSinceBasic = 0;
    let totalHealing = 0;
    let totalShield = 0;
    let cumulativeDamage = 0;
    let simulatedKillSeconds = Number.POSITIVE_INFINITY;
    let nextCombatSkillAt = 0;
    const supportEvents: BalanceSupportTimelineEvent[] = [];
    const guaranteedEvasionWindows: Array<{ start: number; end: number }> = [];
    type RotationEntry = (typeof entries)[number];
    const rotationStatuses = new Map<string, { source: string; entry: RotationEntry }>();
    while (time < window - 0.0001) {
        for (const entry of entries) {
            if (entry.activeUntil > 0 && entry.activeUntil <= time + 0.0001) {
                const source = `balance:rotation:${entry.data.id}`;
                entity.attribute.removeBySource(source);
                const grantedStatusId = entry.data.balance?.grantsRotationStatusEffectId;
                if (grantedStatusId && rotationStatuses.get(grantedStatusId)?.source === source) {
                    rotationStatuses.delete(grantedStatusId);
                }
                entry.activeUntil = 0;
            }
        }
        mentality = Math.min(entity.maxMentality, mentality + entity.attribute.get(AttributeType.MENTALITY_REGEN) * actionInterval);
        const ready = entries.filter(entry => {
            const context = createSkillContext(entity, entry.skill);
            const cost = finiteNonNegative(entry.data.balance?.calculateManaCost?.(context) ?? 0);
            const cadenceReady = !entry.data.tags.includes(GameTags.SKILL_COMBAT)
                || nextCombatSkillAt <= time + 0.0001;
            const requiredStatusId = entry.data.balance?.requiresRotationStatusEffectId;
            return entry.cooldownEndsAt <= time + 0.0001
                && cadenceReady
                && (!requiredStatusId || rotationStatuses.has(requiredStatusId))
                && cost <= mentality + 0.0001;
        });
        const shouldBasic = skillsSinceBasic >= 2 || ready.length === 0;
        if (shouldBasic) {
            const damage = calculateExpectedBasicHit(scenario);
            basicDamage += damage;
            cumulativeDamage += damage;
            basicAttacks++;
            skillsSinceBasic = 0;
        } else {
            ready.sort((left, right) => {
                if (left.casts === 0 || right.casts === 0) return Number(left.casts > 0) - Number(right.casts > 0);
                const leftCooldown = Math.max(0.1, left.skill.getMaxCooldown(entity));
                const rightCooldown = Math.max(0.1, right.skill.getMaxCooldown(entity));
                return (left.lastCastAt + leftCooldown - time) / leftCooldown
                    - (right.lastCastAt + rightCooldown - time) / rightCooldown
                    || left.data.id.localeCompare(right.data.id);
            });
            const entry = ready[0];
            const context = createSkillContext(entity, entry.skill);
            const report = analyzeSkillBalance(scenario, entry.data.id, entry.skill.level);
            const cost = finiteNonNegative(entry.data.balance?.calculateManaCost?.(context) ?? 0);
            mentality = Math.max(0, mentality - cost);
            entry.casts++;
            entry.castTimes.push(time);
            entry.damage += report.expectedDamagePerTarget;
            cumulativeDamage += report.expectedDamagePerTarget;
            entry.healing += report.healing;
            entry.shield += report.shield;
            entry.manaSpent += cost;
            entry.lastCastAt = time;
            entry.cooldownEndsAt = time + Math.max(actionInterval, report.cooldown);
            const requiredStatusId = entry.data.balance?.requiresRotationStatusEffectId;
            if (requiredStatusId && entry.data.balance?.consumesRequiredRotationStatusEffect) {
                const requiredStatus = rotationStatuses.get(requiredStatusId);
                if (requiredStatus) {
                    entity.attribute.removeBySource(requiredStatus.source);
                    requiredStatus.entry.activeUntil = 0;
                    rotationStatuses.delete(requiredStatusId);
                }
            }
            if (entry.data.tags.includes(GameTags.SKILL_COMBAT)) {
                nextCombatSkillAt = time + PLAYER_COMBAT_SKILL_CADENCE_SECONDS;
            }
            for (const rule of entry.data.sharedCooldowns ?? []) {
                const sharedCooldownEndsAt = time + rule.seconds;
                for (const targetEntry of entries) {
                    if (!targetEntry.data.tags.includes(rule.targetTag)) continue;
                    targetEntry.cooldownEndsAt = Math.max(targetEntry.cooldownEndsAt, sharedCooldownEndsAt);
                }
            }
            const modifiers = entry.data.balance?.calculateRotationModifiers?.(context) ?? [];
            const effectDuration = finiteNonNegative(entry.data.balance?.calculateEffectDuration?.(context) ?? 0);
            if (entry.data.balance?.guaranteedEvasion && effectDuration > 0) {
                guaranteedEvasionWindows.push({ start: time, end: time + effectDuration });
            }
            if (modifiers.length && effectDuration > 0) {
                const source = `balance:rotation:${entry.data.id}`;
                entity.attribute.removeBySource(source);
                entity.attribute.addModifiers(modifiers.map(modifier => ({ ...modifier, source })));
                entry.activeUntil = time + effectDuration;
            }
            const grantedStatusId = entry.data.balance?.grantsRotationStatusEffectId;
            if (grantedStatusId && effectDuration > 0) {
                const source = `balance:rotation:${entry.data.id}`;
                const previous = rotationStatuses.get(grantedStatusId);
                if (previous && previous.source !== source) {
                    entity.attribute.removeBySource(previous.source);
                    previous.entry.activeUntil = 0;
                }
                entry.activeUntil = Math.max(entry.activeUntil, time + effectDuration);
                rotationStatuses.set(grantedStatusId, {
                    source,
                    entry,
                });
            }
            totalHealing += report.healing;
            totalShield += report.shield;
            if (report.healing + report.shield > 0) {
                supportEvents.push({
                    at: Math.min(window, time + actionInterval),
                    sourceId: `skill:${entry.data.id}`,
                    healing: report.healing,
                    shield: report.shield,
                    shieldDuration: report.shield > 0
                        ? effectDuration || BALANCE_DEFAULT_SHIELD_DURATION_SECONDS
                        : 0,
                });
            }
            skillsSinceBasic++;
        }
        const actionEndsAt = Math.min(window, time + actionInterval);
        if (!Number.isFinite(simulatedKillSeconds) && cumulativeDamage >= target.maxLife) {
            simulatedKillSeconds = actionEndsAt;
        }
        time += actionInterval;
    }
    const skillDamage = entries.reduce((sum, entry) => sum + entry.damage, 0);
    const totalDamage = basicDamage + skillDamage;
    const dps = totalDamage / window;
    const fightHorizon = Math.min(window, simulatedKillSeconds);
    const guaranteedEvasionCoverage = calculateWindowCoverage(guaranteedEvasionWindows, window);
    const incomingTimeline = createIncomingTimeline(
        fightHorizon,
        incomingBasic,
        incomingBasicInterval,
        targetData,
        incomingSkills,
        guaranteedEvasionWindows,
    );
    const survivalBeforeKill = replayBalanceSurvival(
        playerMaxLife,
        incomingTimeline,
        supportEvents.filter(event => event.at <= fightHorizon + 0.0001),
    );
    const projectedSupportBeforeKill = survivalBeforeKill.expected.effectiveSupport;
    const incomingPressure = calculateIncomingPressure(
        incomingBasic,
        incomingBasicInterval,
        targetData,
        incomingSkills,
        guaranteedEvasionCoverage,
    );
    const supportPerSecond = (totalHealing + totalShield) / window;
    const rawSurvivalSeconds = survivalSeconds(playerMaxLife, incomingPressure.rawDps);
    const evasionSurvivalSeconds = survivalSeconds(playerMaxLife, incomingPressure.evasionDps);
    const effectiveSurvivalSeconds = survivalSeconds(
        playerMaxLife,
        Math.max(0, incomingPressure.guaranteedEvasionDps - supportPerSecond),
    );
    const expectedLifeAfterKill = survivalBeforeKill.expected.endingLife;
    for (const entry of entries) entity.attribute.removeBySource(`balance:rotation:${entry.data.id}`);
    const notes = [
        `평타 1회 뒤 스킬을 최대 2회까지 사용하며, 전투 기술은 ${PLAYER_COMBAT_SKILL_CADENCE_SECONDS}초 공용 연계 간격과 같은 행동 시간·정신력·개별 및 태그 공유 재사용 대기시간을 사용합니다.`,
        '선공 폭딜은 모든 기술이 준비된 교전 시작 시점에서 첫 반격 전에 끝낼 수 있는 직접 피해 행동을 큰 순서대로 계산합니다.',
        '생존은 대상의 실제 평타·보스 기술과 직접 회복·보호막을 한 시간축에서 재생하고, 같은 시각에는 피해를 먼저 확정합니다.',
        '은신처럼 선행 상태가 필요한 기술은 선행기 발동 뒤에만 사용하고, 후속 피해를 계산한 직후 해당 상태와 능력치 보정을 소모합니다.',
        '제어·은신·지속 피해와 다중 대상 추가 피해는 직접 피해나 임의 전투력 점수로 더하지 않습니다.',
    ];
    return {
        encounter: scenario.encounter,
        targetDataId: scenario.targetDataId,
        targetName: scenario.targetName,
        targetLevel: scenario.level,
        targetSourceLevel: scenario.targetSourceLevel,
        targetNormalized: scenario.targetNormalized,
        duration: window,
        loadoutName: scenario.loadoutName,
        basicAttackType: scenario.basicAttackType,
        basicAttacks,
        basicDamage,
        skillCasts: entries.reduce((sum, entry) => sum + entry.casts, 0),
        skillDamage,
        totalDamage,
        dps,
        basicDamageShare: totalDamage > 0 ? basicDamage / totalDamage : 0,
        playerMaxLife,
        targetMaxLife: target.maxLife,
        estimatedKillSeconds: dps > 0 ? target.maxLife / dps : Number.POSITIVE_INFINITY,
        simulatedKillSeconds,
        maxOpeningActionName: opening.maxActionName,
        maxOpeningActionDamage: opening.maxActionDamage,
        oneActionKill: opening.maxActionDamage >= target.maxLife,
        counterattackDelay,
        openingBurstActions: opening.actionCount,
        openingBurstDamage: opening.damage,
        openingBurstKillSeconds: opening.killSeconds,
        killsBeforeCounterattack: opening.killSeconds < incomingBasicInterval - 0.0001,
        currentSpeed,
        targetSpeed,
        basicAttackEvasionSpeed,
        evasionChance,
        evasionCapSpeed,
        evasionCapAgility,
        evasionCapReached: currentSpeed >= evasionCapSpeed,
        penetration,
        targetDefense,
        effectiveDefense,
        endingMentality: mentality,
        totalHealing,
        totalShield,
        defenderEvasionChance: incomingBasic.evasionChance,
        guaranteedEvasionCoverage,
        incomingBasicDamage: incomingBasic.damageOnHit,
        incomingBasicInterval,
        strongestIncomingSkillName: strongestIncomingSkill?.name,
        strongestIncomingSkillDamage: strongestIncomingSkill?.damageOnHit ?? 0,
        strongestIncomingSkillUnavoidable: strongestIncomingSkill?.unavoidable ?? false,
        strongestIncomingSkillOneShots: (strongestIncomingSkill?.damageOnHit ?? 0) >= playerMaxLife,
        rawSurvivalSeconds,
        evasionSurvivalSeconds,
        effectiveSurvivalSeconds,
        expectedIncomingHitsBeforeKill: survivalBeforeKill.expectedHits,
        expectedIncomingDamageBeforeKill: survivalBeforeKill.expectedDamage,
        projectedSupportBeforeKill,
        expectedLifeAfterKill,
        survivesUntilKill: survivalBeforeKill.expected.diedAt === undefined,
        evasionPreventsDeath: survivalBeforeKill.raw.diedAt !== undefined
            && survivalBeforeKill.expected.diedAt === undefined,
        skills: Object.freeze(entries.map(entry => Object.freeze({
            skillId: entry.data.id,
            name: entry.data.name,
            skillLevel: entry.skill.level,
            casts: entry.casts,
            castTimes: Object.freeze([...entry.castTimes]),
            damage: entry.damage,
            healing: entry.healing,
            shield: entry.shield,
            manaSpent: entry.manaSpent,
        }))),
        notes: Object.freeze(notes),
    };
}

export function analyzeBalanceProfile(level: number, mainJobId: string, subJobId?: string): BalanceProfileReport {
    const monsterScenario = createBalanceScenario(level, mainJobId, subJobId, BalanceEncounterType.MONSTER);
    const bossScenario = createBalanceScenario(level, mainJobId, subJobId, BalanceEncounterType.BOSS);
    return {
        level: monsterScenario.level,
        jobId: monsterScenario.effectiveJob.id,
        name: monsterScenario.effectiveJob.name,
        allocationLabel: monsterScenario.allocation.label,
        monster: analyzeCombatRotation(monsterScenario),
        boss: analyzeCombatRotation(bossScenario),
    };
}

export function analyzeAllBalanceProfiles(level: number): readonly BalanceProfileReport[] {
    return getAllJobs().filter(job => job.tier.key === 'first').map(job => analyzeBalanceProfile(level, job.id));
}

/** 추천 장비 1차 직업들이 동레벨 일반 몬스터 한 마리를 잡을 때의 순 생명력 소모 분포. */
export function analyzeMonsterPressureDistribution(level: number): MonsterPressureDistribution {
    const profiles = analyzeAllBalanceProfiles(level);
    const lifeLossRatios = profiles.map(({ monster }) => Math.max(
        0,
        Math.min(1, 1 - monster.expectedLifeAfterKill / monster.playerMaxLife),
    ));
    return Object.freeze({
        level: normalizeLevel(level),
        p25LifeLossRatio: percentile(lifeLossRatios, 0.25),
        medianLifeLossRatio: percentile(lifeLossRatios, 0.5),
        p75LifeLossRatio: percentile(lifeLossRatios, 0.75),
        deathProfiles: profiles.filter(({ monster }) => !monster.survivesUntilKill).length,
        profileCount: profiles.length,
        lifeLossRatios: Object.freeze(lifeLossRatios),
    });
}

/** 장비 modifier 또는 버프 아이템의 실제 상태효과를 적용한 전후 전투 지표를 계산한다. */
export function analyzeItemBalance(level: number, mainJobId: string, itemDataId: string): ItemBalanceReport {
    const data = getItemData(itemDataId);
    if (!data) throw new Error(`아이템을 찾을 수 없습니다: ${itemDataId}`);
    if (!data.balance) throw new Error(`${data.name}은(는) 전투 밸런스 분석 대상이 아닙니다.`);
    const baseline = createBalanceScenario(level, mainJobId);
    const modified = createBalanceScenario(level, mainJobId);
    if (data.modifiers?.length) {
        modified.entity.attribute.addModifiers(data.modifiers.map(modifier => ({
            ...modifier,
            source: `balance:item:${data.id}`,
        })));
    }
    const statusEffect = resolveItemStatusEffect(data);
    if (statusEffect) {
        modified.entity.applyStatusEffect(statusEffect.type, statusEffect.duration, statusEffect.level);
    }
    const recommendedJobNames = (data.balance.recommendedJobIds ?? [])
        .map(id => getJob(id)?.name ?? id);
    const notes = [...(data.balance.notes ?? [])];
    if (data.onBasicAttackHit) notes.push('적중 후 확률 효과는 기본 DPS에 합산하지 않고 별도 효과로 표시합니다.');
    return {
        itemId: data.id,
        name: data.name,
        role: data.balance.role.label,
        level: baseline.level,
        jobId: baseline.mainJob.id,
        jobName: baseline.mainJob.name,
        recommendedJobNames: Object.freeze(recommendedJobNames),
        attackType: data.balance.attackType,
        statusEffect: statusEffect ? {
            id: statusEffect.type.id,
            label: statusEffect.type.label,
            level: statusEffect.level,
            duration: statusEffect.duration,
        } : undefined,
        before: createCombatSnapshot(baseline.entity, baseline.target),
        after: createCombatSnapshot(modified.entity, modified.target),
        notes: Object.freeze(notes),
    };
}

export function analyzeAllFirstJobs(level: number): readonly JobBalanceReport[] {
    return getAllJobs()
        .filter(job => job.tier.key === 'first')
        .map(job => analyzeJobBalance(level, job.id));
}

/** Lv.200 이상에서 가능한 서로 다른 모든 메인→서브 조합을 실제 엘리트 직업으로 분석한다. */
export function analyzeAllEliteJobs(level: number): readonly JobBalanceReport[] {
    if (normalizeLevel(level) < 200) return [];
    const firstJobs = getAllJobs().filter(job => job.tier.key === 'first');
    return firstJobs.flatMap(main => firstJobs
        .filter(sub => sub.id !== main.id)
        .map(sub => analyzeJobBalance(level, main.id, sub.id)));
}

export function findSkillDataForBalance(input: string): Readonly<SkillData> | undefined {
    const normalized = input.trim().toLowerCase();
    return getAllSkillData().find(skill => skill.id === normalized
        || skill.name === input.trim()
        || skill.aliases?.some(alias => alias.toLowerCase() === normalized));
}

export function findItemDataForBalance(input: string): Readonly<ItemData> | undefined {
    const normalized = input.trim().toLowerCase();
    return getAllItemData().find(item => item.balance
        && (item.id.toLowerCase() === normalized || item.name === input.trim()));
}

export function getAllBalanceItemData(): readonly Readonly<ItemData>[] {
    return getAllItemData().filter(item => item.balance);
}

function createProjectedStats(level: number, allocation: BalanceStatAllocation): StatRecord {
    const earnedLevels = Math.max(0, level - 1);
    const result = Object.fromEntries(StatType.values().map(type => [type.key, earnedLevels])) as StatRecord;
    const distributable = earnedLevels * 3;
    const entries = StatType.values().map(type => ({ type, weight: Math.max(0, allocation.weights[type.key] ?? 0) }));
    const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0) || entries.length;
    let assigned = 0;
    const remainders: Array<{ key: StatKey; remainder: number }> = [];
    for (const entry of entries) {
        const exact = distributable * (totalWeight > 0 ? (entry.weight || (totalWeight === entries.length ? 1 : 0)) / totalWeight : 0);
        const amount = Math.floor(exact);
        result[entry.type.key] += amount;
        assigned += amount;
        remainders.push({ key: entry.type.key, remainder: exact - amount });
    }
    remainders.sort((a, b) => b.remainder - a.remainder || a.key.localeCompare(b.key));
    for (let index = 0; assigned < distributable; index++, assigned++) {
        result[remainders[index % remainders.length].key] += 1;
    }
    return Object.freeze(result);
}

function applyJobModifiers(entity: Entity, modifiers: readonly Omit<AttributeModifier, 'source'>[], source: string): void {
    entity.attribute.addModifiers(modifiers.map(modifier => ({ ...modifier, source })));
}

/** 실제 패시브 callback을 적용해 런타임과 밸런스 진단의 계산식을 동일하게 유지한다. */
function matchesProjectedJobRequirement(
    data: Readonly<SkillData>,
    mainJob: Readonly<JobData>,
    subJob: Readonly<JobData> | undefined,
    eliteJob: Readonly<JobData> | undefined,
    thirdJob: Readonly<JobData> | undefined,
): boolean {
    const requirement = data.jobRequirement;
    if (!requirement) return false;
    return requirement.anyOf.some(required => {
        const mainCompatible = [mainJob, eliteJob, thirdJob]
            .some(job => job && isJobDescendant(job.id, required));
        if (requirement.slot === JobSlotType.MAIN) return mainCompatible;
        if (requirement.slot === JobSlotType.SUB) return subJob?.id === required;
        return mainCompatible || subJob?.id === required;
    });
}

/** 실제 패시브 callback과 레벨·메인 계보 조건을 함께 적용한다. */
function applyJobPassives(
    entity: Entity,
    level: number,
    mainJob: Readonly<JobData>,
    subJob: Readonly<JobData> | undefined,
    eliteJob: Readonly<JobData> | undefined,
    thirdJob: Readonly<JobData> | undefined,
): void {
    const jobs = [mainJob, subJob, eliteJob, thirdJob];
    const skillIds = new Set(jobs.flatMap(job => job?.grantedSkills.map(grant => grant.skillDataId) ?? []));
    for (const data of getAllSkillData()) {
        if (!data.tags.includes(GameTags.SKILL_PASSIVE)
            || data.unlockLevel === undefined
            || data.unlockLevel > level
            || !matchesProjectedJobRequirement(data, mainJob, subJob, eliteJob, thirdJob)) continue;
        skillIds.add(data.id);
    }
    for (const skillDataId of skillIds) {
        const data = getSkillData(skillDataId);
        if (!data?.tags.includes(GameTags.SKILL_PASSIVE) || !data.onPassiveUpdate) continue;
        const skill = new Skill({ playerId: null, skillDataId, level: 1 });
        data.onPassiveUpdate(createSkillContext(entity, skill), 0);
    }
}

function createCombatSnapshot(entity: Entity, target: Entity): CombatBalanceSnapshot {
    const hitChance = 1 - calculateEvasionChance(
        entity.attribute.get(AttributeType.SPEED),
        target.attribute.get(AttributeType.SPEED),
    );
    const attacksPerSecond = entity.attribute.get(AttributeType.ATTACK_SPEED);
    const physicalBasicDps = calculateProjectedCriticalDamage(
        entity.attribute.get(AttributeType.ATK),
        entity,
        target,
        target.attribute.get(AttributeType.DEF),
        entity.attribute.get(AttributeType.ARMOR_PEN),
    ).expected * hitChance * attacksPerSecond;
    const magicBasicDps = calculateProjectedCriticalDamage(
        entity.attribute.get(AttributeType.MAGIC_FORCE),
        entity,
        target,
        target.attribute.get(AttributeType.MAGIC_DEF),
        entity.attribute.get(AttributeType.MAGIC_PEN),
    ).expected * hitChance * attacksPerSecond;
    const targetHitChance = 1 - calculateEvasionChance(
        target.attribute.get(AttributeType.SPEED),
        entity.attribute.get(AttributeType.SPEED),
    );
    const targetAttackSpeed = target.attribute.get(AttributeType.ATTACK_SPEED);
    const incomingPhysicalDps = calculateProjectedCriticalDamage(
        target.attribute.get(AttributeType.ATK),
        target,
        entity,
        entity.attribute.get(AttributeType.DEF),
        target.attribute.get(AttributeType.ARMOR_PEN),
    ).expected * targetHitChance * targetAttackSpeed;
    const incomingMagicDps = calculateProjectedCriticalDamage(
        target.attribute.get(AttributeType.MAGIC_FORCE),
        target,
        entity,
        entity.attribute.get(AttributeType.MAGIC_DEF),
        target.attribute.get(AttributeType.MAGIC_PEN),
    ).expected * targetHitChance * targetAttackSpeed;
    return {
        attack: entity.attribute.get(AttributeType.ATK),
        magicForce: entity.attribute.get(AttributeType.MAGIC_FORCE),
        maxLife: entity.maxLife,
        defense: entity.attribute.get(AttributeType.DEF),
        magicDefense: entity.attribute.get(AttributeType.MAGIC_DEF),
        speed: entity.attribute.get(AttributeType.SPEED),
        attackSpeed: attacksPerSecond,
        physicalBasicDps,
        magicBasicDps,
        physicalSurvivalSeconds: survivalSeconds(entity.maxLife, incomingPhysicalDps),
        magicSurvivalSeconds: survivalSeconds(entity.maxLife, incomingMagicDps),
    };
}

const PROJECTED_WEAPONS = Object.freeze({
    'career:warrior': [
        { level: 1, id: 'training_axe' },
        { level: 28, id: 'oathiron_sword' },
        { level: 50, id: 'windsteel_sword' },
        { level: 70, id: 'dunebreaker_sword' },
        { level: 120, id: 'rimecleaver_sword' },
        { level: 150, id: 'tidebreaker_sword' },
        { level: 200, id: 'paradox_edge' },
        { level: 235, id: 'sootcleaver_sword' },
        { level: 275, id: 'nullsilver_greatsword' },
        { level: 310, id: 'drowned_edge' },
        { level: 345, id: 'rootbone_cleaver' },
    ],
    'career:archer': [
        { level: 1, id: 'light_bow' },
        { level: 10, id: 'silverweb_hunter_bow' },
        { level: 28, id: 'requiem_bow' },
        { level: 50, id: 'stormstring_bow' },
        { level: 70, id: 'sunwire_bow' },
        { level: 120, id: 'icesilk_longbow' },
        { level: 150, id: 'mistcurrent_bow' },
        { level: 200, id: 'photon_repeater' },
        { level: 235, id: 'hornstring_bow' },
        { level: 275, id: 'crownstring_longbow' },
        { level: 310, id: 'mooncurrent_bow' },
        { level: 345, id: 'heartstring_greatbow' },
    ],
    'career:assassin': [
        { level: 1, id: 'venom_dagger' },
        { level: 50, id: 'nightglass_dagger' },
        { level: 70, id: 'mirage_fang_dagger' },
        { level: 120, id: 'mirrorfang_dagger' },
        { level: 150, id: 'blackcoral_sting' },
        { level: 200, id: 'voidspring_dagger' },
        { level: 235, id: 'gloamfang_dagger' },
        { level: 275, id: 'voidsilk_stiletto' },
        { level: 310, id: 'nightpearl_knife' },
        { level: 345, id: 'amber_memory_fang' },
    ],
    'career:mage': [
        { level: 1, id: 'apprentice_staff' },
        { level: 20, id: 'starwood_staff' },
        { level: 40, id: 'mourning_staff' },
        { level: 70, id: 'helioglass_staff' },
        { level: 120, id: 'auroraprism_staff' },
        { level: 150, id: 'deeppearl_staff' },
        { level: 200, id: 'logic_core_staff' },
        { level: 235, id: 'blackflame_staff' },
        { level: 275, id: 'starless_scepter' },
        { level: 310, id: 'eclipse_oracle_staff' },
        { level: 345, id: 'origin_heart_staff' },
    ],
    'career:cleric': [
        // TODO(content): 성직자 전용 성구 계열이 추가되기 전까지 같은 정신력 계열의 지팡이 진척을 사용한다.
        { level: 1, id: 'apprentice_staff' },
        { level: 20, id: 'starwood_staff' },
        { level: 40, id: 'mourning_staff' },
        { level: 70, id: 'helioglass_staff' },
        { level: 120, id: 'auroraprism_staff' },
        { level: 150, id: 'deeppearl_staff' },
        { level: 200, id: 'logic_core_staff' },
        { level: 235, id: 'blackflame_staff' },
        { level: 275, id: 'starless_scepter' },
        { level: 310, id: 'eclipse_oracle_staff' },
        { level: 345, id: 'origin_heart_staff' },
    ],
    'career:blacksmith': [
        { level: 1, id: 'iron_pickaxe' },
        // 생산 장비의 난수 편차를 프로파일 기준값으로 쓰지 않고,
        // 황혼왕릉에서 확정 회수 가능한 범용 장검을 전투 기준선으로 사용한다.
        { level: 28, id: 'oathiron_sword' },
    ],
} satisfies Record<string, readonly { level: number; id: string }[]>);

const MONSTER_PROJECTED_ATTRIBUTE_TYPES = Object.freeze([
    AttributeType.MAX_LIFE,
    AttributeType.ATK,
    AttributeType.MAGIC_FORCE,
    AttributeType.DEF,
    AttributeType.MAGIC_DEF,
    AttributeType.ARMOR_PEN,
    AttributeType.MAGIC_PEN,
    AttributeType.SPEED,
    AttributeType.ATTACK_SPEED,
    AttributeType.CRIT_RATE,
    AttributeType.CRIT_DMG,
]);

function applyProjectedLoadout(entity: Entity, mainJobId: string, level: number, itemDataId?: string): {
    name: string;
    tags: readonly TagId[];
    attackType: 'physical' | 'magic';
    projectileDataId?: string;
} {
    const choices = PROJECTED_WEAPONS[mainJobId as keyof typeof PROJECTED_WEAPONS] ?? [];
    const choice = itemDataId ? undefined : [...choices].reverse().find(value => level >= value.level);
    const data = getItemData(itemDataId ?? choice?.id ?? '');
    if (itemDataId && (!data || data.equipSlot !== 'mainHand' || !data.tags.includes(GameTags.ITEM_WEAPON))) {
        throw new Error(`밸런스 주무기 데이터를 찾을 수 없습니다: ${itemDataId}`);
    }
    if (data?.modifiers?.length) {
        entity.attribute.addModifiers(data.modifiers.map(modifier => ({
            ...modifier,
            source: `balance:loadout:${data.id}`,
        })));
    }
    return {
        name: data?.name ?? '무장비',
        tags: Object.freeze([...(data?.tags ?? [])]),
        attackType: data?.balance?.attackType ?? (mainJobId === 'career:mage' ? 'magic' : 'physical'),
        projectileDataId: data?.tags.includes(GameTags.WEAPON_BOW)
            ? 'basic_arrow'
            : data?.tags.includes(GameTags.WEAPON_STAFF) ? 'basic_magic_orb' : undefined,
    };
}

function createEncounterTarget(level: number, encounter: BalanceEncounterType): { target: Entity; data: MonsterData } {
    const candidates = getAllMonsterData().filter(data => data.tags.includes(GameTags.ENTITY_BOSS) === encounter.boss);
    const data = candidates.sort((left, right) => Math.abs(left.level - level) - Math.abs(right.level - level)
        || right.level - left.level
        || left.id.localeCompare(right.id))[0];
    if (!data) throw new Error(`${encounter.label} 마스터 데이터가 없습니다.`);
    const native = new Monster(data.id, 'balance:void');
    if (data.level === level) return { target: native, data };

    if (!data.statProfile || !data.statRank) {
        throw new Error(`밸런스 대상의 몬스터 스탯 메타데이터가 없습니다: ${data.id}`);
    }
    const calculation = {
        profile: data.statProfile,
        rank: data.statRank,
        weights: data.statWeights,
    };
    const nativeCalculated = calculateMonsterBaseAttributes({ level: data.level, ...calculation });
    const targetCalculated = calculateMonsterBaseAttributes({ level, ...calculation });
    const projectedAttributes: Partial<AttributeRecord> = { ...native.attribute.base };
    for (const type of MONSTER_PROJECTED_ATTRIBUTE_TYPES) {
        const nativeBudget = nativeCalculated[type.key] ?? 0;
        const targetBudget = targetCalculated[type.key] ?? 0;
        const nativeValue = native.attribute.get(type);
        projectedAttributes[type.key] = nativeBudget > 0
            ? targetBudget * Math.max(0, nativeValue / nativeBudget)
            : nativeValue;
    }
    const target = new BalanceTargetEntity(
        `Lv.${level} 환산 ${data.name}`,
        level,
        projectedAttributes,
        native.tags.values(),
    );
    return { target, data };
}

function getRotationSkills(scenario: BalanceScenario): Readonly<SkillData>[] {
    const granted = new Set([
        ...scenario.mainJob.grantedSkills.map(value => value.skillDataId),
        ...(scenario.subJob?.grantedSkills.map(value => value.skillDataId) ?? []),
        ...(scenario.eliteJob?.grantedSkills.map(value => value.skillDataId) ?? []),
        ...(scenario.thirdJob?.grantedSkills.map(value => value.skillDataId) ?? []),
    ]);
    return getAllSkillData().filter(data => {
        if (!data.balance || data.tags.includes(GameTags.SKILL_PASSIVE)) return false;
        if (scenario.level < (data.unlockLevel ?? PROJECTED_SKILL_UNLOCK_LEVELS.get(data.id) ?? 1)) return false;
        if (data.weaponRequirement && !data.weaponRequirement.mainHandAnyTags.some(tag =>
            scenario.mainHandTags.includes(tag))) return false;
        if (granted.has(data.id) || data.id === 'power_strike') return true;
        return matchesProjectedJobRequirement(
            data,
            scenario.mainJob,
            scenario.subJob,
            scenario.eliteJob,
            scenario.thirdJob,
        );
    }).sort((left, right) => left.id.localeCompare(right.id));
}

/** 첫 반격 전에 사용할 수 있는 준비 완료 기술을 직접 피해가 큰 순서로 배치한 선공 폭딜 진단. */
function calculateOpeningBurst(
    scenario: BalanceScenario,
    actionInterval: number,
    counterattackDelay: number,
): OpeningBurstSnapshot {
    const basicDamage = calculateExpectedBasicHit(scenario);
    const basicMaximumDamage = calculateMaximumBasicHit(scenario);
    const skillCandidates = getRotationSkills(scenario)
        // 선행 준비 행동 없이 단독으로 쓸 수 없는 기술은 1행동 선공치로 과대평가하지 않는다.
        .filter(data => !data.balance?.requiresRotationStatusEffectId)
        .map(data => {
            const skillLevel = projectSkillLevel(scenario.level, data, scenario);
            const report = analyzeSkillBalance(
                scenario,
                data.id,
                skillLevel,
            );
            const damageType = data.balance?.damageType ?? 'absolute';
            const defense = damageType === 'physical'
                ? scenario.target.attribute.get(AttributeType.DEF)
                : damageType === 'magic' ? scenario.target.attribute.get(AttributeType.MAGIC_DEF) : 0;
            const maximumDefendedDamage = calculateProjectedCriticalDamage(
                report.rawDamage,
                scenario.entity,
                scenario.target,
                defense,
                report.penetration,
                data.balance?.criticalMode,
            ).maximum;
            const affinitySource = data.balance?.effectTags?.length ? {
                hasTag: (tag: TagId) => data.balance!.effectTags!.includes(tag),
            } : scenario.entity;
            const maximumDamage = applyTagEffectValue(
                maximumDefendedDamage,
                affinitySource,
                scenario.target,
            ).value * positiveInteger(data.balance?.hitCount ?? 1);
            return {
                name: report.name,
                damage: report.expectedDamagePerTarget,
                maximumDamage,
                manaCost: report.manaCost,
                combat: data.tags.includes(GameTags.SKILL_COMBAT),
            };
        }).filter(candidate => candidate.damage > 0)
        .sort((left, right) => right.damage - left.damage || left.name.localeCompare(right.name));
    const maxCandidate = [
        { name: '기본 공격', maximumDamage: basicMaximumDamage },
        ...skillCandidates.filter(candidate => candidate.manaCost <= scenario.entity.maxMentality + 0.0001),
    ]
        .sort((left, right) => right.maximumDamage - left.maximumDamage || left.name.localeCompare(right.name))[0];
    const actionCount = Math.max(1, Math.floor((counterattackDelay - 0.0001) / actionInterval));
    let mentality = scenario.entity.maxMentality;
    let damage = 0;
    let killSeconds = Number.POSITIVE_INFINITY;
    let nextCombatSkillAt = 0;
    const remaining = [...skillCandidates];
    for (let index = 0; index < actionCount; index++) {
        const actionAt = index * actionInterval;
        const candidateIndex = remaining.findIndex(candidate => candidate.manaCost <= mentality + 0.0001
            && (!candidate.combat || nextCombatSkillAt <= actionAt + 0.0001));
        const candidate = candidateIndex >= 0 ? remaining.splice(candidateIndex, 1)[0] : undefined;
        if (candidate) {
            mentality -= candidate.manaCost;
            if (candidate.combat) nextCombatSkillAt = actionAt + PLAYER_COMBAT_SKILL_CADENCE_SECONDS;
        }
        damage += candidate?.damage ?? basicDamage;
        if (!Number.isFinite(killSeconds) && damage >= scenario.target.maxLife) {
            killSeconds = (index + 1) * actionInterval;
        }
    }
    return {
        maxActionName: maxCandidate?.name ?? '기본 공격',
        maxActionDamage: maxCandidate?.maximumDamage ?? 0,
        actionCount,
        damage,
        killSeconds,
    };
}

function calculateIncomingBasicAttack(scenario: BalanceScenario): IncomingAttackSnapshot {
    const data = getMonsterData(scenario.targetDataId);
    const magic = data?.attack?.damageType === 'magic';
    const absolute = data?.attack?.damageType === 'absolute';
    const rawPower = scenario.target.attribute.get(magic ? AttributeType.MAGIC_FORCE : AttributeType.ATK);
    const defense = absolute
        ? 0
        : scenario.entity.attribute.get(magic ? AttributeType.MAGIC_DEF : AttributeType.DEF);
    const penetration = absolute
        ? 0
        : scenario.target.attribute.get(magic ? AttributeType.MAGIC_PEN : AttributeType.ARMOR_PEN);
    const defended = calculateProjectedCriticalDamage(
        rawPower,
        scenario.target,
        scenario.entity,
        defense,
        penetration,
    ).expected;
    const damageOnHit = applyTagEffectValue(defended, scenario.target, scenario.entity).value;
    const evasionChance = calculateEvasionChance(
        scenario.target.getEvasionAttackSpeed(),
        scenario.entity.attribute.get(AttributeType.SPEED),
    );
    return {
        name: '기본 공격',
        damageOnHit,
        expectedDamage: damageOnHit * (1 - evasionChance),
        evasionChance,
        unavoidable: false,
    };
}

function calculateIncomingSkillAttacks(
    scenario: BalanceScenario,
    data: MonsterData | undefined,
): ReadonlyMap<string, IncomingAttackSnapshot> {
    const result = new Map<string, IncomingAttackSnapshot>();
    for (const runtime of data?.skills ?? []) {
        const skillData = getSkillData(runtime.skillDataId);
        const calculateDamage = skillData?.balance?.calculateDamage;
        if (!skillData?.balance || !calculateDamage) continue;
        const skill = new Skill({
            playerId: null,
            skillDataId: skillData.id,
            level: Math.max(1, Math.min(skillData.maxLevel, runtime.level ?? 1)),
        });
        const context = createSkillContext(scenario.target, skill);
        const balance = skillData.balance;
        const raw = finiteNonNegative(calculateDamage(context));
        const damageType = balance.damageType ?? 'absolute';
        const defense = damageType === 'physical'
            ? scenario.entity.attribute.get(AttributeType.DEF)
            : damageType === 'magic' ? scenario.entity.attribute.get(AttributeType.MAGIC_DEF) : 0;
        const defaultPenetration = damageType === 'physical'
            ? scenario.target.attribute.get(AttributeType.ARMOR_PEN)
            : damageType === 'magic' ? scenario.target.attribute.get(AttributeType.MAGIC_PEN) : 0;
        const penetration = finiteNonNegative(balance.calculatePenetration?.(context) ?? defaultPenetration);
        const defended = calculateProjectedCriticalDamage(
            raw,
            scenario.target,
            scenario.entity,
            defense,
            penetration,
            balance.criticalMode,
        ).expected;
        const affinitySource = balance.effectTags?.length ? {
            hasTag: (tag: TagId) => balance.effectTags!.includes(tag),
        } : scenario.target;
        const hitCount = positiveInteger(balance.hitCount ?? 1);
        const damageOnHit = applyTagEffectValue(defended, affinitySource, scenario.entity).value * hitCount;
        const attackSpeed = finitePositive(
            balance.calculateEvasionAttackSpeed?.(context)
                ?? scenario.target.getEvasionAttackSpeed(),
        );
        const evasionChance = balance.unavoidable ? 0 : calculateEvasionChance(
            attackSpeed,
            scenario.entity.attribute.get(AttributeType.SPEED),
        );
        result.set(skillData.id, {
            name: skillData.name,
            damageOnHit,
            expectedDamage: damageOnHit * (1 - evasionChance),
            evasionChance,
            unavoidable: balance.unavoidable ?? false,
        });
    }
    return result;
}

function calculateIncomingPressure(
    basic: IncomingAttackSnapshot,
    basicInterval: number,
    data: MonsterData | undefined,
    skills: ReadonlyMap<string, IncomingAttackSnapshot>,
    guaranteedEvasionCoverage: number,
): { rawDps: number; evasionDps: number; guaranteedEvasionDps: number } {
    const rawBasicDps = basic.damageOnHit / basicInterval;
    const evasionBasicDps = basic.expectedDamage / basicInterval;
    const pattern = getPatternPressure(data, skills);
    return {
        rawDps: rawBasicDps + pattern.rawDps,
        evasionDps: evasionBasicDps + pattern.evasionDps,
        guaranteedEvasionDps: (evasionBasicDps + pattern.avoidableDps) * (1 - guaranteedEvasionCoverage)
            + pattern.unavoidableDps,
    };
}

function getPatternPressure(
    data: MonsterData | undefined,
    skills: ReadonlyMap<string, IncomingAttackSnapshot>,
): { rawDps: number; evasionDps: number; avoidableDps: number; unavoidableDps: number } {
    const sequence = data?.skillPattern?.sequence
        .map(id => skills.get(id))
        .filter((attack): attack is IncomingAttackSnapshot => Boolean(attack)) ?? [];
    if (!sequence.length || !data?.skillPattern) {
        return { rawDps: 0, evasionDps: 0, avoidableDps: 0, unavoidableDps: 0 };
    }
    const interval = Math.max(
        BALANCE_ACTION_FLOOR_SECONDS,
        (data.skillPattern.interval.min + data.skillPattern.interval.max) / 2,
    );
    const divisor = sequence.length * interval;
    const unavoidableDamage = sequence
        .filter(attack => attack.unavoidable)
        .reduce((sum, attack) => sum + attack.expectedDamage, 0);
    const avoidableDamage = sequence
        .filter(attack => !attack.unavoidable)
        .reduce((sum, attack) => sum + attack.expectedDamage, 0);
    return {
        rawDps: sequence.reduce((sum, attack) => sum + attack.damageOnHit, 0) / divisor,
        evasionDps: (avoidableDamage + unavoidableDamage) / divisor,
        avoidableDps: avoidableDamage / divisor,
        unavoidableDps: unavoidableDamage / divisor,
    };
}

function createIncomingTimeline(
    horizon: number,
    basic: IncomingAttackSnapshot,
    basicInterval: number,
    data: MonsterData | undefined,
    skills: ReadonlyMap<string, IncomingAttackSnapshot>,
    guaranteedWindows: readonly { start: number; end: number }[],
): readonly BalanceIncomingTimelineEvent[] {
    const events: BalanceIncomingTimelineEvent[] = [];
    const addEvent = (at: number, attack: IncomingAttackSnapshot): void => {
        const guaranteedEvaded = !attack.unavoidable && isTimeCovered(at, guaranteedWindows);
        events.push({
            at,
            expectedDamage: guaranteedEvaded ? 0 : attack.expectedDamage,
            rawDamage: attack.damageOnHit,
            expectedHits: guaranteedEvaded ? 0 : attack.unavoidable ? 1 : 1 - attack.evasionChance,
        });
    };
    const basicCount = Math.floor((horizon + 0.0001) / basicInterval);
    for (let index = 1; index <= basicCount; index++) {
        const at = index * basicInterval;
        addEvent(at, basic);
    }
    const pattern = data?.skillPattern;
    if (!pattern || horizon + 0.0001 < pattern.initialDelay || !pattern.sequence.length) {
        return Object.freeze(events);
    }
    const interval = Math.max(
        BALANCE_ACTION_FLOOR_SECONDS,
        (pattern.interval.min + pattern.interval.max) / 2,
    );
    const patternCount = 1 + Math.floor((horizon - pattern.initialDelay + 0.0001) / interval);
    for (let index = 0; index < patternCount; index++) {
        const attack = skills.get(pattern.sequence[index % pattern.sequence.length]);
        if (!attack) continue;
        const at = pattern.initialDelay + index * interval;
        addEvent(at, attack);
    }
    return Object.freeze(events.sort((left, right) => left.at - right.at));
}

/**
 * 평타·패턴 피격과 직접 회복·보호막을 한 시간축에서 재생한다.
 * 같은 시각에는 피해가 먼저 확정되며, 스킬 source가 같은 보호막은 누적하지 않고 교체한다.
 */
export function replayBalanceSurvival(
    maxLife: number,
    incomingEvents: readonly BalanceIncomingTimelineEvent[],
    supportEvents: readonly BalanceSupportTimelineEvent[],
): BalanceSurvivalTimelineReport {
    const normalizedMaxLife = finiteNonNegative(maxLife);
    const incoming = incomingEvents
        .filter(event => Number.isFinite(event.at) && event.at >= 0)
        .map((event, order) => ({
            kind: 'incoming' as const,
            at: event.at,
            order,
            expectedDamage: finiteNonNegative(event.expectedDamage),
            rawDamage: finiteNonNegative(event.rawDamage),
            expectedHits: finiteNonNegative(event.expectedHits),
        }));
    const support = supportEvents
        .filter(event => Number.isFinite(event.at) && event.at >= 0)
        .map((event, order) => ({
            kind: 'support' as const,
            at: event.at,
            order,
            sourceId: event.sourceId.trim(),
            healing: finiteNonNegative(event.healing),
            shield: finiteNonNegative(event.shield),
            shieldDuration: finiteNonNegative(event.shieldDuration),
        }));
    const timeline = [...incoming, ...support].sort((left, right) => left.at - right.at
        || Number(left.kind === 'support') - Number(right.kind === 'support')
        || left.order - right.order);
    const replay = (damageKey: 'expectedDamage' | 'rawDamage'): BalanceSurvivalTimelineState => {
        const shields = new Map<string, { amount: number; expiresAt: number }>();
        let life = normalizedMaxLife;
        let effectiveSupport = 0;
        let diedAt: number | undefined;
        for (const event of timeline) {
            if (diedAt !== undefined) continue;
            for (const [sourceId, shield] of shields) {
                if (shield.expiresAt <= event.at) shields.delete(sourceId);
            }
            if (event.kind === 'incoming') {
                let remainingDamage = event[damageKey];
                const activeShields = [...shields.entries()].sort((left, right) =>
                    left[1].expiresAt - right[1].expiresAt || left[0].localeCompare(right[0]));
                for (const [sourceId, shield] of activeShields) {
                    if (remainingDamage <= 0) break;
                    const absorbed = Math.min(shield.amount, remainingDamage);
                    shield.amount -= absorbed;
                    remainingDamage -= absorbed;
                    effectiveSupport += absorbed;
                    if (shield.amount <= 0) shields.delete(sourceId);
                }
                life = Math.max(0, life - remainingDamage);
                if (life <= 0) diedAt = event.at;
                continue;
            }
            const healing = Math.min(event.healing, Math.max(0, normalizedMaxLife - life));
            life += healing;
            effectiveSupport += healing;
            if (event.shield > 0 && event.shieldDuration > 0) {
                shields.set(event.sourceId, {
                    amount: event.shield,
                    expiresAt: event.at + event.shieldDuration,
                });
            }
        }
        return {
            endingLife: life,
            effectiveSupport,
            ...(diedAt === undefined ? {} : { diedAt }),
        };
    };
    return {
        expectedHits: incoming.reduce((sum, event) => sum + event.expectedHits, 0),
        expectedDamage: incoming.reduce((sum, event) => sum + event.expectedDamage, 0),
        rawDamage: incoming.reduce((sum, event) => sum + event.rawDamage, 0),
        expected: replay('expectedDamage'),
        raw: replay('rawDamage'),
    };
}

function calculateWindowCoverage(
    windows: readonly { start: number; end: number }[],
    duration: number,
): number {
    const clipped = windows
        .map(window => ({
            start: Math.max(0, Math.min(duration, window.start)),
            end: Math.max(0, Math.min(duration, window.end)),
        }))
        .filter(window => window.end > window.start)
        .sort((left, right) => left.start - right.start);
    let covered = 0;
    let currentStart = 0;
    let currentEnd = 0;
    for (const window of clipped) {
        if (window.start > currentEnd) {
            covered += Math.max(0, currentEnd - currentStart);
            currentStart = window.start;
            currentEnd = window.end;
        } else {
            currentEnd = Math.max(currentEnd, window.end);
        }
    }
    covered += Math.max(0, currentEnd - currentStart);
    return duration > 0 ? Math.min(1, covered / duration) : 0;
}

function isTimeCovered(time: number, windows: readonly { start: number; end: number }[]): boolean {
    return windows.some(window => time >= window.start && time < window.end);
}

function projectSkillLevel(characterLevel: number, data: Readonly<SkillData>, scenario: BalanceScenario): number {
    const advancedTier = data.jobRequirement?.anyOf
        .map(id => getJob(id)?.tier.key)
        .find(tier => tier === 'elite' || tier === 'third');
    const requiresSub = Boolean(scenario.subJob && data.jobRequirement?.anyOf.some(id => isJobDescendant(scenario.subJob!.id, id)));
    const unlockLevel = data.unlockLevel
        ?? (advancedTier === 'third' ? 500
            : advancedTier === 'elite' ? 200
                : requiresSub ? 50 : PROJECTED_SKILL_UNLOCK_LEVELS.get(data.id) ?? 20);
    return Math.max(1, Math.min(data.maxLevel, 1 + Math.floor(Math.max(0, characterLevel - unlockLevel) / 20)));
}

function calculateExpectedBasicHit(scenario: BalanceScenario): number {
    const entity = scenario.entity;
    const target = scenario.target;
    const magic = scenario.basicAttackType === 'magic';
    const projectile = scenario.basicProjectileDataId
        ? getProjectileData(scenario.basicProjectileDataId)
        : undefined;
    const rawPower = entity.attribute.get(magic ? AttributeType.MAGIC_FORCE : AttributeType.ATK);
    const raw = rawPower * (projectile?.damageMultiplier ?? 1) + (projectile?.damageBonus ?? 0);
    const defended = calculateProjectedCriticalDamage(
        raw,
        entity,
        target,
        target.attribute.get(magic ? AttributeType.MAGIC_DEF : AttributeType.DEF),
        entity.attribute.get(magic ? AttributeType.MAGIC_PEN : AttributeType.ARMOR_PEN),
    ).expected;
    const affinitySource = projectile ? {
        hasTag: (tag: TagId) => projectile.tags.includes(tag),
    } : entity;
    const affinityDamage = applyTagEffectValue(defended, affinitySource, target).value;
    return affinityDamage * (1 - calculateEvasionChance(
        getBasicAttackEvasionSpeed(scenario),
        target.attribute.get(AttributeType.SPEED),
    ));
}

function calculateMaximumBasicHit(scenario: BalanceScenario): number {
    const magic = scenario.basicAttackType === 'magic';
    const projectile = scenario.basicProjectileDataId
        ? getProjectileData(scenario.basicProjectileDataId)
        : undefined;
    const rawPower = scenario.entity.attribute.get(magic ? AttributeType.MAGIC_FORCE : AttributeType.ATK);
    const raw = rawPower * (projectile?.damageMultiplier ?? 1) + (projectile?.damageBonus ?? 0);
    const defended = calculateProjectedCriticalDamage(
        raw,
        scenario.entity,
        scenario.target,
        scenario.target.attribute.get(magic ? AttributeType.MAGIC_DEF : AttributeType.DEF),
        scenario.entity.attribute.get(magic ? AttributeType.MAGIC_PEN : AttributeType.ARMOR_PEN),
    ).maximum;
    const affinitySource = projectile ? {
        hasTag: (tag: TagId) => projectile.tags.includes(tag),
    } : scenario.entity;
    return applyTagEffectValue(defended, affinitySource, scenario.target).value;
}

/** 추천 무기의 실제 투사체 계수까지 반영한 기본 공격 회피 판정 속도. */
function getBasicAttackEvasionSpeed(scenario: BalanceScenario): number {
    const projectile = scenario.basicProjectileDataId
        ? getProjectileData(scenario.basicProjectileDataId)
        : undefined;
    if (!projectile) return scenario.entity.getEvasionAttackSpeed();
    const acceleration = calculateProjectileAcceleration(
        scenario.entity,
        projectile.accelerationCoefficient,
    );
    return calculateProjectileEvasionSpeed(acceleration);
}

function resolveItemStatusEffect(data: ItemData): {
    type: StatusEffectType;
    level: number;
    duration: number;
} | undefined {
    const value = data.baseMetadata?.[ItemMetadataKeys.STATUS_EFFECT];
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const id = value.id;
    const type = typeof id === 'string' ? StatusEffectType.fromKey(id) : undefined;
    const rawLevel = value.level;
    const rawDuration = value.duration;
    if (!type || typeof rawDuration !== 'number' || !Number.isFinite(rawDuration) || rawDuration <= 0) return undefined;
    const level = typeof rawLevel === 'number' && Number.isFinite(rawLevel) ? type.normalizeLevel(rawLevel) : 1;
    return { type, level, duration: rawDuration };
}

function finiteNonNegative(value: number): number {
    return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function finitePositive(value: number): number {
    return Number.isFinite(value) ? Math.max(0.01, value) : 0.01;
}

function positiveInteger(value: number): number {
    return Number.isInteger(value) && value > 0 ? value : 1;
}

function percentile(values: readonly number[], ratio: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((left, right) => left - right);
    return sorted[Math.floor((sorted.length - 1) * Math.max(0, Math.min(1, ratio)))];
}

function normalizeLevel(level: number): number {
    if (!Number.isFinite(level)) throw new Error('레벨은 유한한 숫자여야 합니다.');
    return Math.max(1, Math.floor(level));
}

function survivalSeconds(maxLife: number, incomingDps: number): number {
    return incomingDps > 0 ? maxLife / incomingDps : Number.POSITIVE_INFINITY;
}

function freezeAllocation(label: string, weights: Partial<Record<StatKey, number>>): BalanceStatAllocation {
    return Object.freeze({ label, weights: Object.freeze({ ...weights }) });
}
