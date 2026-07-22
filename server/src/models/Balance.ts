import Entity from './Entity.js';
import Equipment from './Equipment.js';
import { AttributeType } from './Attribute.js';
import type { AttributeModifier } from './Attribute.js';
import { calculateEvasionChance, calculateFinalDamage } from './Combat.js';
import { DEFAULT_PLAYER_BASE_ATTRIBUTE } from './PlayerDefaults.js';
import { getAllJobs, getJob, isJobDescendant, resolveEliteJob, type JobData } from './Job.js';
import Skill, {
    createSkillContext,
    getAllSkillData,
    getSkillData,
    SkillCriticalMode,
    type SkillData,
} from './Skill.js';
import { StatType, type StatKey, type StatRecord } from './Stat.js';
import {
    getAllItemData,
    getItemData,
    ItemMetadataKeys,
    type ItemData,
} from './Item.js';
import { StatusEffectType } from './StatusEffect.js';
import { GameTags } from '../../../shared/tags.js';
import Monster, { getAllMonsterData, type MonsterData } from './Monster.js';
import { applyTagEffectValue } from './TagEffect.js';
import type { TagId } from '../../../shared/tags.js';

const BALANCE_WINDOW_SECONDS = 60;
const BALANCE_ACTION_FLOOR_SECONDS = 0.45;
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
    ['career:archer', freezeAllocation('궁수 기준', { agility: 4, sensibility: 3, strength: 2, vitality: 1 })],
    ['career:assassin', freezeAllocation('암살자 기준', { agility: 4, sensibility: 3, strength: 2, vitality: 1 })],
    ['career:mage', freezeAllocation('마법사 기준', { mentality: 4, vitality: 3, sensibility: 2, agility: 1 })],
    ['career:blacksmith', freezeAllocation('대장장이 기준', { sensibility: 4, vitality: 4, strength: 1, mentality: 1 })],
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

export interface BalanceScenario {
    readonly level: number;
    readonly mainJob: Readonly<JobData>;
    readonly subJob?: Readonly<JobData>;
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
    readonly basicAttackType: 'physical' | 'magic';
}

export interface RotationSkillReport {
    readonly skillId: string;
    readonly name: string;
    readonly skillLevel: number;
    readonly casts: number;
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
    readonly targetMaxLife: number;
    readonly estimatedKillSeconds: number;
    readonly currentSpeed: number;
    readonly evasionCapSpeed: number;
    readonly evasionCapAgility: number;
    readonly evasionCapReached: boolean;
    readonly endingMentality: number;
    readonly totalHealing: number;
    readonly totalShield: number;
    readonly skills: readonly RotationSkillReport[];
    readonly notes: readonly string[];
}

