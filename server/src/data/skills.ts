import { AttributeType } from '../models/Attribute.js';
import type { AttributeModifier } from '../models/Attribute.js';
import {
    defineSkill,
    denySkill,
    SkillBalanceRole,
    SkillCriticalMode,
} from '../models/Skill.js';
import type { SkillContext } from '../models/Skill.js';
import type Player from '../models/Player.js';
import { StatusEffectType } from '../models/StatusEffect.js';
import { sendNotificationFiltered } from '../modules/message.js';
import { isOnlinePlayerAtLocation } from '../modules/playerRegistry.js';
import { GameTags } from '../../../shared/tags.js';
import type { TagId } from '../../../shared/tags.js';
import {
    calculateProjectileAcceleration,
    calculateProjectileTravelTime,
    getProjectileData,
    spawnProjectileFromData,
} from '../models/Projectile.js';
import { getLocation } from '../models/Location.js';
import { ActionType } from '../models/Action.js';
import type Entity from '../models/Entity.js';
import { ShieldType } from '../models/Shield.js';
import { LegacyStatusEffects } from './statusEffects.js';
import { StatType } from '../models/Stat.js';

const CRITICAL_HIT_STAT = 'combat:critical_hits';

function numberMeta(context: SkillContext, key: string): number {
    const value = context.skill.getMetadata(key);
    if (typeof value !== 'number') throw new Error(`${context.skill.name} metadata가 숫자가 아닙니다: ${key}`);
    return value;
}

function requirePlayer(context: SkillContext): Player {
    if (!context.player) throw new Error(`${context.skill.name}은(는) 플레이어 전용 동작을 요청했습니다.`);
    return context.player;
}

function manaCost(context: SkillContext): number {
    return Math.max(0, Math.round(
        numberMeta(context, 'baseManaCost')
        + (context.skill.level - 1) * numberMeta(context, 'manaCostPerLevel'),
    ));
}

function attackPower(context: SkillContext): number {
    const multiplier = numberMeta(context, 'baseAttackMultiplier')
        + (context.skill.level - 1) * numberMeta(context, 'attackMultiplierPerLevel');
    return context.owner.attribute.get(AttributeType.ATK) * multiplier;
}

function valueByLevel(level: number, base: number, perLevel: number): number {
    return base + Math.max(0, level - 1) * perLevel;
}

function percentByLevel(level: number, base: number, perLevel: number): number {
    return valueByLevel(level, base, perLevel);
}

