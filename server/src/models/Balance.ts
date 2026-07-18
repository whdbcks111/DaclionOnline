import Entity from './Entity.js';
import Equipment from './Equipment.js';
import { AttributeType } from './Attribute.js';
import type { AttributeModifier } from './Attribute.js';
import { calculateEvasionChance, calculateFinalDamage } from './Combat.js';
import { DEFAULT_PLAYER_BASE_ATTRIBUTE } from './PlayerDefaults.js';
import { getAllJobs, getJob, resolveEliteJob, type JobData } from './Job.js';
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

const BALANCE_WINDOW_SECONDS = 60;

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
    ['career:mage', freezeAllocation('마법사 기준', { mentality: 5, sensibility: 2, vitality: 2, agility: 1 })],
]);

class BalanceEntity extends Entity {
    constructor(
        readonly balanceName: string,
        level: number,
        stats: Partial<StatRecord>,
    ) {
        super(level, 0, 'balance:void', DEFAULT_PLAYER_BASE_ATTRIBUTE, Equipment.createEmpty(), stats);
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

export function createBalanceScenario(level: number, mainJobId: string, subJobId?: string): BalanceScenario {
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
    applyJobModifiers(entity, effectiveJob.mainModifiers, 'balance:main');
    if (subJob) applyJobModifiers(entity, subJob.subModifiers, 'balance:sub');
    applyJobPassives(entity, [mainJob, subJob, effectiveJob]);
    const target = new BalanceEntity('동레벨 균형형 표준 대상', normalizedLevel, createProjectedStats(normalizedLevel, DEFAULT_ALLOCATION));
    return { level: normalizedLevel, mainJob, subJob, effectiveJob, allocation, stats, entity, target };
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
    const expectedDamagePerTarget = defendedDamage * hitCount * (1 - evasion);
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
        .filter(job => job.id === 'career:warrior' || job.id === 'career:archer'
            || job.id === 'career:assassin' || job.id === 'career:mage')
        .map(job => analyzeJobBalance(level, job.id));
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