export interface BalanceProfileReport {
    readonly level: number;
    readonly jobId: string;
    readonly name: string;
    readonly allocationLabel: string;
    readonly monster: CombatRotationReport;
    readonly boss: CombatRotationReport;
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
): BalanceScenario {
    const normalizedLevel = normalizeLevel(level);
    const mainJob = getJob(mainJobId);
    if (!mainJob) throw new Error(`직업을 찾을 수 없습니다: ${mainJobId}`);
    const subJob = subJobId ? getJob(subJobId) : undefined;
    if (subJobId && !subJob) throw new Error(`서브 직업을 찾을 수 없습니다: ${subJobId}`);
    if (subJob?.id === mainJob.id) throw new Error('메인과 서브 직업은 달라야 합니다.');
    const effectiveJob = normalizedLevel >= 200 && subJob
        ? resolveEliteJob(mainJob.id, subJob.id) ?? mainJob
        : mainJob;
    const allocation = JOB_ALLOCATIONS.get(mainJob.id) ?? DEFAULT_ALLOCATION;
    const stats = createProjectedStats(normalizedLevel, allocation);
    const entity = new BalanceEntity(`${effectiveJob.name} 기준 공격자`, normalizedLevel, stats);
    const loadout = applyProjectedLoadout(entity, mainJob.id, normalizedLevel);
    applyJobModifiers(entity, effectiveJob.mainModifiers, 'balance:main');
    if (subJob) applyJobModifiers(entity, subJob.subModifiers, 'balance:sub');
    applyJobPassives(entity, [mainJob, subJob, effectiveJob]);
    const targetProfile = createEncounterTarget(normalizedLevel, encounter);
    return {
        level: normalizedLevel,
        mainJob,
        subJob,
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
        basicAttackType: loadout.attackType,
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
    const criticalMultiplier = getExpectedCriticalMultiplier(scenario.entity, balance?.criticalMode);
    const damageType = balance?.damageType ?? 'absolute';
    const defense = damageType === 'physical'
        ? scenario.target.attribute.get(AttributeType.DEF)
        : damageType === 'magic' ? scenario.target.attribute.get(AttributeType.MAGIC_DEF) : 0;
    const penetration = damageType === 'physical'
        ? scenario.entity.attribute.get(AttributeType.ARMOR_PEN)
        : damageType === 'magic' ? scenario.entity.attribute.get(AttributeType.MAGIC_PEN) : 0;
    const defendedDamage = damageType === 'absolute'
        ? rawDamage * criticalMultiplier
        : calculateFinalDamage(rawDamage * criticalMultiplier, defense, penetration);
    const evasion = balance?.criticalMode === SkillCriticalMode.DISABLED && damageType === 'absolute'
        ? 0
        : calculateEvasionChance(
            scenario.entity.attribute.get(AttributeType.SPEED),
            scenario.target.attribute.get(AttributeType.SPEED),
        );
    const affinitySource = balance?.effectTags?.length ? {
        hasTag: (tag: TagId) => balance.effectTags!.includes(tag),
    } : scenario.entity;
    const affinityDamage = applyTagEffectValue(defendedDamage, affinitySource, scenario.target).value;
    const expectedDamagePerTarget = affinityDamage * hitCount * (1 - evasion);
    const expectedTotalDamage = expectedDamagePerTarget * targetCount;
    const cooldownLimitedCasts = cooldown > 0 ? Math.ceil(BALANCE_WINDOW_SECONDS / cooldown) : 1;
    const availableMentality = scenario.entity.maxMentality
        + scenario.entity.attribute.get(AttributeType.MENTALITY_REGEN) * BALANCE_WINDOW_SECONDS;
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
    const expectedCrit = getExpectedCriticalMultiplier(entity, SkillCriticalMode.NORMAL);
    const physicalHit = calculateFinalDamage(
        entity.attribute.get(AttributeType.ATK) * expectedCrit,
        target.attribute.get(AttributeType.DEF),
        entity.attribute.get(AttributeType.ARMOR_PEN),
    );
    const hitChance = 1 - calculateEvasionChance(
        entity.attribute.get(AttributeType.SPEED),
        target.attribute.get(AttributeType.SPEED),
    );
    const skillIds = new Set([
        ...scenario.mainJob.grantedSkills.map(value => value.skillDataId),
        ...(scenario.subJob?.grantedSkills.map(value => value.skillDataId) ?? []),
        ...scenario.effectiveJob.grantedSkills.map(value => value.skillDataId),
    ]);
    const skillReports = [...skillIds]
        .filter(id => {
            const skill = getSkillData(id);
            return skill && !skill.tags.includes(GameTags.SKILL_PASSIVE);
        })
        .map(id => analyzeSkillBalance(scenario, id, getSkillData(id)!.maxLevel))
        .sort((a, b) => b.sustainableDpm - a.sustainableDpm || a.name.localeCompare(b.name));
    const targetExpectedCrit = getExpectedCriticalMultiplier(target, SkillCriticalMode.NORMAL);
    const targetHitChance = 1 - calculateEvasionChance(
        target.attribute.get(AttributeType.SPEED),
        entity.attribute.get(AttributeType.SPEED),
    );
    const incomingPhysicalDps = calculateFinalDamage(
        target.attribute.get(AttributeType.ATK) * targetExpectedCrit,
        entity.attribute.get(AttributeType.DEF),
        target.attribute.get(AttributeType.ARMOR_PEN),
    ) * targetHitChance * target.attribute.get(AttributeType.ATTACK_SPEED);
    const incomingMagicDps = calculateFinalDamage(
        target.attribute.get(AttributeType.MAGIC_FORCE) * targetExpectedCrit,
        entity.attribute.get(AttributeType.MAGIC_DEF),
        target.attribute.get(AttributeType.MAGIC_PEN),
    ) * targetHitChance * target.attribute.get(AttributeType.ATTACK_SPEED);
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
export function analyzeCombatRotation(scenario: BalanceScenario, duration = BALANCE_WINDOW_SECONDS): CombatRotationReport {
    const window = Math.max(5, Math.min(600, finiteNonNegative(duration) || BALANCE_WINDOW_SECONDS));
    const entries = getRotationSkills(scenario).map(data => {
        const level = projectSkillLevel(scenario.level, data, scenario);
        return {
            data,
            skill: new Skill({ playerId: null, skillDataId: data.id, level }),
            cooldownEndsAt: 0,
            lastCastAt: Number.NEGATIVE_INFINITY,
            casts: 0,
            damage: 0,
            healing: 0,
            shield: 0,
            manaSpent: 0,
            activeUntil: 0,
        };
    });
    const entity = scenario.entity;
    const target = scenario.target;
    const actionInterval = Math.max(BALANCE_ACTION_FLOOR_SECONDS, 1 / Math.max(0.1, entity.attribute.get(AttributeType.ATTACK_SPEED)));
    // 회피 투자 기준은 로테이션 도중 우연히 남아 있는 짧은 버프가 아니라 상시 장비·직업 modifier로 계산한다.
    const currentSpeed = entity.attribute.get(AttributeType.SPEED);
    const evasionCapSpeed = target.attribute.get(AttributeType.SPEED) * 2.8;
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
    while (time < window - 0.0001) {
        for (const entry of entries) {
            if (entry.activeUntil > 0 && entry.activeUntil <= time + 0.0001) {
                entity.attribute.removeBySource(`balance:rotation:${entry.data.id}`);
                entry.activeUntil = 0;
            }
        }
        mentality = Math.min(entity.maxMentality, mentality + entity.attribute.get(AttributeType.MENTALITY_REGEN) * actionInterval);
        const ready = entries.filter(entry => {
            const context = createSkillContext(entity, entry.skill);
            const cost = finiteNonNegative(entry.data.balance?.calculateManaCost?.(context) ?? 0);
            return entry.cooldownEndsAt <= time + 0.0001 && cost <= mentality + 0.0001;
        });
        const shouldBasic = skillsSinceBasic >= 2 || ready.length === 0;
        if (shouldBasic) {
            const damage = calculateExpectedBasicHit(scenario);
            basicDamage += damage;
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
            entry.damage += report.expectedDamagePerTarget;
            entry.healing += report.healing;
            entry.shield += report.shield;
            entry.manaSpent += cost;
            entry.lastCastAt = time;
            entry.cooldownEndsAt = time + Math.max(actionInterval, report.cooldown);
            for (const rule of entry.data.sharedCooldowns ?? []) {
                const sharedCooldownEndsAt = time + rule.seconds;
                for (const targetEntry of entries) {
                    if (!targetEntry.data.tags.includes(rule.targetTag)) continue;
                    targetEntry.cooldownEndsAt = Math.max(targetEntry.cooldownEndsAt, sharedCooldownEndsAt);
                }
            }
            const modifiers = entry.data.balance?.calculateRotationModifiers?.(context) ?? [];
            const effectDuration = finiteNonNegative(entry.data.balance?.calculateEffectDuration?.(context) ?? 0);
            if (modifiers.length && effectDuration > 0) {
                const source = `balance:rotation:${entry.data.id}`;
                entity.attribute.removeBySource(source);
                entity.attribute.addModifiers(modifiers.map(modifier => ({ ...modifier, source })));
                entry.activeUntil = time + effectDuration;
            }
            totalHealing += report.healing;
            totalShield += report.shield;
            skillsSinceBasic++;
        }
        time += actionInterval;
    }
    const skillDamage = entries.reduce((sum, entry) => sum + entry.damage, 0);
    const totalDamage = basicDamage + skillDamage;
    const dps = totalDamage / window;
    for (const entry of entries) entity.attribute.removeBySource(`balance:rotation:${entry.data.id}`);
    const notes = [
        '평타 1회 뒤 스킬을 최대 2회까지 사용하며, 모든 스킬은 같은 행동 시간·정신력·개별 및 태그 공유 재사용 대기시간을 사용합니다.',
        '제어·확정 회피·은신·지속 피해와 다중 대상 추가 피해는 단일 대상 직접 피해에 임의 점수로 더하지 않습니다.',
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
        targetMaxLife: target.maxLife,
        estimatedKillSeconds: dps > 0 ? target.maxLife / dps : Number.POSITIVE_INFINITY,
        currentSpeed,
        evasionCapSpeed,
        evasionCapAgility,
        evasionCapReached: currentSpeed >= evasionCapSpeed,
        endingMentality: mentality,
        totalHealing,
        totalShield,
        skills: Object.freeze(entries.map(entry => Object.freeze({
            skillId: entry.data.id,
            name: entry.data.name,
            skillLevel: entry.skill.level,
            casts: entry.casts,
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
function applyJobPassives(entity: Entity, jobs: readonly (Readonly<JobData> | undefined)[]): void {
    const skillIds = new Set(jobs.flatMap(job => job?.grantedSkills.map(grant => grant.skillDataId) ?? []));
    for (const skillDataId of skillIds) {
        const data = getSkillData(skillDataId);
        if (!data?.tags.includes(GameTags.SKILL_PASSIVE) || !data.onPassiveUpdate) continue;
        const skill = new Skill({ playerId: null, skillDataId, level: 1 });
        data.onPassiveUpdate(createSkillContext(entity, skill), 0);
    }
}

function createCombatSnapshot(entity: Entity, target: Entity): CombatBalanceSnapshot {
    const expectedCrit = getExpectedCriticalMultiplier(entity, SkillCriticalMode.NORMAL);
    const hitChance = 1 - calculateEvasionChance(
        entity.attribute.get(AttributeType.SPEED),
        target.attribute.get(AttributeType.SPEED),
    );
    const attacksPerSecond = entity.attribute.get(AttributeType.ATTACK_SPEED);
    const physicalBasicDps = calculateFinalDamage(
        entity.attribute.get(AttributeType.ATK) * expectedCrit,
        target.attribute.get(AttributeType.DEF),
        entity.attribute.get(AttributeType.ARMOR_PEN),
    ) * hitChance * attacksPerSecond;
    const magicBasicDps = calculateFinalDamage(
        entity.attribute.get(AttributeType.MAGIC_FORCE) * expectedCrit,
        target.attribute.get(AttributeType.MAGIC_DEF),
        entity.attribute.get(AttributeType.MAGIC_PEN),
    ) * hitChance * attacksPerSecond;
    const targetCrit = getExpectedCriticalMultiplier(target, SkillCriticalMode.NORMAL);
    const targetHitChance = 1 - calculateEvasionChance(
        target.attribute.get(AttributeType.SPEED),
        entity.attribute.get(AttributeType.SPEED),
    );
    const targetAttackSpeed = target.attribute.get(AttributeType.ATTACK_SPEED);
    const incomingPhysicalDps = calculateFinalDamage(
        target.attribute.get(AttributeType.ATK) * targetCrit,
        entity.attribute.get(AttributeType.DEF),
        target.attribute.get(AttributeType.ARMOR_PEN),
    ) * targetHitChance * targetAttackSpeed;
    const incomingMagicDps = calculateFinalDamage(
        target.attribute.get(AttributeType.MAGIC_FORCE) * targetCrit,
        entity.attribute.get(AttributeType.MAGIC_DEF),
        target.attribute.get(AttributeType.MAGIC_PEN),
    ) * targetHitChance * targetAttackSpeed;
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
    'career:warrior': [{ level: 1, id: 'training_axe' }, { level: 70, id: 'windsteel_sword' }],
    'career:archer': [{ level: 1, id: 'light_bow' }, { level: 70, id: 'stormstring_bow' }],
    'career:assassin': [{ level: 1, id: 'venom_dagger' }, { level: 90, id: 'nightglass_dagger' }],
    'career:mage': [{ level: 1, id: 'apprentice_staff' }, { level: 120, id: 'starwood_staff' }],
    'career:blacksmith': [{ level: 1, id: 'iron_pickaxe' }],
} satisfies Record<string, readonly { level: number; id: string }[]>);

const COMBAT_ATTRIBUTE_TYPES = Object.freeze([
    AttributeType.MAX_LIFE,
    AttributeType.MAX_MENTALITY,
    AttributeType.LIFE_REGEN,
    AttributeType.MENTALITY_REGEN,
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

function applyProjectedLoadout(entity: Entity, mainJobId: string, level: number): { name: string; attackType: 'physical' | 'magic' } {
    const choices = PROJECTED_WEAPONS[mainJobId as keyof typeof PROJECTED_WEAPONS] ?? [];
    const choice = [...choices].reverse().find(value => level >= value.level);
    const data = choice ? getItemData(choice.id) : undefined;
    if (data?.modifiers?.length) {
        entity.attribute.addModifiers(data.modifiers.map(modifier => ({
            ...modifier,
            source: `balance:loadout:${data.id}`,
        })));
    }
    return {
        name: data?.name ?? '무장비',
        attackType: data?.balance?.attackType ?? (mainJobId === 'career:mage' ? 'magic' : 'physical'),
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

    const nativeBaseline = new BalanceEntity('원본 레벨 표준 대상', data.level, createProjectedStats(data.level, DEFAULT_ALLOCATION));
    const target = new BalanceEntity(
        `Lv.${level} 환산 ${data.name}`,
        level,
        createProjectedStats(level, DEFAULT_ALLOCATION),
        native.tags.values(),
    );
    for (const type of COMBAT_ATTRIBUTE_TYPES) {
        const baseline = nativeBaseline.attribute.get(type);
        const ratio = baseline > 0 ? native.attribute.get(type) / baseline : 1;
        const current = target.attribute.get(type);
        const desired = current * Math.max(0, ratio);
        target.attribute.addModifier({ attribute: type.key, op: 'add', value: desired - current, source: 'balance:target-normalization' });
    }
    return { target, data };
}

function getRotationSkills(scenario: BalanceScenario): Readonly<SkillData>[] {
    const granted = new Set([
        ...scenario.mainJob.grantedSkills.map(value => value.skillDataId),
        ...(scenario.subJob?.grantedSkills.map(value => value.skillDataId) ?? []),
        ...scenario.effectiveJob.grantedSkills.map(value => value.skillDataId),
    ]);
    const ownedJobs = [scenario.mainJob.id, scenario.subJob?.id, scenario.effectiveJob.id].filter((id): id is string => Boolean(id));
    return getAllSkillData().filter(data => {
        if (!data.balance || data.tags.includes(GameTags.SKILL_PASSIVE)) return false;
        if (scenario.level < (PROJECTED_SKILL_UNLOCK_LEVELS.get(data.id) ?? 1)) return false;
        if (granted.has(data.id) || data.id === 'power_strike') return true;
        return data.jobRequirement?.anyOf.some(required => ownedJobs.some(job => isJobDescendant(job, required))) ?? false;
    }).sort((left, right) => left.id.localeCompare(right.id));
}

function projectSkillLevel(characterLevel: number, data: Readonly<SkillData>, scenario: BalanceScenario): number {
    const requiresElite = data.jobRequirement?.anyOf.some(id => getJob(id)?.tier.key === 'elite') ?? false;
    const requiresSub = Boolean(scenario.subJob && data.jobRequirement?.anyOf.some(id => isJobDescendant(scenario.subJob!.id, id)));
    const unlockLevel = requiresElite ? 200 : requiresSub ? 50 : PROJECTED_SKILL_UNLOCK_LEVELS.get(data.id) ?? 20;
    return Math.max(1, Math.min(data.maxLevel, 1 + Math.floor(Math.max(0, characterLevel - unlockLevel) / 20)));
}

function calculateExpectedBasicHit(scenario: BalanceScenario): number {
    const entity = scenario.entity;
    const target = scenario.target;
    const magic = scenario.basicAttackType === 'magic';
    const raw = entity.attribute.get(magic ? AttributeType.MAGIC_FORCE : AttributeType.ATK)
        * getExpectedCriticalMultiplier(entity, SkillCriticalMode.NORMAL);
    const defended = calculateFinalDamage(
        raw,
        target.attribute.get(magic ? AttributeType.MAGIC_DEF : AttributeType.DEF),
        entity.attribute.get(magic ? AttributeType.MAGIC_PEN : AttributeType.ARMOR_PEN),
    );
    return defended * (1 - calculateEvasionChance(
        entity.attribute.get(AttributeType.SPEED),
        target.attribute.get(AttributeType.SPEED),
    ));
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

function getExpectedCriticalMultiplier(entity: Entity, mode = SkillCriticalMode.NORMAL): number {
    if (mode === SkillCriticalMode.DISABLED) return 1;
    const criticalDamage = Math.max(0, entity.attribute.get(AttributeType.CRIT_DMG));
    if (mode === SkillCriticalMode.GUARANTEED) return criticalDamage;
    const criticalRate = Math.max(0, Math.min(1, entity.attribute.get(AttributeType.CRIT_RATE)));
    return 1 + criticalRate * (criticalDamage - 1);
}

function finiteNonNegative(value: number): number {
    return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function positiveInteger(value: number): number {
    return Number.isInteger(value) && value > 0 ? value : 1;
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