function formatNumber(value: number): string {
    return Number.isInteger(value) ? value.toString() : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function tooltipValue(value: number, description: string, suffix = ''): string {
    return `[tooltip=${description}]${formatNumber(value)}${suffix}[/tooltip]`;
}

function levelValueTooltip(
    context: SkillContext,
    label: string,
    base: number,
    perLevel: number,
    suffix = '',
): string {
    const value = valueByLevel(context.skill.level, base, perLevel);
    const growth = perLevel === 0 ? '' : ` · 스킬 레벨당 +${formatNumber(perLevel)}${suffix}`;
    return tooltipValue(value, `${label}: 기본 ${formatNumber(base)}${suffix}${growth}`, suffix);
}

function attributeDamageTooltip(
    context: SkillContext,
    attribute: AttributeType,
    basePercent: number,
    perLevelPercent: number,
): string {
    const percent = percentByLevel(context.skill.level, basePercent, perLevelPercent);
    const damage = context.owner.attribute.get(attribute) * percent / 100;
    const growth = perLevelPercent === 0 ? '' : ` · 스킬 레벨당 계수 +${formatNumber(perLevelPercent)}%p`;
    return tooltipValue(damage, `${attribute.label} × ${formatNumber(percent)}%${growth}`);
}

function cooldownByLevel(context: SkillContext, base: number, perLevelReduction: number, minimum: number): number {
    return Math.max(minimum, base - Math.max(0, context.skill.level - 1) * perLevelReduction);
}

function manaBarrierShieldAmount(context: SkillContext): number {
    return valueByLevel(context.skill.level, 45, 15)
        + context.owner.attribute.get(AttributeType.MAGIC_FORCE) * 0.75;
}

function activationGuide(requirement: string): string {
    return `${requirement} \`/스킬 {{name}}\` 또는 채팅에 [color=gold]{{name}}![/color]를 입력해 발동합니다.`;
}

function buffFeedback(name: string, duration: number, effects: string): string {
    return `${name} 발동! ${effects} (${formatNumber(duration)}초)`;
}

const PROJECTILE_CRITICAL_TEXT = '투사체는 {{icon.critRate}}{{icon.critDmg}} 시전자의 치명타 능력치를 적용합니다.';
const PROJECTILE_FLIGHT_TEXT = '{{icon.projectileAcceleration}} 현재 도달 시간은 [color=cyan]{{projectileTravelTime}}[/color]입니다.';

function magicSkillAccelerationMultiplier(context: SkillContext): number {
    const levelBonus = Math.max(0, context.skill.level - 1) * 0.08;
    const magicForceBonus = Math.min(0.75, Math.max(0, context.owner.attribute.get(AttributeType.MAGIC_FORCE)) * 0.002);
    return 1 + levelBonus + magicForceBonus;
}

function projectileTravelTimeTooltip(context: SkillContext, dataId: string, magicSkill: boolean): string {
    const data = getProjectileData(dataId);
    if (!data) return '알 수 없음';
    const multiplier = magicSkill ? magicSkillAccelerationMultiplier(context) : 1;
    const acceleration = calculateProjectileAcceleration(context.owner, data.accelerationCoefficient, multiplier);
    const travelTime = calculateProjectileTravelTime(context.owner, data.travelTime, data.accelerationCoefficient, multiplier);
    const magicDetail = magicSkill
        ? ` · 스킬 레벨당 가속 +8% · 마법력 1당 가속 +0.2% (마법력 보너스 최대 +75%)`
        : '';
    return tooltipValue(
        travelTime,
        `기본 ${formatNumber(data.travelTime)}초 ÷ 최종 투사체 가속 ${formatNumber(acceleration)}배${magicDetail}`,
        '초',
    );
}

defineSkill({
    id: 'power_strike',
    name: '강타',
    icon: 'skills/power_strike',
    aliases: ['powerstrike'],
    maxLevel: 5,
    descriptionTemplate:
        '현재 대상으로 기본 공격을 가해 {{icon.atk}}{{icon.critDmg}} [color=orange]{{damage}}[/color]의 예상 물리 피해를 입힙니다. '
        + '이 공격은 [color=gold]100% 확률로 치명타[/color]가 발생합니다.\n'
        + '공격 직전에 {{icon.armorPen}} 물리 관통력이 일회성으로 [color=orange]+{{armorPenFlat}}[/color] 및 '
        + '[color=orange]+{{armorPenPercent}}%[/color] 증가합니다.',
    costTemplate:
        '{{icon.maxMentality}} [color=$magic]정신력 {{manaCost}}[/color]',
    activationConditionTemplate:
        `살아 있는 현재 대상과 {{icon.maxMentality}} [color=$magic]정신력 {{manaCost}} 이상[/color]이 필요합니다. `
        + '`/스킬 {{name}}` 또는 채팅에 [color=gold]강타![/color]를 입력해 발동합니다.',
    activationMessage: '강타!',
    baseMetadata: {
        baseManaCost: 20,
        manaCostPerLevel: 2,
        baseAttackMultiplier: 1.15,
        attackMultiplierPerLevel: 0.1,
        baseCooldown: 8,
        cooldownReductionPerLevel: 0.5,
        armorPenFlat: 10,
        armorPenPercent: 5,
    },
    calculatedFields: {
        manaCost,
        attackPower,
        damage: context => {
            const attackMultiplier = numberMeta(context, 'baseAttackMultiplier')
                + (context.skill.level - 1) * numberMeta(context, 'attackMultiplierPerLevel');
            const critMultiplier = context.owner.attribute.get(AttributeType.CRIT_DMG);
            return tooltipValue(
                attackPower(context) * critMultiplier,
                `공격력 × ${formatNumber(attackMultiplier * 100)}% × 치명타 피해 ${formatNumber(critMultiplier * 100)}% · 스킬 레벨당 계수 +${formatNumber(numberMeta(context, 'attackMultiplierPerLevel') * 100)}%p`,
            );
        },
        armorPenFlat: context => numberMeta(context, 'armorPenFlat'),
        armorPenPercent: context => numberMeta(context, 'armorPenPercent'),
    },
    balance: {
        role: SkillBalanceRole.DAMAGE,
        damageType: 'physical',
        calculateDamage: attackPower,
        criticalMode: SkillCriticalMode.GUARANTEED,
        calculateManaCost: manaCost,
        notes: ['관통력 증가분은 대상 방어력에 따라 달라져 예상 피해에 별도 합산하지 않습니다.'],
    },
    calculateMaxCooldown: context => Math.max(
        1,
        numberMeta(context, 'baseCooldown')
            - (context.skill.level - 1) * numberMeta(context, 'cooldownReductionPerLevel'),
    ),
    autoAcquire: {
        watchedProgress: [CRITICAL_HIT_STAT],
        check: ({ player }) => (player?.progress.getCounter(CRITICAL_HIT_STAT) ?? 0n) >= 5n,
    },
    activateOnMessage: ({ message }) => message.trim() === '강타!',
    canActivate: context => {
        const player = requirePlayer(context);
        const target = player.currentTarget;
        if (!target) return denySkill('먼저 /대상지정 번호 명령어로 대상을 지정해주세요.');
        if (target.locationId !== player.locationId) return denySkill('현재 대상이 같은 장소에 없습니다.');
        if (target.isDefeated) return denySkill(`이미 ${target.defeatLabel} 상태인 대상입니다.`);
        if (player.attackCooldown > 0) {
            return denySkill(`기본 공격 대기시간이 ${player.attackCooldown.toFixed(1)}초 남았습니다.`);
        }
        const attackDenied = target.getAttackDeniedReason(player.attackOwner);
        if (attackDenied) return denySkill(attackDenied);
        const cost = manaCost(context);
        if (!player.canSpendMentality(cost)) {
            return denySkill(`정신력이 부족합니다. (${player.mentality.toFixed(1)} / ${cost})`);
        }
        return { accepted: true };
    },
    onStart: context => {
        const player = requirePlayer(context);
        const { skill } = context;
        const target = player.currentTarget;
        if (!target) throw new Error('강타 대상이 발동 직전에 사라졌습니다.');

        const cost = manaCost(context);
        if (!player.spendMentality(cost)) throw new Error('강타 정신력 소모에 실패했습니다.');

        const source = `skill:${skill.skillDataId}:single-attack`;
        const flat = numberMeta(context, 'armorPenFlat');
        const percentMultiplier = 1 + numberMeta(context, 'armorPenPercent') / 100;
        player.attribute.removeBySource(source);
        player.attribute.addModifiers([
            { attribute: AttributeType.ARMOR_PEN.key, op: 'add', value: flat, source },
            { attribute: AttributeType.ARMOR_PEN.key, op: 'multiply', value: percentMultiplier, source },
        ]);

        try {
            const result = player.attack(target, 'physical', attackPower(context), {
                criticalRate: 1,
                consumeMainHandDurability: true,
            });
            if (!result) {
                player.restoreMentality(cost);
                throw new Error('강타 공격이 확정되지 않았습니다.');
            }
        } finally {
            player.attribute.removeBySource(source);
        }
    },
    tags: [GameTags.SKILL_ACTIVE, GameTags.SKILL_COMBAT],
});

const BATTLE_RUSH = defineAttributeBuff('battle_rush', '전투 질주', '공격력과 이동속도가 증가합니다.', [
    { attribute: AttributeType.ATK, op: 'multiply', value: level => 1 + percentByLevel(level, 15, 3) / 100 },
    { attribute: AttributeType.SPEED, op: 'multiply', value: level => 1 + percentByLevel(level, 20, 3) / 100 },
]);
const INDOMITABLE = defineAttributeBuff('indomitable', '불굴', '방어력과 최대 생명력이 증가합니다.', [
    { attribute: AttributeType.DEF, op: 'add', value: level => valueByLevel(level, 15, 5) },
    { attribute: AttributeType.MAX_LIFE, op: 'multiply', value: level => 1 + percentByLevel(level, 20, 3) / 100 },
]);
const MANA_BARRIER = defineAttributeBuff('mana_barrier', '마력 보호막', '방어력과 마법 저항력이 증가합니다.', [
    { attribute: AttributeType.DEF, op: 'add', value: level => valueByLevel(level, 12, 4) },
    { attribute: AttributeType.MAGIC_DEF, op: 'add', value: level => valueByLevel(level, 20, 5) },
]);
const ELEMENTAL_INSIGHT = defineAttributeBuff('elemental_insight', '원소 통찰', '마법력과 정신력 재생이 증가합니다.', [
    { attribute: AttributeType.MAGIC_FORCE, op: 'multiply', value: level => 1 + percentByLevel(level, 20, 4) / 100 },
    { attribute: AttributeType.MENTALITY_REGEN, op: 'add', value: level => valueByLevel(level, 2, 0.75) },
]);

const STUN = LegacyStatusEffects.STUN;

const WIND_EVASION = StatusEffectType.define({
    id: 'wind_evasion', label: '바람 회피', icon: 'skills/career_archer', maxLevel: 5,
    descriptionTemplate: '이동할 수 있는 동안 받는 공격을 확정적으로 회피합니다.',
    onStart: ({ target, effect }) => target.grantGuaranteedEvasion(`status:${effect.type.id}`),
    onEarlyUpdate: ({ target, effect }) => target.grantGuaranteedEvasion(`status:${effect.type.id}`),
    onRemove: ({ target, effect }) => { target.removeGuaranteedEvasion(`status:${effect.type.id}`); },
    aliases: ['바람 회피'], tags: [GameTags.PROPERTY_NATURAL],
});

const STEALTH = StatusEffectType.define({
    id: 'stealth', label: '은신', icon: 'skills/career_assassin', maxLevel: 5,
    descriptionTemplate: '다른 대상이 공격 대상으로 지정할 수 없고 이동속도가 증가합니다.',
    onStart: ({ target, effect }) => applyStealth(target, effect.type.id, effect.level),
    onUpdate: ({ target, effect }) => applyStealth(target, effect.type.id, effect.level),
    onRemove: ({ target, effect }) => {
        target.tags.removeRuntime(`status:${effect.type.id}`);
        target.attribute.removeBySource(`status:${effect.type.id}`);
    },
    aliases: ['은신'], tags: [GameTags.PROPERTY_DARK],
});

type BuffModifier = { attribute: AttributeType; op: 'add' | 'multiply'; value: (level: number) => number };
function defineAttributeBuff(id: string, label: string, description: string, modifiers: readonly BuffModifier[]): StatusEffectType {
    const apply = (target: import('../models/Entity.js').default, level: number) => {
        const source = `status:${id}`;
        target.attribute.removeBySource(source);
        target.attribute.addModifiers(modifiers.map(modifier => ({
            attribute: modifier.attribute.key, op: modifier.op, value: modifier.value(level), source,
        })));
    };
    return StatusEffectType.define({
        id, label, icon: id === 'mana_barrier' || id === 'elemental_insight' ? 'skills/career_mage' : 'skills/career_warrior', maxLevel: 5, descriptionTemplate: description,
        onStart: ({ target, effect }) => apply(target, effect.level),
        onUpdate: ({ target, effect }) => apply(target, effect.level),
        onRemove: ({ target }) => target.attribute.removeBySource(`status:${id}`),
        tags: [],
    });
}

function applyStealth(target: import('../models/Entity.js').default, id: string, level = 1): void {
    const source = `status:${id}`;
    target.tags.setRuntime(source, [GameTags.TRAIT_STEALTH]);
    target.attribute.removeBySource(source);
    target.attribute.addModifier({
        attribute: AttributeType.SPEED.key,
        op: 'multiply',
        value: 1 + percentByLevel(level, 25, 5) / 100,
        source,
    });
}

const JOBS = {
    warrior: 'career:warrior', archer: 'career:archer', assassin: 'career:assassin', mage: 'career:mage',
    blacksmith: 'career:blacksmith',
} as const;

function jobRequirement(jobId: string) { return { anyOf: [jobId], slot: undefined }; }

function hasBlacksmithSkillAccess(player?: Player | null): boolean {
    return Boolean(player && (player.career.hasJob(JOBS.blacksmith)
        || player.progress.getFlag('profession:blacksmith')));
}

interface JobPassiveModifier extends Omit<AttributeModifier, 'source'> {
    label: string;
    display: string;
}

/**
 * 직업의 상시 효과를 일반 스킬과 같은 공개 API로 정의한다.
 * 전용 아이콘은 후속 콘텐츠 아트 작업 전까지 직업 아이콘을 임시 사용한다. TODO: 패시브별 아이콘 교체.
 */
function defineJobPassive(options: {
    id: string;
    name: string;
    jobId: string;
    icon: string;
    description: string;
    modifiers: readonly JobPassiveModifier[];
    isVisible?: (player?: Player | null) => boolean;
}): void {
    const source = `skill:${options.id}:passive`;
    defineSkill({
        id: options.id,
        name: options.name,
        icon: options.icon,
        maxLevel: 1,
        descriptionTemplate: options.description,
        costTemplate: '소모값 없음',
        activationConditionTemplate: '해당 직업이 활성화되어 있는 동안 항상 적용됩니다.',
        baseMetadata: null,
        calculatedFields: Object.fromEntries(options.modifiers.map(modifier => [
            modifier.attribute,
            () => `[tooltip=${modifier.label}: ${modifier.display}]${modifier.display}[/tooltip]`,
        ])),
        calculateExperienceGain: () => 0,
        calculateRequiredExperience: () => 0,
        jobRequirement: options.isVisible ? undefined : jobRequirement(options.jobId),
        isVisible: options.isVisible ? ({ player }) => options.isVisible!(player) : undefined,
        canActivate: () => denySkill('패시브 스킬은 직접 발동할 수 없습니다.'),
        onPassiveUpdate: ({ owner }) => {
            if (owner.attribute.hasSource(source)) return;
            owner.attribute.addModifiers(options.modifiers.map(({ label: _label, display: _display, ...modifier }) => ({
                ...modifier,
                source,
            })));
        },
        onPassiveInactive: ({ owner }) => owner.attribute.removeBySource(source),
        tags: [GameTags.SKILL_PASSIVE],
    });
}

defineJobPassive({
    id: 'warrior_combat_instinct',
    name: '전투 본능',
    jobId: JOBS.warrior,
    icon: 'jobs/warrior',
    description: '{{icon.atk}} 공격력이 [color=orange]{{atk}}[/color], {{icon.def}} 방어력이 [color=yellow]{{def}}[/color] 증가합니다.',
    modifiers: [
        { attribute: AttributeType.ATK.key, op: 'multiply', value: 1.06, label: '공격력 증가', display: '+6%' },
        { attribute: AttributeType.DEF.key, op: 'add', value: 6, label: '방어력 증가', display: '+6' },
    ],
});

defineJobPassive({
    id: 'archer_hawkeye',
    name: '매의 눈',
    jobId: JOBS.archer,
    icon: 'jobs/archer',
    description: '{{icon.critRate}} 치명타 확률이 [color=gold]{{critRate}}[/color], {{icon.speed}} 이동속도가 [color=cyan]{{speed}}[/color] 증가합니다.',
    modifiers: [
        { attribute: AttributeType.CRIT_RATE.key, op: 'add', value: 0.04, label: '치명타 확률 증가', display: '+4%p' },
        { attribute: AttributeType.SPEED.key, op: 'multiply', value: 1.05, label: '이동속도 증가', display: '+5%' },
    ],
});

defineJobPassive({
    id: 'assassin_lethal_instinct',
    name: '살의 감각',
    jobId: JOBS.assassin,
    icon: 'jobs/assassin',
    description: '{{icon.critDmg}} 치명타 피해가 [color=orange]{{critDmg}}[/color], {{icon.armorPen}} 방어 관통력이 [color=orange]{{armorPen}}[/color] 증가합니다.',
    modifiers: [
        { attribute: AttributeType.CRIT_DMG.key, op: 'add', value: 0.18, label: '치명타 피해 증가', display: '+18%p' },
        { attribute: AttributeType.ARMOR_PEN.key, op: 'add', value: 4, label: '방어 관통력 증가', display: '+4' },
    ],
});

defineJobPassive({
    id: 'mage_mana_cycle',
    name: '마력 순환',
    jobId: JOBS.mage,
    icon: 'jobs/mage',
    description: '{{icon.magicForce}} 마법력이 [color=$magic]{{magicForce}}[/color], {{icon.mentalityRegen}} 정신력 재생이 [color=$magic]{{mentalityRegen}}[/color] 증가합니다.',
    modifiers: [
        { attribute: AttributeType.MAGIC_FORCE.key, op: 'multiply', value: 1.07, label: '마법력 증가', display: '+7%' },
        { attribute: AttributeType.MENTALITY_REGEN.key, op: 'add', value: 1.5, label: '정신력 재생 증가', display: '+1.5/초' },
    ],
});

defineJobPassive({
    id: 'blacksmith_temper',
    name: '대장장이의 담금질',
    jobId: JOBS.blacksmith,
    icon: 'items/iron_pickaxe',
    description: '{{icon.maxWeight}} 최대 중량이 [color=gold]{{maxWeight}}[/color], {{icon.speed}} 이동속도가 [color=cyan]{{speed}}[/color] 증가합니다.',
    modifiers: [
        { attribute: AttributeType.MAX_WEIGHT.key, op: 'add', value: 10, label: '최대 중량 증가', display: '+10' },
        { attribute: AttributeType.SPEED.key, op: 'multiply', value: 1.04, label: '이동속도 증가', display: '+4%' },
    ],
    isVisible: hasBlacksmithSkillAccess,
});

const elitePassives = [
    {
        id: 'blade_ranger_mastery', name: '추격의 검로', jobId: 'career:blade_ranger', icon: 'jobs/warrior',
        description: '{{icon.atk}} 공격력이 [color=orange]{{atk}}[/color], {{icon.speed}} 이동속도가 [color=cyan]{{speed}}[/color] 증가합니다.',
        modifiers: [
            { attribute: AttributeType.ATK.key, op: 'multiply', value: 1.1, label: '공격력 증가', display: '+10%' },
            { attribute: AttributeType.SPEED.key, op: 'multiply', value: 1.08, label: '이동속도 증가', display: '+8%' },
        ],
    },
    {
        id: 'shadow_blade_mastery', name: '그림자 칼날', jobId: 'career:shadow_blade', icon: 'jobs/warrior',
        description: '{{icon.atk}} 공격력이 [color=orange]{{atk}}[/color], {{icon.critDmg}} 치명타 피해가 [color=orange]{{critDmg}}[/color] 증가합니다.',
        modifiers: [
            { attribute: AttributeType.ATK.key, op: 'multiply', value: 1.1, label: '공격력 증가', display: '+10%' },
            { attribute: AttributeType.CRIT_DMG.key, op: 'add', value: 0.2, label: '치명타 피해 증가', display: '+20%p' },
        ],
    },
    {
        id: 'spellblade_mastery', name: '마력 검로', jobId: 'career:spellblade', icon: 'jobs/warrior',
        description: '{{icon.atk}} 공격력이 [color=orange]{{atk}}[/color], {{icon.magicForce}} 마법력이 [color=$magic]{{magicForce}}[/color] 증가합니다.',
        modifiers: [
            { attribute: AttributeType.ATK.key, op: 'multiply', value: 1.07, label: '공격력 증가', display: '+7%' },
            { attribute: AttributeType.MAGIC_FORCE.key, op: 'multiply', value: 1.1, label: '마법력 증가', display: '+10%' },
        ],
    },
    {
        id: 'siege_bow_mastery', name: '공성 자세', jobId: 'career:siege_bow', icon: 'jobs/archer',
        description: '{{icon.atk}} 공격력이 [color=orange]{{atk}}[/color], {{icon.maxLife}} 최대 생명력이 [color=green]{{maxLife}}[/color] 증가합니다.',
        modifiers: [
            { attribute: AttributeType.ATK.key, op: 'multiply', value: 1.12, label: '공격력 증가', display: '+12%' },
            { attribute: AttributeType.MAX_LIFE.key, op: 'multiply', value: 1.08, label: '최대 생명력 증가', display: '+8%' },
        ],
    },
    {
        id: 'night_hunter_mastery', name: '야간 포착', jobId: 'career:night_hunter', icon: 'jobs/archer',
        description: '{{icon.critRate}} 치명타 확률이 [color=gold]{{critRate}}[/color], {{icon.speed}} 이동속도가 [color=cyan]{{speed}}[/color] 증가합니다.',
        modifiers: [
            { attribute: AttributeType.CRIT_RATE.key, op: 'add', value: 0.06, label: '치명타 확률 증가', display: '+6%p' },
            { attribute: AttributeType.SPEED.key, op: 'multiply', value: 1.08, label: '이동속도 증가', display: '+8%' },
        ],
    },
    {
        id: 'elemental_marksman_mastery', name: '원소 조준', jobId: 'career:elemental_marksman', icon: 'jobs/archer',
        description: '{{icon.magicForce}} 마법력이 [color=$magic]{{magicForce}}[/color], {{icon.magicPen}} 마법 관통력이 [color=$magic]{{magicPen}}[/color] 증가합니다.',
        modifiers: [
            { attribute: AttributeType.MAGIC_FORCE.key, op: 'multiply', value: 1.12, label: '마법력 증가', display: '+12%' },
            { attribute: AttributeType.MAGIC_PEN.key, op: 'add', value: 6, label: '마법 관통력 증가', display: '+6' },
        ],
    },
    {
        id: 'executioner_mastery', name: '처형 준비', jobId: 'career:executioner', icon: 'jobs/assassin',
        description: '{{icon.atk}} 공격력이 [color=orange]{{atk}}[/color], {{icon.armorPen}} 방어 관통력이 [color=orange]{{armorPen}}[/color] 증가합니다.',
        modifiers: [
            { attribute: AttributeType.ATK.key, op: 'multiply', value: 1.12, label: '공격력 증가', display: '+12%' },
            { attribute: AttributeType.ARMOR_PEN.key, op: 'add', value: 6, label: '방어 관통력 증가', display: '+6' },
        ],
    },
    {
        id: 'phantom_shooter_mastery', name: '환영 사격술', jobId: 'career:phantom_shooter', icon: 'jobs/assassin',
        description: '{{icon.critDmg}} 치명타 피해가 [color=orange]{{critDmg}}[/color], {{icon.speed}} 이동속도가 [color=cyan]{{speed}}[/color] 증가합니다.',
        modifiers: [
            { attribute: AttributeType.CRIT_DMG.key, op: 'add', value: 0.22, label: '치명타 피해 증가', display: '+22%p' },
            { attribute: AttributeType.SPEED.key, op: 'multiply', value: 1.08, label: '이동속도 증가', display: '+8%' },
        ],
    },
    {
        id: 'arcane_reaper_mastery', name: '영혼 포식', jobId: 'career:arcane_reaper', icon: 'jobs/assassin',
        description: '{{icon.magicForce}} 마법력이 [color=$magic]{{magicForce}}[/color], {{icon.critDmg}} 치명타 피해가 [color=orange]{{critDmg}}[/color] 증가합니다.',
        modifiers: [
            { attribute: AttributeType.MAGIC_FORCE.key, op: 'multiply', value: 1.1, label: '마법력 증가', display: '+10%' },
            { attribute: AttributeType.CRIT_DMG.key, op: 'add', value: 0.15, label: '치명타 피해 증가', display: '+15%p' },
        ],
    },
    {
        id: 'battle_magus_mastery', name: '전투 마력갑', jobId: 'career:battle_magus', icon: 'jobs/mage',
        description: '{{icon.magicForce}} 마법력이 [color=$magic]{{magicForce}}[/color], {{icon.maxLife}} 최대 생명력이 [color=green]{{maxLife}}[/color] 증가합니다.',
        modifiers: [
            { attribute: AttributeType.MAGIC_FORCE.key, op: 'multiply', value: 1.12, label: '마법력 증가', display: '+12%' },
            { attribute: AttributeType.MAX_LIFE.key, op: 'multiply', value: 1.1, label: '최대 생명력 증가', display: '+10%' },
        ],
    },
    {
        id: 'star_weaver_mastery', name: '성좌 유도', jobId: 'career:star_weaver', icon: 'jobs/mage',
        description: '{{icon.magicForce}} 마법력이 [color=$magic]{{magicForce}}[/color], {{icon.speed}} 이동속도가 [color=cyan]{{speed}}[/color] 증가합니다.',
        modifiers: [
            { attribute: AttributeType.MAGIC_FORCE.key, op: 'multiply', value: 1.12, label: '마법력 증가', display: '+12%' },
            { attribute: AttributeType.SPEED.key, op: 'multiply', value: 1.08, label: '이동속도 증가', display: '+8%' },
        ],
    },
    {
        id: 'hexblade_mastery', name: '주술 각인', jobId: 'career:hexblade', icon: 'jobs/mage',
        description: '{{icon.magicForce}} 마법력이 [color=$magic]{{magicForce}}[/color], {{icon.magicPen}} 마법 관통력이 [color=$magic]{{magicPen}}[/color] 증가합니다.',
        modifiers: [
            { attribute: AttributeType.MAGIC_FORCE.key, op: 'multiply', value: 1.1, label: '마법력 증가', display: '+10%' },
            { attribute: AttributeType.MAGIC_PEN.key, op: 'add', value: 6, label: '마법 관통력 증가', display: '+6' },
        ],
    },
    {
        id: 'weapon_master_mastery', name: '장인의 무기술', jobId: 'career:weapon_master', icon: 'jobs/warrior',
        description: '{{icon.atk}} 공격력이 [color=orange]{{atk}}[/color], {{icon.def}} 방어력이 [color=yellow]{{def}}[/color] 증가합니다.',
        modifiers: [
            { attribute: AttributeType.ATK.key, op: 'multiply', value: 1.1, label: '공격력 증가', display: '+10%' },
            { attribute: AttributeType.DEF.key, op: 'multiply', value: 1.08, label: '방어력 증가', display: '+8%' },
        ],
    },
    {
        id: 'machinist_archer_mastery', name: '정밀 기공', jobId: 'career:machinist_archer', icon: 'jobs/archer',
        description: '{{icon.atk}} 공격력이 [color=orange]{{atk}}[/color], {{icon.projectileAcceleration}} 투사체 가속이 [color=cyan]{{projectileAcceleration}}[/color] 증가합니다.',
        modifiers: [
            { attribute: AttributeType.ATK.key, op: 'multiply', value: 1.1, label: '공격력 증가', display: '+10%' },
            { attribute: AttributeType.PROJECTILE_ACCELERATION.key, op: 'multiply', value: 1.1, label: '투사체 가속 증가', display: '+10%' },
        ],
    },
    {
        id: 'steel_shadow_mastery', name: '연마된 살의', jobId: 'career:steel_shadow', icon: 'jobs/assassin',
        description: '{{icon.critDmg}} 치명타 피해가 [color=orange]{{critDmg}}[/color], {{icon.armorPen}} 방어 관통력이 [color=orange]{{armorPen}}[/color] 증가합니다.',
        modifiers: [
            { attribute: AttributeType.CRIT_DMG.key, op: 'add', value: 0.2, label: '치명타 피해 증가', display: '+20%p' },
            { attribute: AttributeType.ARMOR_PEN.key, op: 'add', value: 7, label: '방어 관통력 증가', display: '+7' },
        ],
    },
    {
        id: 'runeforger_mastery', name: '전투 룬각', jobId: 'career:runeforger', icon: 'jobs/mage',
        description: '{{icon.magicForce}} 마법력이 [color=$magic]{{magicForce}}[/color], {{icon.def}} 방어력이 [color=yellow]{{def}}[/color] 증가합니다.',
        modifiers: [
            { attribute: AttributeType.MAGIC_FORCE.key, op: 'multiply', value: 1.12, label: '마법력 증가', display: '+12%' },
            { attribute: AttributeType.DEF.key, op: 'multiply', value: 1.08, label: '방어력 증가', display: '+8%' },
        ],
    },
    {
        id: 'battle_smith_mastery', name: '전장의 담금질', jobId: 'career:battle_smith', icon: 'items/iron_pickaxe',
        description: '{{icon.maxLife}} 최대 생명력이 [color=green]{{maxLife}}[/color], {{icon.atk}} 공격력이 [color=orange]{{atk}}[/color] 증가합니다.',
        modifiers: [
            { attribute: AttributeType.MAX_LIFE.key, op: 'multiply', value: 1.1, label: '최대 생명력 증가', display: '+10%' },
            { attribute: AttributeType.ATK.key, op: 'multiply', value: 1.1, label: '공격력 증가', display: '+10%' },
        ],
    },
    {
        id: 'artificer_mastery', name: '자동 조준 장치', jobId: 'career:artificer', icon: 'items/iron_pickaxe',
        description: '{{icon.projectileAcceleration}} 투사체 가속이 [color=cyan]{{projectileAcceleration}}[/color], {{icon.critRate}} 치명타 확률이 [color=gold]{{critRate}}[/color] 증가합니다.',
        modifiers: [
            { attribute: AttributeType.PROJECTILE_ACCELERATION.key, op: 'multiply', value: 1.12, label: '투사체 가속 증가', display: '+12%' },
            { attribute: AttributeType.CRIT_RATE.key, op: 'add', value: 0.05, label: '치명타 확률 증가', display: '+5%p' },
        ],
    },
    {
        id: 'venom_smith_mastery', name: '독금 연마', jobId: 'career:venom_smith', icon: 'items/iron_pickaxe',
        description: '{{icon.critDmg}} 치명타 피해가 [color=orange]{{critDmg}}[/color], {{icon.armorPen}} 방어 관통력이 [color=orange]{{armorPen}}[/color] 증가합니다.',
        modifiers: [
            { attribute: AttributeType.CRIT_DMG.key, op: 'add', value: 0.2, label: '치명타 피해 증가', display: '+20%p' },
            { attribute: AttributeType.ARMOR_PEN.key, op: 'add', value: 6, label: '방어 관통력 증가', display: '+6' },
        ],
    },
    {
        id: 'arcane_smith_mastery', name: '마도 제련', jobId: 'career:arcane_smith', icon: 'items/iron_pickaxe',
        description: '{{icon.magicForce}} 마법력이 [color=$magic]{{magicForce}}[/color], {{icon.magicDef}} 마법 저항력이 [color=$magic]{{magicDef}}[/color] 증가합니다.',
        modifiers: [
            { attribute: AttributeType.MAGIC_FORCE.key, op: 'multiply', value: 1.12, label: '마법력 증가', display: '+12%' },
            { attribute: AttributeType.MAGIC_DEF.key, op: 'multiply', value: 1.1, label: '마법 저항력 증가', display: '+10%' },
        ],
    },
] as const;

for (const passive of elitePassives) defineJobPassive(passive);

const statAwakenings = [
    {
        id: 'titan_strength', name: '거인의 힘', stat: StatType.STRENGTH, icon: 'attributes/atk',
        description: '{{icon.atk}} 공격력이 [color=orange]{{atk}}[/color], {{icon.armorPen}} 방어 관통력이 [color=orange]{{armorPen}}[/color] 증가합니다.',
        modifiers: [
            { attribute: AttributeType.ATK.key, op: 'multiply', value: 1.08, label: '공격력 증가', display: '+8%' },
            { attribute: AttributeType.ARMOR_PEN.key, op: 'add', value: 8, label: '방어 관통력 증가', display: '+8' },
        ],
    },
    {
        id: 'wind_step', name: '바람걸음', stat: StatType.AGILITY, icon: 'attributes/speed',
        description: '{{icon.speed}} 이동속도가 [color=cyan]{{speed}}[/color], {{icon.attackSpeed}} 공격속도가 [color=cyan]{{attackSpeed}}[/color] 증가합니다.',
        modifiers: [
            { attribute: AttributeType.SPEED.key, op: 'multiply', value: 1.07, label: '이동속도 증가', display: '+7%' },
            { attribute: AttributeType.ATTACK_SPEED.key, op: 'multiply', value: 1.06, label: '공격속도 증가', display: '+6%' },
        ],
    },
    {
        id: 'unyielding_body', name: '불굴의 육체', stat: StatType.VITALITY, icon: 'attributes/maxLife',
        description: '{{icon.maxLife}} 최대 생명력이 [color=green]{{maxLife}}[/color], {{icon.def}} 방어력이 [color=yellow]{{def}}[/color] 증가합니다.',
        modifiers: [
            { attribute: AttributeType.MAX_LIFE.key, op: 'multiply', value: 1.1, label: '최대 생명력 증가', display: '+10%' },
            { attribute: AttributeType.DEF.key, op: 'multiply', value: 1.06, label: '방어력 증가', display: '+6%' },
        ],
    },
    {
        id: 'true_sight', name: '심안', stat: StatType.SENSIBILITY, icon: 'attributes/critRate',
        description: '{{icon.critRate}} 치명타 확률이 [color=gold]{{critRate}}[/color], {{icon.critDmg}} 치명타 피해가 [color=orange]{{critDmg}}[/color] 증가합니다.',
        modifiers: [
            { attribute: AttributeType.CRIT_RATE.key, op: 'add', value: 0.04, label: '치명타 확률 증가', display: '+4%p' },
            { attribute: AttributeType.CRIT_DMG.key, op: 'add', value: 0.12, label: '치명타 피해 증가', display: '+12%p' },
        ],
    },
    {
        id: 'mana_spring', name: '마력의 샘', stat: StatType.MENTALITY, icon: 'attributes/maxMentality',
        description: '{{icon.maxMentality}} 최대 정신력이 [color=$magic]{{maxMentality}}[/color], {{icon.magicForce}} 마법력이 [color=$magic]{{magicForce}}[/color], {{icon.mentalityRegen}} 정신력 재생이 [color=$magic]{{mentalityRegen}}[/color] 증가합니다.',
        modifiers: [
            { attribute: AttributeType.MAX_MENTALITY.key, op: 'multiply', value: 1.1, label: '최대 정신력 증가', display: '+10%' },
            { attribute: AttributeType.MAGIC_FORCE.key, op: 'multiply', value: 1.08, label: '마법력 증가', display: '+8%' },
            { attribute: AttributeType.MENTALITY_REGEN.key, op: 'add', value: 1, label: '정신력 재생 증가', display: '+1/초' },
        ],
    },
] as const;

for (const awakening of statAwakenings) {
    const source = `skill:${awakening.id}:passive`;
    // TODO: 각 각성의 전용 스킬 아이콘으로 교체. 1차 구현에서는 능력치 카테고리 fallback을 사용한다.
    defineSkill({
        id: awakening.id,
        name: awakening.name,
        icon: awakening.icon,
        maxLevel: 1,
        descriptionTemplate: awakening.description,
        costTemplate: '소모값 없음',
        activationConditionTemplate: `${awakening.stat.label} [color=gold]100[/color] 달성 시 자동으로 깨우칩니다.`,
        baseMetadata: null,
        calculatedFields: Object.fromEntries(awakening.modifiers.map(modifier => [
            modifier.attribute,
            () => `[tooltip=${modifier.label}: ${modifier.display}]${modifier.display}[/tooltip]`,
        ])),
        calculateExperienceGain: () => 0,
        calculateRequiredExperience: () => 0,
        autoAcquire: {
            watchedProgress: [],
            alwaysEvaluate: true,
            check: ({ player }) => (player?.stat.get(awakening.stat) ?? 0) >= 100,
        },
        canActivate: () => denySkill('패시브 스킬은 직접 발동할 수 없습니다.'),
        onPassiveUpdate: ({ owner }) => {
            if (owner.attribute.hasSource(source)) return;
            owner.attribute.addModifiers(awakening.modifiers.map(({ label: _label, display: _display, ...modifier }) => ({
                ...modifier,
                source,
            })));
        },
        onPassiveInactive: ({ owner }) => owner.attribute.removeBySource(source),
        tags: [GameTags.SKILL_PASSIVE],
    });
}

const weaponMasteries = [
    {
        id: 'sword_mastery', name: '검 숙련', weapon: 'sword', label: '검', tag: GameTags.WEAPON_SWORD, icon: 'items/old_sword',
        description: '{{icon.atk}} 검 장착 중 공격력이 [color=orange]{{atk}}[/color] 증가합니다.',
        modifiers: [{ attribute: AttributeType.ATK.key, op: 'multiply', value: 1.05, label: '공격력 증가', display: '+5%' }],
    },
    {
        id: 'axe_mastery', name: '도끼 숙련', weapon: 'axe', label: '도끼', tag: GameTags.WEAPON_AXE, icon: 'items/training_axe',
        description: '{{icon.atk}} 도끼 장착 중 공격력이 [color=orange]{{atk}}[/color] 증가합니다.',
        modifiers: [{ attribute: AttributeType.ATK.key, op: 'multiply', value: 1.08, label: '공격력 증가', display: '+8%' }],
    },
    {
        id: 'bow_mastery', name: '활 숙련', weapon: 'bow', label: '활', tag: GameTags.WEAPON_BOW, icon: 'items/light_bow',
        description: '{{icon.critRate}} 활 장착 중 치명타 확률이 [color=gold]{{critRate}}[/color] 증가합니다.',
        modifiers: [{ attribute: AttributeType.CRIT_RATE.key, op: 'add', value: 0.03, label: '치명타 확률 증가', display: '+3%p' }],
    },
    {
        id: 'dagger_mastery', name: '단검 숙련', weapon: 'dagger', label: '단검', tag: GameTags.WEAPON_DAGGER, icon: 'items/venom_dagger',
        description: '{{icon.armorPen}} 단검 장착 중 방어 관통력이 [color=orange]{{armorPen}}[/color] 증가합니다.',
        modifiers: [{ attribute: AttributeType.ARMOR_PEN.key, op: 'add', value: 5, label: '방어 관통력 증가', display: '+5' }],
    },
    {
        id: 'staff_mastery', name: '지팡이 숙련', weapon: 'staff', label: '지팡이', tag: GameTags.WEAPON_STAFF, icon: 'items/apprentice_staff',
        description: '{{icon.magicForce}} 지팡이 장착 중 마법력이 [color=$magic]{{magicForce}}[/color] 증가합니다.',
        modifiers: [{ attribute: AttributeType.MAGIC_FORCE.key, op: 'multiply', value: 1.07, label: '마법력 증가', display: '+7%' }],
    },
] as const;

for (const mastery of weaponMasteries) {
    const source = `skill:${mastery.id}:passive`;
    defineSkill({
        id: mastery.id,
        name: mastery.name,
        icon: mastery.icon,
        maxLevel: 1,
        descriptionTemplate: mastery.description,
        costTemplate: '소모값 없음',
        activationConditionTemplate: `${mastery.label}을(를) 장착한 동안 항상 적용됩니다.`,
        baseMetadata: null,
        calculatedFields: Object.fromEntries(mastery.modifiers.map(modifier => [
            modifier.attribute,
            () => `[tooltip=${modifier.label}: ${modifier.display}]${modifier.display}[/tooltip]`,
        ])),
        calculateExperienceGain: () => 0,
        calculateRequiredExperience: () => 0,
        autoAcquire: {
            watchedProgress: [`combat:weapon_hits/${mastery.weapon}`],
            check: ({ player }) => (player?.progress.getCounter(`combat:weapon_hits/${mastery.weapon}`) ?? 0n) >= 200n,
        },
        weaponRequirement: weaponRequirement(`${mastery.label}을(를) 장착해야 합니다.`, mastery.tag),
        canActivate: () => denySkill('패시브 스킬은 직접 발동할 수 없습니다.'),
        onPassiveUpdate: ({ owner }) => {
            if (owner.attribute.hasSource(source)) return;
            owner.attribute.addModifiers(mastery.modifiers.map(({ label: _label, display: _display, ...modifier }) => ({
                ...modifier,
                source,
            })));
        },
        onPassiveInactive: ({ owner }) => owner.attribute.removeBySource(source),
        tags: [GameTags.SKILL_PASSIVE],
    });
}

const smeltingMaterials = [
    ['iron_ore', 'refined_iron', '철'],
    ['gold_ore', 'refined_gold', '금'],
    ['ruby', 'refined_ruby', '루비'],
    ['emerald', 'refined_emerald', '에메랄드'],
    ['diamond', 'refined_diamond', '다이아몬드'],
] as const;

defineSkill({
    id: 'arcane_smelting',
    name: '마력 제련',
    icon: 'items/iron_ore',
    maxLevel: 10,
    descriptionTemplate: '인벤토리에서 가장 앞에 있는 원광을 찾아 불순물을 걷어내고 한 번에 [color=gold]{{batch}}개[/color]까지 제련 소재로 바꿉니다.',
    costTemplate: '{{manaCost}} 정신력 · 재사용 대기시간 {{maxCooldown}}초',
    activationConditionTemplate: '/스킬 마력 제련 또는 마력 제련!',
    activationMessage: '마력 제련!',
    baseMetadata: { baseManaCost: 18 },
    calculatedFields: {
        batch: context => 2 + context.skill.level,
        manaCost: context => numberMeta(context, 'baseManaCost'),
    },
    activationFeedback: context => `${context.skill.getActiveState<string>('materialLabel') ?? '소재'} ${context.skill.getActiveState<number>('processedCount') ?? 0}개를 마력으로 제련했습니다.`,
    calculateMaxCooldown: () => 5,
    isVisible: ({ player }) => hasBlacksmithSkillAccess(player),
    canActivate: context => {
        const player = requirePlayer(context);
        if (!hasBlacksmithSkillAccess(player)) return denySkill('대장장이 직업이 필요합니다.');
        if (!smeltingMaterials.some(([raw]) => player.inventory.getCount(raw) > 0)) return denySkill('제련할 광물이나 보석이 없습니다.');
        const cost = numberMeta(context, 'baseManaCost');
        return player.canSpendMentality(cost) ? { accepted: true } : denySkill(`정신력이 ${cost} 필요합니다.`);
    },
    onStart: context => {
        const player = requirePlayer(context);
        const material = smeltingMaterials.find(([raw]) => player.inventory.getCount(raw) > 0);
        if (!material) return;
        const [raw, refined, label] = material;
        const count = Math.min(player.inventory.getCount(raw), 2 + context.skill.level);
        const selections = player.inventory.selectItems([{ count, matches: item => item.itemDataId === raw }]);
        if (!selections || !player.inventory.replaceSelectedItems(selections, [{
            itemDataId: refined, count, durability: null, metadataDelta: null, tags: [],
        }])) throw new Error('마력 제련 재료 교환에 실패했습니다.');
        const cost = numberMeta(context, 'baseManaCost');
        if (!player.spendMentality(cost)) throw new Error('마력 제련 정신력 소모에 실패했습니다.');
        return { state: { materialLabel: label, processedCount: count } };
    },
    tags: [GameTags.SKILL_ACTIVE],
});

defineSkill({
    id: 'metal_forging',
    name: '금속 단조',
    icon: 'items/training_axe',
    maxLevel: 1,
    descriptionTemplate: '제련 소재와 장비 형태를 선택해 리듬 단조를 시작할 수 있습니다. 정확도가 완성품의 공격·방어 수치와 내구도를 결정합니다.',
    costTemplate: '형태별 제련 소재 소모',
    activationConditionTemplate: '/단조 <형태> <재료> 명령어로 사용합니다.',
    baseMetadata: null,
    calculatedFields: {},
    canActivate: () => denySkill('/단조 <형태> <재료> 명령어를 사용하세요.'),
    tags: [GameTags.SKILL_PASSIVE],
});

function weaponRequirement(description: string, ...tags: string[]) { return { mainHandAnyTags: tags, description }; }
function targetOrDeny(context: SkillContext): { target: Entity } | { reason: string } {
    const player = requirePlayer(context);
    const target = player.currentTarget;
    if (!target) return { reason: '먼저 /대상지정 번호 명령어로 대상을 지정해주세요.' };
    if (target.locationId !== player.locationId || target.isDefeated) return { reason: '같은 장소의 살아 있는 대상이 필요합니다.' };
    const denied = target.getAttackDeniedReason(player);
    return denied ? { reason: denied } : { target };
}
function spend(context: SkillContext, amount: number): void {
    if (!requirePlayer(context).spendMentality(amount)) throw new Error('정신력 소모에 실패했습니다.');
}
function simpleCheck(cost: number, needsTarget = true, requiresAttackReady = needsTarget) {
    return (context: SkillContext) => {
        if (needsTarget) {
            const found = targetOrDeny(context);
            if ('reason' in found) return denySkill(found.reason);
        }
        const player = requirePlayer(context);
        if (requiresAttackReady && player.attackCooldown > 0) return denySkill(`공격 대기시간이 ${player.attackCooldown.toFixed(1)}초 남았습니다.`);
        if (requiresAttackReady && !player.canPerformAction(ActionType.ATTACK)) return denySkill('현재 공격할 수 없는 상태입니다.');
        return player.canSpendMentality(cost) ? { accepted: true } as const : denySkill(`정신력이 ${cost} 필요합니다.`);
    };
}
function directAttack(context: SkillContext, multiplier: number, options: Parameters<Player['attack']>[3] = {}) {
    const found = targetOrDeny(context);
    if ('reason' in found) throw new Error(found.reason);
    const result = context.owner.attack(found.target, 'physical', context.owner.attribute.get(AttributeType.ATK) * multiplier, options);
    if (!result) throw new Error('공격이 확정되지 않았습니다.');
    return result;
}
function projectileAttack(
    context: SkillContext,
    dataId: string,
    multiplier: number,
    tags?: string[],
    onHit?: Parameters<typeof spawnProjectileFromData>[0]['onHit'],
    extraOverrides?: NonNullable<Parameters<typeof spawnProjectileFromData>[0]['overrides']>,
): void {
    const found = targetOrDeny(context);
    if ('reason' in found) throw new Error(found.reason);
    const data = getProjectileData(dataId);
    const damageType = extraOverrides?.damageType ?? data?.damageType;
    const accelerationMultiplier = extraOverrides?.accelerationMultiplier
        ?? (damageType === 'magic' ? magicSkillAccelerationMultiplier(context) : 1);
    const projectile = spawnProjectileFromData({
        owner: context.owner, target: found.target, dataId,
        overrides: {
            damageMultiplier: multiplier,
            ...(tags ? { tags } : {}),
            ...extraOverrides,
            accelerationMultiplier,
        },
        onHit,
    });
    if (!projectile) throw new Error('투사체 생성에 실패했습니다.');
    context.owner.commitAttack(false);
}

defineSkill({
    id: 'steel_slash', name: '강철 베기', icon: 'skills/career_warrior', maxLevel: 5,
    descriptionTemplate: '검 또는 도끼로 현재 대상에게 {{icon.atk}} [color=orange]{{damage}}[/color]의 물리 피해를 입힙니다.',
    costTemplate: '{{icon.maxMentality}} [color=$magic]정신력 10[/color]',
    activationConditionTemplate: activationGuide('검 또는 도끼와 살아 있는 현재 대상이 필요합니다.'),
    activationMessage: '강철 베기!', activationPhrase: '강철 베기!', baseMetadata: null,
    calculatedFields: { damage: context => attributeDamageTooltip(context, AttributeType.ATK, 175, 12) },
    balance: {
        role: SkillBalanceRole.DAMAGE, damageType: 'physical',
        calculateDamage: context => context.owner.attribute.get(AttributeType.ATK) * percentByLevel(context.skill.level, 175, 12) / 100,
        calculateManaCost: () => 10,
    },
    calculateMaxCooldown: context => cooldownByLevel(context, 5, 0.2, 4.2),
    jobRequirement: jobRequirement(JOBS.warrior), weaponRequirement: weaponRequirement('검 또는 도끼를 장착해야 합니다.', GameTags.WEAPON_SWORD, GameTags.WEAPON_AXE),
    canActivate: simpleCheck(10), onStart: context => {
        spend(context, 10);
        directAttack(context, percentByLevel(context.skill.level, 175, 12) / 100, { consumeMainHandDurability: true });
    },
    tags: [GameTags.SKILL_ACTIVE, GameTags.SKILL_COMBAT],
});

defineSkill({
    id: 'battle_rush', name: '전투 질주', icon: 'skills/career_warrior', maxLevel: 5,
    descriptionTemplate: '{{duration}} 동안 {{icon.atk}} 공격력이 [color=orange]{{attackBonus}}[/color], {{icon.speed}} 이동속도가 [color=cyan]{{speedBonus}}[/color] 증가합니다.',
    costTemplate: '{{icon.maxMentality}} [color=$magic]정신력 14[/color]',
    activationConditionTemplate: activationGuide('별도의 대상이나 무기가 필요하지 않습니다.'), activationMessage: '전투 질주!', baseMetadata: null,
    activationFeedback: context => buffFeedback(
        context.skill.name,
        valueByLevel(context.skill.level, 8, 1),
        `공격력 +${formatNumber(percentByLevel(context.skill.level, 15, 3))}%, 이동속도 +${formatNumber(percentByLevel(context.skill.level, 20, 3))}%`,
    ),
    calculatedFields: {
        duration: context => levelValueTooltip(context, '지속시간', 8, 1, '초'),
        attackBonus: context => levelValueTooltip(context, '공격력 증가', 15, 3, '%'),
        speedBonus: context => levelValueTooltip(context, '이동속도 증가', 20, 3, '%'),
    },
    balance: {
        role: SkillBalanceRole.SUPPORT, calculateManaCost: () => 14,
        notes: ['지속 중 공격력·이동속도 증가량은 수치로 표시하되 DPM에 임의 환산하지 않습니다.'],
    },
    calculateMaxCooldown: context => cooldownByLevel(context, 18, 1, 14),
    jobRequirement: jobRequirement(JOBS.warrior), canActivate: simpleCheck(14, false),
    onStart: context => {
        spend(context, 14);
        context.owner.applyStatusEffect(BATTLE_RUSH, valueByLevel(context.skill.level, 8, 1), context.skill.level);
    },
    tags: [GameTags.SKILL_ACTIVE, GameTags.SKILL_COMBAT],
});

defineSkill({
    id: 'indomitable', name: '불굴', icon: 'skills/career_warrior', maxLevel: 5,
    descriptionTemplate: '{{duration}} 동안 {{icon.def}} 방어력이 [color=yellow]+{{defBonus}}[/color], {{icon.maxLife}} 최대 생명력이 [color=green]{{lifeBonus}}[/color] 증가하고 최대 생명력의 [color=green]{{healPercent}}[/color]를 회복합니다.',
    costTemplate: '{{icon.maxMentality}} [color=$magic]정신력 18[/color]',
    activationConditionTemplate: activationGuide('별도의 대상이나 무기가 필요하지 않습니다.'), activationMessage: '불굴!', baseMetadata: null,
    activationFeedback: context => buffFeedback(
        context.skill.name,
        valueByLevel(context.skill.level, 10, 1),
        `방어력 +${formatNumber(valueByLevel(context.skill.level, 15, 5))}, 최대 생명력 +${formatNumber(percentByLevel(context.skill.level, 20, 3))}%, 생명력 ${formatNumber(percentByLevel(context.skill.level, 15, 2))}% 회복`,
    ),
    calculatedFields: {
        duration: context => levelValueTooltip(context, '지속시간', 10, 1, '초'),
        defBonus: context => levelValueTooltip(context, '방어력 증가', 15, 5),
        lifeBonus: context => levelValueTooltip(context, '최대 생명력 증가', 20, 3, '%'),
        healPercent: context => levelValueTooltip(context, '즉시 회복량', 15, 2, '%'),
    },
    balance: {
        role: SkillBalanceRole.DEFENSE,
        calculateManaCost: () => 18,
        calculateHealing: context => context.owner.maxLife * percentByLevel(context.skill.level, 15, 2) / 100,
        notes: ['방어력·최대 생명력 증가는 지속형 효과라 단발 회복량과 분리합니다.'],
    },
    calculateMaxCooldown: context => cooldownByLevel(context, 28, 1.5, 22),
    jobRequirement: jobRequirement(JOBS.warrior), canActivate: simpleCheck(18, false),
    onStart: context => {
        spend(context, 18);
        context.owner.applyStatusEffect(INDOMITABLE, valueByLevel(context.skill.level, 10, 1), context.skill.level);
        context.owner.heal(context.owner.maxLife * percentByLevel(context.skill.level, 15, 2) / 100, context.owner);
    },
    tags: [GameTags.SKILL_ACTIVE],
});

defineSkill({
    id: 'arcane_arrow', name: '마력 화살', icon: 'skills/career_archer', maxLevel: 5,
    descriptionTemplate: `탄약을 소모하지 않는 빛 속성 화살을 발사해 {{icon.magicForce}} [color=$magic]{{damage}}[/color]의 마법 피해를 입힙니다. ${PROJECTILE_CRITICAL_TEXT} ${PROJECTILE_FLIGHT_TEXT}`,
    costTemplate: '{{icon.maxMentality}} [color=$magic]정신력 12[/color]',
    activationConditionTemplate: activationGuide('활과 살아 있는 현재 대상이 필요합니다.'), activationMessage: '마력 화살!', baseMetadata: null,
    calculatedFields: {
        damage: context => attributeDamageTooltip(context, AttributeType.MAGIC_FORCE, 160, 12),
        projectileTravelTime: context => projectileTravelTimeTooltip(context, 'basic_magic_orb', true),
    },
    balance: {
        role: SkillBalanceRole.DAMAGE, damageType: 'magic',
        calculateDamage: context => context.owner.attribute.get(AttributeType.MAGIC_FORCE) * percentByLevel(context.skill.level, 160, 12) / 100,
        calculateManaCost: () => 12,
    },
    calculateMaxCooldown: context => cooldownByLevel(context, 5, 0.2, 4.2),
    jobRequirement: jobRequirement(JOBS.archer), weaponRequirement: weaponRequirement('활을 장착해야 합니다.', GameTags.WEAPON_BOW),
    canActivate: simpleCheck(12), onStart: context => {
        spend(context, 12);
        projectileAttack(context, 'basic_magic_orb', percentByLevel(context.skill.level, 160, 12) / 100, [GameTags.PROPERTY_LIGHT]);
    },
    tags: [GameTags.SKILL_ACTIVE, GameTags.SKILL_COMBAT],
});

defineSkill({
    id: 'multishot', name: '다중 사격', icon: 'skills/career_archer', maxLevel: 5,
    descriptionTemplate: `현재 장소의 공격 가능한 대상 최대 [color=gold]3명[/color]에게 각각 {{icon.atk}} [color=orange]{{damage}}[/color]의 물리 피해를 주는 화살을 발사합니다. ${PROJECTILE_CRITICAL_TEXT} ${PROJECTILE_FLIGHT_TEXT}`,
    costTemplate: '{{icon.maxMentality}} [color=$magic]정신력 18[/color]',
    activationConditionTemplate: activationGuide('활과 현재 장소의 공격 가능한 오브젝트가 필요합니다.'), activationMessage: '다중 사격!', baseMetadata: null,
    calculatedFields: {
        damage: context => attributeDamageTooltip(context, AttributeType.ATK, 100, 10),
        projectileTravelTime: context => projectileTravelTimeTooltip(context, 'basic_arrow', false),
    },
    balance: {
        role: SkillBalanceRole.DAMAGE, damageType: 'physical', targetCount: 3,
        calculateDamage: context => context.owner.attribute.get(AttributeType.ATK) * percentByLevel(context.skill.level, 100, 10) / 100,
        calculateManaCost: () => 18,
        notes: ['대상이 3명 있다고 가정한 총 피해와 대상 1명 피해를 함께 표시합니다.'],
    },
    calculateMaxCooldown: context => cooldownByLevel(context, 11, 0.5, 9),
    jobRequirement: jobRequirement(JOBS.archer), weaponRequirement: weaponRequirement('활을 장착해야 합니다.', GameTags.WEAPON_BOW),
    canActivate: context => {
        const checked = simpleCheck(18, false, true)(context);
        if (!checked.accepted) return checked;
        const player = requirePlayer(context);
        return (getLocation(player.locationId)?.getAttackableObjects(player).length ?? 0) > 0
            ? { accepted: true } : denySkill('현재 장소에 공격 가능한 대상이 없습니다.');
    }, onStart: context => {
        const player = requirePlayer(context); spend(context, 18);
        for (const target of getLocation(player.locationId)?.getAttackableObjects(player).slice(0, 3) ?? []) {
            spawnProjectileFromData({
                owner: player,
                target,
                dataId: 'basic_arrow',
                overrides: { damageMultiplier: percentByLevel(context.skill.level, 100, 10) / 100 },
            });
        }
        player.commitAttack(false);
    }, tags: [GameTags.SKILL_ACTIVE, GameTags.SKILL_COMBAT],
});

defineSkill({
    id: 'stunning_shot', name: '충격 화살', icon: 'skills/career_archer', maxLevel: 5,
    descriptionTemplate: `{{icon.atk}} [color=orange]{{damage}}[/color]의 물리 피해를 주는 강화 화살을 발사합니다. 적중한 대상은 {{stunDuration}} 동안 기절합니다. ${PROJECTILE_CRITICAL_TEXT} ${PROJECTILE_FLIGHT_TEXT}`,
    costTemplate: '{{icon.maxMentality}} [color=$magic]정신력 20[/color]',
    activationConditionTemplate: activationGuide('활과 살아 있는 현재 대상이 필요합니다.'), activationMessage: '충격 화살!', baseMetadata: null,
    calculatedFields: {
        damage: context => attributeDamageTooltip(context, AttributeType.ATK, 125, 10),
        stunDuration: context => levelValueTooltip(context, '기절 지속시간', 2, 0.25, '초'),
        projectileTravelTime: context => projectileTravelTimeTooltip(context, 'basic_arrow', false),
    },
    balance: {
        role: SkillBalanceRole.CONTROL, damageType: 'physical',
        calculateDamage: context => context.owner.attribute.get(AttributeType.ATK) * percentByLevel(context.skill.level, 125, 10) / 100,
        calculateManaCost: () => 20,
        notes: ['기절의 가치는 적 패턴에 따라 달라 피해량에 임의 합산하지 않습니다.'],
    },
    calculateMaxCooldown: context => cooldownByLevel(context, 16, 0.75, 13),
    jobRequirement: jobRequirement(JOBS.archer), weaponRequirement: weaponRequirement('활을 장착해야 합니다.', GameTags.WEAPON_BOW),
    canActivate: simpleCheck(20), onStart: context => {
        spend(context, 20);
        projectileAttack(context, 'basic_arrow', percentByLevel(context.skill.level, 125, 10) / 100, undefined, (_p, result) => {
            if (!result.evaded) _p.target.applyStatusEffect(STUN, valueByLevel(context.skill.level, 2, 0.25), context.skill.level);
        });
    },
    tags: [GameTags.SKILL_ACTIVE, GameTags.SKILL_COMBAT],
});

defineSkill({
    id: 'wind_evasion', name: '바람 회피', icon: 'skills/career_archer', maxLevel: 5,
    descriptionTemplate: '{{duration}} 동안 {{icon.speed}} 이동 가능한 상태라면 받는 공격을 [color=cyan]확정적으로 회피[/color]합니다. 이동이 금지된 동안에는 발동하지 않습니다.',
    costTemplate: '{{icon.maxMentality}} [color=$magic]정신력 22[/color]',
    activationConditionTemplate: activationGuide('별도의 대상이나 무기가 필요하지 않습니다.'), activationMessage: '바람 회피!', baseMetadata: null,
    activationFeedback: context => buffFeedback(
        context.skill.name,
        valueByLevel(context.skill.level, 4, 0.5),
        '이동 가능한 동안 공격 확정 회피',
    ),
    calculatedFields: { duration: context => levelValueTooltip(context, '확정 회피 지속시간', 4, 0.5, '초') },
    balance: {
        role: SkillBalanceRole.DEFENSE, calculateManaCost: () => 22,
        notes: ['확정 회피는 적 공격 빈도에 의존하므로 고정 전투력으로 환산하지 않습니다.'],
    },
    calculateMaxCooldown: context => cooldownByLevel(context, 24, 1.5, 18),
    jobRequirement: jobRequirement(JOBS.archer), canActivate: simpleCheck(22, false),
    onStart: context => {
        spend(context, 22);
        context.owner.applyStatusEffect(WIND_EVASION, valueByLevel(context.skill.level, 4, 0.5), context.skill.level);
    }, tags: [GameTags.SKILL_ACTIVE],
});

defineSkill({
    id: 'stealth', name: '은신', icon: 'skills/career_assassin', maxLevel: 5,
    descriptionTemplate: '{{duration}} 동안 다른 대상이 공격 대상으로 지정할 수 없는 은신 상태가 되고 {{icon.speed}} 이동속도가 [color=cyan]{{speedBonus}}[/color] 증가합니다. 암습 사용 시 해제됩니다.',
    costTemplate: '{{icon.maxMentality}} [color=$magic]정신력 16[/color]',
    activationConditionTemplate: activationGuide('별도의 대상이나 무기가 필요하지 않습니다.'), activationMessage: '은신!', baseMetadata: null,
    activationFeedback: context => buffFeedback(
        context.skill.name,
        valueByLevel(context.skill.level, 8, 0.75),
        `공격 대상 지정 방지, 이동속도 +${formatNumber(percentByLevel(context.skill.level, 25, 5))}%`,
    ),
    calculatedFields: {
        duration: context => levelValueTooltip(context, '은신 지속시간', 8, 0.75, '초'),
        speedBonus: context => levelValueTooltip(context, '이동속도 증가', 25, 5, '%'),
    },
    balance: {
        role: SkillBalanceRole.SUPPORT, calculateManaCost: () => 16,
        notes: ['은신과 이동속도는 상황 의존 효과라 DPM에 임의 환산하지 않습니다.'],
    },
    calculateMaxCooldown: context => cooldownByLevel(context, 20, 1, 16),
    jobRequirement: jobRequirement(JOBS.assassin), canActivate: simpleCheck(16, false),
    onStart: context => {
        spend(context, 16);
        context.owner.applyStatusEffect(STEALTH, valueByLevel(context.skill.level, 8, 0.75), context.skill.level);
    }, tags: [GameTags.SKILL_ACTIVE],
});

defineSkill({
    id: 'ambush', name: '암습', icon: 'skills/career_assassin', maxLevel: 5,
    descriptionTemplate: '은신을 해제하고 {{icon.atk}}{{icon.critDmg}} [color=orange]{{damage}}[/color]의 물리 피해를 주는 {{icon.critRate}} 확정 치명타 공격을 가합니다. 이 공격은 회피할 수 없습니다.',
    costTemplate: '{{icon.maxMentality}} [color=$magic]정신력 18[/color]',
    activationConditionTemplate: activationGuide('단검, 은신 효과와 살아 있는 현재 대상이 필요합니다.'), activationMessage: '암습!', baseMetadata: null,
    calculatedFields: { damage: context => {
        const percent = percentByLevel(context.skill.level, 180, 15);
        const damage = context.owner.attribute.get(AttributeType.ATK) * percent / 100
            * context.owner.attribute.get(AttributeType.CRIT_DMG);
        return tooltipValue(
            damage,
            `공격력 × ${formatNumber(percent)}% × 치명타 피해 ${formatNumber(context.owner.attribute.get(AttributeType.CRIT_DMG) * 100)}% · 스킬 레벨당 계수 +15%p`,
        );
    } },
    balance: {
        role: SkillBalanceRole.DAMAGE, damageType: 'physical',
        calculateDamage: context => context.owner.attribute.get(AttributeType.ATK) * percentByLevel(context.skill.level, 180, 15) / 100,
        criticalMode: SkillCriticalMode.GUARANTEED,
        calculateManaCost: () => 18,
        notes: ['선행 은신의 재사용 대기시간과 정신력 소모는 별도이며, 이 명령은 암습 단독 사용량을 계산합니다.'],
    },
    calculateMaxCooldown: context => cooldownByLevel(context, 10, 0.5, 8),
    jobRequirement: jobRequirement(JOBS.assassin), weaponRequirement: weaponRequirement('단검을 장착해야 합니다.', GameTags.WEAPON_DAGGER),
    canActivate: context => context.owner.getStatusEffect(STEALTH) ? simpleCheck(18)(context) : denySkill('은신 상태에서만 사용할 수 있습니다.'),
    onStart: context => {
        spend(context, 18);
        context.owner.removeStatusEffect(STEALTH);
        directAttack(context, percentByLevel(context.skill.level, 180, 15) / 100, { criticalRate: 1, unavoidable: true, consumeMainHandDurability: true });
    },
    tags: [GameTags.SKILL_ACTIVE, GameTags.SKILL_COMBAT],
});

defineSkill({
    id: 'venom_blade', name: '맹독 칼날', icon: 'skills/career_assassin', maxLevel: 5,
    descriptionTemplate: '단검으로 {{icon.atk}} [color=orange]{{damage}}[/color]의 물리 피해를 입힙니다. 피해를 준 대상에게 Lv.{{level}} 맹독을 {{poisonDuration}} 동안 부여합니다.',
    costTemplate: '{{icon.maxMentality}} [color=$magic]정신력 14[/color]',
    activationConditionTemplate: activationGuide('단검과 살아 있는 현재 대상이 필요합니다.'), activationMessage: '맹독 칼날!', baseMetadata: null,
    calculatedFields: {
        damage: context => attributeDamageTooltip(context, AttributeType.ATK, 145, 10),
        poisonDuration: context => levelValueTooltip(context, '맹독 지속시간', 8, 1, '초'),
    },
    balance: {
        role: SkillBalanceRole.DAMAGE, damageType: 'physical',
        calculateDamage: context => context.owner.attribute.get(AttributeType.ATK) * percentByLevel(context.skill.level, 145, 10) / 100,
        calculateManaCost: () => 14,
        notes: ['맹독 지속 피해는 대상의 최대·현재 생명력에 의존하므로 직접 타격 DPM과 분리합니다.'],
    },
    calculateMaxCooldown: context => cooldownByLevel(context, 9, 0.5, 7),
    jobRequirement: jobRequirement(JOBS.assassin), weaponRequirement: weaponRequirement('단검을 장착해야 합니다.', GameTags.WEAPON_DAGGER),
    canActivate: simpleCheck(14), onStart: context => {
        const found = targetOrDeny(context);
        if ('reason' in found) throw new Error(found.reason);
        spend(context, 14);
        const result = directAttack(context, percentByLevel(context.skill.level, 145, 10) / 100, { consumeMainHandDurability: true });
        if (!result.evaded && result.finalDamage > 0) {
            found.target.applyStatusEffect(StatusEffectType.DEADLY_POISON, valueByLevel(context.skill.level, 8, 1), context.skill.level);
        }
    },
    tags: [GameTags.SKILL_ACTIVE, GameTags.SKILL_COMBAT, GameTags.PROPERTY_POISON],
});

defineSkill({
    id: 'magic_bolt', name: '마력탄', icon: 'skills/career_mage', maxLevel: 5,
    descriptionTemplate: `응축한 정신 에너지를 발사해 {{icon.magicForce}} [color=$magic]{{damage}}[/color]의 마법 피해를 입힙니다. ${PROJECTILE_CRITICAL_TEXT} ${PROJECTILE_FLIGHT_TEXT}`,
    costTemplate: '{{icon.maxMentality}} [color=$magic]정신력 10[/color]',
    activationConditionTemplate: activationGuide('살아 있는 현재 대상이 필요합니다. 장착 무기와 관계없이 사용할 수 있습니다.'), activationMessage: '마력탄!', baseMetadata: null,
    calculatedFields: {
        damage: context => attributeDamageTooltip(context, AttributeType.MAGIC_FORCE, 165, 13),
        projectileTravelTime: context => projectileTravelTimeTooltip(context, 'magic_bolt', true),
    },
    balance: {
        role: SkillBalanceRole.DAMAGE, damageType: 'magic',
        calculateDamage: context => context.owner.attribute.get(AttributeType.MAGIC_FORCE) * percentByLevel(context.skill.level, 165, 13) / 100,
        calculateManaCost: () => 10,
    },
    calculateMaxCooldown: context => cooldownByLevel(context, 4, 0.2, 3.2),
    jobRequirement: jobRequirement(JOBS.mage),
    canActivate: simpleCheck(10), onStart: context => {
        spend(context, 10);
        projectileAttack(context, 'magic_bolt', percentByLevel(context.skill.level, 165, 13) / 100);
    }, tags: [GameTags.SKILL_ACTIVE, GameTags.SKILL_COMBAT],
});

defineSkill({
    id: 'mana_barrier', name: '마력 보호막', icon: 'skills/career_mage', maxLevel: 5,
    descriptionTemplate: '{{duration}} 동안 [color=#a56de2]{{shieldAmount}}의 마법 보호막[/color]을 얻습니다. '
        + '{{icon.def}} 방어력이 [color=yellow]+{{defBonus}}[/color], {{icon.magicDef}} 마법 저항력이 [color=purple]+{{magicDefBonus}}[/color] 증가합니다.',
    costTemplate: '{{icon.maxMentality}} [color=$magic]정신력 22[/color]',
    activationConditionTemplate: activationGuide('별도의 대상이나 무기가 필요하지 않습니다.'), activationMessage: '마력 보호막!', baseMetadata: null,
    activationFeedback: context => buffFeedback(
        context.skill.name,
        valueByLevel(context.skill.level, 10, 1),
        `마법 보호막 ${formatNumber(manaBarrierShieldAmount(context))}, 방어력 +${formatNumber(valueByLevel(context.skill.level, 12, 4))}, 마법 저항력 +${formatNumber(valueByLevel(context.skill.level, 20, 5))}`,
    ),
    calculatedFields: {
        duration: context => levelValueTooltip(context, '지속시간', 10, 1, '초'),
        shieldAmount: context => tooltipValue(
            manaBarrierShieldAmount(context),
            `기본 ${formatNumber(valueByLevel(context.skill.level, 45, 15))} + 마법력 × 75% · 기본 보호막 스킬 레벨당 +15`,
        ),
        defBonus: context => levelValueTooltip(context, '방어력 증가', 12, 4),
        magicDefBonus: context => levelValueTooltip(context, '마법 저항력 증가', 20, 5),
    },
    balance: {
        role: SkillBalanceRole.DEFENSE,
        calculateManaCost: () => 22,
        calculateShield: manaBarrierShieldAmount,
        notes: ['방어력·마법저항 증가는 지속형 효과라 보호막량과 분리합니다.'],
    },
    calculateMaxCooldown: context => cooldownByLevel(context, 22, 1, 18),
    jobRequirement: jobRequirement(JOBS.mage), canActivate: simpleCheck(22, false),
    onStart: context => {
        spend(context, 22);
        const duration = valueByLevel(context.skill.level, 10, 1);
        context.owner.setShield('skill:mana_barrier', manaBarrierShieldAmount(context), ShieldType.MAGIC, duration, context.owner);
        context.owner.applyStatusEffect(MANA_BARRIER, duration, context.skill.level);
    }, tags: [GameTags.SKILL_ACTIVE],
});

defineSkill({
    id: 'elemental_bind', name: '원소 속박', icon: 'skills/career_mage', maxLevel: 5,
    descriptionTemplate: `얼음 속성 구체로 {{icon.magicForce}} [color=$magic]{{damage}}[/color]의 마법 피해를 입힙니다. 적중한 대상은 {{bindDuration}} 동안 공격·스킬·이동·장소 이동을 할 수 없습니다. ${PROJECTILE_CRITICAL_TEXT} ${PROJECTILE_FLIGHT_TEXT}`,
    costTemplate: '{{icon.maxMentality}} [color=$magic]정신력 24[/color]',
    activationConditionTemplate: activationGuide('살아 있는 현재 대상이 필요합니다. 장착 무기와 관계없이 사용할 수 있습니다.'), activationMessage: '원소 속박!', baseMetadata: null,
    calculatedFields: {
        damage: context => attributeDamageTooltip(context, AttributeType.MAGIC_FORCE, 115, 10),
        bindDuration: context => levelValueTooltip(context, '속박 지속시간', 1.5, 0.2, '초'),
        projectileTravelTime: context => projectileTravelTimeTooltip(context, 'basic_magic_orb', true),
    },
    balance: {
        role: SkillBalanceRole.CONTROL, damageType: 'magic',
        calculateDamage: context => context.owner.attribute.get(AttributeType.MAGIC_FORCE) * percentByLevel(context.skill.level, 115, 10) / 100,
        calculateManaCost: () => 24,
        notes: ['속박의 가치는 적 패턴에 따라 달라 피해량에 임의 합산하지 않습니다.'],
    },
    calculateMaxCooldown: context => cooldownByLevel(context, 15, 0.75, 12),
    jobRequirement: jobRequirement(JOBS.mage),
    canActivate: simpleCheck(24), onStart: context => {
        spend(context, 24);
        projectileAttack(context, 'basic_magic_orb', percentByLevel(context.skill.level, 115, 10) / 100, [GameTags.PROPERTY_ICE], (_p, result) => {
            if (!result.evaded) _p.target.applyStatusEffect(STUN, valueByLevel(context.skill.level, 1.5, 0.2), context.skill.level);
        });
    }, tags: [GameTags.SKILL_ACTIVE, GameTags.SKILL_COMBAT],
});

defineSkill({
    id: 'elemental_insight', name: '원소 통찰', icon: 'skills/career_mage', maxLevel: 5,
    descriptionTemplate: '{{duration}} 동안 {{icon.magicForce}} 마법력이 [color=$magic]{{magicBonus}}[/color], {{icon.mentalityRegen}} 정신력 재생이 [color=purple]+{{regenBonus}}/초[/color] 증가합니다.',
    costTemplate: '{{icon.maxMentality}} [color=$magic]정신력 16[/color]',
    activationConditionTemplate: activationGuide('별도의 대상이나 무기가 필요하지 않습니다.'), activationMessage: '원소 통찰!', baseMetadata: null,
    activationFeedback: context => buffFeedback(
        context.skill.name,
        valueByLevel(context.skill.level, 12, 1),
        `마법력 +${formatNumber(percentByLevel(context.skill.level, 20, 4))}%, 정신력 재생 +${formatNumber(valueByLevel(context.skill.level, 2, 0.75))}/초`,
    ),
    calculatedFields: {
        duration: context => levelValueTooltip(context, '지속시간', 12, 1, '초'),
        magicBonus: context => levelValueTooltip(context, '마법력 증가', 20, 4, '%'),
        regenBonus: context => levelValueTooltip(context, '정신력 재생 증가', 2, 0.75),
    },
    balance: {
        role: SkillBalanceRole.SUPPORT, calculateManaCost: () => 16,
        notes: ['마법력·정신력 재생 증가는 지속형 효과라 단일 스킬 DPM에 임의 합산하지 않습니다.'],
    },
    calculateMaxCooldown: context => cooldownByLevel(context, 25, 1.25, 20),
    jobRequirement: jobRequirement(JOBS.mage), canActivate: simpleCheck(16, false),
    onStart: context => {
        spend(context, 16);
        context.owner.applyStatusEffect(ELEMENTAL_INSIGHT, valueByLevel(context.skill.level, 12, 1), context.skill.level);
    }, tags: [GameTags.SKILL_ACTIVE],
});

for (const elemental of [
    { id: 'fireball', name: '화염구', icon: 'affinities/fire', tag: GameTags.PROPERTY_FIRE, stat: 'career:mage_fire_kills', effect: StatusEffectType.FIRE, effectLabel: '화염', duration: 6, durationPerLevel: 1 },
    { id: 'frost_bolt', name: '빙결탄', icon: 'affinities/ice', tag: GameTags.PROPERTY_ICE, stat: 'career:mage_ice_kills', effect: STUN, effectLabel: '기절', duration: 2, durationPerLevel: 0.25 },
    { id: 'lightning_orb', name: '뇌전구', icon: 'affinities/electric', tag: GameTags.PROPERTY_ELECTRIC, stat: 'career:mage_electric_kills', effect: StatusEffectType.PARALYTIC_POISON, effectLabel: '마비독', duration: 5, durationPerLevel: 0.75 },
] as const) defineSkill({
    id: elemental.id, name: elemental.name, icon: elemental.icon, maxLevel: 5,
    descriptionTemplate: `${elemental.name}를 발사해 {{icon.magicForce}} [color=$magic]{{damage}}[/color]의 속성 마법 피해를 입히고 Lv.{{level}} ${elemental.effectLabel} 효과를 {{effectDuration}} 동안 부여합니다. ${PROJECTILE_CRITICAL_TEXT} ${PROJECTILE_FLIGHT_TEXT}`,
    costTemplate: '{{icon.maxMentality}} [color=$magic]정신력 28[/color]',
    activationConditionTemplate: activationGuide('살아 있는 현재 대상이 필요합니다. 장착 무기와 관계없이 사용할 수 있습니다.'),
    activationMessage: `${elemental.name}!`, baseMetadata: null,
    calculatedFields: {
        damage: context => attributeDamageTooltip(context, AttributeType.MAGIC_FORCE, 185, 15),
        effectDuration: context => levelValueTooltip(context, `${elemental.effectLabel} 지속시간`, elemental.duration, elemental.durationPerLevel, '초'),
        projectileTravelTime: context => projectileTravelTimeTooltip(context, 'basic_magic_orb', true),
    },
    balance: {
        role: SkillBalanceRole.DAMAGE, damageType: 'magic',
        calculateDamage: context => context.owner.attribute.get(AttributeType.MAGIC_FORCE) * percentByLevel(context.skill.level, 185, 15) / 100,
        calculateManaCost: () => 28,
        notes: [`${elemental.effectLabel} 효과는 대상 상태에 따라 달라 직접 타격 DPM과 분리합니다.`],
    },
    calculateMaxCooldown: context => cooldownByLevel(context, 9, 0.5, 7),
    jobRequirement: jobRequirement(JOBS.mage),
    autoAcquire: { watchedProgress: [elemental.stat], check: ({ player }) => Boolean(player?.career?.hasJob(JOBS.mage) && player.progress.getCounter(elemental.stat) >= 5n) },
    canActivate: simpleCheck(28), onStart: context => {
        spend(context, 28);
        projectileAttack(context, 'basic_magic_orb', percentByLevel(context.skill.level, 185, 15) / 100, [elemental.tag], (_p, result) => {
            if (!result.evaded) {
                _p.target.applyStatusEffect(
                    elemental.effect,
                    valueByLevel(context.skill.level, elemental.duration, elemental.durationPerLevel),
                    context.skill.level,
                );
            }
        });
    },
    tags: [GameTags.SKILL_ACTIVE, GameTags.SKILL_COMBAT, elemental.tag],
});

interface EliteTechniqueDefinition {
    id: string;
    name: string;
    jobId: string;
    icon: string;
    damageType: 'physical' | 'magic';
    attribute: AttributeType;
    secondaryAttribute?: AttributeType;
    basePercent: number;
    perLevelPercent: number;
    secondaryBasePercent?: number;
    secondaryPerLevelPercent?: number;
    manaCost: number;
    cooldown: number;
    /** 실제 무기를 휘두르거나 발사하는 기술에만 지정한다. 자체 생성 투사체·주문에는 생략한다. */
    weaponDescription?: string;
    weaponTags?: readonly TagId[];
    projectile?: 'basic_arrow' | 'magic_bolt';
    propertyTag?: TagId;
    guaranteedCritical?: boolean;
    unavoidable?: boolean;
    extraDescription?: string;
    onHit?: (target: Entity, level: number) => void;
    shieldPercent?: number;
}

const eliteTechniques: readonly EliteTechniqueDefinition[] = [
    {
        id: 'blade_ranger_technique', name: '질풍 추격', jobId: 'career:blade_ranger', icon: 'jobs/warrior',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 250, perLevelPercent: 15,
        manaCost: 24, cooldown: 10, weaponDescription: '검 또는 도끼를 장착해야 합니다.',
        weaponTags: [GameTags.WEAPON_SWORD, GameTags.WEAPON_AXE], unavoidable: true,
        extraDescription: '바람을 가르며 파고들어 이 공격은 회피할 수 없습니다.', propertyTag: GameTags.PROPERTY_NATURAL,
    },
    {
        id: 'shadow_blade_technique', name: '그림자 참수', jobId: 'career:shadow_blade', icon: 'jobs/warrior',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 225, perLevelPercent: 15,
        manaCost: 26, cooldown: 12, weaponDescription: '검 또는 단검을 장착해야 합니다.',
        weaponTags: [GameTags.WEAPON_SWORD, GameTags.WEAPON_DAGGER], guaranteedCritical: true,
        extraDescription: '그림자에서 급소를 베어 확정적으로 치명타가 발생합니다.', propertyTag: GameTags.PROPERTY_DARK,
    },
    {
        id: 'spellblade_technique', name: '마력 검파', jobId: 'career:spellblade', icon: 'jobs/warrior',
        damageType: 'magic', attribute: AttributeType.MAGIC_FORCE, basePercent: 255, perLevelPercent: 16,
        secondaryAttribute: AttributeType.ATK, secondaryBasePercent: 120, secondaryPerLevelPercent: 8,
        manaCost: 30, cooldown: 11, weaponDescription: '검을 장착해야 합니다.',
        weaponTags: [GameTags.WEAPON_SWORD],
        extraDescription: '칼날에 실은 마력을 폭발시켜 마법 피해를 입힙니다.',
    },
    {
        id: 'siege_bow_technique', name: '성벽 관통사격', jobId: 'career:siege_bow', icon: 'jobs/archer',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 310, perLevelPercent: 18,
        manaCost: 28, cooldown: 15, weaponDescription: '활을 장착해야 합니다.', weaponTags: [GameTags.WEAPON_BOW],
        projectile: 'basic_arrow', extraDescription: '무거운 한 발로 큰 피해를 입힙니다.', propertyTag: GameTags.PROPERTY_METAL,
    },
    {
        id: 'night_hunter_technique', name: '월영 사격', jobId: 'career:night_hunter', icon: 'jobs/archer',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 235, perLevelPercent: 15,
        manaCost: 24, cooldown: 10, weaponDescription: '활을 장착해야 합니다.', weaponTags: [GameTags.WEAPON_BOW],
        projectile: 'basic_arrow', guaranteedCritical: true,
        extraDescription: '달빛 아래 급소를 겨냥해 확정적으로 치명타가 발생합니다.', propertyTag: GameTags.PROPERTY_DARK,
    },
    {
        id: 'elemental_marksman_technique', name: '뇌광 관통화살', jobId: 'career:elemental_marksman', icon: 'jobs/archer',
        damageType: 'magic', attribute: AttributeType.MAGIC_FORCE, basePercent: 270, perLevelPercent: 17,
        secondaryAttribute: AttributeType.ATK, secondaryBasePercent: 100, secondaryPerLevelPercent: 6,
        manaCost: 32, cooldown: 12, weaponDescription: '활을 장착해야 합니다.', weaponTags: [GameTags.WEAPON_BOW],
        projectile: 'magic_bolt', propertyTag: GameTags.PROPERTY_ELECTRIC,
        extraDescription: '적중 시 같은 레벨의 마비독을 4초 동안 부여합니다.',
        onHit: (target, level) => target.applyStatusEffect(StatusEffectType.PARALYTIC_POISON, 4, level),
    },
    {
        id: 'executioner_technique', name: '최후 집행', jobId: 'career:executioner', icon: 'jobs/assassin',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 300, perLevelPercent: 18,
        manaCost: 28, cooldown: 14, weaponDescription: '도끼 또는 단검을 장착해야 합니다.',
        weaponTags: [GameTags.WEAPON_AXE, GameTags.WEAPON_DAGGER], unavoidable: true,
        extraDescription: '도망칠 틈을 주지 않는 집행으로 이 공격은 회피할 수 없습니다.',
    },
    {
        id: 'phantom_shooter_technique', name: '환영 추적탄', jobId: 'career:phantom_shooter', icon: 'jobs/assassin',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 250, perLevelPercent: 16,
        manaCost: 25, cooldown: 11, projectile: 'basic_arrow',
        extraDescription: '장착 무기와 관계없이 환영 단검을 투척해 적의 움직임을 추적합니다.', propertyTag: GameTags.PROPERTY_DARK,
    },
    {
        id: 'arcane_reaper_technique', name: '비전 수확', jobId: 'career:arcane_reaper', icon: 'jobs/assassin',
        damageType: 'magic', attribute: AttributeType.MAGIC_FORCE, basePercent: 275, perLevelPercent: 17,
        secondaryAttribute: AttributeType.ATK, secondaryBasePercent: 100, secondaryPerLevelPercent: 6,
        manaCost: 30, cooldown: 12, propertyTag: GameTags.PROPERTY_POISON,
        extraDescription: '적중 시 같은 레벨의 맹독을 6초 동안 부여합니다.',
        onHit: (target, level) => target.applyStatusEffect(StatusEffectType.DEADLY_POISON, 6, level),
    },
    {
        id: 'battle_magus_technique', name: '마력갑 돌진', jobId: 'career:battle_magus', icon: 'jobs/mage',
        damageType: 'magic', attribute: AttributeType.MAGIC_FORCE, basePercent: 225, perLevelPercent: 14,
        manaCost: 30, cooldown: 13, shieldPercent: 12,
        extraDescription: '공격 후 최대 생명력의 12%만큼 일반 보호막을 8초 동안 얻습니다.',
    },
    {
        id: 'star_weaver_technique', name: '낙성', jobId: 'career:star_weaver', icon: 'jobs/mage',
        damageType: 'magic', attribute: AttributeType.MAGIC_FORCE, basePercent: 315, perLevelPercent: 18,
        manaCost: 34, cooldown: 15, projectile: 'magic_bolt', propertyTag: GameTags.PROPERTY_LIGHT,
        extraDescription: '별빛을 낙하시켜 강한 빛 속성 마법 피해를 입힙니다.',
    },
    {
        id: 'hexblade_technique', name: '저주 각인', jobId: 'career:hexblade', icon: 'jobs/mage',
        damageType: 'magic', attribute: AttributeType.MAGIC_FORCE, basePercent: 245, perLevelPercent: 16,
        manaCost: 29, cooldown: 11, propertyTag: GameTags.PROPERTY_DARK,
        extraDescription: '적중 시 같은 레벨의 마비독을 3초 동안 부여합니다.',
        onHit: (target, level) => target.applyStatusEffect(StatusEffectType.PARALYTIC_POISON, 3, level),
    },
    {
        id: 'weapon_master_technique', name: '완성의 일격', jobId: 'career:weapon_master', icon: 'jobs/warrior',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 305, perLevelPercent: 18,
        manaCost: 28, cooldown: 13, weaponDescription: '검 또는 도끼를 장착해야 합니다.',
        weaponTags: [GameTags.WEAPON_SWORD, GameTags.WEAPON_AXE], unavoidable: true,
        extraDescription: '무기의 무게 중심을 완전히 제어해 이 공격은 회피할 수 없습니다.', propertyTag: GameTags.PROPERTY_METAL,
    },
    {
        id: 'machinist_archer_technique', name: '철우 연사', jobId: 'career:machinist_archer', icon: 'jobs/archer',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 285, perLevelPercent: 17,
        manaCost: 27, cooldown: 12, weaponDescription: '활을 장착해야 합니다.', weaponTags: [GameTags.WEAPON_BOW],
        projectile: 'basic_arrow', propertyTag: GameTags.PROPERTY_METAL,
        extraDescription: '정밀 가공한 금속 화살을 고속으로 발사합니다.',
    },
    {
        id: 'steel_shadow_technique', name: '톱날 급습', jobId: 'career:steel_shadow', icon: 'jobs/assassin',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 255, perLevelPercent: 16,
        manaCost: 25, cooldown: 11, weaponDescription: '단검 또는 검을 장착해야 합니다.',
        weaponTags: [GameTags.WEAPON_DAGGER, GameTags.WEAPON_SWORD], guaranteedCritical: true,
        extraDescription: '연마한 날로 급소를 파고들어 확정적으로 치명타가 발생합니다.', propertyTag: GameTags.PROPERTY_METAL,
    },
    {
        id: 'runeforger_technique', name: '폭발 룬', jobId: 'career:runeforger', icon: 'jobs/mage',
        damageType: 'magic', attribute: AttributeType.MAGIC_FORCE, basePercent: 300, perLevelPercent: 18,
        manaCost: 34, cooldown: 14,
        projectile: 'magic_bolt', propertyTag: GameTags.PROPERTY_FIRE,
        extraDescription: '금속에 새긴 룬을 폭발시켜 불 속성 마법 피해를 입힙니다.',
    },
    {
        id: 'battle_smith_technique', name: '모루 강타', jobId: 'career:battle_smith', icon: 'items/iron_pickaxe',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 330, perLevelPercent: 19,
        manaCost: 30, cooldown: 15, weaponDescription: '도끼 또는 검을 장착해야 합니다.',
        weaponTags: [GameTags.WEAPON_AXE, GameTags.WEAPON_SWORD], unavoidable: true,
        extraDescription: '모루를 내리치듯 무겁게 찍어 이 공격은 회피할 수 없습니다.', propertyTag: GameTags.PROPERTY_METAL,
    },
    {
        id: 'artificer_technique', name: '자동 추적탄', jobId: 'career:artificer', icon: 'items/iron_pickaxe',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 275, perLevelPercent: 17,
        manaCost: 27, cooldown: 11,
        projectile: 'basic_arrow', propertyTag: GameTags.PROPERTY_ELECTRIC,
        extraDescription: '기계식 유도 장치가 달린 전기 속성 탄환을 발사합니다.',
    },
    {
        id: 'venom_smith_technique', name: '독금 천공', jobId: 'career:venom_smith', icon: 'items/iron_pickaxe',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 250, perLevelPercent: 16,
        manaCost: 26, cooldown: 12, weaponDescription: '단검을 장착해야 합니다.', weaponTags: [GameTags.WEAPON_DAGGER],
        propertyTag: GameTags.PROPERTY_POISON,
        extraDescription: '적중 시 같은 레벨의 맹독을 7초 동안 부여합니다.',
        onHit: (target, level) => target.applyStatusEffect(StatusEffectType.DEADLY_POISON, 7, level),
    },
    {
        id: 'arcane_smith_technique', name: '마도 용융탄', jobId: 'career:arcane_smith', icon: 'items/iron_pickaxe',
        damageType: 'magic', attribute: AttributeType.MAGIC_FORCE, basePercent: 310, perLevelPercent: 18,
        manaCost: 35, cooldown: 14,
        projectile: 'magic_bolt', propertyTag: GameTags.PROPERTY_FIRE, shieldPercent: 10,
        extraDescription: '용융 마력을 발사하고 공격 후 최대 생명력의 10%만큼 일반 보호막을 8초 동안 얻습니다.',
    },
];

function eliteTechniqueDamage(context: SkillContext, technique: EliteTechniqueDefinition): number {
    const primary = context.owner.attribute.get(technique.attribute)
        * percentByLevel(context.skill.level, technique.basePercent, technique.perLevelPercent) / 100;
    if (!technique.secondaryAttribute) return primary;
    return primary + context.owner.attribute.get(technique.secondaryAttribute)
        * percentByLevel(
            context.skill.level,
            technique.secondaryBasePercent ?? 0,
            technique.secondaryPerLevelPercent ?? 0,
        ) / 100;
}

function eliteTechniqueDamageTooltip(context: SkillContext, technique: EliteTechniqueDefinition): string {
    const damage = eliteTechniqueDamage(context, technique);
    const primaryPercent = percentByLevel(context.skill.level, technique.basePercent, technique.perLevelPercent);
    const secondary = technique.secondaryAttribute
        ? ` + ${technique.secondaryAttribute.label} × ${formatNumber(percentByLevel(context.skill.level, technique.secondaryBasePercent ?? 0, technique.secondaryPerLevelPercent ?? 0))}%`
        : '';
    return tooltipValue(damage, `${technique.attribute.label} × ${formatNumber(primaryPercent)}%${secondary}`);
}

for (const technique of eliteTechniques) {
    // TODO: 엘리트 전용 스킬 아트로 교체. 1차 구현에서는 주계열 직업 아이콘을 사용한다.
    defineSkill({
        id: technique.id,
        name: technique.name,
        icon: technique.icon,
        maxLevel: 5,
        descriptionTemplate: `현재 대상에게 {{icon.${technique.attribute.key}}} [color=${technique.damageType === 'magic' ? '$magic' : 'orange'}]{{damage}}[/color]의 ${technique.damageType === 'magic' ? '마법' : '물리'} 피해를 입힙니다. ${technique.extraDescription ?? ''}${technique.projectile ? ` ${PROJECTILE_FLIGHT_TEXT}` : ''}`,
        costTemplate: `{{icon.maxMentality}} [color=$magic]정신력 ${technique.manaCost}[/color]`,
        activationConditionTemplate: activationGuide(
            `${technique.weaponDescription ? `${technique.weaponDescription} ` : '장착 무기와 관계없이 '}살아 있는 현재 대상이 필요합니다.`,
        ),
        activationMessage: `${technique.name}!`,
        baseMetadata: null,
        calculatedFields: {
            damage: context => eliteTechniqueDamageTooltip(context, technique),
            ...(technique.projectile ? {
                projectileTravelTime: (context: SkillContext) => projectileTravelTimeTooltip(
                    context,
                    technique.projectile!,
                    technique.damageType === 'magic',
                ),
            } : {}),
        },
        balance: {
            role: technique.onHit ? SkillBalanceRole.CONTROL : technique.shieldPercent ? SkillBalanceRole.DEFENSE : SkillBalanceRole.DAMAGE,
            damageType: technique.damageType,
            calculateDamage: context => eliteTechniqueDamage(context, technique),
            criticalMode: technique.guaranteedCritical ? SkillCriticalMode.GUARANTEED : SkillCriticalMode.NORMAL,
            calculateManaCost: () => technique.manaCost,
            calculateShield: technique.shieldPercent
                ? context => context.owner.maxLife * technique.shieldPercent! / 100
                : undefined,
            notes: technique.onHit ? ['상태효과의 가치는 대상과 패턴에 따라 달라 직접 피해와 분리합니다.'] : undefined,
        },
        calculateMaxCooldown: () => technique.cooldown,
        jobRequirement: jobRequirement(technique.jobId),
        ...(technique.weaponDescription && technique.weaponTags?.length ? {
            weaponRequirement: weaponRequirement(technique.weaponDescription, ...technique.weaponTags),
        } : {}),
        canActivate: simpleCheck(technique.manaCost),
        onStart: context => {
            const found = targetOrDeny(context);
            if ('reason' in found) throw new Error(found.reason);
            spend(context, technique.manaCost);
            const multiplier = percentByLevel(context.skill.level, technique.basePercent, technique.perLevelPercent) / 100;
            const damage = eliteTechniqueDamage(context, technique);
            if (technique.projectile) {
                projectileAttack(
                    context,
                    technique.projectile,
                    multiplier,
                    technique.propertyTag ? [technique.propertyTag] : undefined,
                    (_projectile, result) => {
                        if (!result.evaded && result.finalDamage > 0) technique.onHit?.(_projectile.target, context.skill.level);
                    },
                    {
                        ...(technique.secondaryAttribute ? { damage } : {}),
                        ...(technique.guaranteedCritical ? { attributeOverrides: { critRate: 1 } } : {}),
                    },
                );
            } else {
                const result = context.owner.attack(found.target, technique.damageType,
                    damage, {
                        criticalRate: technique.guaranteedCritical ? 1 : undefined,
                        unavoidable: technique.unavoidable,
                        consumeMainHandDurability: Boolean(technique.weaponTags?.length),
                    });
                if (!result) throw new Error(`${technique.name} 공격이 확정되지 않았습니다.`);
                if (!result.evaded && result.finalDamage > 0) technique.onHit?.(found.target, context.skill.level);
            }
            if (technique.shieldPercent) {
                context.owner.setShield(
                    `skill:${technique.id}`,
                    context.owner.maxLife * technique.shieldPercent / 100,
                    ShieldType.GENERAL,
                    8,
                    context.owner,
                );
            }
        },
        tags: [GameTags.SKILL_ACTIVE, GameTags.SKILL_COMBAT, ...(technique.propertyTag ? [technique.propertyTag] : [])],
    });
}

function seismicManaCost(context: SkillContext): number {
    if (!context.player) return 0;
    return Math.max(0, Math.round(
        numberMeta(context, 'baseManaCost')
        + (context.skill.level - 1) * numberMeta(context, 'manaCostPerLevel'),
    ));
}

function seismicDamage(context: SkillContext): number {
    const multiplier = numberMeta(context, 'baseDamageMultiplier')
        + (context.skill.level - 1) * numberMeta(context, 'damageMultiplierPerLevel');
    return context.owner.attribute.get(AttributeType.MAGIC_FORCE) * multiplier;
}

defineSkill({
    id: 'seismic_crush',
    name: '지각 붕괴',
    icon: 'skills/seismic_crush',
    aliases: ['seismiccrush'],
    maxLevel: 5,
    descriptionTemplate:
        '[color=gold]{{castTime}}초[/color] 동안 지면의 힘을 모은 뒤 현재 대상에게 '
        + '{{icon.magicForce}} [color=$magic]{{damage}}의 마법 피해[/color]를 입힙니다. '
        + '적중 시 [color=violet]{{paralysisChance}}% 확률[/color]로 마비독을 부여합니다.',
    costTemplate: '{{icon.maxMentality}} [color=$magic]정신력 {{manaCost}}[/color]',
    activationConditionTemplate:
        '살아 있는 현재 대상과 공격 가능 상태가 필요합니다. 시전 중에는 다른 공격을 하지 않습니다.',
    activationMessage: '지각 붕괴!',
    baseMetadata: {
        baseManaCost: 32,
        manaCostPerLevel: 3,
        baseDamageMultiplier: 1.45,
        damageMultiplierPerLevel: 0.15,
        castTime: 1.8,
        baseCooldown: 12,
        cooldownReductionPerLevel: 0.6,
        paralysisChance: 30,
        paralysisDuration: 3,
    },
    calculatedFields: {
        manaCost: seismicManaCost,
        damage: seismicDamage,
        castTime: context => numberMeta(context, 'castTime'),
        paralysisChance: context => numberMeta(context, 'paralysisChance'),
    },
    balance: {
        role: SkillBalanceRole.CONTROL,
        damageType: 'magic',
        calculateDamage: seismicDamage,
        calculateManaCost: context => Math.max(0, Math.round(
            numberMeta(context, 'baseManaCost')
            + (context.skill.level - 1) * numberMeta(context, 'manaCostPerLevel'),
        )),
        notes: ['마비독 부여 기대값은 대상 생명체 여부와 확률에 의존해 직접 타격 DPM과 분리합니다.'],
    },
    calculateMaxCooldown: context => Math.max(
        5,
        numberMeta(context, 'baseCooldown')
            - (context.skill.level - 1) * numberMeta(context, 'cooldownReductionPerLevel'),
    ),
    canActivate: context => {
        const target = context.owner.currentTarget;
        if (!target) return denySkill('먼저 대상을 지정해야 합니다.');
        if (target.locationId !== context.owner.locationId) return denySkill('현재 대상이 같은 장소에 없습니다.');
        if (target.isDefeated) return denySkill(`이미 ${target.defeatLabel} 상태인 대상입니다.`);
        if (context.owner.attackCooldown > 0) {
            return denySkill(`공격 대기시간이 ${context.owner.attackCooldown.toFixed(1)}초 남았습니다.`);
        }
        const attackDenied = target.getAttackDeniedReason(context.owner.attackOwner);
        if (attackDenied) return denySkill(attackDenied);
        const cost = seismicManaCost(context);
        if (context.player && !context.player.canSpendMentality(cost)) {
            return denySkill(`정신력이 부족합니다. (${context.player.mentality.toFixed(1)} / ${cost})`);
        }
        return { accepted: true };
    },
    onStart: context => {
        const cost = seismicManaCost(context);
        if (context.player && !context.player.spendMentality(cost)) {
            throw new Error('지각 붕괴 정신력 소모에 실패했습니다.');
        }
        const castTime = numberMeta(context, 'castTime');
        sendNotificationFiltered(
            userId => isOnlinePlayerAtLocation(userId, context.owner.locationId),
            {
                key: `skill-telegraph:${context.owner.name}:seismic-crush`,
                message: `${context.owner.name}이(가) 지각 붕괴를 준비합니다! (${castTime.toFixed(1)}초)`,
                length: castTime * 1000,
            },
        );
        return { duration: castTime, state: { released: false } };
    },
    onUpdate: context => {
        const castTime = numberMeta(context, 'castTime');
        if (context.elapsed < castTime || context.skill.getActiveState<boolean>('released')) return 'continue';
        context.skill.setActiveState('released', true);
        const target = context.owner.currentTarget;
        if (!target || target.isDefeated || target.locationId !== context.owner.locationId) return 'finish';
        const result = context.owner.attack(target, 'magic', seismicDamage(context), {
            consumeMainHandDurability: false,
        });
        if (result && !result.evaded
            && Math.random() < numberMeta(context, 'paralysisChance') / 100) {
            target.applyStatusEffect(
                StatusEffectType.PARALYTIC_POISON,
                numberMeta(context, 'paralysisDuration'),
                Math.max(1, context.skill.level),
            );
        }
        return 'finish';
    },
    tags: [GameTags.SKILL_ACTIVE, GameTags.SKILL_COMBAT],
});

// TODO(icons): 철근 심장수호자 전용 아이콘 제작 전까지 지각 붕괴 fallback을 공유한다.
defineSkill({
    id: 'ironroot_lockdown',
    name: '철근 압살',
    icon: 'skills/seismic_crush',
    aliases: ['ironrootlockdown'],
    maxLevel: 5,
    descriptionTemplate:
        '[color=gold]{{castTime}}초[/color] 동안 현재 위협 대상을 고정한 뒤 '
        + '회피할 수 없고 방어력을 무시하는 [color=red]최대 생명력 비례 고정 피해[/color]를 입힙니다. '
        + '적중한 대상은 [color=violet]{{controlDuration}}초 동안 제압[/color]됩니다.',
    costTemplate: '소모값 없음',
    activationConditionTemplate: '살아 있는 현재 대상이 필요합니다. 몬스터 전용 스킬입니다.',
    activationMessage: '철근 압살!',
    baseMetadata: {
        castTime: 1.4,
        fixedLifeRatio: 0.25,
        magicForceMultiplier: 1.2,
        controlDuration: 3,
        baseCooldown: 8,
    },
    calculatedFields: {
        castTime: context => numberMeta(context, 'castTime'),
        controlDuration: context => numberMeta(context, 'controlDuration'),
    },
    calculateMaxCooldown: context => numberMeta(context, 'baseCooldown'),
    canActivate: context => {
        if (context.player) return denySkill('철근 심장수호자만 사용할 수 있는 스킬입니다.');
        const target = context.owner.currentTarget;
        if (!target) return denySkill('현재 위협 대상이 없습니다.');
        if (target.locationId !== context.owner.locationId || target.isDefeated) {
            return denySkill('현재 위협 대상을 공격할 수 없습니다.');
        }
        const attackDenied = target.getAttackDeniedReason(context.owner.attackOwner);
        return attackDenied ? denySkill(attackDenied) : { accepted: true };
    },
    onStart: context => {
        const castTime = numberMeta(context, 'castTime');
        sendNotificationFiltered(
            userId => isOnlinePlayerAtLocation(userId, context.owner.locationId),
            {
                key: `skill-telegraph:${context.owner.name}:ironroot-lockdown`,
                message: `${context.owner.name}이(가) 한 명을 철근으로 고정합니다! (${castTime.toFixed(1)}초)`,
                length: castTime * 1_000,
            },
        );
        return { duration: castTime, state: { released: false } };
    },
    onUpdate: context => {
        const castTime = numberMeta(context, 'castTime');
        if (context.elapsed < castTime || context.skill.getActiveState<boolean>('released')) return 'continue';
        context.skill.setActiveState('released', true);
        const target = context.owner.currentTarget;
        if (!target || target.isDefeated || target.locationId !== context.owner.locationId) return 'finish';
        const fixedDamage = Math.max(
            target.maxLife * numberMeta(context, 'fixedLifeRatio'),
            context.owner.attribute.get(AttributeType.MAGIC_FORCE) * numberMeta(context, 'magicForceMultiplier'),
        );
        const result = context.owner.attack(target, 'magic', fixedDamage, {
            unavoidable: true,
            fixedDamage: true,
            consumeMainHandDurability: false,
            triggerMainHandHitEffects: false,
        });
        if (result) {
            target.applyStatusEffect(
                LegacyStatusEffects.OVERMASTER,
                numberMeta(context, 'controlDuration'),
                Math.max(1, context.skill.level * 2),
            );
        }
        return 'finish';
    },
    tags: [
        GameTags.SKILL_ACTIVE, GameTags.SKILL_COMBAT,
        GameTags.PROPERTY_EARTH, GameTags.PROPERTY_METAL,
    ],
});
