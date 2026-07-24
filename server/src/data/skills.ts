import { AttributeType } from '../models/Attribute.js';
import type { AttributeModifier } from '../models/Attribute.js';
import {
    defineSkill,
    defineSkillTagDisplay,
    denySkill,
    SkillBalanceRole,
    SkillCriticalMode,
} from '../models/Skill.js';
import type { SkillContext } from '../models/Skill.js';
import type Player from '../models/Player.js';
import { StatusEffectType } from '../models/StatusEffect.js';
import {
    sendBotMessageToUsers,
    sendNotificationToUsers,
} from '../modules/message.js';
import { getOnlinePlayerUserIdsAtLocation } from '../modules/playerRegistry.js';
import { chat } from '../utils/chatBuilder.js';
import { GameTags } from '../../../shared/tags.js';
import type { TagId } from '../../../shared/tags.js';
import {
    calculateProjectileAcceleration,
    calculateProjectileEvasionSpeed,
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
import { calculateSmeltingExperience } from '../modules/forging.js';
import {
    FORGED_ITEM_NAMING_SENSIBILITY,
    MAX_WEAPON_REINFORCEMENT,
    STAFF_INFUSION_MENTALITY_COST,
} from '../models/Forging.js';

const CRITICAL_HIT_STAT = 'combat:critical_hits';

defineSkillTagDisplay(GameTags.SKILL_GROUP_WARRIOR, '전사 기술', 'skills/career_warrior');
defineSkillTagDisplay(GameTags.SKILL_GROUP_ARCHER, '궁술', 'skills/career_archer');
defineSkillTagDisplay(GameTags.SKILL_GROUP_ASSASSIN, '암살 기술', 'skills/career_assassin');
defineSkillTagDisplay(GameTags.SKILL_GROUP_MAGIC, '마법', 'skills/career_mage');
// TODO(icons): 대장장이 직업 전용 아이콘 제작 전까지 금속 단조 아이콘을 사용한다.
defineSkillTagDisplay(GameTags.SKILL_GROUP_BLACKSMITH, '단조 기술', 'skills/metal_forging');
defineSkillTagDisplay(GameTags.SKILL_GROUP_FIRE, '화염 계열', 'affinities/fire');
defineSkillTagDisplay(GameTags.SKILL_GROUP_ICE, '빙결 계열', 'affinities/ice');
defineSkillTagDisplay(GameTags.SKILL_GROUP_ELECTRIC, '전격 계열', 'affinities/electric');

const CAREER_SHARED_COOLDOWN_SECONDS = 0.75;
const MAGIC_SHARED_COOLDOWN_SECONDS = 0.5;
/** 이동속도는 공격력보다 단위가 작으므로 피해 계수에서만 이 비율로 전투력 단위를 맞춘다. */
const MOBILITY_DAMAGE_SCALE = 40;
const ELEMENT_SHARED_COOLDOWN_SECONDS = 1;

function careerSharedCooldown(targetTag: TagId, seconds = CAREER_SHARED_COOLDOWN_SECONDS) {
    return [{ targetTag, seconds }] as const;
}

function elementalSkillGroup(tag?: TagId): TagId | undefined {
    if (tag === GameTags.PROPERTY_FIRE) return GameTags.SKILL_GROUP_FIRE;
    if (tag === GameTags.PROPERTY_ICE) return GameTags.SKILL_GROUP_ICE;
    if (tag === GameTags.PROPERTY_ELECTRIC) return GameTags.SKILL_GROUP_ELECTRIC;
    return undefined;
}

function combatSkillGroups(primary: TagId, propertyTag?: TagId): TagId[] {
    const elemental = elementalSkillGroup(propertyTag);
    return elemental ? [primary, elemental] : [primary];
}

function combatSharedCooldowns(primary: TagId, propertyTag?: TagId) {
    const elemental = elementalSkillGroup(propertyTag);
    return [
        { targetTag: primary, seconds: primary === GameTags.SKILL_GROUP_MAGIC
            ? MAGIC_SHARED_COOLDOWN_SECONDS : CAREER_SHARED_COOLDOWN_SECONDS },
        ...(elemental ? [{ targetTag: elemental, seconds: ELEMENT_SHARED_COOLDOWN_SECONDS }] : []),
    ];
}

function numberMeta(context: SkillContext, key: string): number {
    const value = context.skill.getMetadata(key);
    if (typeof value !== 'number') throw new Error(`${context.skill.name} metadata가 숫자가 아닙니다: ${key}`);
    return value;
}

function announceMonsterSkill(
    context: SkillContext,
    skillId: string,
    skillName: string,
    castTime: number,
    preview?: string,
): void {
    if (context.player) return;
    const audience = getOnlinePlayerUserIdsAtLocation(context.owner.locationId);
    if (audience.length === 0) return;
    const message = `${context.owner.name}이(가) ${skillName}을(를) 준비합니다! (${formatNumber(castTime)}초)`;
    sendNotificationToUsers(audience, {
        key: `boss-skill:${context.owner.name}:${skillId}`,
        message,
        length: castTime * 1_000,
    });
    const record = chat()
        .color('red', builder => builder.weight('bold', nested => nested.text('[ 전투 예고 ]')))
        .text(` ${context.owner.name} · `)
        .color('gold', builder => builder.weight('bold', nested => nested.text(skillName)))
        .text(` (${formatNumber(castTime)}초)`);
    if (preview) record.text('\n').color('gray', builder => builder.text(preview));
    sendBotMessageToUsers(audience, record.build());
}

function recordMonsterSkillResult(context: SkillContext, skillName: string, comment: string): void {
    if (context.player) return;
    const audience = getOnlinePlayerUserIdsAtLocation(context.owner.locationId);
    if (audience.length === 0) return;
    sendBotMessageToUsers(audience, chat()
        .color('gold', builder => builder.weight('bold', nested => nested.text(`[ ${skillName} ]`)))
        .text(` ${comment}`)
        .build());
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

interface AttributeDamageTerm {
    readonly attribute: AttributeType;
    readonly basePercent: number;
    readonly perLevelPercent: number;
    readonly scale?: number;
}

function attributeTermValue(context: SkillContext, term: AttributeDamageTerm): number {
    return context.owner.attribute.get(term.attribute) * (term.scale ?? 1);
}

function combinedAttributeDamage(context: SkillContext, terms: readonly AttributeDamageTerm[]): number {
    return terms.reduce((sum, term) => sum + attributeTermValue(context, term)
        * percentByLevel(context.skill.level, term.basePercent, term.perLevelPercent) / 100, 0);
}

function combinedAttributeDamageFormula(context: SkillContext, terms: readonly AttributeDamageTerm[]): string {
    return terms.map(term => {
        const percent = percentByLevel(context.skill.level, term.basePercent, term.perLevelPercent);
        const scale = term.scale && term.scale !== 1 ? ` × ${formatNumber(term.scale)}` : '';
        return `${term.attribute.label}${scale} × ${formatNumber(percent)}%`;
    }).join(' + ');
}

function combinedAttributeDamageTooltip(context: SkillContext, terms: readonly AttributeDamageTerm[]): string {
    return tooltipValue(
        combinedAttributeDamage(context, terms),
        combinedAttributeDamageFormula(context, terms),
    );
}

function cooldownByLevel(context: SkillContext, base: number, perLevelReduction: number, minimum: number): number {
    return Math.max(minimum, base - Math.max(0, context.skill.level - 1) * perLevelReduction);
}

function manaBarrierShieldAmount(context: SkillContext): number {
    return valueByLevel(context.skill.level, 45, 15)
        + context.owner.attribute.get(AttributeType.MAGIC_FORCE) * 0.65
        + context.owner.maxLife * 0.04;
}

function activationGuide(preparation = ''): string {
    const prefix = preparation.trim().replace(/[.]+$/, '');
    return `${prefix ? `${prefix} ` : ''}\`/스킬 {{name}}\` 또는 채팅에 [color=gold]{{name}}![/color]를 입력해 발동합니다.`;
}

function targetActivationGuide(weaponRequirement?: string): string {
    const equipment = weaponRequirement
        ? weaponRequirement.trim().replace(/장착해야 합니다\.?$/, '장착한 뒤')
        : '';
    return activationGuide(`대상을 지정하고${equipment ? ` ${equipment}` : ''}`);
}

function penetrationLabel(attribute: AttributeType): string {
    return attribute === AttributeType.MAGIC_PEN ? '마법 관통력' : '물리 관통력';
}

function buffFeedback(name: string, duration: number, effects: string): string {
    return `${name} 발동! ${effects} (${formatNumber(duration)}초)`;
}

const PROJECTILE_CRITICAL_TEXT = '이 투사체에는 시전자의 {{icon.critRate}} 치명타 확률과 {{icon.critDmg}} 치명타 피해가 적용됩니다.';
const PROJECTILE_FLIGHT_TEXT = '{{icon.projectileAcceleration}} 대상에게 도달하기까지 [color=cyan]{{projectileTravelTime}}[/color]가 걸립니다.';

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

/** 런타임 Projectile과 같은 계산으로 밸런스 진단용 회피 판정 속도를 구한다. */
function projectileEvasionAttackSpeed(context: SkillContext, dataId: string, magicSkill: boolean): number {
    const data = getProjectileData(dataId);
    if (!data) return context.owner.getEvasionAttackSpeed();
    const multiplier = magicSkill ? magicSkillAccelerationMultiplier(context) : 1;
    return calculateProjectileEvasionSpeed(calculateProjectileAcceleration(
        context.owner,
        data.accelerationCoefficient,
        multiplier,
    ));
}

defineSkill({
    id: 'power_strike',
    name: '강타',
    icon: 'skills/power_strike',
    aliases: ['powerstrike'],
    maxLevel: 5,
    descriptionTemplate:
        '힘을 모아 지정한 대상을 강하게 내리칩니다. 이 공격은 [color=gold]반드시 치명타로 적중[/color]하며, '
        + '공격 직전에 {{icon.armorPen}} 물리 관통력이 일회성으로 [color=orange]+{{armorPenFlat}}[/color] 및 '
        + '[color=orange]+{{armorPenPercent}}%[/color] 증가하고, '
        + '{{icon.atk}}{{icon.critDmg}} [color=orange]{{damage}}[/color]의 물리 피해를 입힙니다.',
    costTemplate:
        '{{icon.maxMentality}} [color=$magic]정신력 {{manaCost}}[/color]',
    activationConditionTemplate: targetActivationGuide('검, 도끼, 단검 또는 곡괭이를 장착해야 합니다.'),
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
    weaponRequirement: weaponRequirement(
        '강타는 검, 도끼, 단검 또는 곡괭이를 장착해야 사용할 수 있습니다.',
        GameTags.WEAPON_SWORD,
        GameTags.WEAPON_AXE,
        GameTags.WEAPON_DAGGER,
        GameTags.TOOL_MINING,
    ),
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
    { attribute: AttributeType.MAGIC_FORCE, op: 'multiply', value: level => 1 + percentByLevel(level, 12, 2) / 100 },
    { attribute: AttributeType.MENTALITY_REGEN, op: 'add', value: level => valueByLevel(level, 2, 0.75) },
]);

const STUN = LegacyStatusEffects.STUN;

const WIND_EVASION = StatusEffectType.define({
    id: 'wind_evasion', label: '바람 회피', icon: 'skills/career_archer',
    descriptionTemplate: '이동할 수 있는 동안 받는 공격을 확정적으로 회피합니다.',
    onStart: ({ target, effect }) => target.grantGuaranteedEvasion(`status:${effect.type.id}`),
    onEarlyUpdate: ({ target, effect }) => target.grantGuaranteedEvasion(`status:${effect.type.id}`),
    onRemove: ({ target, effect }) => { target.removeGuaranteedEvasion(`status:${effect.type.id}`); },
    aliases: ['바람 회피'], tags: [GameTags.PROPERTY_NATURAL],
});

const STEALTH = StatusEffectType.define({
    id: 'stealth', label: '은신', icon: 'skills/career_assassin',
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
        id, label, icon: id === 'mana_barrier' || id === 'elemental_insight' ? 'skills/career_mage' : 'skills/career_warrior', descriptionTemplate: description,
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

/** 직업의 상시 효과를 일반 스킬과 같은 공개 API로 정의한다. */
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
        icon: `skills/${options.id}`,
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
    description: '{{icon.critDmg}} 치명타 피해가 [color=orange]{{critDmg}}[/color], {{icon.armorPen}} 물리 관통력이 [color=orange]{{armorPen}}[/color] 증가합니다.',
    modifiers: [
        { attribute: AttributeType.CRIT_DMG.key, op: 'add', value: 0.18, label: '치명타 피해 증가', display: '+18%p' },
        { attribute: AttributeType.ARMOR_PEN.key, op: 'add', value: 4, label: '물리 관통력 증가', display: '+4' },
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
    description: '{{icon.maxWeight}} 최대 중량이 [color=gold]{{maxWeight}}[/color], {{icon.maxLife}} 최대 생명력이 [color=green]{{maxLife}}[/color], {{icon.critDmg}} 치명타 피해가 [color=orange]{{critDmg}}[/color] 증가합니다.',
    modifiers: [
        { attribute: AttributeType.MAX_WEIGHT.key, op: 'add', value: 10, label: '최대 중량 증가', display: '+10' },
        { attribute: AttributeType.MAX_LIFE.key, op: 'multiply', value: 1.08, label: '최대 생명력 증가', display: '+8%' },
        { attribute: AttributeType.CRIT_DMG.key, op: 'add', value: 0.2, label: '치명타 피해 증가', display: '+20%p' },
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
        description: '{{icon.atk}} 공격력이 [color=orange]{{atk}}[/color], {{icon.armorPen}} 물리 관통력이 [color=orange]{{armorPen}}[/color] 증가합니다.',
        modifiers: [
            { attribute: AttributeType.ATK.key, op: 'multiply', value: 1.12, label: '공격력 증가', display: '+12%' },
            { attribute: AttributeType.ARMOR_PEN.key, op: 'add', value: 6, label: '물리 관통력 증가', display: '+6' },
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
        description: '{{icon.critDmg}} 치명타 피해가 [color=orange]{{critDmg}}[/color], {{icon.armorPen}} 물리 관통력이 [color=orange]{{armorPen}}[/color] 증가합니다.',
        modifiers: [
            { attribute: AttributeType.CRIT_DMG.key, op: 'add', value: 0.2, label: '치명타 피해 증가', display: '+20%p' },
            { attribute: AttributeType.ARMOR_PEN.key, op: 'add', value: 7, label: '물리 관통력 증가', display: '+7' },
        ],
    },
    {
        id: 'runeforger_mastery', name: '전투 룬각', jobId: 'career:runeforger', icon: 'jobs/mage',
        description: '{{icon.magicForce}} 마법력이 [color=$magic]{{magicForce}}[/color], {{icon.def}} 방어력이 [color=yellow]{{def}}[/color], {{icon.attackSpeed}} 공격속도가 [color=cyan]{{attackSpeed}}[/color] 증가합니다.',
        modifiers: [
            { attribute: AttributeType.MAGIC_FORCE.key, op: 'multiply', value: 1.12, label: '마법력 증가', display: '+12%' },
            { attribute: AttributeType.DEF.key, op: 'multiply', value: 1.08, label: '방어력 증가', display: '+8%' },
            { attribute: AttributeType.ATTACK_SPEED.key, op: 'multiply', value: 1.08, label: '공격속도 증가', display: '+8%' },
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
        description: '{{icon.critDmg}} 치명타 피해가 [color=orange]{{critDmg}}[/color], {{icon.armorPen}} 물리 관통력이 [color=orange]{{armorPen}}[/color] 증가합니다.',
        modifiers: [
            { attribute: AttributeType.CRIT_DMG.key, op: 'add', value: 0.2, label: '치명타 피해 증가', display: '+20%p' },
            { attribute: AttributeType.ARMOR_PEN.key, op: 'add', value: 6, label: '물리 관통력 증가', display: '+6' },
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
        description: '{{icon.atk}} 공격력이 [color=orange]{{atk}}[/color], {{icon.armorPen}} 물리 관통력이 [color=orange]{{armorPen}}[/color] 증가합니다.',
        modifiers: [
            { attribute: AttributeType.ATK.key, op: 'multiply', value: 1.08, label: '공격력 증가', display: '+8%' },
            { attribute: AttributeType.ARMOR_PEN.key, op: 'add', value: 8, label: '물리 관통력 증가', display: '+8' },
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
    defineSkill({
        id: awakening.id,
        name: awakening.name,
        icon: `skills/${awakening.id}`,
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
        description: '{{icon.armorPen}} 단검 장착 중 물리 관통력이 [color=orange]{{armorPen}}[/color] 증가합니다.',
        modifiers: [{ attribute: AttributeType.ARMOR_PEN.key, op: 'add', value: 5, label: '물리 관통력 증가', display: '+5' }],
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
        icon: `skills/${mastery.id}`,
        maxLevel: 1,
        descriptionTemplate: mastery.description,
        costTemplate: '소모값 없음',
        activationConditionTemplate: `${mastery.label} 장착 중 항상 적용됩니다.`,
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
        weaponRequirement: weaponRequirement(`${mastery.label} 장착이 필요합니다.`, mastery.tag),
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
    ['ember_ore', 'ember_alloy', '홍염강'],
] as const;

function precisionBreakDamage(context: SkillContext): number {
    return context.owner.attribute.get(AttributeType.ATK) * percentByLevel(context.skill.level, 135, 10) / 100
        + context.owner.maxLife * percentByLevel(context.skill.level, 2, 0.25) / 100
        + context.owner.attribute.get(AttributeType.ATK)
            * context.owner.attribute.get(AttributeType.FORGING_PRECISION)
            * percentByLevel(context.skill.level, 60, 6) / 100;
}

defineSkill({
    id: 'precision_break',
    name: '결 파쇄',
    icon: 'skills/precision_break',
    maxLevel: 5,
    descriptionTemplate: '대상의 방어 태세에서 가장 약한 결을 찾아 파쇄합니다. 이 공격은 반드시 치명타로 적중하며, {{icon.atk}}{{icon.maxLife}}{{icon.forgingPrecision}}{{icon.critDmg}} [color=orange]{{damage}}[/color]의 물리 피해를 입힙니다.',
    costTemplate: '{{icon.maxMentality}} [color=$magic]정신력 12[/color]',
    activationConditionTemplate: targetActivationGuide(),
    activationMessage: '결 파쇄!',
    baseMetadata: null,
    calculatedFields: {
        damage: context => tooltipValue(
            precisionBreakDamage(context) * context.owner.attribute.get(AttributeType.CRIT_DMG),
            `(${AttributeType.ATK.label} × ${formatNumber(percentByLevel(context.skill.level, 135, 10))}%`
            + ` + 최대 생명력 × ${formatNumber(percentByLevel(context.skill.level, 2, 0.25))}%`
            + ` + ${AttributeType.ATK.label} × ${AttributeType.FORGING_PRECISION.label} × ${formatNumber(percentByLevel(context.skill.level, 60, 6))}%) × 치명타 피해`,
        ),
    },
    balance: {
        role: SkillBalanceRole.DAMAGE,
        damageType: 'physical',
        calculateDamage: precisionBreakDamage,
        criticalMode: SkillCriticalMode.GUARANTEED,
        calculateManaCost: () => 12,
    },
    calculateMaxCooldown: context => cooldownByLevel(context, 7, 0.25, 6),
    sharedCooldowns: careerSharedCooldown(GameTags.SKILL_GROUP_BLACKSMITH),
    jobRequirement: jobRequirement(JOBS.blacksmith),
    canActivate: simpleCheck(12),
    onStart: context => {
        const found = targetOrDeny(context);
        if ('reason' in found) throw new Error(found.reason);
        spend(context, 12);
        context.owner.attack(found.target, 'physical', precisionBreakDamage(context), {
            criticalRate: 1,
            consumeMainHandDurability: true,
        });
    },
    tags: [GameTags.SKILL_ACTIVE, GameTags.SKILL_COMBAT, GameTags.SKILL_GROUP_BLACKSMITH],
});

defineSkill({
    id: 'arcane_smelting',
    name: '마력 제련',
    icon: 'skills/arcane_smelting',
    maxLevel: 10,
    descriptionTemplate: '인벤토리에서 가장 앞에 있는 원광을 찾아 불순물을 걷어내고 스킬 레벨과 {{icon.forgingPrecision}} 제련 정밀도에 따라 한 번에 [color=gold]{{batch}}개[/color]까지 제련 소재로 바꿉니다.',
    costTemplate: '{{manaCost}} 정신력 · 재사용 대기시간 {{maxCooldown}}초',
    activationConditionTemplate: activationGuide(),
    activationMessage: '마력 제련!',
    baseMetadata: { baseManaCost: 18 },
    calculatedFields: {
        batch: context => 2 + context.skill.level + Math.floor((context.owner.attribute?.get?.(AttributeType.FORGING_PRECISION) ?? 0) * 10),
        manaCost: context => numberMeta(context, 'baseManaCost'),
    },
    activationFeedback: context => {
        const level = context.skill.getActiveState<number>('reachedLevel');
        return `${context.skill.getActiveState<string>('materialLabel') ?? '소재'} ${context.skill.getActiveState<number>('processedCount') ?? 0}개를 마력으로 제련했습니다. (+${context.skill.getActiveState<number>('characterExperience') ?? 0} EXP${level ? ` · Lv.${level} 달성` : ''})`;
    },
    calculateMaxCooldown: () => 5,
    sharedCooldowns: careerSharedCooldown(GameTags.SKILL_GROUP_BLACKSMITH, 1),
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
        const count = Math.min(
            player.inventory.getCount(raw),
            2 + context.skill.level + Math.floor((player.attribute?.get?.(AttributeType.FORGING_PRECISION) ?? 0) * 10),
        );
        const selections = player.inventory.selectItems([{ count, matches: item => item.itemDataId === raw }]);
        if (!selections || !player.inventory.replaceSelectedItems(selections, [{
            itemDataId: refined, count, durability: null, metadataDelta: null, tags: [],
        }])) throw new Error('마력 제련 재료 교환에 실패했습니다.');
        const cost = numberMeta(context, 'baseManaCost');
        if (!player.spendMentality(cost)) throw new Error('마력 제련 정신력 소모에 실패했습니다.');
        const characterExperience = calculateSmeltingExperience(player, count);
        const levelsGained = player.gainExp(characterExperience);
        return { state: {
            materialLabel: label,
            processedCount: count,
            characterExperience,
            ...(levelsGained.length ? { reachedLevel: levelsGained.at(-1)! } : {}),
        } };
    },
    tags: [GameTags.SKILL_ACTIVE, GameTags.SKILL_GROUP_BLACKSMITH],
});

defineSkill({
    id: 'metal_forging',
    name: '금속 단조',
    icon: 'skills/metal_forging',
    maxLevel: 1,
    descriptionTemplate: '제련 소재와 장비 형태를 선택해 리듬 단조를 시작할 수 있습니다. 정확도가 완성품의 공격·방어 수치와 내구도를 결정합니다.',
    costTemplate: '형태별 제련 소재 소모',
    activationConditionTemplate: '제련 소재와 장비 형태를 준비한 뒤 `/단조 <형태> <재료>`를 입력해 사용합니다.',
    baseMetadata: null,
    calculatedFields: {},
    canActivate: () => denySkill('/단조 <형태> <재료> 명령어를 사용하세요.'),
    tags: [GameTags.SKILL_PASSIVE],
});

defineSkill({
    id: 'artisan_naming',
    name: '장인의 명명',
    // TODO: 후가공 스킬 전용 아이콘 제작 전까지 단조 장검 아이콘을 사용한다.
    icon: 'items/forged_sword',
    maxLevel: 1,
    descriptionTemplate: '직접 단조한 장비에 장인이 정한 고유한 이름을 새깁니다. 이름은 장비 인스턴스에 영속되며 같은 마스터 아이템의 다른 장비에는 영향을 주지 않습니다.',
    costTemplate: '소모값 없음',
    activationConditionTemplate: `감각 ${FORGED_ITEM_NAMING_SENSIBILITY} 이상일 때 직접 단조한 장비를 지정해 \`/장비명명 <아이템 번호 또는 장착칸> <새 이름>\`을 입력합니다.`,
    baseMetadata: null,
    calculateExperienceGain: () => 0,
    calculateRequiredExperience: () => 0,
    autoAcquire: {
        watchedProgress: [],
        alwaysEvaluate: true,
        check: ({ player }) => Boolean(player
            && hasBlacksmithSkillAccess(player)
            && player.stat.get(StatType.SENSIBILITY) >= FORGED_ITEM_NAMING_SENSIBILITY),
    },
    isVisible: ({ player }) => hasBlacksmithSkillAccess(player),
    canActivate: () => denySkill('/장비명명 <아이템 번호 또는 장착칸> <새 이름> 명령어를 사용하세요.'),
    tags: [GameTags.SKILL_PASSIVE],
});

defineSkill({
    id: 'arcane_enchanting',
    name: '마법 부여',
    // TODO: 후가공 스킬 전용 아이콘 제작 전까지 마법력 능력치 아이콘을 사용한다.
    icon: 'attributes/magicForce',
    maxLevel: 5,
    descriptionTemplate: '무기의 재료·속성을 읽어 다음 적중 효과 중 하나를 영구히 각인합니다. [tooltip=1초마다 불 속성 피해를 주며 오래 지속되면 화상을 남깁니다.][color=orange]화염[/color][/tooltip] · [tooltip=0.5초마다 최대 생명력과 잃은 생명력에 비례한 피해를 주고 받는 치유량을 50% 감소시킵니다.][color=purple]맹독[/color][/tooltip] · [tooltip=스킬·아이템 사용·공격·이동·회피·장소 이동을 모두 막습니다.][color=yellow]기절[/color][/tooltip] · [tooltip=초당 얼음 피해를 주고 이동속도와 공격속도를 낮춥니다. 화염과 만나면 서로 상쇄됩니다.][color=skyblue]빙결[/color][/tooltip] · [tooltip=공격과 회피를 할 수 없게 만듭니다.][color=darkgray]실명[/color][/tooltip]. 장비 속성과 고유 특성이 후보를 편향하며 발동률(18~68%)·효과 레벨·지속시간은 감각과 서버 난수에 따라 결정됩니다.',
    costTemplate: '{{icon.maxMentality}} [color=$magic]정신력 80[/color]',
    activationConditionTemplate: '마도 대장장이가 아직 마법이 부여되지 않은 무기를 지정해 `/마법부여 <아이템 번호 또는 장착칸>`을 입력합니다.',
    baseMetadata: null,
    calculateExperienceGain: () => 25,
    jobRequirement: jobRequirement('career:arcane_smith'),
    canActivate: () => denySkill('/마법부여 <아이템 번호 또는 장착칸> 명령어를 사용하세요.'),
    tags: [GameTags.SKILL_PASSIVE],
});

defineSkill({
    id: 'staff_infusing',
    name: '지팡이 마력 부여',
    // TODO(art): 전용 스킬 아이콘 제작 전까지 지팡이 카테고리 fallback을 사용한다.
    icon: 'items/apprentice_staff',
    maxLevel: 1,
    descriptionTemplate: '직접 단조한 지팡이 틀에 마력 회로를 열어 실제 주문과 마력탄을 다룰 수 있는 지팡이로 완성합니다. 틀의 재료·품질·단조 능력치는 유지되며 마법 관통력, 정신력 재생, 투사체 가속이 추가됩니다.',
    costTemplate: `{{icon.maxMentality}} [color=$magic]정신력 ${STAFF_INFUSION_MENTALITY_COST}[/color]`,
    activationConditionTemplate: '마도 대장장이가 `/단조 지팡이 틀 <재료>`로 틀을 만든 뒤 `/지팡이부여 <인벤토리 번호>`를 입력합니다.',
    baseMetadata: null,
    calculateExperienceGain: () => 0,
    jobRequirement: jobRequirement('career:arcane_smith'),
    canActivate: () => denySkill('/지팡이부여 <인벤토리 번호> 명령어를 사용하세요.'),
    tags: [GameTags.SKILL_PASSIVE, GameTags.SKILL_GROUP_BLACKSMITH],
});

defineSkill({
    id: 'artificer_manufacturing',
    name: '정밀 병기 제작',
    // TODO(art): 전용 스킬 아이콘 제작 전까지 활 카테고리 fallback을 사용한다.
    icon: 'items/light_bow',
    maxLevel: 1,
    descriptionTemplate: '단조 미니게임으로 활대와 화살촉 묶음을 만들고, 호환되는 시위와 화살대를 제작해 활과 화살로 조립합니다. 단조 재료·품질·특이 각인은 완성 병기와 화살의 공격 성능에 그대로 반영됩니다.',
    costTemplate: '형태별 제련 소재와 제작 부품 소모',
    activationConditionTemplate: '기계 장인이 `/단조 활대 <재료>` 또는 `/단조 화살촉 묶음 <재료>`를 사용한 뒤 발견한 전용 제작법으로 부품을 조립합니다.',
    baseMetadata: null,
    calculateExperienceGain: () => 0,
    jobRequirement: jobRequirement('career:artificer'),
    canActivate: () => denySkill('/단조와 /제작 명령어를 사용하세요.'),
    tags: [GameTags.SKILL_PASSIVE, GameTags.SKILL_GROUP_BLACKSMITH],
});

defineSkill({
    id: 'weapon_reinforcement',
    name: '무기 강화',
    // TODO: 후가공 스킬 전용 아이콘 제작 전까지 공격력 능력치 아이콘을 사용한다.
    icon: 'attributes/atk',
    maxLevel: 5,
    descriptionTemplate: `지핵 강화석을 소모해 무기를 최대 +${MAX_WEAPON_REINFORCEMENT}까지 강화합니다. 강화는 실패하거나 하락하지 않으며, 매 단계 공격 계열 능력치와 무기 종류에 맞는 긍정 효과가 영구적으로 누적됩니다.`,
    costTemplate: '지핵 강화석 1개',
    activationConditionTemplate: '전투 대장장이가 +5 미만인 무기를 지정해 `/무기강화 <아이템 번호 또는 장착칸>`을 입력합니다.',
    baseMetadata: null,
    calculateExperienceGain: () => 28,
    jobRequirement: jobRequirement('career:battle_smith'),
    canActivate: () => denySkill('/무기강화 <아이템 번호 또는 장착칸> 명령어를 사용하세요.'),
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
    return directDamageAttack(
        context,
        context.owner.attribute.get(AttributeType.ATK) * multiplier,
        options,
    );
}
function directDamageAttack(
    context: SkillContext,
    damage: number,
    options: Parameters<Player['attack']>[3] = {},
) {
    const found = targetOrDeny(context);
    if ('reason' in found) throw new Error(found.reason);
    const result = context.owner.attack(found.target, 'physical', damage, options);
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

const ARCHER_ARCANE_ARROW_TERMS: readonly AttributeDamageTerm[] = [
    { attribute: AttributeType.ATK, basePercent: 105, perLevelPercent: 8 },
    { attribute: AttributeType.SPEED, scale: MOBILITY_DAMAGE_SCALE, basePercent: 35, perLevelPercent: 4 },
];
const ARCHER_MULTISHOT_TERMS: readonly AttributeDamageTerm[] = [
    { attribute: AttributeType.ATK, basePercent: 90, perLevelPercent: 9 },
    { attribute: AttributeType.SPEED, scale: MOBILITY_DAMAGE_SCALE, basePercent: 15, perLevelPercent: 2 },
];
const ARCHER_STUNNING_SHOT_TERMS: readonly AttributeDamageTerm[] = [
    { attribute: AttributeType.ATK, basePercent: 110, perLevelPercent: 9 },
    { attribute: AttributeType.SPEED, scale: MOBILITY_DAMAGE_SCALE, basePercent: 20, perLevelPercent: 2 },
];
const ASSASSIN_AMBUSH_TERMS: readonly AttributeDamageTerm[] = [
    { attribute: AttributeType.SPEED, scale: MOBILITY_DAMAGE_SCALE, basePercent: 75, perLevelPercent: 6 },
    { attribute: AttributeType.ATK, basePercent: 100, perLevelPercent: 8 },
];
const ASSASSIN_VENOM_BLADE_TERMS: readonly AttributeDamageTerm[] = [
    { attribute: AttributeType.SPEED, scale: MOBILITY_DAMAGE_SCALE, basePercent: 55, perLevelPercent: 5 },
    { attribute: AttributeType.ATK, basePercent: 90, perLevelPercent: 7 },
];

function speedScaledDuration(
    context: SkillContext,
    base: number,
    perLevel: number,
    speedRatio: number,
): number {
    return valueByLevel(context.skill.level, base, perLevel)
        + Math.max(0, context.owner.attribute.get(AttributeType.SPEED) - AttributeType.SPEED.defaultValue) * speedRatio;
}

defineSkill({
    id: 'steel_slash', name: '강철 베기', icon: 'skills/steel_slash', maxLevel: 5,
    descriptionTemplate: '검 또는 도끼에 힘을 실어 대상을 힘껏 베어 냅니다. {{icon.atk}} [color=orange]{{damage}}[/color]의 물리 피해를 입힙니다.',
    costTemplate: '{{icon.maxMentality}} [color=$magic]정신력 10[/color]',
    activationConditionTemplate: targetActivationGuide('검 또는 도끼를 장착해야 합니다.'),
    activationMessage: '강철 베기!', activationPhrase: '강철 베기!', baseMetadata: null,
    calculatedFields: { damage: context => attributeDamageTooltip(context, AttributeType.ATK, 175, 12) },
    balance: {
        role: SkillBalanceRole.DAMAGE, damageType: 'physical',
        calculateDamage: context => context.owner.attribute.get(AttributeType.ATK) * percentByLevel(context.skill.level, 175, 12) / 100,
        calculateManaCost: () => 10,
    },
    calculateMaxCooldown: context => cooldownByLevel(context, 5, 0.2, 4.2),
    sharedCooldowns: careerSharedCooldown(GameTags.SKILL_GROUP_WARRIOR),
    jobRequirement: jobRequirement(JOBS.warrior), weaponRequirement: weaponRequirement('검 또는 도끼를 장착해야 합니다.', GameTags.WEAPON_SWORD, GameTags.WEAPON_AXE),
    canActivate: simpleCheck(10), onStart: context => {
        spend(context, 10);
        directAttack(context, percentByLevel(context.skill.level, 175, 12) / 100, { consumeMainHandDurability: true });
    },
    tags: [GameTags.SKILL_ACTIVE, GameTags.SKILL_COMBAT, GameTags.SKILL_GROUP_WARRIOR],
});

defineSkill({
    id: 'battle_rush', name: '전투 질주', icon: 'skills/battle_rush', maxLevel: 5,
    descriptionTemplate: '전의를 끌어올려 {{duration}} 동안 {{icon.atk}} 공격력이 [color=orange]{{attackBonus}}[/color], {{icon.speed}} 이동속도가 [color=cyan]{{speedBonus}}[/color] 증가합니다.',
    costTemplate: '{{icon.maxMentality}} [color=$magic]정신력 14[/color]',
    activationConditionTemplate: activationGuide(), activationMessage: '전투 질주!', baseMetadata: null,
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
        calculateEffectDuration: context => valueByLevel(context.skill.level, 8, 1),
        calculateRotationModifiers: context => [
            { attribute: AttributeType.ATK.key, op: 'multiply', value: 1 + percentByLevel(context.skill.level, 15, 3) / 100 },
            { attribute: AttributeType.SPEED.key, op: 'multiply', value: 1 + percentByLevel(context.skill.level, 20, 3) / 100 },
        ],
        notes: ['지속 중 공격력·이동속도 증가량은 수치로 표시하되 DPM에 임의 환산하지 않습니다.'],
    },
    calculateMaxCooldown: context => cooldownByLevel(context, 18, 1, 14),
    sharedCooldowns: careerSharedCooldown(GameTags.SKILL_GROUP_WARRIOR),
    jobRequirement: jobRequirement(JOBS.warrior), canActivate: simpleCheck(14, false),
    onStart: context => {
        spend(context, 14);
        context.owner.applyStatusEffect(BATTLE_RUSH, valueByLevel(context.skill.level, 8, 1), context.skill.level);
    },
    tags: [GameTags.SKILL_ACTIVE, GameTags.SKILL_COMBAT, GameTags.SKILL_GROUP_WARRIOR],
});

defineSkill({
    id: 'indomitable', name: '불굴', icon: 'skills/indomitable', maxLevel: 5,
    descriptionTemplate: '고통을 견디며 전열을 가다듬습니다. {{duration}} 동안 {{icon.def}} 방어력이 [color=yellow]+{{defBonus}}[/color], {{icon.maxLife}} 최대 생명력이 [color=green]{{lifeBonus}}[/color] 증가하고 생명력을 최대치의 [color=green]{{healPercent}}[/color]만큼 회복합니다.',
    costTemplate: '{{icon.maxMentality}} [color=$magic]정신력 18[/color]',
    activationConditionTemplate: activationGuide(), activationMessage: '불굴!', baseMetadata: null,
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
        calculateEffectDuration: context => valueByLevel(context.skill.level, 10, 1),
        calculateRotationModifiers: context => [
            { attribute: AttributeType.DEF.key, op: 'add', value: valueByLevel(context.skill.level, 15, 5) },
            { attribute: AttributeType.MAX_LIFE.key, op: 'multiply', value: 1 + percentByLevel(context.skill.level, 20, 3) / 100 },
        ],
        notes: ['방어력·최대 생명력 증가는 지속형 효과라 단발 회복량과 분리합니다.'],
    },
    calculateMaxCooldown: context => cooldownByLevel(context, 28, 1.5, 22),
    sharedCooldowns: careerSharedCooldown(GameTags.SKILL_GROUP_WARRIOR),
    jobRequirement: jobRequirement(JOBS.warrior), canActivate: simpleCheck(18, false),
    onStart: context => {
        spend(context, 18);
        context.owner.applyStatusEffect(INDOMITABLE, valueByLevel(context.skill.level, 10, 1), context.skill.level);
        context.owner.heal(context.owner.maxLife * percentByLevel(context.skill.level, 15, 2) / 100, context.owner);
    },
    tags: [GameTags.SKILL_ACTIVE, GameTags.SKILL_GROUP_WARRIOR],
});

defineSkill({
    id: 'arcane_arrow', name: '마력 화살', icon: 'skills/arcane_arrow', maxLevel: 5,
    descriptionTemplate: `활의 장력과 기동력을 빛의 화살로 바꿔 대상에게 발사합니다. 탄약은 소모하지 않으며, {{icon.atk}}{{icon.speed}} [color=$magic]{{damage}}[/color]의 마법 피해를 입힙니다. ${PROJECTILE_CRITICAL_TEXT} ${PROJECTILE_FLIGHT_TEXT}`,
    costTemplate: '{{icon.maxMentality}} [color=$magic]정신력 12[/color]',
    activationConditionTemplate: targetActivationGuide('활을 장착해야 합니다.'), activationMessage: '마력 화살!', baseMetadata: null,
    calculatedFields: {
        damage: context => combinedAttributeDamageTooltip(context, ARCHER_ARCANE_ARROW_TERMS),
        projectileTravelTime: context => projectileTravelTimeTooltip(context, 'basic_magic_orb', true),
    },
    balance: {
        role: SkillBalanceRole.DAMAGE, damageType: 'magic',
        effectTags: [GameTags.PROPERTY_LIGHT],
        calculateDamage: context => combinedAttributeDamage(context, ARCHER_ARCANE_ARROW_TERMS),
        calculateEvasionAttackSpeed: context => projectileEvasionAttackSpeed(context, 'basic_magic_orb', true),
        calculateManaCost: () => 12,
    },
    calculateMaxCooldown: context => cooldownByLevel(context, 5, 0.2, 4.2),
    sharedCooldowns: careerSharedCooldown(GameTags.SKILL_GROUP_ARCHER),
    jobRequirement: jobRequirement(JOBS.archer), weaponRequirement: weaponRequirement('활을 장착해야 합니다.', GameTags.WEAPON_BOW),
    canActivate: simpleCheck(12), onStart: context => {
        spend(context, 12);
        projectileAttack(context, 'basic_magic_orb', 1, [GameTags.PROPERTY_LIGHT], undefined, {
            damage: combinedAttributeDamage(context, ARCHER_ARCANE_ARROW_TERMS),
        });
    },
    tags: [GameTags.SKILL_ACTIVE, GameTags.SKILL_COMBAT, GameTags.SKILL_GROUP_ARCHER],
});

defineSkill({
    id: 'multishot', name: '다중 사격', icon: 'skills/multishot', maxLevel: 5,
    descriptionTemplate: `현재 장소의 공격 가능한 대상 최대 [color=gold]3명[/color]에게 각각 {{icon.atk}}{{icon.speed}} [color=orange]{{damage}}[/color]의 물리 피해를 주는 화살을 발사합니다. ${PROJECTILE_CRITICAL_TEXT} ${PROJECTILE_FLIGHT_TEXT}`,
    costTemplate: '{{icon.maxMentality}} [color=$magic]정신력 18[/color]',
    activationConditionTemplate: activationGuide('활을 장착하고 공격할 대상이 있는 장소에서'), activationMessage: '다중 사격!', baseMetadata: null,
    calculatedFields: {
        damage: context => combinedAttributeDamageTooltip(context, ARCHER_MULTISHOT_TERMS),
        projectileTravelTime: context => projectileTravelTimeTooltip(context, 'basic_arrow', false),
    },
    balance: {
        role: SkillBalanceRole.DAMAGE, damageType: 'physical', targetCount: 3,
        calculateDamage: context => combinedAttributeDamage(context, ARCHER_MULTISHOT_TERMS),
        calculateEvasionAttackSpeed: context => projectileEvasionAttackSpeed(context, 'basic_arrow', false),
        calculateManaCost: () => 18,
        notes: ['대상이 3명 있다고 가정한 총 피해와 대상 1명 피해를 함께 표시합니다.'],
    },
    calculateMaxCooldown: context => cooldownByLevel(context, 11, 0.5, 9),
    sharedCooldowns: careerSharedCooldown(GameTags.SKILL_GROUP_ARCHER),
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
                overrides: { damage: combinedAttributeDamage(context, ARCHER_MULTISHOT_TERMS) },
            });
        }
        player.commitAttack(false);
    }, tags: [GameTags.SKILL_ACTIVE, GameTags.SKILL_COMBAT, GameTags.SKILL_GROUP_ARCHER],
});

defineSkill({
    id: 'stunning_shot', name: '충격 화살', icon: 'skills/stunning_shot', maxLevel: 5,
    descriptionTemplate: `활의 장력과 비행 속도를 충격으로 응축한 화살을 발사합니다. {{icon.atk}}{{icon.speed}} [color=orange]{{damage}}[/color]의 물리 피해를 입히고, 적중한 대상을 {{stunDuration}} 동안 기절시킵니다. ${PROJECTILE_CRITICAL_TEXT} ${PROJECTILE_FLIGHT_TEXT}`,
    costTemplate: '{{icon.maxMentality}} [color=$magic]정신력 20[/color]',
    activationConditionTemplate: targetActivationGuide('활을 장착해야 합니다.'), activationMessage: '충격 화살!', baseMetadata: null,
    calculatedFields: {
        damage: context => combinedAttributeDamageTooltip(context, ARCHER_STUNNING_SHOT_TERMS),
        stunDuration: context => tooltipValue(
            speedScaledDuration(context, 2, 0.25, 0.02),
            `기본 ${formatNumber(valueByLevel(context.skill.level, 2, 0.25))}초 + 기본치를 넘는 이동속도 × 0.02초`,
            '초',
        ),
        projectileTravelTime: context => projectileTravelTimeTooltip(context, 'basic_arrow', false),
    },
    balance: {
        role: SkillBalanceRole.CONTROL, damageType: 'physical',
        calculateDamage: context => combinedAttributeDamage(context, ARCHER_STUNNING_SHOT_TERMS),
        calculateEvasionAttackSpeed: context => projectileEvasionAttackSpeed(context, 'basic_arrow', false),
        calculateManaCost: () => 20,
        notes: ['기절의 가치는 적 패턴에 따라 달라 피해량에 임의 합산하지 않습니다.'],
    },
    calculateMaxCooldown: context => cooldownByLevel(context, 16, 0.75, 13),
    sharedCooldowns: careerSharedCooldown(GameTags.SKILL_GROUP_ARCHER),
    jobRequirement: jobRequirement(JOBS.archer), weaponRequirement: weaponRequirement('활을 장착해야 합니다.', GameTags.WEAPON_BOW),
    canActivate: simpleCheck(20), onStart: context => {
        spend(context, 20);
        projectileAttack(context, 'basic_arrow', 1, undefined, (_p, result) => {
            if (!result.evaded) _p.target.applyStatusEffect(
                STUN,
                speedScaledDuration(context, 2, 0.25, 0.02),
                context.skill.level,
            );
        }, { damage: combinedAttributeDamage(context, ARCHER_STUNNING_SHOT_TERMS) });
    },
    tags: [GameTags.SKILL_ACTIVE, GameTags.SKILL_COMBAT, GameTags.SKILL_GROUP_ARCHER],
});

defineSkill({
    id: 'wind_evasion', name: '바람 회피', icon: 'skills/wind_evasion', maxLevel: 5,
    descriptionTemplate: '{{icon.speed}} 이동속도에 따라 결정되는 {{duration}} 동안 이동 가능한 상태라면 받는 공격을 [color=cyan]확정적으로 회피[/color]합니다. 이동이 금지된 동안에는 발동하지 않습니다.',
    costTemplate: '{{icon.maxMentality}} [color=$magic]정신력 22[/color]',
    activationConditionTemplate: activationGuide(), activationMessage: '바람 회피!', baseMetadata: null,
    activationFeedback: context => buffFeedback(
        context.skill.name,
        speedScaledDuration(context, 7, 0.75, 0.04),
        '이동 가능한 동안 공격 확정 회피',
    ),
    calculatedFields: { duration: context => tooltipValue(
        speedScaledDuration(context, 7, 0.75, 0.04),
        `기본 ${formatNumber(valueByLevel(context.skill.level, 7, 0.75))}초 + 기본치를 넘는 이동속도 × 0.04초`,
        '초',
    ) },
    balance: {
        role: SkillBalanceRole.DEFENSE, calculateManaCost: () => 22,
        calculateEffectDuration: context => speedScaledDuration(context, 7, 0.75, 0.04),
        notes: ['확정 회피는 적 공격 빈도에 의존하므로 고정 전투력으로 환산하지 않습니다.'],
    },
    calculateMaxCooldown: context => cooldownByLevel(context, 24, 1.5, 18),
    sharedCooldowns: careerSharedCooldown(GameTags.SKILL_GROUP_ARCHER),
    jobRequirement: jobRequirement(JOBS.archer), canActivate: simpleCheck(22, false),
    onStart: context => {
        spend(context, 22);
        context.owner.applyStatusEffect(
            WIND_EVASION,
            speedScaledDuration(context, 7, 0.75, 0.04),
            context.skill.level,
        );
    }, tags: [GameTags.SKILL_ACTIVE, GameTags.SKILL_GROUP_ARCHER],
});

defineSkill({
    id: 'stealth', name: '은신', icon: 'skills/stealth', maxLevel: 5,
    descriptionTemplate: '{{icon.speed}} 이동속도에 따라 결정되는 {{duration}} 동안 다른 대상이 공격 대상으로 지정할 수 없는 은신 상태가 되고 이동속도가 [color=cyan]{{speedBonus}}[/color] 증가합니다. 직접 공격하거나 투사체를 발사하면 즉시 해제됩니다.',
    costTemplate: '{{icon.maxMentality}} [color=$magic]정신력 16[/color]',
    activationConditionTemplate: activationGuide(), activationMessage: '은신!', baseMetadata: null,
    activationFeedback: context => buffFeedback(
        context.skill.name,
        speedScaledDuration(context, 8, 0.75, 0.05),
        `공격 대상 지정 방지, 이동속도 +${formatNumber(percentByLevel(context.skill.level, 25, 5))}%`,
    ),
    calculatedFields: {
        duration: context => tooltipValue(
            speedScaledDuration(context, 8, 0.75, 0.05),
            `기본 ${formatNumber(valueByLevel(context.skill.level, 8, 0.75))}초 + 기본치를 넘는 이동속도 × 0.05초`,
            '초',
        ),
        speedBonus: context => levelValueTooltip(context, '이동속도 증가', 25, 5, '%'),
    },
    balance: {
        role: SkillBalanceRole.SUPPORT, calculateManaCost: () => 16,
        calculateEffectDuration: context => speedScaledDuration(context, 8, 0.75, 0.05),
        calculateRotationModifiers: context => [{
            attribute: AttributeType.SPEED.key,
            op: 'multiply',
            value: 1 + percentByLevel(context.skill.level, 25, 5) / 100,
        }],
        notes: ['은신과 이동속도는 상황 의존 효과라 DPM에 임의 환산하지 않습니다.'],
    },
    calculateMaxCooldown: context => cooldownByLevel(context, 20, 1, 16),
    sharedCooldowns: careerSharedCooldown(GameTags.SKILL_GROUP_ASSASSIN),
    jobRequirement: jobRequirement(JOBS.assassin), canActivate: simpleCheck(16, false),
    onStart: context => {
        spend(context, 16);
        context.owner.applyStatusEffect(
            STEALTH,
            speedScaledDuration(context, 8, 0.75, 0.05),
            context.skill.level,
        );
    }, tags: [GameTags.SKILL_ACTIVE, GameTags.SKILL_GROUP_ASSASSIN],
});

defineSkill({
    id: 'ambush', name: '암습', icon: 'skills/ambush', maxLevel: 5,
    descriptionTemplate: '은신을 해제하며 이동속도를 살린 채 대상의 급소를 기습합니다. 이 공격은 회피할 수 없고 반드시 치명타로 적중하며, {{icon.speed}}{{icon.atk}}{{icon.critDmg}} [color=orange]{{damage}}[/color]의 물리 피해를 입힙니다.',
    costTemplate: '{{icon.maxMentality}} [color=$magic]정신력 18[/color]',
    activationConditionTemplate: activationGuide('대상을 지정하고 단검을 장착한 뒤 은신 상태에서'), activationMessage: '암습!', baseMetadata: null,
    calculatedFields: { damage: context => {
        const damage = combinedAttributeDamage(context, ASSASSIN_AMBUSH_TERMS)
            * context.owner.attribute.get(AttributeType.CRIT_DMG);
        return tooltipValue(
            damage,
            `(${combinedAttributeDamageFormula(context, ASSASSIN_AMBUSH_TERMS)}) × 치명타 피해 ${formatNumber(context.owner.attribute.get(AttributeType.CRIT_DMG) * 100)}%`,
        );
    } },
    balance: {
        role: SkillBalanceRole.DAMAGE, damageType: 'physical',
        calculateDamage: context => combinedAttributeDamage(context, ASSASSIN_AMBUSH_TERMS),
        criticalMode: SkillCriticalMode.GUARANTEED,
        calculateManaCost: () => 18,
        notes: ['선행 은신의 재사용 대기시간과 정신력 소모는 별도이며, 이 명령은 암습 단독 사용량을 계산합니다.'],
    },
    calculateMaxCooldown: context => cooldownByLevel(context, 10, 0.5, 8),
    sharedCooldowns: careerSharedCooldown(GameTags.SKILL_GROUP_ASSASSIN),
    jobRequirement: jobRequirement(JOBS.assassin), weaponRequirement: weaponRequirement('단검을 장착해야 합니다.', GameTags.WEAPON_DAGGER),
    canActivate: context => context.owner.getStatusEffect(STEALTH) ? simpleCheck(18)(context) : denySkill('은신 상태에서만 사용할 수 있습니다.'),
    onStart: context => {
        spend(context, 18);
        context.owner.removeStatusEffect(STEALTH);
        directDamageAttack(context, combinedAttributeDamage(context, ASSASSIN_AMBUSH_TERMS), {
            criticalRate: 1,
            unavoidable: true,
            consumeMainHandDurability: true,
        });
    },
    tags: [GameTags.SKILL_ACTIVE, GameTags.SKILL_COMBAT, GameTags.SKILL_GROUP_ASSASSIN],
});

defineSkill({
    id: 'venom_blade', name: '맹독 칼날', icon: 'skills/venom_blade', maxLevel: 5,
    descriptionTemplate: '단검에 치명적인 독을 바르고 빠르게 파고들어 대상을 베어 냅니다. {{icon.speed}}{{icon.atk}} [color=orange]{{damage}}[/color]의 물리 피해를 입히고, 적중한 대상에게 Lv.{{level}} 맹독을 {{poisonDuration}} 동안 부여합니다.',
    costTemplate: '{{icon.maxMentality}} [color=$magic]정신력 14[/color]',
    activationConditionTemplate: targetActivationGuide('단검을 장착해야 합니다.'), activationMessage: '맹독 칼날!', baseMetadata: null,
    calculatedFields: {
        damage: context => combinedAttributeDamageTooltip(context, ASSASSIN_VENOM_BLADE_TERMS),
        poisonDuration: context => levelValueTooltip(context, '맹독 지속시간', 8, 1, '초'),
    },
    balance: {
        role: SkillBalanceRole.DAMAGE, damageType: 'physical',
        calculateDamage: context => combinedAttributeDamage(context, ASSASSIN_VENOM_BLADE_TERMS),
        calculateManaCost: () => 14,
        notes: ['맹독 지속 피해는 대상의 최대·현재 생명력에 의존하므로 직접 타격 DPM과 분리합니다.'],
    },
    calculateMaxCooldown: context => cooldownByLevel(context, 9, 0.5, 7),
    sharedCooldowns: careerSharedCooldown(GameTags.SKILL_GROUP_ASSASSIN),
    jobRequirement: jobRequirement(JOBS.assassin), weaponRequirement: weaponRequirement('단검을 장착해야 합니다.', GameTags.WEAPON_DAGGER),
    canActivate: simpleCheck(14), onStart: context => {
        const found = targetOrDeny(context);
        if ('reason' in found) throw new Error(found.reason);
        spend(context, 14);
        const result = directDamageAttack(context, combinedAttributeDamage(context, ASSASSIN_VENOM_BLADE_TERMS), {
            consumeMainHandDurability: true,
        });
        if (!result.evaded && result.finalDamage > 0) {
            found.target.applyStatusEffect(StatusEffectType.DEADLY_POISON, valueByLevel(context.skill.level, 8, 1), context.skill.level);
        }
    },
    tags: [GameTags.SKILL_ACTIVE, GameTags.SKILL_COMBAT, GameTags.PROPERTY_POISON, GameTags.SKILL_GROUP_ASSASSIN],
});

defineSkill({
    id: 'magic_bolt', name: '마력탄', icon: 'skills/magic_bolt', maxLevel: 5,
    descriptionTemplate: `응축한 정신 에너지를 발사해 {{icon.magicForce}} [color=$magic]{{damage}}[/color]의 마법 피해를 입힙니다. ${PROJECTILE_CRITICAL_TEXT} ${PROJECTILE_FLIGHT_TEXT}`,
    costTemplate: '{{icon.maxMentality}} [color=$magic]정신력 10[/color]',
    activationConditionTemplate: targetActivationGuide(), activationMessage: '마력탄!', baseMetadata: null,
    calculatedFields: {
        damage: context => attributeDamageTooltip(context, AttributeType.MAGIC_FORCE, 95, 7),
        projectileTravelTime: context => projectileTravelTimeTooltip(context, 'magic_bolt', true),
    },
    balance: {
        role: SkillBalanceRole.DAMAGE, damageType: 'magic',
        calculateDamage: context => context.owner.attribute.get(AttributeType.MAGIC_FORCE) * percentByLevel(context.skill.level, 95, 7) / 100,
        calculateEvasionAttackSpeed: context => projectileEvasionAttackSpeed(context, 'magic_bolt', true),
        calculateManaCost: () => 10,
    },
    calculateMaxCooldown: context => cooldownByLevel(context, 4, 0.2, 3.2),
    sharedCooldowns: careerSharedCooldown(GameTags.SKILL_GROUP_MAGIC, MAGIC_SHARED_COOLDOWN_SECONDS),
    jobRequirement: jobRequirement(JOBS.mage),
    canActivate: simpleCheck(10), onStart: context => {
        spend(context, 10);
        projectileAttack(context, 'magic_bolt', percentByLevel(context.skill.level, 95, 7) / 100);
    }, tags: [GameTags.SKILL_ACTIVE, GameTags.SKILL_COMBAT, GameTags.SKILL_GROUP_MAGIC],
});

defineSkill({
    id: 'mana_barrier', name: '마력 보호막', icon: 'skills/mana_barrier', maxLevel: 5,
    descriptionTemplate: '마력으로 몸을 감싸 {{duration}} 동안 [color=#a56de2]{{shieldAmount}}만큼의 마법 피해를 막는 보호막[/color]을 얻습니다. '
        + '{{icon.def}} 방어력이 [color=yellow]+{{defBonus}}[/color], {{icon.magicDef}} 마법 저항력이 [color=purple]+{{magicDefBonus}}[/color] 증가합니다.',
    costTemplate: '{{icon.maxMentality}} [color=$magic]정신력 22[/color]',
    activationConditionTemplate: activationGuide(), activationMessage: '마력 보호막!', baseMetadata: null,
    activationFeedback: context => buffFeedback(
        context.skill.name,
        valueByLevel(context.skill.level, 10, 1),
        `마법 보호막 ${formatNumber(manaBarrierShieldAmount(context))}, 방어력 +${formatNumber(valueByLevel(context.skill.level, 12, 4))}, 마법 저항력 +${formatNumber(valueByLevel(context.skill.level, 20, 5))}`,
    ),
    calculatedFields: {
        duration: context => levelValueTooltip(context, '지속시간', 10, 1, '초'),
        shieldAmount: context => tooltipValue(
            manaBarrierShieldAmount(context),
            `기본 ${formatNumber(valueByLevel(context.skill.level, 45, 15))} + 마법력 × 65% + 최대 생명력 × 4% · 기본 보호막 스킬 레벨당 +15`,
        ),
        defBonus: context => levelValueTooltip(context, '방어력 증가', 12, 4),
        magicDefBonus: context => levelValueTooltip(context, '마법 저항력 증가', 20, 5),
    },
    balance: {
        role: SkillBalanceRole.DEFENSE,
        calculateManaCost: () => 22,
        calculateShield: manaBarrierShieldAmount,
        calculateEffectDuration: context => valueByLevel(context.skill.level, 10, 1),
        calculateRotationModifiers: context => [
            { attribute: AttributeType.DEF.key, op: 'add', value: valueByLevel(context.skill.level, 12, 4) },
            { attribute: AttributeType.MAGIC_DEF.key, op: 'add', value: valueByLevel(context.skill.level, 20, 5) },
        ],
        notes: ['방어력·마법저항 증가는 지속형 효과라 보호막량과 분리합니다.'],
    },
    calculateMaxCooldown: context => cooldownByLevel(context, 22, 1, 18),
    sharedCooldowns: careerSharedCooldown(GameTags.SKILL_GROUP_MAGIC, MAGIC_SHARED_COOLDOWN_SECONDS),
    jobRequirement: jobRequirement(JOBS.mage), canActivate: simpleCheck(22, false),
    onStart: context => {
        spend(context, 22);
        const duration = valueByLevel(context.skill.level, 10, 1);
        context.owner.setShield('skill:mana_barrier', manaBarrierShieldAmount(context), ShieldType.MAGIC, duration, context.owner);
        context.owner.applyStatusEffect(MANA_BARRIER, duration, context.skill.level);
    }, tags: [GameTags.SKILL_ACTIVE, GameTags.SKILL_GROUP_MAGIC],
});

defineSkill({
    id: 'elemental_bind', name: '원소 속박', icon: 'skills/elemental_bind', maxLevel: 5,
    descriptionTemplate: `얼음 마력을 구체로 응축해 대상에게 발사합니다. {{icon.magicForce}} [color=$magic]{{damage}}[/color]의 마법 피해를 입히고, 적중한 대상을 {{bindDuration}} 동안 속박해 공격·스킬·이동·장소 이동을 막습니다. ${PROJECTILE_CRITICAL_TEXT} ${PROJECTILE_FLIGHT_TEXT}`,
    costTemplate: '{{icon.maxMentality}} [color=$magic]정신력 24[/color]',
    activationConditionTemplate: targetActivationGuide(), activationMessage: '원소 속박!', baseMetadata: null,
    calculatedFields: {
        damage: context => attributeDamageTooltip(context, AttributeType.MAGIC_FORCE, 75, 6),
        bindDuration: context => levelValueTooltip(context, '속박 지속시간', 1.5, 0.2, '초'),
        projectileTravelTime: context => projectileTravelTimeTooltip(context, 'basic_magic_orb', true),
    },
    balance: {
        role: SkillBalanceRole.CONTROL, damageType: 'magic',
        calculateDamage: context => context.owner.attribute.get(AttributeType.MAGIC_FORCE) * percentByLevel(context.skill.level, 75, 6) / 100,
        calculateEvasionAttackSpeed: context => projectileEvasionAttackSpeed(context, 'basic_magic_orb', true),
        calculateManaCost: () => 24,
        notes: ['속박의 가치는 적 패턴에 따라 달라 피해량에 임의 합산하지 않습니다.'],
    },
    calculateMaxCooldown: context => cooldownByLevel(context, 15, 0.75, 12),
    sharedCooldowns: combatSharedCooldowns(GameTags.SKILL_GROUP_MAGIC, GameTags.PROPERTY_ICE),
    jobRequirement: jobRequirement(JOBS.mage),
    canActivate: simpleCheck(24), onStart: context => {
        spend(context, 24);
        projectileAttack(context, 'basic_magic_orb', percentByLevel(context.skill.level, 75, 6) / 100, [GameTags.PROPERTY_ICE], (_p, result) => {
            if (!result.evaded) _p.target.applyStatusEffect(STUN, valueByLevel(context.skill.level, 1.5, 0.2), context.skill.level);
        });
    }, tags: [GameTags.SKILL_ACTIVE, GameTags.SKILL_COMBAT, GameTags.PROPERTY_ICE,
        ...combatSkillGroups(GameTags.SKILL_GROUP_MAGIC, GameTags.PROPERTY_ICE)],
});

defineSkill({
    id: 'elemental_insight', name: '원소 통찰', icon: 'skills/elemental_insight', maxLevel: 5,
    descriptionTemplate: '{{duration}} 동안 {{icon.magicForce}} 마법력이 [color=$magic]{{magicBonus}}[/color], {{icon.mentalityRegen}} 정신력 재생이 [color=purple]+{{regenBonus}}/초[/color] 증가합니다.',
    costTemplate: '{{icon.maxMentality}} [color=$magic]정신력 16[/color]',
    activationConditionTemplate: activationGuide(), activationMessage: '원소 통찰!', baseMetadata: null,
    activationFeedback: context => buffFeedback(
        context.skill.name,
        valueByLevel(context.skill.level, 12, 1),
        `마법력 +${formatNumber(percentByLevel(context.skill.level, 12, 2))}%, 정신력 재생 +${formatNumber(valueByLevel(context.skill.level, 2, 0.75))}/초`,
    ),
    calculatedFields: {
        duration: context => levelValueTooltip(context, '지속시간', 12, 1, '초'),
        magicBonus: context => levelValueTooltip(context, '마법력 증가', 12, 2, '%'),
        regenBonus: context => levelValueTooltip(context, '정신력 재생 증가', 2, 0.75),
    },
    balance: {
        role: SkillBalanceRole.SUPPORT, calculateManaCost: () => 16,
        calculateEffectDuration: context => valueByLevel(context.skill.level, 12, 1),
        calculateRotationModifiers: context => [
            { attribute: AttributeType.MAGIC_FORCE.key, op: 'multiply', value: 1 + percentByLevel(context.skill.level, 12, 2) / 100 },
            { attribute: AttributeType.MENTALITY_REGEN.key, op: 'add', value: valueByLevel(context.skill.level, 2, 0.75) },
        ],
        notes: ['마법력·정신력 재생 증가는 지속형 효과라 단일 스킬 DPM에 임의 합산하지 않습니다.'],
    },
    calculateMaxCooldown: context => cooldownByLevel(context, 25, 1.25, 20),
    sharedCooldowns: careerSharedCooldown(GameTags.SKILL_GROUP_MAGIC, MAGIC_SHARED_COOLDOWN_SECONDS),
    jobRequirement: jobRequirement(JOBS.mage), canActivate: simpleCheck(16, false),
    onStart: context => {
        spend(context, 16);
        context.owner.applyStatusEffect(ELEMENTAL_INSIGHT, valueByLevel(context.skill.level, 12, 1), context.skill.level);
    }, tags: [GameTags.SKILL_ACTIVE, GameTags.SKILL_GROUP_MAGIC],
});

for (const elemental of [
    { id: 'fireball', name: '화염구', icon: 'affinities/fire', tag: GameTags.PROPERTY_FIRE, stat: 'career:mage_fire_kills', effect: StatusEffectType.FIRE, effectLabel: '화염', duration: 6, durationPerLevel: 1 },
    { id: 'frost_bolt', name: '빙결탄', icon: 'affinities/ice', tag: GameTags.PROPERTY_ICE, stat: 'career:mage_ice_kills', effect: STUN, effectLabel: '기절', duration: 2, durationPerLevel: 0.25 },
    { id: 'lightning_orb', name: '뇌전구', icon: 'affinities/electric', tag: GameTags.PROPERTY_ELECTRIC, stat: 'career:mage_electric_kills', effect: StatusEffectType.PARALYTIC_POISON, effectLabel: '마비독', duration: 5, durationPerLevel: 0.75 },
] as const) defineSkill({
    id: elemental.id, name: elemental.name, icon: `skills/${elemental.id}`, maxLevel: 5,
    descriptionTemplate: `${elemental.name}에 원소 마력을 응축해 대상에게 발사합니다. {{icon.magicForce}} [color=$magic]{{damage}}[/color]의 속성 마법 피해를 입히고, 적중한 대상에게 Lv.{{level}} ${elemental.effectLabel} 효과를 {{effectDuration}} 동안 부여합니다. ${PROJECTILE_CRITICAL_TEXT} ${PROJECTILE_FLIGHT_TEXT}`,
    costTemplate: '{{icon.maxMentality}} [color=$magic]정신력 28[/color]',
    activationConditionTemplate: targetActivationGuide(),
    activationMessage: `${elemental.name}!`, baseMetadata: null,
    calculatedFields: {
        damage: context => attributeDamageTooltip(context, AttributeType.MAGIC_FORCE, 100, 7),
        effectDuration: context => levelValueTooltip(context, `${elemental.effectLabel} 지속시간`, elemental.duration, elemental.durationPerLevel, '초'),
        projectileTravelTime: context => projectileTravelTimeTooltip(context, 'basic_magic_orb', true),
    },
    balance: {
        role: SkillBalanceRole.DAMAGE, damageType: 'magic',
        effectTags: [elemental.tag],
        calculateDamage: context => context.owner.attribute.get(AttributeType.MAGIC_FORCE) * percentByLevel(context.skill.level, 100, 7) / 100,
        calculateEvasionAttackSpeed: context => projectileEvasionAttackSpeed(context, 'basic_magic_orb', true),
        calculateManaCost: () => 28,
        notes: [`${elemental.effectLabel} 효과는 대상 상태에 따라 달라 직접 타격 DPM과 분리합니다.`],
    },
    calculateMaxCooldown: context => cooldownByLevel(context, 9, 0.5, 7),
    sharedCooldowns: combatSharedCooldowns(GameTags.SKILL_GROUP_MAGIC, elemental.tag),
    jobRequirement: jobRequirement(JOBS.mage),
    autoAcquire: { watchedProgress: [elemental.stat], check: ({ player }) => Boolean(player?.career?.hasJob(JOBS.mage) && player.progress.getCounter(elemental.stat) >= 5n) },
    canActivate: simpleCheck(28), onStart: context => {
        spend(context, 28);
        projectileAttack(context, 'basic_magic_orb', percentByLevel(context.skill.level, 100, 7) / 100, [elemental.tag], (_p, result) => {
            if (!result.evaded) {
                _p.target.applyStatusEffect(
                    elemental.effect,
                    valueByLevel(context.skill.level, elemental.duration, elemental.durationPerLevel),
                    context.skill.level,
                );
            }
        });
    },
    tags: [GameTags.SKILL_ACTIVE, GameTags.SKILL_COMBAT, elemental.tag,
        ...combatSkillGroups(GameTags.SKILL_GROUP_MAGIC, elemental.tag)],
});

interface GrowthTechniqueDefinition {
    id: string;
    name: string;
    icon: string;
    activationHeader: string;
    damageType: 'physical' | 'magic';
    attribute: AttributeType;
    attributeScale?: number;
    basePercent: number;
    perLevelPercent: number;
    secondaryAttribute?: AttributeType;
    secondaryAttributeScale?: number;
    secondaryBasePercent?: number;
    secondaryPerLevelPercent?: number;
    tertiaryAttribute?: AttributeType;
    tertiaryAttributeScale?: number;
    tertiaryBasePercent?: number;
    tertiaryPerLevelPercent?: number;
    /** 대장장이 감각 파생 능력치가 주 능력치 계수를 추가로 증폭하는 비율. */
    forgingPrecisionBasePercent?: number;
    forgingPrecisionPerLevelPercent?: number;
    manaCost: number;
    cooldown: number;
    jobId?: string;
    groupTag?: TagId;
    unlockLevel?: number;
    weaponDescription?: string;
    weaponTags?: readonly TagId[];
    projectile?: 'basic_arrow' | 'basic_magic_orb' | 'magic_bolt';
    projectileName?: string;
    propertyTag?: TagId;
    hitCount?: number;
    guaranteedCritical?: boolean;
    unavoidable?: boolean;
    penetration?: { attribute: AttributeType; base: number; perLevel: number };
    statusEffect?: StatusEffectType;
    statusLabel?: string;
    statusDuration?: number;
    statusDurationPerLevel?: number;
    statusLevel?: (skillLevel: number) => number;
    shieldPercent?: number;
    autoAcquireProgress?: {
        id: string;
        count: number;
        prerequisiteSkillId: string;
        prerequisiteLevel: number;
    };
    descriptionIntro: string;
}

function scaledAttributeValue(
    context: SkillContext,
    attribute: AttributeType,
    scale = 1,
): number {
    return context.owner.attribute.get(attribute) * scale;
}

function growthTechniqueDamage(context: SkillContext, definition: GrowthTechniqueDefinition): number {
    const primary = scaledAttributeValue(context, definition.attribute, definition.attributeScale)
        * percentByLevel(context.skill.level, definition.basePercent, definition.perLevelPercent) / 100;
    const secondary = definition.secondaryAttribute
        ? scaledAttributeValue(context, definition.secondaryAttribute, definition.secondaryAttributeScale)
            * percentByLevel(
                context.skill.level,
                definition.secondaryBasePercent ?? 0,
                definition.secondaryPerLevelPercent ?? 0,
            ) / 100
        : 0;
    const tertiary = definition.tertiaryAttribute
        ? scaledAttributeValue(context, definition.tertiaryAttribute, definition.tertiaryAttributeScale)
            * percentByLevel(
                context.skill.level,
                definition.tertiaryBasePercent ?? 0,
                definition.tertiaryPerLevelPercent ?? 0,
            ) / 100
        : 0;
    const precision = definition.forgingPrecisionBasePercent !== undefined
        ? scaledAttributeValue(context, definition.attribute, definition.attributeScale)
            * context.owner.attribute.get(AttributeType.FORGING_PRECISION)
            * percentByLevel(
                context.skill.level,
                definition.forgingPrecisionBasePercent,
                definition.forgingPrecisionPerLevelPercent ?? 0,
            ) / 100
        : 0;
    return primary + secondary + tertiary + precision;
}

function growthTechniqueDamageTooltip(context: SkillContext, definition: GrowthTechniqueDefinition): string {
    const primaryPercent = percentByLevel(context.skill.level, definition.basePercent, definition.perLevelPercent);
    const scaledLabel = (attribute: AttributeType, scale = 1) =>
        `${attribute.label}${scale === 1 ? '' : ` × ${formatNumber(scale)}`}`;
    const formulas = [
        `${scaledLabel(definition.attribute, definition.attributeScale)} × ${formatNumber(primaryPercent)}%`,
    ];
    if (definition.secondaryAttribute) {
        formulas.push(
            `${scaledLabel(definition.secondaryAttribute, definition.secondaryAttributeScale)} × ${formatNumber(percentByLevel(
                context.skill.level,
                definition.secondaryBasePercent ?? 0,
                definition.secondaryPerLevelPercent ?? 0,
            ))}%`,
        );
    }
    if (definition.tertiaryAttribute) {
        formulas.push(
            `${scaledLabel(definition.tertiaryAttribute, definition.tertiaryAttributeScale)} × ${formatNumber(percentByLevel(
                context.skill.level,
                definition.tertiaryBasePercent ?? 0,
                definition.tertiaryPerLevelPercent ?? 0,
            ))}%`,
        );
    }
    if (definition.forgingPrecisionBasePercent !== undefined) {
        formulas.push(
            `${scaledLabel(definition.attribute, definition.attributeScale)} × ${AttributeType.FORGING_PRECISION.label} × `
            + `${formatNumber(percentByLevel(
                context.skill.level,
                definition.forgingPrecisionBasePercent,
                definition.forgingPrecisionPerLevelPercent ?? 0,
            ))}%`,
        );
    }
    return tooltipValue(growthTechniqueDamage(context, definition), formulas.join(' + '));
}

function careerLevelAutoAcquire(jobId: string, unlockLevel: number) {
    return {
        watchedProgress: [] as readonly string[],
        alwaysEvaluate: true,
        check: ({ player }: SkillContext) => Boolean(
            player && player.level >= unlockLevel && player.career.hasJob(jobId),
        ),
    };
}

function careerMasteryAutoAcquire(
    jobId: string,
    unlockLevel: number,
    requirement: NonNullable<GrowthTechniqueDefinition['autoAcquireProgress']>,
) {
    return {
        watchedProgress: [requirement.id] as readonly string[],
        // 선행 스킬 레벨은 Progress 변경 없이 오르므로 주기 검사도 함께 사용한다.
        alwaysEvaluate: true,
        check: ({ player }: SkillContext) => Boolean(
            player
            && player.level >= unlockLevel
            && player.career.hasJob(jobId)
            && player.progress.getCounter(requirement.id) >= BigInt(requirement.count)
            && (player.skills.get(requirement.prerequisiteSkillId)?.level ?? 0) >= requirement.prerequisiteLevel,
        ),
    };
}

// TODO(icons): 1차 성장기·보스 전승 기술은 전용 아트 제작 전까지 같은 직업/효과의 기존 아이콘과 배너를 재사용한다.
const growthTechniques: readonly GrowthTechniqueDefinition[] = [
    {
        id: 'fracture_slash', name: '파쇄 베기', icon: 'skills/steel_slash', activationHeader: 'steel_slash',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 210, perLevelPercent: 14,
        manaCost: 18, cooldown: 8, jobId: JOBS.warrior, groupTag: GameTags.SKILL_GROUP_WARRIOR, unlockLevel: 30,
        weaponDescription: '검 또는 도끼를 장착해야 합니다.', weaponTags: [GameTags.WEAPON_SWORD, GameTags.WEAPON_AXE],
        statusEffect: LegacyStatusEffects.DEFENSE_REDUCTION, statusLabel: '방어력 감소', statusDuration: 8,
        statusDurationPerLevel: 0.5, descriptionIntro: '방어 태세의 빈틈을 노려 무기를 힘껏 베어 냅니다.',
    },
    {
        id: 'iron_tempest', name: '철풍 돌파', icon: 'skills/battle_rush', activationHeader: 'battle_rush',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 265, perLevelPercent: 17,
        manaCost: 26, cooldown: 13, jobId: JOBS.warrior, groupTag: GameTags.SKILL_GROUP_WARRIOR, unlockLevel: 50,
        weaponDescription: '검 또는 도끼를 장착해야 합니다.', weaponTags: [GameTags.WEAPON_SWORD, GameTags.WEAPON_AXE],
        unavoidable: true, shieldPercent: 8,
        descriptionIntro: '강철 바람을 두르고 대상에게 거침없이 돌진합니다.',
    },
    {
        id: 'piercing_arrow', name: '관통 화살', icon: 'skills/stunning_shot', activationHeader: 'stunning_shot',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 172, perLevelPercent: 12,
        secondaryAttribute: AttributeType.SPEED, secondaryAttributeScale: MOBILITY_DAMAGE_SCALE,
        secondaryBasePercent: 41, secondaryPerLevelPercent: 3,
        manaCost: 18, cooldown: 8, jobId: JOBS.archer, groupTag: GameTags.SKILL_GROUP_ARCHER, unlockLevel: 30,
        weaponDescription: '활을 장착해야 합니다.', weaponTags: [GameTags.WEAPON_BOW], projectile: 'basic_arrow',
        propertyTag: GameTags.PROPERTY_METAL,
        penetration: { attribute: AttributeType.ARMOR_PEN, base: 20, perLevel: 5 },
        descriptionIntro: '금속 화살촉에 힘을 집중해 대상의 방어를 관통합니다.',
    },
    {
        id: 'arrow_storm', name: '화살 폭우', icon: 'skills/multishot', activationHeader: 'multishot',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 77, perLevelPercent: 6,
        secondaryAttribute: AttributeType.SPEED, secondaryAttributeScale: MOBILITY_DAMAGE_SCALE,
        secondaryBasePercent: 18, secondaryPerLevelPercent: 1.5,
        manaCost: 30, cooldown: 15, jobId: JOBS.archer, groupTag: GameTags.SKILL_GROUP_ARCHER, unlockLevel: 50,
        weaponDescription: '활을 장착해야 합니다.', weaponTags: [GameTags.WEAPON_BOW], projectile: 'basic_arrow',
        hitCount: 4, descriptionIntro: '한 대상을 향해 네 발의 화살을 연달아 쏟아붓습니다.',
    },
    {
        id: 'rupture_cut', name: '혈맥 절단', icon: 'skills/ambush', activationHeader: 'ambush',
        damageType: 'physical', attribute: AttributeType.SPEED, attributeScale: MOBILITY_DAMAGE_SCALE,
        basePercent: 105, perLevelPercent: 7,
        secondaryAttribute: AttributeType.ATK, secondaryBasePercent: 85, secondaryPerLevelPercent: 6,
        manaCost: 18, cooldown: 8, jobId: JOBS.assassin, groupTag: GameTags.SKILL_GROUP_ASSASSIN, unlockLevel: 30,
        weaponDescription: '단검을 장착해야 합니다.', weaponTags: [GameTags.WEAPON_DAGGER], guaranteedCritical: true,
        statusEffect: LegacyStatusEffects.BLEEDING, statusLabel: '출혈', statusDuration: 7, statusDurationPerLevel: 0.75,
        descriptionIntro: '단검으로 급소의 혈맥을 깊게 베어 냅니다.',
    },
    {
        id: 'shadow_dagger', name: '그림자 단검', icon: 'skills/venom_blade', activationHeader: 'venom_blade',
        damageType: 'physical', attribute: AttributeType.SPEED, attributeScale: MOBILITY_DAMAGE_SCALE,
        basePercent: 129, perLevelPercent: 8,
        secondaryAttribute: AttributeType.ATK, secondaryBasePercent: 106, secondaryPerLevelPercent: 7,
        manaCost: 24, cooldown: 11, jobId: JOBS.assassin, groupTag: GameTags.SKILL_GROUP_ASSASSIN, unlockLevel: 50,
        projectile: 'basic_arrow', projectileName: '그림자 단검', propertyTag: GameTags.PROPERTY_DARK,
        penetration: { attribute: AttributeType.ARMOR_PEN, base: 16, perLevel: 4 },
        descriptionIntro: '암흑으로 빚은 단검을 대상에게 투척합니다.',
    },
    {
        id: 'mana_lance', name: '마력 창', icon: 'skills/magic_bolt', activationHeader: 'magic_bolt',
        damageType: 'magic', attribute: AttributeType.MAGIC_FORCE, basePercent: 150, perLevelPercent: 10,
        manaCost: 24, cooldown: 8, jobId: JOBS.mage, groupTag: GameTags.SKILL_GROUP_MAGIC, unlockLevel: 30,
        projectile: 'magic_bolt', projectileName: '마력 창',
        penetration: { attribute: AttributeType.MAGIC_PEN, base: 20, perLevel: 5 },
        descriptionIntro: '마력으로 이루어진 창을 소환하여 대상에게 발사합니다.',
    },
    {
        id: 'flame_wave', name: '홍염 파동', icon: 'skills/fireball', activationHeader: 'fireball',
        damageType: 'magic', attribute: AttributeType.MAGIC_FORCE, basePercent: 170, perLevelPercent: 11,
        manaCost: 32, cooldown: 12, jobId: JOBS.mage, groupTag: GameTags.SKILL_GROUP_MAGIC, unlockLevel: 50,
        projectile: 'basic_magic_orb', projectileName: '홍염 파동', propertyTag: GameTags.PROPERTY_FIRE,
        statusEffect: StatusEffectType.FIRE, statusLabel: '화염', statusDuration: 8, statusDurationPerLevel: 1,
        descriptionIntro: '응축한 홍염을 거센 파동으로 빚어 대상에게 발사합니다.',
    },
    {
        id: 'fault_finder', name: '결함 간파', icon: 'skills/precision_break', activationHeader: 'precision_break',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 165, perLevelPercent: 12,
        forgingPrecisionBasePercent: 50, forgingPrecisionPerLevelPercent: 5,
        manaCost: 18, cooldown: 9, jobId: JOBS.blacksmith, groupTag: GameTags.SKILL_GROUP_BLACKSMITH, unlockLevel: 30,
        guaranteedCritical: true, statusEffect: LegacyStatusEffects.DEFENSE_REDUCTION,
        statusLabel: '방어력 감소', statusDuration: 9, statusDurationPerLevel: 0.5,
        descriptionIntro: '대상의 장비와 방어 태세에서 취약한 결을 찾아 베어 냅니다.',
    },
    {
        id: 'anvil_resonance', name: '모루의 공명', icon: 'skills/precision_break', activationHeader: 'precision_break',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 550, perLevelPercent: 35,
        forgingPrecisionBasePercent: 60, forgingPrecisionPerLevelPercent: 6,
        manaCost: 32, cooldown: 14, jobId: JOBS.blacksmith, groupTag: GameTags.SKILL_GROUP_BLACKSMITH, unlockLevel: 50,
        guaranteedCritical: true, unavoidable: true,
        descriptionIntro: '무기에 금속의 공명을 실어 대상을 강하게 내리칩니다.',
    },
    {
        id: 'frontline_cleave', name: '전선 가르기', icon: 'skills/steel_slash', activationHeader: 'steel_slash',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 320, perLevelPercent: 20,
        manaCost: 34, cooldown: 10, jobId: JOBS.warrior, groupTag: GameTags.SKILL_GROUP_WARRIOR, unlockLevel: 75,
        weaponDescription: '검 또는 도끼를 장착해야 합니다.', weaponTags: [GameTags.WEAPON_SWORD, GameTags.WEAPON_AXE],
        penetration: { attribute: AttributeType.ARMOR_PEN, base: 28, perLevel: 6 },
        descriptionIntro: '무게 중심을 낮추고 전방의 방어선을 한 번에 갈라 냅니다.',
    },
    {
        id: 'ironblood_counter', name: '철혈 반격', icon: 'skills/indomitable', activationHeader: 'indomitable',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 350, perLevelPercent: 22,
        secondaryAttribute: AttributeType.MAX_LIFE, secondaryBasePercent: 2.5, secondaryPerLevelPercent: 0.25,
        manaCost: 42, cooldown: 14, jobId: JOBS.warrior, groupTag: GameTags.SKILL_GROUP_WARRIOR, unlockLevel: 100,
        weaponDescription: '검 또는 도끼를 장착해야 합니다.', weaponTags: [GameTags.WEAPON_SWORD, GameTags.WEAPON_AXE],
        shieldPercent: 12,
        descriptionIntro: '받아 낸 충격을 몸 안에 붙들어 두었다가 무기에 실어 되돌려 줍니다.',
    },
    {
        id: 'giant_execution', name: '거인 단두', icon: 'skills/steel_slash', activationHeader: 'steel_slash',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 430, perLevelPercent: 28,
        manaCost: 52, cooldown: 13, jobId: JOBS.warrior, groupTag: GameTags.SKILL_GROUP_WARRIOR, unlockLevel: 140,
        weaponDescription: '검 또는 도끼를 장착해야 합니다.', weaponTags: [GameTags.WEAPON_SWORD, GameTags.WEAPON_AXE],
        guaranteedCritical: true, penetration: { attribute: AttributeType.ARMOR_PEN, base: 42, perLevel: 8 },
        descriptionIntro: '거대한 적의 목덜미를 겨누듯 무기를 높이 들어 급소를 내려칩니다.',
    },
    {
        id: 'war_god_descent', name: '전쟁신 강림', icon: 'skills/battle_rush', activationHeader: 'battle_rush',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 520, perLevelPercent: 34,
        secondaryAttribute: AttributeType.MAX_LIFE, secondaryBasePercent: 3, secondaryPerLevelPercent: 0.35,
        manaCost: 68, cooldown: 18, jobId: JOBS.warrior, groupTag: GameTags.SKILL_GROUP_WARRIOR, unlockLevel: 180,
        weaponDescription: '검 또는 도끼를 장착해야 합니다.', weaponTags: [GameTags.WEAPON_SWORD, GameTags.WEAPON_AXE],
        unavoidable: true, penetration: { attribute: AttributeType.ARMOR_PEN, base: 60, perLevel: 10 },
        statusEffect: LegacyStatusEffects.OVERMASTER, statusLabel: '제압', statusDuration: 1.5,
        statusDurationPerLevel: 0.2,
        descriptionIntro: '전장의 압력을 한 몸에 모아 대상이 물러설 틈조차 없이 돌진합니다.',
    },
    {
        id: 'shieldbreaker_blow', name: '방패분쇄', icon: 'skills/steel_slash', activationHeader: 'steel_slash',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 255, perLevelPercent: 17,
        manaCost: 28, cooldown: 8, jobId: JOBS.warrior, groupTag: GameTags.SKILL_GROUP_WARRIOR, unlockLevel: 75,
        weaponDescription: '검 또는 도끼를 장착해야 합니다.', weaponTags: [GameTags.WEAPON_SWORD, GameTags.WEAPON_AXE],
        penetration: { attribute: AttributeType.ARMOR_PEN, base: 38, perLevel: 7 },
        statusEffect: LegacyStatusEffects.DEFENSE_REDUCTION, statusLabel: '방어력 감소',
        statusDuration: 8, statusDurationPerLevel: 0.5,
        descriptionIntro: '무기의 무게를 방어구 한 점에 집중해 방패와 갑옷의 결속을 부숩니다.',
    },
    {
        id: 'bloodline_tempest', name: '혈기 폭풍', icon: 'skills/battle_rush', activationHeader: 'battle_rush',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 325, perLevelPercent: 21,
        secondaryAttribute: AttributeType.MAX_LIFE, secondaryBasePercent: 2, secondaryPerLevelPercent: 0.2,
        manaCost: 38, cooldown: 11, jobId: JOBS.warrior, groupTag: GameTags.SKILL_GROUP_WARRIOR, unlockLevel: 100,
        weaponDescription: '검 또는 도끼를 장착해야 합니다.', weaponTags: [GameTags.WEAPON_SWORD, GameTags.WEAPON_AXE],
        shieldPercent: 8,
        descriptionIntro: '상처에서 솟은 투지를 회전하는 폭풍으로 바꿔 대상에게 되돌립니다.',
    },
    {
        id: 'earthsplitter', name: '대지 가르기', icon: 'skills/steel_slash', activationHeader: 'steel_slash',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 395, perLevelPercent: 26,
        manaCost: 48, cooldown: 13, jobId: JOBS.warrior, groupTag: GameTags.SKILL_GROUP_WARRIOR, unlockLevel: 140,
        weaponDescription: '검 또는 도끼를 장착해야 합니다.', weaponTags: [GameTags.WEAPON_SWORD, GameTags.WEAPON_AXE],
        propertyTag: GameTags.PROPERTY_EARTH, unavoidable: true,
        descriptionIntro: '지면을 따라 충격을 흘려 보내 대상의 발밑에서 대지를 갈라 올립니다.',
    },
    {
        id: 'last_legion', name: '최후 군단', icon: 'skills/indomitable', activationHeader: 'indomitable',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 480, perLevelPercent: 31,
        secondaryAttribute: AttributeType.MAX_LIFE, secondaryBasePercent: 4, secondaryPerLevelPercent: 0.4,
        manaCost: 62, cooldown: 17, jobId: JOBS.warrior, groupTag: GameTags.SKILL_GROUP_WARRIOR, unlockLevel: 180,
        weaponDescription: '검 또는 도끼를 장착해야 합니다.', weaponTags: [GameTags.WEAPON_SWORD, GameTags.WEAPON_AXE],
        guaranteedCritical: true, shieldPercent: 15,
        descriptionIntro: '혼자 남은 전장을 하나의 군단처럼 버티며 모든 힘을 마지막 일격에 싣습니다.',
    },
    {
        id: 'tracking_arrow', name: '추적 화살', icon: 'skills/stunning_shot', activationHeader: 'stunning_shot',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 230, perLevelPercent: 15,
        secondaryAttribute: AttributeType.SPEED, secondaryAttributeScale: MOBILITY_DAMAGE_SCALE,
        secondaryBasePercent: 55, secondaryPerLevelPercent: 4,
        manaCost: 32, cooldown: 9, jobId: JOBS.archer, groupTag: GameTags.SKILL_GROUP_ARCHER, unlockLevel: 75,
        weaponDescription: '활을 장착해야 합니다.', weaponTags: [GameTags.WEAPON_BOW],
        projectile: 'basic_arrow', unavoidable: true,
        descriptionIntro: '대상의 움직임을 미리 읽어 궤적을 휘게 만든 화살을 발사합니다.',
    },
    {
        id: 'rupture_volley', name: '파열 연사', icon: 'skills/multishot', activationHeader: 'multishot',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 108, perLevelPercent: 8,
        secondaryAttribute: AttributeType.SPEED, secondaryAttributeScale: MOBILITY_DAMAGE_SCALE,
        secondaryBasePercent: 26, secondaryPerLevelPercent: 2,
        manaCost: 42, cooldown: 13, jobId: JOBS.archer, groupTag: GameTags.SKILL_GROUP_ARCHER, unlockLevel: 100,
        weaponDescription: '활을 장착해야 합니다.', weaponTags: [GameTags.WEAPON_BOW],
        projectile: 'basic_arrow', hitCount: 3,
        penetration: { attribute: AttributeType.ARMOR_PEN, base: 30, perLevel: 6 },
        descriptionIntro: '같은 상처를 세 번 꿰뚫도록 간격을 맞춘 화살을 연달아 놓습니다.',
    },
    {
        id: 'meteor_arrow', name: '유성 화살', icon: 'skills/stunning_shot', activationHeader: 'stunning_shot',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 345, perLevelPercent: 23,
        secondaryAttribute: AttributeType.SPEED, secondaryAttributeScale: MOBILITY_DAMAGE_SCALE,
        secondaryBasePercent: 82, secondaryPerLevelPercent: 5,
        manaCost: 54, cooldown: 15, jobId: JOBS.archer, groupTag: GameTags.SKILL_GROUP_ARCHER, unlockLevel: 140,
        weaponDescription: '활을 장착해야 합니다.', weaponTags: [GameTags.WEAPON_BOW],
        projectile: 'basic_arrow', propertyTag: GameTags.PROPERTY_FIRE,
        penetration: { attribute: AttributeType.ARMOR_PEN, base: 38, perLevel: 7 },
        statusEffect: StatusEffectType.FIRE, statusLabel: '화염', statusDuration: 8, statusDurationPerLevel: 1,
        descriptionIntro: '활시위에 마찰열을 모아 밤하늘의 유성처럼 타오르는 화살을 쏩니다.',
    },
    {
        id: 'skyfall_barrage', name: '천궁 낙화', icon: 'skills/multishot', activationHeader: 'multishot',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 94, perLevelPercent: 7,
        secondaryAttribute: AttributeType.SPEED, secondaryAttributeScale: MOBILITY_DAMAGE_SCALE,
        secondaryBasePercent: 22, secondaryPerLevelPercent: 1.5,
        manaCost: 70, cooldown: 18, jobId: JOBS.archer, groupTag: GameTags.SKILL_GROUP_ARCHER, unlockLevel: 180,
        weaponDescription: '활을 장착해야 합니다.', weaponTags: [GameTags.WEAPON_BOW],
        projectile: 'basic_arrow', hitCount: 5,
        penetration: { attribute: AttributeType.ARMOR_PEN, base: 48, perLevel: 9 },
        descriptionIntro: '다섯 발을 하늘로 흩뿌려 서로 다른 각도에서 한 대상을 덮치게 합니다.',
    },
    {
        id: 'windsplit_arrow', name: '풍절 화살', icon: 'skills/stunning_shot', activationHeader: 'stunning_shot',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 205, perLevelPercent: 14,
        secondaryAttribute: AttributeType.SPEED, secondaryAttributeScale: MOBILITY_DAMAGE_SCALE,
        secondaryBasePercent: 49, secondaryPerLevelPercent: 3.5,
        manaCost: 27, cooldown: 8, jobId: JOBS.archer, groupTag: GameTags.SKILL_GROUP_ARCHER, unlockLevel: 75,
        weaponDescription: '활을 장착해야 합니다.', weaponTags: [GameTags.WEAPON_BOW],
        projectile: 'basic_arrow', penetration: { attribute: AttributeType.ARMOR_PEN, base: 24, perLevel: 5 },
        descriptionIntro: '화살 앞의 공기를 얇게 갈라 저항과 방어구를 함께 뚫는 사격을 합니다.',
    },
    {
        id: 'binding_arrow', name: '구속 화살', icon: 'skills/stunning_shot', activationHeader: 'stunning_shot',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 255, perLevelPercent: 17,
        secondaryAttribute: AttributeType.SPEED, secondaryAttributeScale: MOBILITY_DAMAGE_SCALE,
        secondaryBasePercent: 61, secondaryPerLevelPercent: 4,
        manaCost: 38, cooldown: 11, jobId: JOBS.archer, groupTag: GameTags.SKILL_GROUP_ARCHER, unlockLevel: 100,
        weaponDescription: '활을 장착해야 합니다.', weaponTags: [GameTags.WEAPON_BOW],
        projectile: 'basic_arrow', statusEffect: LegacyStatusEffects.BIND, statusLabel: '속박',
        statusDuration: 2.5, statusDurationPerLevel: 0.25,
        descriptionIntro: '명중과 동시에 마력 실이 펼쳐지는 화살로 대상의 이동 경로를 묶습니다.',
    },
    {
        id: 'sun_piercer', name: '태양 관통', icon: 'affinities/light', activationHeader: 'stunning_shot',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 328, perLevelPercent: 22,
        secondaryAttribute: AttributeType.SPEED, secondaryAttributeScale: MOBILITY_DAMAGE_SCALE,
        secondaryBasePercent: 78, secondaryPerLevelPercent: 5,
        manaCost: 49, cooldown: 13, jobId: JOBS.archer, groupTag: GameTags.SKILL_GROUP_ARCHER, unlockLevel: 140,
        weaponDescription: '활을 장착해야 합니다.', weaponTags: [GameTags.WEAPON_BOW],
        projectile: 'basic_arrow', propertyTag: GameTags.PROPERTY_LIGHT,
        penetration: { attribute: AttributeType.ARMOR_PEN, base: 46, perLevel: 8 },
        descriptionIntro: '한 줄기 햇빛을 화살대에 감아 그림자와 방어구를 동시에 꿰뚫습니다.',
    },
    {
        id: 'star_rain', name: '성우', icon: 'skills/multishot', activationHeader: 'multishot',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 122, perLevelPercent: 8.5,
        secondaryAttribute: AttributeType.SPEED, secondaryAttributeScale: MOBILITY_DAMAGE_SCALE,
        secondaryBasePercent: 29, secondaryPerLevelPercent: 2,
        manaCost: 64, cooldown: 17, jobId: JOBS.archer, groupTag: GameTags.SKILL_GROUP_ARCHER, unlockLevel: 180,
        weaponDescription: '활을 장착해야 합니다.', weaponTags: [GameTags.WEAPON_BOW],
        projectile: 'basic_arrow', hitCount: 4, propertyTag: GameTags.PROPERTY_LIGHT,
        descriptionIntro: '별빛을 머금은 네 발의 화살을 비처럼 떨어뜨려 대상의 퇴로를 지웁니다.',
    },
    {
        id: 'venom_shadow', name: '독영 투척', icon: 'skills/venom_blade', activationHeader: 'venom_blade',
        damageType: 'physical', attribute: AttributeType.SPEED, attributeScale: MOBILITY_DAMAGE_SCALE,
        basePercent: 162, perLevelPercent: 10.5,
        secondaryAttribute: AttributeType.ATK, secondaryBasePercent: 133, secondaryPerLevelPercent: 8.5,
        manaCost: 32, cooldown: 9, jobId: JOBS.assassin, groupTag: GameTags.SKILL_GROUP_ASSASSIN, unlockLevel: 75,
        projectile: 'basic_arrow', projectileName: '독영', propertyTag: GameTags.PROPERTY_POISON,
        statusEffect: StatusEffectType.DEADLY_POISON, statusLabel: '맹독', statusDuration: 9, statusDurationPerLevel: 1,
        descriptionIntro: '손끝에서 독으로 굳힌 그림자를 뽑아 대상의 혈맥에 꽂습니다.',
    },
    {
        id: 'shadow_pursuit', name: '그림자 추격', icon: 'skills/ambush', activationHeader: 'ambush',
        damageType: 'physical', attribute: AttributeType.SPEED, attributeScale: MOBILITY_DAMAGE_SCALE,
        basePercent: 193, perLevelPercent: 13,
        secondaryAttribute: AttributeType.ATK, secondaryBasePercent: 157, secondaryPerLevelPercent: 10,
        manaCost: 40, cooldown: 11, jobId: JOBS.assassin, groupTag: GameTags.SKILL_GROUP_ASSASSIN, unlockLevel: 100,
        unavoidable: true, propertyTag: GameTags.PROPERTY_DARK,
        penetration: { attribute: AttributeType.ARMOR_PEN, base: 32, perLevel: 7 },
        descriptionIntro: '대상의 그림자를 밟아 도주 경로를 끊고 사각으로 파고듭니다.',
    },
    {
        id: 'heart_extraction', name: '심장 적출', icon: 'skills/ambush', activationHeader: 'ambush',
        damageType: 'physical', attribute: AttributeType.SPEED, attributeScale: MOBILITY_DAMAGE_SCALE,
        basePercent: 242, perLevelPercent: 16,
        secondaryAttribute: AttributeType.ATK, secondaryBasePercent: 198, secondaryPerLevelPercent: 13,
        manaCost: 52, cooldown: 14, jobId: JOBS.assassin, groupTag: GameTags.SKILL_GROUP_ASSASSIN, unlockLevel: 140,
        guaranteedCritical: true, penetration: { attribute: AttributeType.ARMOR_PEN, base: 48, perLevel: 9 },
        statusEffect: LegacyStatusEffects.BLEEDING, statusLabel: '출혈', statusDuration: 10, statusDurationPerLevel: 1,
        descriptionIntro: '한 호흡 동안 맥박을 읽고 가장 깊은 급소만을 정확히 찌릅니다.',
    },
    {
        id: 'formless_chain', name: '무영 연살', icon: 'skills/venom_blade', activationHeader: 'venom_blade',
        damageType: 'physical', attribute: AttributeType.SPEED, attributeScale: MOBILITY_DAMAGE_SCALE,
        basePercent: 103, perLevelPercent: 7,
        secondaryAttribute: AttributeType.ATK, secondaryBasePercent: 85, secondaryPerLevelPercent: 5,
        manaCost: 66, cooldown: 17, jobId: JOBS.assassin, groupTag: GameTags.SKILL_GROUP_ASSASSIN, unlockLevel: 180,
        hitCount: 3, propertyTag: GameTags.PROPERTY_DARK,
        penetration: { attribute: AttributeType.ARMOR_PEN, base: 58, perLevel: 10 },
        statusEffect: LegacyStatusEffects.BLINDNESS, statusLabel: '실명', statusDuration: 3,
        statusDurationPerLevel: 0.35,
        descriptionIntro: '형체를 지운 채 세 방향에서 연달아 베어 감각과 방어를 함께 무너뜨립니다.',
    },
    {
        id: 'nerve_needle', name: '신경침', icon: 'skills/venom_blade', activationHeader: 'venom_blade',
        damageType: 'physical', attribute: AttributeType.SPEED, attributeScale: MOBILITY_DAMAGE_SCALE,
        basePercent: 138, perLevelPercent: 9,
        secondaryAttribute: AttributeType.ATK, secondaryBasePercent: 112, secondaryPerLevelPercent: 8,
        manaCost: 27, cooldown: 8, jobId: JOBS.assassin, groupTag: GameTags.SKILL_GROUP_ASSASSIN, unlockLevel: 75,
        projectile: 'basic_arrow', projectileName: '신경침', propertyTag: GameTags.PROPERTY_POISON,
        statusEffect: StatusEffectType.PARALYTIC_POISON, statusLabel: '마비독',
        statusDuration: 6, statusDurationPerLevel: 0.75,
        descriptionIntro: '독을 바른 가느다란 침을 신경이 모인 곳에 던져 순간적인 경련을 일으킵니다.',
    },
    {
        id: 'miststep_cut', name: '안개걸음', icon: 'skills/ambush', activationHeader: 'ambush',
        damageType: 'physical', attribute: AttributeType.SPEED, attributeScale: MOBILITY_DAMAGE_SCALE,
        basePercent: 176, perLevelPercent: 12,
        secondaryAttribute: AttributeType.ATK, secondaryBasePercent: 144, secondaryPerLevelPercent: 9,
        manaCost: 37, cooldown: 10, jobId: JOBS.assassin, groupTag: GameTags.SKILL_GROUP_ASSASSIN, unlockLevel: 100,
        unavoidable: true, propertyTag: GameTags.PROPERTY_WATER,
        descriptionIntro: '안개처럼 몸을 흩뜨린 뒤 대상의 시야 안쪽에서 다시 모여 베어 냅니다.',
    },
    {
        id: 'death_mark', name: '사점 낙인', icon: 'skills/venom_blade', activationHeader: 'venom_blade',
        damageType: 'physical', attribute: AttributeType.SPEED, attributeScale: MOBILITY_DAMAGE_SCALE,
        basePercent: 220, perLevelPercent: 15,
        secondaryAttribute: AttributeType.ATK, secondaryBasePercent: 180, secondaryPerLevelPercent: 12,
        manaCost: 48, cooldown: 13, jobId: JOBS.assassin, groupTag: GameTags.SKILL_GROUP_ASSASSIN, unlockLevel: 140,
        penetration: { attribute: AttributeType.ARMOR_PEN, base: 44, perLevel: 8 },
        statusEffect: LegacyStatusEffects.CURSE, statusLabel: '쇠약의 저주',
        statusDuration: 9, statusDurationPerLevel: 0.75,
        descriptionIntro: '다음 숨이 끊어질 지점을 낙인으로 새겨 대상의 힘과 회복을 약화합니다.',
    },
    {
        id: 'moonless_execution', name: '무월 처형', icon: 'skills/ambush', activationHeader: 'ambush',
        damageType: 'physical', attribute: AttributeType.SPEED, attributeScale: MOBILITY_DAMAGE_SCALE,
        basePercent: 281, perLevelPercent: 18,
        secondaryAttribute: AttributeType.ATK, secondaryBasePercent: 229, secondaryPerLevelPercent: 15,
        manaCost: 63, cooldown: 17, jobId: JOBS.assassin, groupTag: GameTags.SKILL_GROUP_ASSASSIN, unlockLevel: 180,
        guaranteedCritical: true, unavoidable: true, propertyTag: GameTags.PROPERTY_DARK,
        penetration: { attribute: AttributeType.ARMOR_PEN, base: 62, perLevel: 11 },
        descriptionIntro: '빛이 닿지 않는 한순간을 골라 대상의 그림자와 목숨을 함께 끊습니다.',
    },
    {
        id: 'mana_detonation', name: '마력 폭쇄', icon: 'skills/magic_bolt', activationHeader: 'magic_bolt',
        damageType: 'magic', attribute: AttributeType.MAGIC_FORCE, basePercent: 210, perLevelPercent: 13,
        manaCost: 38, cooldown: 9, jobId: JOBS.mage, groupTag: GameTags.SKILL_GROUP_MAGIC, unlockLevel: 75,
        projectile: 'magic_bolt', projectileName: '폭쇄 마력',
        penetration: { attribute: AttributeType.MAGIC_PEN, base: 28, perLevel: 6 },
        descriptionIntro: '불안정하게 겹친 마력층을 대상 안쪽에서 한꺼번에 붕괴시킵니다.',
    },
    {
        id: 'arcane_meteor', name: '마도 유성', icon: 'skills/magic_bolt', activationHeader: 'magic_bolt',
        damageType: 'magic', attribute: AttributeType.MAGIC_FORCE, basePercent: 260, perLevelPercent: 17,
        manaCost: 48, cooldown: 13, jobId: JOBS.mage, groupTag: GameTags.SKILL_GROUP_MAGIC, unlockLevel: 100,
        projectile: 'basic_magic_orb', projectileName: '마도 유성', unavoidable: true,
        descriptionIntro: '상공에 마력 덩어리를 빚어 대상의 위치로 곧장 낙하시킵니다.',
    },
    {
        id: 'element_collapse', name: '원소 붕괴', icon: 'skills/elemental_bind', activationHeader: 'elemental_bind',
        damageType: 'magic', attribute: AttributeType.MAGIC_FORCE, basePercent: 315, perLevelPercent: 20,
        manaCost: 58, cooldown: 15, jobId: JOBS.mage, groupTag: GameTags.SKILL_GROUP_MAGIC, unlockLevel: 140,
        penetration: { attribute: AttributeType.MAGIC_PEN, base: 45, perLevel: 8 },
        statusEffect: LegacyStatusEffects.MAGIC_DEFENSE_REDUCTION, statusLabel: '마법 저항력 감소',
        statusDuration: 10, statusDurationPerLevel: 0.75,
        descriptionIntro: '대상을 둘러싼 원소의 균형을 무너뜨려 마력 방어막부터 붕괴시킵니다.',
    },
    {
        id: 'constellation_rupture', name: '성좌 파열', icon: 'skills/magic_bolt', activationHeader: 'magic_bolt',
        damageType: 'magic', attribute: AttributeType.MAGIC_FORCE, basePercent: 1_350, perLevelPercent: 82,
        manaCost: 76, cooldown: 18, jobId: JOBS.mage, groupTag: GameTags.SKILL_GROUP_MAGIC, unlockLevel: 180,
        projectile: 'magic_bolt', projectileName: '파열 성좌', unavoidable: true,
        penetration: { attribute: AttributeType.MAGIC_PEN, base: 62, perLevel: 11 }, shieldPercent: 10,
        descriptionIntro: '작은 성좌를 마력으로 그린 뒤 모든 별의 선을 대상 한 점에서 파열시킵니다.',
    },
    {
        id: 'hotspot_strike', name: '열점 타격', icon: 'skills/precision_break', activationHeader: 'precision_break',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 270, perLevelPercent: 18,
        secondaryAttribute: AttributeType.MAX_LIFE, secondaryBasePercent: 3, secondaryPerLevelPercent: 0.25,
        forgingPrecisionBasePercent: 50, forgingPrecisionPerLevelPercent: 5,
        manaCost: 34, cooldown: 10, jobId: JOBS.blacksmith, groupTag: GameTags.SKILL_GROUP_BLACKSMITH, unlockLevel: 75,
        guaranteedCritical: true, statusEffect: LegacyStatusEffects.DEFENSE_REDUCTION,
        statusLabel: '방어력 감소', statusDuration: 10, statusDurationPerLevel: 0.5,
        descriptionIntro: '금속이 가장 먼저 무너지는 열점을 찾아 한 치의 오차 없이 내리칩니다.',
    },
    {
        id: 'steel_pulse', name: '강철 맥동', icon: 'skills/indomitable', activationHeader: 'indomitable',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 310, perLevelPercent: 20,
        forgingPrecisionBasePercent: 70, forgingPrecisionPerLevelPercent: 7,
        manaCost: 42, cooldown: 14, jobId: JOBS.blacksmith, groupTag: GameTags.SKILL_GROUP_BLACKSMITH, unlockLevel: 100,
        unavoidable: true, shieldPercent: 14,
        descriptionIntro: '갑옷과 무기의 진동을 같은 박자로 맞춰 충격파와 방벽을 동시에 일으킵니다.',
    },
    {
        id: 'masterwork_break', name: '극정밀 파쇄', icon: 'skills/precision_break', activationHeader: 'precision_break',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 385, perLevelPercent: 25,
        secondaryAttribute: AttributeType.MAX_LIFE, secondaryBasePercent: 4, secondaryPerLevelPercent: 0.35,
        forgingPrecisionBasePercent: 90, forgingPrecisionPerLevelPercent: 8,
        manaCost: 54, cooldown: 14, jobId: JOBS.blacksmith, groupTag: GameTags.SKILL_GROUP_BLACKSMITH, unlockLevel: 140,
        guaranteedCritical: true, penetration: { attribute: AttributeType.ARMOR_PEN, base: 48, perLevel: 9 },
        descriptionIntro: '수없이 단조한 경험으로 대상의 결함선을 계산해 정확히 그 선만 파쇄합니다.',
    },
    {
        id: 'anvil_starfall', name: '모루성 낙하', icon: 'skills/precision_break', activationHeader: 'precision_break',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 500, perLevelPercent: 32,
        secondaryAttribute: AttributeType.MAX_LIFE, secondaryBasePercent: 6, secondaryPerLevelPercent: 0.5,
        forgingPrecisionBasePercent: 120, forgingPrecisionPerLevelPercent: 10,
        manaCost: 72, cooldown: 18, jobId: JOBS.blacksmith, groupTag: GameTags.SKILL_GROUP_BLACKSMITH, unlockLevel: 180,
        guaranteedCritical: true, unavoidable: true,
        penetration: { attribute: AttributeType.ARMOR_PEN, base: 64, perLevel: 11 },
        descriptionIntro: '하늘의 별을 거대한 모루로 상상해 대상의 결함점 위로 그대로 떨어뜨립니다.',
    },
    {
        id: 'blazing_spear', name: '작열창', icon: 'affinities/fire', activationHeader: 'fireball',
        damageType: 'magic', attribute: AttributeType.MAGIC_FORCE, basePercent: 240, perLevelPercent: 15,
        manaCost: 42, cooldown: 10, jobId: JOBS.mage, groupTag: GameTags.SKILL_GROUP_MAGIC, unlockLevel: 75,
        projectile: 'magic_bolt', projectileName: '작열창', propertyTag: GameTags.PROPERTY_FIRE,
        penetration: { attribute: AttributeType.MAGIC_PEN, base: 30, perLevel: 6 },
        statusEffect: StatusEffectType.FIRE, statusLabel: '화염', statusDuration: 10, statusDurationPerLevel: 1,
        autoAcquireProgress: {
            id: 'career:mage_fire_kills', count: 30, prerequisiteSkillId: 'fireball', prerequisiteLevel: 3,
        },
        descriptionIntro: '화염구를 가늘고 뜨겁게 압축해 갑옷 틈을 꿰뚫는 불꽃 창으로 빚습니다.',
    },
    {
        id: 'phoenix_eruption', name: '불사조 폭염', icon: 'affinities/fire', activationHeader: 'fireball',
        damageType: 'magic', attribute: AttributeType.MAGIC_FORCE, basePercent: 335, perLevelPercent: 20,
        manaCost: 62, cooldown: 15, jobId: JOBS.mage, groupTag: GameTags.SKILL_GROUP_MAGIC, unlockLevel: 140,
        projectile: 'basic_magic_orb', projectileName: '불사조 폭염', propertyTag: GameTags.PROPERTY_FIRE,
        statusEffect: StatusEffectType.FIRE, statusLabel: '화염', statusDuration: 14, statusDurationPerLevel: 1.25,
        autoAcquireProgress: {
            id: 'career:mage_fire_kills', count: 100, prerequisiteSkillId: 'blazing_spear', prerequisiteLevel: 3,
        },
        descriptionIntro: '되살아나는 불꽃의 형상을 만들어 대상에게 폭발시키고 꺼지지 않는 열기를 남깁니다.',
    },
    {
        id: 'inferno_meteor', name: '겁화 유성', icon: 'affinities/fire', activationHeader: 'fireball',
        damageType: 'magic', attribute: AttributeType.MAGIC_FORCE, basePercent: 1_425, perLevelPercent: 86,
        manaCost: 86, cooldown: 20, jobId: JOBS.mage, groupTag: GameTags.SKILL_GROUP_MAGIC, unlockLevel: 180,
        projectile: 'basic_magic_orb', projectileName: '겁화 유성', propertyTag: GameTags.PROPERTY_FIRE,
        unavoidable: true, penetration: { attribute: AttributeType.MAGIC_PEN, base: 68, perLevel: 12 },
        statusEffect: StatusEffectType.FIRE, statusLabel: '화염', statusDuration: 18, statusDurationPerLevel: 1.5,
        autoAcquireProgress: {
            id: 'career:mage_fire_kills', count: 200, prerequisiteSkillId: 'phoenix_eruption', prerequisiteLevel: 4,
        },
        descriptionIntro: '상공의 열을 한 점으로 끌어모아 피할 수 없는 거대한 겁화의 유성으로 떨어뜨립니다.',
    },
    {
        id: 'frost_prison', name: '서리 감옥', icon: 'affinities/ice', activationHeader: 'elemental_bind',
        damageType: 'magic', attribute: AttributeType.MAGIC_FORCE, basePercent: 225, perLevelPercent: 14,
        manaCost: 40, cooldown: 11, jobId: JOBS.mage, groupTag: GameTags.SKILL_GROUP_MAGIC, unlockLevel: 75,
        projectile: 'basic_magic_orb', projectileName: '서리 감옥', propertyTag: GameTags.PROPERTY_ICE,
        statusEffect: LegacyStatusEffects.FROZEN, statusLabel: '빙결', statusDuration: 3,
        statusDurationPerLevel: 0.3,
        autoAcquireProgress: {
            id: 'career:mage_ice_kills', count: 30, prerequisiteSkillId: 'frost_bolt', prerequisiteLevel: 3,
        },
        descriptionIntro: '대상 주위의 수분을 한순간에 얼려 움직임을 가두는 서리 감옥을 세웁니다.',
    },
    {
        id: 'glacial_spike', name: '빙하 첨탑', icon: 'affinities/ice', activationHeader: 'magic_bolt',
        damageType: 'magic', attribute: AttributeType.MAGIC_FORCE, basePercent: 325, perLevelPercent: 20,
        manaCost: 60, cooldown: 15, jobId: JOBS.mage, groupTag: GameTags.SKILL_GROUP_MAGIC, unlockLevel: 140,
        projectile: 'magic_bolt', projectileName: '빙하 첨탑', propertyTag: GameTags.PROPERTY_ICE,
        penetration: { attribute: AttributeType.MAGIC_PEN, base: 48, perLevel: 9 },
        statusEffect: LegacyStatusEffects.FROZEN, statusLabel: '빙결', statusDuration: 4,
        statusDurationPerLevel: 0.35,
        autoAcquireProgress: {
            id: 'career:mage_ice_kills', count: 100, prerequisiteSkillId: 'frost_prison', prerequisiteLevel: 3,
        },
        descriptionIntro: '오래된 빙하의 압력을 창끝에 담아 마력 방벽까지 얼려 부수는 첨탑을 발사합니다.',
    },
    {
        id: 'absolute_zero', name: '절대영도', icon: 'affinities/ice', activationHeader: 'elemental_bind',
        damageType: 'magic', attribute: AttributeType.MAGIC_FORCE, basePercent: 1_350, perLevelPercent: 82,
        manaCost: 84, cooldown: 21, jobId: JOBS.mage, groupTag: GameTags.SKILL_GROUP_MAGIC, unlockLevel: 180,
        unavoidable: true, propertyTag: GameTags.PROPERTY_ICE,
        penetration: { attribute: AttributeType.MAGIC_PEN, base: 64, perLevel: 11 },
        statusEffect: LegacyStatusEffects.FROZEN, statusLabel: '빙결', statusDuration: 5,
        statusDurationPerLevel: 0.45,
        autoAcquireProgress: {
            id: 'career:mage_ice_kills', count: 200, prerequisiteSkillId: 'glacial_spike', prerequisiteLevel: 4,
        },
        descriptionIntro: '대상 주변의 열 운동을 강제로 멈춰 피할 공간까지 얼어붙는 절대영도를 펼칩니다.',
    },
    {
        id: 'thunder_lance', name: '뇌광창', icon: 'affinities/electric', activationHeader: 'magic_bolt',
        damageType: 'magic', attribute: AttributeType.MAGIC_FORCE, basePercent: 235, perLevelPercent: 15,
        manaCost: 41, cooldown: 9, jobId: JOBS.mage, groupTag: GameTags.SKILL_GROUP_MAGIC, unlockLevel: 75,
        projectile: 'magic_bolt', projectileName: '뇌광창', propertyTag: GameTags.PROPERTY_ELECTRIC,
        penetration: { attribute: AttributeType.MAGIC_PEN, base: 26, perLevel: 6 },
        statusEffect: StatusEffectType.PARALYTIC_POISON, statusLabel: '마비독', statusDuration: 7,
        statusDurationPerLevel: 0.75,
        autoAcquireProgress: {
            id: 'career:mage_electric_kills', count: 30, prerequisiteSkillId: 'lightning_orb', prerequisiteLevel: 3,
        },
        descriptionIntro: '전류를 한 줄기 창으로 정렬해 신경과 마력 회로를 함께 관통합니다.',
    },
    {
        id: 'chain_thunder', name: '연쇄 뇌격', icon: 'affinities/electric', activationHeader: 'magic_bolt',
        damageType: 'magic', attribute: AttributeType.MAGIC_FORCE, basePercent: 118, perLevelPercent: 8,
        manaCost: 61, cooldown: 14, jobId: JOBS.mage, groupTag: GameTags.SKILL_GROUP_MAGIC, unlockLevel: 140,
        projectile: 'magic_bolt', projectileName: '연쇄 뇌격', propertyTag: GameTags.PROPERTY_ELECTRIC,
        hitCount: 3, statusEffect: StatusEffectType.PARALYTIC_POISON, statusLabel: '마비독',
        statusDuration: 8, statusDurationPerLevel: 0.8,
        autoAcquireProgress: {
            id: 'career:mage_electric_kills', count: 100, prerequisiteSkillId: 'thunder_lance', prerequisiteLevel: 3,
        },
        descriptionIntro: '세 번 되튀는 뇌격을 같은 대상의 마력 회로에 연속으로 흘려보냅니다.',
    },
    {
        id: 'heavenly_thunder', name: '천뢰 심판', icon: 'affinities/electric', activationHeader: 'magic_bolt',
        damageType: 'magic', attribute: AttributeType.MAGIC_FORCE, basePercent: 1_380, perLevelPercent: 84,
        manaCost: 85, cooldown: 19, jobId: JOBS.mage, groupTag: GameTags.SKILL_GROUP_MAGIC, unlockLevel: 180,
        unavoidable: true, propertyTag: GameTags.PROPERTY_ELECTRIC,
        penetration: { attribute: AttributeType.MAGIC_PEN, base: 66, perLevel: 12 },
        statusEffect: LegacyStatusEffects.STUN, statusLabel: '기절', statusDuration: 3,
        statusDurationPerLevel: 0.3,
        autoAcquireProgress: {
            id: 'career:mage_electric_kills', count: 200, prerequisiteSkillId: 'chain_thunder', prerequisiteLevel: 4,
        },
        descriptionIntro: '대상의 마력을 피뢰침으로 삼아 하늘의 번개를 한 줄기 심판으로 떨어뜨립니다.',
    },
    {
        id: 'predator_pounce', name: '포식자의 도약', icon: 'skills/battle_rush', activationHeader: 'battle_rush',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 220, perLevelPercent: 15,
        manaCost: 20, cooldown: 10, unavoidable: true,
        statusEffect: LegacyStatusEffects.BLEEDING, statusLabel: '출혈', statusDuration: 8, statusDurationPerLevel: 1,
        descriptionIntro: '포식자처럼 단숨에 거리를 좁혀 대상을 덮칩니다.',
    },
    {
        id: 'silverweb_snare', name: '은실 사냥망', icon: 'skills/stunning_shot', activationHeader: 'stunning_shot',
        damageType: 'magic', attribute: AttributeType.MAGIC_FORCE, basePercent: 180, perLevelPercent: 13,
        manaCost: 24, cooldown: 12, projectile: 'basic_magic_orb', projectileName: '은실 사냥망',
        propertyTag: GameTags.PROPERTY_INSECT, statusEffect: LegacyStatusEffects.BIND,
        statusLabel: '속박', statusDuration: 2.5, statusDurationPerLevel: 0.25,
        descriptionIntro: '은빛 거미실로 엮은 사냥망을 대상에게 펼칩니다.',
    },
    {
        id: 'hoarfrost_snare', name: '상고 그물', icon: 'affinities/ice', activationHeader: 'stunning_shot',
        damageType: 'magic', attribute: AttributeType.MAGIC_FORCE, basePercent: 210, perLevelPercent: 15,
        manaCost: 30, cooldown: 13, projectile: 'basic_magic_orb', projectileName: '상고 그물',
        propertyTag: GameTags.PROPERTY_ICE, statusEffect: LegacyStatusEffects.FROZEN,
        statusLabel: '빙결', statusDuration: 2.5, statusDurationPerLevel: 0.3,
        descriptionIntro: '서리 맺힌 거미줄을 한 점에 얼려 대상에게 던집니다.',
    },
    {
        id: 'aurora_lance', name: '극광 창', icon: 'affinities/ice', activationHeader: 'magic_bolt',
        damageType: 'magic', attribute: AttributeType.MAGIC_FORCE, basePercent: 265, perLevelPercent: 18,
        manaCost: 38, cooldown: 12, projectile: 'magic_bolt', projectileName: '극광 창',
        propertyTag: GameTags.PROPERTY_ICE,
        penetration: { attribute: AttributeType.MAGIC_PEN, base: 28, perLevel: 6 },
        descriptionIntro: '흩어진 극광을 하나의 얼음 창으로 압축해 발사합니다.',
    },
    {
        id: 'siren_wave', name: '해무 파가', icon: 'affinities/water', activationHeader: 'magic_bolt',
        damageType: 'magic', attribute: AttributeType.MAGIC_FORCE, basePercent: 235, perLevelPercent: 16,
        manaCost: 34, cooldown: 13, projectile: 'basic_magic_orb', projectileName: '해무 파가',
        propertyTag: GameTags.PROPERTY_WATER, statusEffect: LegacyStatusEffects.CHARM,
        statusLabel: '매혹', statusDuration: 2, statusDurationPerLevel: 0.25,
        descriptionIntro: '해무에 세이렌의 노래를 실어 거센 파도로 밀어냅니다.',
    },
    {
        id: 'abyss_anchor', name: '심해 닻', icon: 'affinities/metal', activationHeader: 'steel_slash',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 285, perLevelPercent: 19,
        manaCost: 40, cooldown: 14, unavoidable: true, propertyTag: GameTags.PROPERTY_METAL,
        penetration: { attribute: AttributeType.ARMOR_PEN, base: 34, perLevel: 7 },
        statusEffect: LegacyStatusEffects.BIND, statusLabel: '속박', statusDuration: 2.5, statusDurationPerLevel: 0.25,
        descriptionIntro: '심해철로 벼린 거대한 닻을 대상에게 내리꽂습니다.',
    },
    {
        id: 'photon_lance', name: '광자창', icon: 'affinities/light', activationHeader: 'magic_bolt',
        damageType: 'magic', attribute: AttributeType.MAGIC_FORCE, basePercent: 300, perLevelPercent: 21,
        manaCost: 46, cooldown: 12, groupTag: GameTags.SKILL_GROUP_MAGIC,
        projectile: 'magic_bolt', projectileName: '광자창', propertyTag: GameTags.PROPERTY_LIGHT,
        penetration: { attribute: AttributeType.MAGIC_PEN, base: 42, perLevel: 8 },
        descriptionIntro: '광자 렌즈로 모은 빛을 가느다란 창으로 압축해 대상에게 발사합니다.',
    },
    {
        id: 'causality_lock', name: '인과고정', icon: 'affinities/dark', activationHeader: 'elemental_bind',
        damageType: 'magic', attribute: AttributeType.MAGIC_FORCE, basePercent: 250, perLevelPercent: 18,
        manaCost: 44, cooldown: 15, groupTag: GameTags.SKILL_GROUP_MAGIC,
        unavoidable: true, propertyTag: GameTags.PROPERTY_DARK,
        statusEffect: LegacyStatusEffects.BIND, statusLabel: '속박', statusDuration: 3, statusDurationPerLevel: 0.4,
        penetration: { attribute: AttributeType.MAGIC_PEN, base: 34, perLevel: 7 },
        descriptionIntro: '대상의 현재 위치를 결과로 고정해 움직임과 회피 경로를 함께 끊습니다.',
    },
    {
        id: 'gearstorm', name: '톱니폭우', icon: 'affinities/metal', activationHeader: 'multishot',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 175, perLevelPercent: 14,
        manaCost: 40, cooldown: 14, groupTag: GameTags.SKILL_GROUP_WARRIOR,
        projectile: 'basic_arrow', projectileName: '비행 톱니', propertyTag: GameTags.PROPERTY_METAL,
        hitCount: 3, penetration: { attribute: AttributeType.ARMOR_PEN, base: 28, perLevel: 6 },
        descriptionIntro: '세 장의 비행 톱니를 서로 다른 각도로 회전시켜 대상에게 연달아 쏟아냅니다.',
    },
    {
        id: 'paradox_reversal', name: '역설반전', icon: 'affinities/light', activationHeader: 'sanctum_judgment',
        damageType: 'magic', attribute: AttributeType.MAGIC_FORCE, basePercent: 275, perLevelPercent: 19,
        manaCost: 52, cooldown: 18, groupTag: GameTags.SKILL_GROUP_MAGIC,
        unavoidable: true, propertyTag: GameTags.PROPERTY_LIGHT, shieldPercent: 12,
        descriptionIntro: '받게 될 충격의 일부를 뒤집어 대상에게 되돌리고 남은 힘을 방벽으로 고정합니다.',
    },
    {
        id: 'hellhound_charge', name: '재아귀 돌진', icon: 'affinities/fire', activationHeader: 'battle_rush',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 320, perLevelPercent: 22,
        manaCost: 48, cooldown: 13, groupTag: GameTags.SKILL_GROUP_WARRIOR,
        unavoidable: true, propertyTag: GameTags.PROPERTY_FIRE,
        penetration: { attribute: AttributeType.ARMOR_PEN, base: 44, perLevel: 9 },
        statusEffect: LegacyStatusEffects.BLEEDING, statusLabel: '출혈', statusDuration: 9, statusDurationPerLevel: 0.75,
        descriptionIntro: '흑염을 두른 마수의 자세로 거리를 짓밟고 대상의 방어선에 들이받습니다.',
    },
    {
        id: 'blackflame_brand', name: '흑염 낙인', icon: 'affinities/fire', activationHeader: 'fireball',
        damageType: 'magic', attribute: AttributeType.MAGIC_FORCE, basePercent: 315, perLevelPercent: 22,
        manaCost: 50, cooldown: 14, groupTag: GameTags.SKILL_GROUP_MAGIC,
        projectile: 'basic_magic_orb', projectileName: '흑염 낙인', propertyTag: GameTags.PROPERTY_FIRE,
        penetration: { attribute: AttributeType.MAGIC_PEN, base: 46, perLevel: 9 },
        statusEffect: LegacyStatusEffects.CURSE, statusLabel: '쇠약의 저주', statusDuration: 9, statusDurationPerLevel: 0.75,
        descriptionIntro: '빛 없는 불꽃을 낙인의 형태로 압축해 대상의 힘과 회복을 함께 태웁니다.',
    },
    {
        id: 'sovereign_decree', name: '재왕의 칙령', icon: 'affinities/undead', activationHeader: 'deathless_requiem',
        damageType: 'magic', attribute: AttributeType.MAGIC_FORCE, basePercent: 295, perLevelPercent: 20,
        manaCost: 55, cooldown: 18, groupTag: GameTags.SKILL_GROUP_MAGIC,
        unavoidable: true, propertyTag: GameTags.PROPERTY_UNDEAD, shieldPercent: 10,
        penetration: { attribute: AttributeType.MAGIC_PEN, base: 40, perLevel: 8 },
        statusEffect: LegacyStatusEffects.FEAR, statusLabel: '공포', statusDuration: 3.5, statusDurationPerLevel: 0.35,
        descriptionIntro: '폐허의 왕명을 한 문장으로 선고해 대상의 의지를 꺾고 남은 권능을 방벽으로 거둡니다.',
    },
    {
        id: 'voidstep', name: '공허걸음', icon: 'affinities/dark', activationHeader: 'ambush',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 345, perLevelPercent: 24,
        manaCost: 58, cooldown: 14, groupTag: GameTags.SKILL_GROUP_ASSASSIN,
        unavoidable: true, propertyTag: GameTags.PROPERTY_DARK,
        penetration: { attribute: AttributeType.ARMOR_PEN, base: 54, perLevel: 10 },
        statusEffect: LegacyStatusEffects.BLINDNESS, statusLabel: '실명', statusDuration: 3.5, statusDurationPerLevel: 0.35,
        descriptionIntro: '공허에 한 걸음을 숨긴 뒤 대상의 그림자에서 나타나 방어선과 시야를 함께 끊습니다.',
    },
    {
        id: 'crown_nullification', name: '왕관무효', icon: 'affinities/light', activationHeader: 'sanctum_judgment',
        damageType: 'magic', attribute: AttributeType.MAGIC_FORCE, basePercent: 335, perLevelPercent: 23,
        manaCost: 62, cooldown: 18, groupTag: GameTags.SKILL_GROUP_MAGIC,
        unavoidable: true, propertyTag: GameTags.PROPERTY_LIGHT, shieldPercent: 14,
        penetration: { attribute: AttributeType.MAGIC_PEN, base: 52, perLevel: 10 },
        statusEffect: LegacyStatusEffects.SILENCE, statusLabel: '침묵', statusDuration: 4, statusDurationPerLevel: 0.4,
        descriptionIntro: '대상에게 내려진 권능의 문장을 지워 마법 흐름을 끊고 지워진 힘을 자신의 방벽으로 되돌립니다.',
    },
    {
        id: 'undertow_step', name: '역조보법', icon: 'affinities/water', activationHeader: 'battle_rush',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 365, perLevelPercent: 25,
        manaCost: 64, cooldown: 14, groupTag: GameTags.SKILL_GROUP_ASSASSIN,
        unavoidable: true, propertyTag: GameTags.PROPERTY_WATER,
        penetration: { attribute: AttributeType.ARMOR_PEN, base: 60, perLevel: 11 },
        statusEffect: LegacyStatusEffects.SLOWNESS, statusLabel: '둔화', statusDuration: 5, statusDurationPerLevel: 0.4,
        descriptionIntro: '거꾸로 흐르는 해류에 몸을 실어 대상의 등 뒤로 파고들고 발밑의 흐름을 끊습니다.',
    },
    {
        id: 'eclipse_verdict', name: '월식선고', icon: 'affinities/dark', activationHeader: 'sanctum_judgment',
        damageType: 'magic', attribute: AttributeType.MAGIC_FORCE, basePercent: 360, perLevelPercent: 25,
        manaCost: 68, cooldown: 18, groupTag: GameTags.SKILL_GROUP_MAGIC,
        unavoidable: true, propertyTag: GameTags.PROPERTY_DARK, shieldPercent: 15,
        penetration: { attribute: AttributeType.MAGIC_PEN, base: 58, perLevel: 11 },
        statusEffect: LegacyStatusEffects.BLINDNESS, statusLabel: '실명', statusDuration: 4.5, statusDurationPerLevel: 0.4,
        descriptionIntro: '달빛과 심해의 어둠을 겹쳐 대상의 감각을 지우고 남은 월광을 방벽으로 거둡니다.',
    },
    {
        id: 'rootbreaker_descent', name: '역근강하', icon: 'affinities/earth', activationHeader: 'battle_rush',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 390, perLevelPercent: 27,
        manaCost: 70, cooldown: 14, groupTag: GameTags.SKILL_GROUP_WARRIOR,
        unavoidable: true, propertyTag: GameTags.PROPERTY_EARTH,
        penetration: { attribute: AttributeType.ARMOR_PEN, base: 68, perLevel: 12 },
        statusEffect: LegacyStatusEffects.DEFENSE_REDUCTION, statusLabel: '방어력 감소', statusDuration: 10, statusDurationPerLevel: 0.5,
        descriptionIntro: '하늘에서 뻗어 내리는 역근의 무게를 몸에 실어 대상의 방어선 위로 곧장 떨어집니다.',
    },
    {
        id: 'primordial_sanctuary', name: '태초성역', icon: 'affinities/holy', activationHeader: 'sanctum_judgment',
        damageType: 'magic', attribute: AttributeType.MAGIC_FORCE, basePercent: 385, perLevelPercent: 27,
        manaCost: 74, cooldown: 19, groupTag: GameTags.SKILL_GROUP_MAGIC,
        unavoidable: true, propertyTag: GameTags.PROPERTY_HOLY, shieldPercent: 16,
        penetration: { attribute: AttributeType.MAGIC_PEN, base: 66, perLevel: 12 },
        statusEffect: LegacyStatusEffects.SILENCE, statusLabel: '침묵', statusDuration: 4.5, statusDurationPerLevel: 0.45,
        descriptionIntro: '태초심장의 첫 박동을 성역으로 펼쳐 대상의 마력 흐름을 끊고 남은 생명력을 방벽으로 거둡니다.',
    },
];

function growthTechniqueDescription(technique: GrowthTechniqueDefinition): string {
    const multipleHits = Boolean(technique.hitCount && technique.hitCount > 1);
    const subject = multipleHits ? '이 기술은' : technique.projectile ? '이 투사체는' : '이 공격은';
    const coefficientIcons = [
        technique.attribute,
        technique.secondaryAttribute,
        technique.tertiaryAttribute,
        ...(technique.forgingPrecisionBasePercent !== undefined ? [AttributeType.FORGING_PRECISION] : []),
    ]
        .filter((attribute): attribute is AttributeType => Boolean(attribute))
        .filter((attribute, index, values) => values.indexOf(attribute) === index)
        .map(attribute => `{{icon.${attribute.key}}}`)
        .join('');
    const clauses = [
        ...(technique.projectile
            ? ['시전자의 {{icon.critRate}} 치명타 확률과 {{icon.critDmg}} 치명타 피해를 적용받고']
            : []),
        ...(technique.guaranteedCritical ? ['반드시 치명타로 적중하며'] : []),
        ...(technique.unavoidable ? ['회피할 수 없고'] : []),
        ...(technique.penetration ? [
            `{{icon.${technique.penetration.attribute.key}}} ${penetrationLabel(technique.penetration.attribute)} `
            + `[color=${technique.damageType === 'magic' ? '$magic' : 'orange'}]{{penetration}}[/color]이 부여되며`,
        ] : []),
        `${coefficientIcons} [color=${technique.damageType === 'magic' ? '$magic' : 'orange'}]{{damage}}[/color]의 `
        + `${technique.damageType === 'magic' ? '마법' : '물리'} 피해를${multipleHits ? ' {{hitCount}}회' : ''} 입힙니다`,
    ];
    return [
        technique.descriptionIntro,
        `${subject} ${clauses.join(', ')}.`,
        technique.statusEffect
            ? `적중한 대상에게 Lv.{{statusLevel}} ${technique.statusLabel} 효과를 {{statusDuration}} 동안 부여합니다.`
            : '',
        technique.shieldPercent
            ? '공격 후 {{shieldAmount}}만큼의 피해를 막는 일반 보호막을 8초 동안 얻습니다.'
            : '',
        technique.projectile ? PROJECTILE_FLIGHT_TEXT : '',
    ].filter(Boolean).join(' ');
}

for (const technique of growthTechniques) defineSkill({
    id: technique.id,
    name: technique.name,
    icon: technique.icon,
    activationHeader: technique.activationHeader,
    maxLevel: 5,
    unlockLevel: technique.unlockLevel,
    descriptionTemplate: growthTechniqueDescription(technique),
    costTemplate: `{{icon.maxMentality}} [color=$magic]정신력 ${technique.manaCost}[/color]`,
    activationConditionTemplate: targetActivationGuide(technique.weaponDescription),
    activationMessage: `${technique.name}!`,
    baseMetadata: null,
    calculatedFields: {
        damage: context => growthTechniqueDamageTooltip(context, technique),
        hitCount: () => technique.hitCount ?? 1,
        penetration: context => technique.penetration
            ? levelValueTooltip(context, technique.penetration.attribute.label, technique.penetration.base, technique.penetration.perLevel)
            : 0,
        statusLevel: context => technique.statusLevel?.(context.skill.level) ?? context.skill.level,
        statusDuration: context => levelValueTooltip(
            context,
            `${technique.statusLabel ?? '효과'} 지속시간`,
            technique.statusDuration ?? 0,
            technique.statusDurationPerLevel ?? 0,
            '초',
        ),
        shieldPercent: () => technique.shieldPercent ? `${formatNumber(technique.shieldPercent)}%` : '0%',
        shieldAmount: context => technique.shieldPercent
            ? tooltipValue(
                context.owner.maxLife * technique.shieldPercent / 100,
                `최대 생명력 × ${formatNumber(technique.shieldPercent)}%`,
            )
            : 0,
        projectileTravelTime: context => technique.projectile
            ? projectileTravelTimeTooltip(context, technique.projectile, technique.damageType === 'magic')
            : 0,
    },
    balance: {
        role: technique.statusEffect ? SkillBalanceRole.CONTROL
            : technique.shieldPercent ? SkillBalanceRole.DEFENSE : SkillBalanceRole.DAMAGE,
        damageType: technique.damageType,
        effectTags: technique.propertyTag ? [technique.propertyTag] : undefined,
        calculateDamage: context => growthTechniqueDamage(context, technique),
        calculateEvasionAttackSpeed: technique.projectile
            ? context => projectileEvasionAttackSpeed(context, technique.projectile!, technique.damageType === 'magic')
            : undefined,
        calculatePenetration: technique.penetration
            ? context => {
                const granted = valueByLevel(
                    context.skill.level,
                    technique.penetration!.base,
                    technique.penetration!.perLevel,
                );
                if (technique.projectile) return granted;
                const base = context.owner.attribute.get(
                    technique.damageType === 'magic' ? AttributeType.MAGIC_PEN : AttributeType.ARMOR_PEN,
                );
                return base + granted;
            }
            : undefined,
        unavoidable: technique.unavoidable,
        criticalMode: technique.guaranteedCritical ? SkillCriticalMode.GUARANTEED : SkillCriticalMode.NORMAL,
        hitCount: technique.hitCount,
        calculateManaCost: () => technique.manaCost,
        calculateShield: technique.shieldPercent
            ? context => context.owner.maxLife * technique.shieldPercent! / 100 : undefined,
        notes: technique.statusEffect ? [`${technique.statusLabel}의 전술 가치는 직접 피해와 분리합니다.`] : undefined,
    },
    calculateMaxCooldown: () => technique.cooldown,
    sharedCooldowns: technique.groupTag
        ? combatSharedCooldowns(technique.groupTag, technique.propertyTag) : undefined,
    jobRequirement: technique.jobId ? jobRequirement(technique.jobId) : undefined,
    autoAcquire: technique.jobId && technique.unlockLevel
        ? technique.autoAcquireProgress
            ? careerMasteryAutoAcquire(technique.jobId, technique.unlockLevel, technique.autoAcquireProgress)
            : careerLevelAutoAcquire(technique.jobId, technique.unlockLevel)
        : undefined,
    ...(technique.weaponDescription && technique.weaponTags?.length ? {
        weaponRequirement: weaponRequirement(technique.weaponDescription, ...technique.weaponTags),
    } : {}),
    canActivate: simpleCheck(technique.manaCost),
    onStart: context => {
        const found = targetOrDeny(context);
        if ('reason' in found) throw new Error(found.reason);
        spend(context, technique.manaCost);
        const damage = growthTechniqueDamage(context, technique);
        const hit = (result: ReturnType<Entity['attack']>) => {
            if (!result || result.evaded || result.finalDamage <= 0 || !technique.statusEffect) return;
            found.target.applyStatusEffect(
                technique.statusEffect,
                valueByLevel(context.skill.level, technique.statusDuration ?? 0, technique.statusDurationPerLevel ?? 0),
                technique.statusLevel?.(context.skill.level) ?? context.skill.level,
            );
        };
        if (technique.projectile) {
            for (let index = 0; index < (technique.hitCount ?? 1); index++) {
                const penetration = technique.penetration
                    ? valueByLevel(context.skill.level, technique.penetration.base, technique.penetration.perLevel)
                    : undefined;
                projectileAttack(
                    context,
                    technique.projectile,
                    1,
                    technique.propertyTag ? [technique.propertyTag] : undefined,
                    (_projectile, result) => hit(result),
                    {
                        ...(technique.projectileName ? { name: technique.projectileName } : {}),
                        ...(technique.unavoidable ? { unavoidable: true } : {}),
                        damage,
                        attributeOverrides: {
                            ...(penetration !== undefined && technique.penetration
                                ? { [technique.penetration.attribute.key]: penetration } : {}),
                        },
                    },
                );
            }
        } else {
            const penetrationSource = `skill:${technique.id}:penetration`;
            const penetration = technique.penetration
                ? valueByLevel(context.skill.level, technique.penetration.base, technique.penetration.perLevel)
                : 0;
            if (technique.penetration) {
                context.owner.attribute.removeBySource(penetrationSource);
                context.owner.attribute.addModifiers([{
                    attribute: technique.penetration.attribute.key,
                    op: 'add',
                    value: penetration,
                    source: penetrationSource,
                }]);
            }
            try {
                const result = context.owner.attack(found.target, technique.damageType,
                    damage, {
                        criticalRate: technique.guaranteedCritical ? 1 : undefined,
                        unavoidable: technique.unavoidable,
                        consumeMainHandDurability: Boolean(technique.weaponTags?.length),
                    });
                if (!result) throw new Error('공격이 확정되지 않았습니다.');
                hit(result);
            } finally {
                context.owner.attribute.removeBySource(penetrationSource);
            }
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
    tags: [
        GameTags.SKILL_ACTIVE,
        GameTags.SKILL_COMBAT,
        ...(technique.propertyTag ? [technique.propertyTag] : []),
        ...(technique.groupTag ? combatSkillGroups(technique.groupTag, technique.propertyTag) : []),
    ],
});

function temperedAegisAmount(context: SkillContext): number {
    const lifePercent = percentByLevel(context.skill.level, 12, 1.5);
    const attackPercent = percentByLevel(context.skill.level, 45, 5);
    const precisionPercent = percentByLevel(context.skill.level, 4, 0.5);
    return context.owner.maxLife * lifePercent / 100
        + context.owner.attribute.get(AttributeType.ATK) * attackPercent / 100
        + context.owner.maxLife
            * (context.owner.attribute.get(AttributeType.FORGING_PRECISION) ?? 0)
            * precisionPercent / 100;
}

defineSkill({
    id: 'tempered_aegis', name: '담금질 방벽', icon: 'skills/indomitable', activationHeader: 'indomitable',
    maxLevel: 5, unlockLevel: 50,
    descriptionTemplate: '달군 금속의 기운으로 몸을 감싸 {{icon.maxLife}}{{icon.atk}}{{icon.forgingPrecision}} {{shieldAmount}}만큼의 피해를 막는 일반 보호막을 {{duration}} 동안 얻습니다.',
    costTemplate: '{{icon.maxMentality}} [color=$magic]정신력 26[/color]',
    activationConditionTemplate: activationGuide(),
    activationMessage: '담금질 방벽!', baseMetadata: null,
    calculatedFields: {
        shieldAmount: context => {
            const lifePercent = percentByLevel(context.skill.level, 12, 1.5);
            const attackPercent = percentByLevel(context.skill.level, 45, 5);
            const precisionPercent = percentByLevel(context.skill.level, 4, 0.5);
            return tooltipValue(
                temperedAegisAmount(context),
                `최대 생명력 × ${formatNumber(lifePercent)}% + 공격력 × ${formatNumber(attackPercent)}%`
                + ` + 최대 생명력 × 제련 정밀도 × ${formatNumber(precisionPercent)}%`,
            );
        },
        duration: context => levelValueTooltip(context, '보호막 지속시간', 10, 1, '초'),
    },
    balance: {
        role: SkillBalanceRole.DEFENSE,
        calculateManaCost: () => 26,
        calculateShield: temperedAegisAmount,
    },
    calculateMaxCooldown: context => cooldownByLevel(context, 22, 1, 18),
    sharedCooldowns: careerSharedCooldown(GameTags.SKILL_GROUP_BLACKSMITH),
    jobRequirement: jobRequirement(JOBS.blacksmith),
    autoAcquire: careerLevelAutoAcquire(JOBS.blacksmith, 50),
    canActivate: simpleCheck(26, false),
    onStart: context => {
        spend(context, 26);
        context.owner.setShield('skill:tempered_aegis', temperedAegisAmount(context), ShieldType.GENERAL,
            valueByLevel(context.skill.level, 10, 1), context.owner);
    },
    tags: [GameTags.SKILL_ACTIVE, GameTags.SKILL_GROUP_BLACKSMITH],
});

interface EliteTechniqueDefinition {
    id: string;
    name: string;
    jobId: string;
    icon: string;
    damageType: 'physical' | 'magic';
    attribute: AttributeType;
    attributeScale?: number;
    secondaryAttribute?: AttributeType;
    secondaryAttributeScale?: number;
    tertiaryAttribute?: AttributeType;
    tertiaryAttributeScale?: number;
    basePercent: number;
    perLevelPercent: number;
    secondaryBasePercent?: number;
    secondaryPerLevelPercent?: number;
    tertiaryBasePercent?: number;
    tertiaryPerLevelPercent?: number;
    forgingPrecisionBasePercent?: number;
    forgingPrecisionPerLevelPercent?: number;
    manaCost: number;
    cooldown: number;
    /** 실제 무기를 휘두르거나 발사하는 기술에만 지정한다. 자체 생성 투사체·주문에는 생략한다. */
    weaponDescription?: string;
    weaponTags?: readonly TagId[];
    projectile?: 'basic_arrow' | 'magic_bolt';
    propertyTag?: TagId;
    guaranteedCritical?: boolean;
    unavoidable?: boolean;
    descriptionIntro: string;
    onHitDescription?: string;
    onHit?: (target: Entity, level: number) => void;
    shieldPercent?: number;
}

const eliteTechniques: readonly EliteTechniqueDefinition[] = [
    {
        id: 'blade_ranger_technique', name: '질풍 추격', jobId: 'career:blade_ranger', icon: 'jobs/warrior',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 215, perLevelPercent: 13,
        secondaryAttribute: AttributeType.SPEED, secondaryAttributeScale: MOBILITY_DAMAGE_SCALE,
        secondaryBasePercent: 45, secondaryPerLevelPercent: 3,
        manaCost: 24, cooldown: 10, weaponDescription: '검 또는 도끼를 장착해야 합니다.',
        weaponTags: [GameTags.WEAPON_SWORD, GameTags.WEAPON_AXE], unavoidable: true,
        descriptionIntro: '바람을 가르며 대상의 퇴로를 따라붙어 베어 냅니다.', propertyTag: GameTags.PROPERTY_NATURAL,
    },
    {
        id: 'shadow_blade_technique', name: '그림자 참수', jobId: 'career:shadow_blade', icon: 'jobs/warrior',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 190, perLevelPercent: 12,
        secondaryAttribute: AttributeType.SPEED, secondaryAttributeScale: MOBILITY_DAMAGE_SCALE,
        secondaryBasePercent: 45, secondaryPerLevelPercent: 3,
        manaCost: 26, cooldown: 12, weaponDescription: '검 또는 단검을 장착해야 합니다.',
        weaponTags: [GameTags.WEAPON_SWORD, GameTags.WEAPON_DAGGER], guaranteedCritical: true,
        descriptionIntro: '대상의 그림자에 파고들어 드러난 급소를 참수합니다.', propertyTag: GameTags.PROPERTY_DARK,
    },
    {
        id: 'spellblade_technique', name: '마력 검파', jobId: 'career:spellblade', icon: 'jobs/warrior',
        damageType: 'magic', attribute: AttributeType.ATK, basePercent: 180, perLevelPercent: 11,
        secondaryAttribute: AttributeType.MAGIC_FORCE, secondaryBasePercent: 120, secondaryPerLevelPercent: 8,
        tertiaryAttribute: AttributeType.SPEED, tertiaryAttributeScale: MOBILITY_DAMAGE_SCALE,
        tertiaryBasePercent: 25, tertiaryPerLevelPercent: 2,
        manaCost: 30, cooldown: 11, weaponDescription: '검을 장착해야 합니다.',
        weaponTags: [GameTags.WEAPON_SWORD],
        descriptionIntro: '칼날에 응축한 마력을 검파로 터뜨려 대상을 가릅니다.',
    },
    {
        id: 'siege_bow_technique', name: '성벽 관통사격', jobId: 'career:siege_bow', icon: 'jobs/archer',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 260, perLevelPercent: 15,
        secondaryAttribute: AttributeType.SPEED, secondaryAttributeScale: MOBILITY_DAMAGE_SCALE,
        secondaryBasePercent: 55, secondaryPerLevelPercent: 4,
        tertiaryAttribute: AttributeType.MAX_LIFE, tertiaryBasePercent: 2, tertiaryPerLevelPercent: 0.15,
        manaCost: 28, cooldown: 15, weaponDescription: '활을 장착해야 합니다.', weaponTags: [GameTags.WEAPON_BOW],
        projectile: 'basic_arrow', descriptionIntro: '공성 장비처럼 무거운 금속 화살 한 발을 힘껏 발사합니다.', propertyTag: GameTags.PROPERTY_METAL,
    },
    {
        id: 'night_hunter_technique', name: '월영 사격', jobId: 'career:night_hunter', icon: 'jobs/archer',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 195, perLevelPercent: 12,
        secondaryAttribute: AttributeType.SPEED, secondaryAttributeScale: MOBILITY_DAMAGE_SCALE,
        secondaryBasePercent: 50, secondaryPerLevelPercent: 4,
        manaCost: 24, cooldown: 10, weaponDescription: '활을 장착해야 합니다.', weaponTags: [GameTags.WEAPON_BOW],
        projectile: 'basic_arrow', guaranteedCritical: true,
        descriptionIntro: '달빛에 비친 대상의 급소를 포착해 화살을 발사합니다.', propertyTag: GameTags.PROPERTY_DARK,
    },
    {
        id: 'elemental_marksman_technique', name: '뇌광 관통화살', jobId: 'career:elemental_marksman', icon: 'jobs/archer',
        damageType: 'magic', attribute: AttributeType.ATK, basePercent: 155, perLevelPercent: 10,
        secondaryAttribute: AttributeType.SPEED, secondaryAttributeScale: MOBILITY_DAMAGE_SCALE,
        secondaryBasePercent: 55, secondaryPerLevelPercent: 4,
        tertiaryAttribute: AttributeType.MAGIC_FORCE, tertiaryBasePercent: 115, tertiaryPerLevelPercent: 7,
        manaCost: 32, cooldown: 12, weaponDescription: '활을 장착해야 합니다.', weaponTags: [GameTags.WEAPON_BOW],
        projectile: 'magic_bolt', propertyTag: GameTags.PROPERTY_ELECTRIC,
        descriptionIntro: '번개를 두른 마력 화살로 대상의 신경을 꿰뚫습니다.',
        onHitDescription: '적중한 대상에게 같은 레벨의 마비독을 4초 동안 부여합니다.',
        onHit: (target, level) => target.applyStatusEffect(StatusEffectType.PARALYTIC_POISON, 4, level),
    },
    {
        id: 'executioner_technique', name: '최후 집행', jobId: 'career:executioner', icon: 'jobs/assassin',
        damageType: 'physical', attribute: AttributeType.SPEED, attributeScale: MOBILITY_DAMAGE_SCALE,
        basePercent: 165, perLevelPercent: 10,
        secondaryAttribute: AttributeType.ATK, secondaryBasePercent: 135, secondaryPerLevelPercent: 8,
        manaCost: 28, cooldown: 14, weaponDescription: '도끼 또는 단검을 장착해야 합니다.',
        weaponTags: [GameTags.WEAPON_AXE, GameTags.WEAPON_DAGGER], unavoidable: true,
        descriptionIntro: '도망칠 틈을 주지 않고 대상에게 최후의 일격을 집행합니다.',
    },
    {
        id: 'phantom_shooter_technique', name: '환영 추적탄', jobId: 'career:phantom_shooter', icon: 'jobs/assassin',
        damageType: 'physical', attribute: AttributeType.SPEED, attributeScale: MOBILITY_DAMAGE_SCALE,
        basePercent: 138, perLevelPercent: 9,
        secondaryAttribute: AttributeType.ATK, secondaryBasePercent: 112, secondaryPerLevelPercent: 7,
        manaCost: 25, cooldown: 11, projectile: 'basic_arrow',
        descriptionIntro: '대상의 움직임을 좇는 환영 단검을 만들어 투척합니다.', propertyTag: GameTags.PROPERTY_DARK,
    },
    {
        id: 'arcane_reaper_technique', name: '비전 수확', jobId: 'career:arcane_reaper', icon: 'jobs/assassin',
        damageType: 'magic', attribute: AttributeType.SPEED, attributeScale: MOBILITY_DAMAGE_SCALE,
        basePercent: 125, perLevelPercent: 8,
        secondaryAttribute: AttributeType.ATK, secondaryBasePercent: 100, secondaryPerLevelPercent: 6,
        tertiaryAttribute: AttributeType.MAGIC_FORCE, tertiaryBasePercent: 90, tertiaryPerLevelPercent: 6,
        manaCost: 30, cooldown: 12, propertyTag: GameTags.PROPERTY_POISON,
        descriptionIntro: '비전 마력으로 대상의 생명력을 베어 독성 잔재를 남깁니다.',
        onHitDescription: '적중한 대상에게 같은 레벨의 맹독을 6초 동안 부여합니다.',
        onHit: (target, level) => target.applyStatusEffect(StatusEffectType.DEADLY_POISON, 6, level),
    },
    {
        id: 'battle_magus_technique', name: '마력갑 돌진', jobId: 'career:battle_magus', icon: 'jobs/mage',
        damageType: 'magic', attribute: AttributeType.MAGIC_FORCE, basePercent: 225, perLevelPercent: 14,
        secondaryAttribute: AttributeType.MAX_LIFE, secondaryBasePercent: 2.5, secondaryPerLevelPercent: 0.2,
        manaCost: 30, cooldown: 13, shieldPercent: 12,
        descriptionIntro: '마력으로 갑옷을 보강한 채 대상에게 정면으로 돌진합니다.',
    },
    {
        id: 'star_weaver_technique', name: '낙성', jobId: 'career:star_weaver', icon: 'jobs/mage',
        damageType: 'magic', attribute: AttributeType.MAGIC_FORCE, basePercent: 270, perLevelPercent: 16,
        secondaryAttribute: AttributeType.SPEED, secondaryAttributeScale: MOBILITY_DAMAGE_SCALE,
        secondaryBasePercent: 50, secondaryPerLevelPercent: 3,
        manaCost: 34, cooldown: 15, projectile: 'magic_bolt', propertyTag: GameTags.PROPERTY_LIGHT,
        descriptionIntro: '대상의 머리 위에 별빛을 모아 거대한 유성으로 떨어뜨립니다.',
    },
    {
        id: 'hexblade_technique', name: '저주 각인', jobId: 'career:hexblade', icon: 'jobs/mage',
        damageType: 'magic', attribute: AttributeType.MAGIC_FORCE, basePercent: 210, perLevelPercent: 14,
        secondaryAttribute: AttributeType.SPEED, secondaryAttributeScale: MOBILITY_DAMAGE_SCALE,
        secondaryBasePercent: 40, secondaryPerLevelPercent: 3,
        manaCost: 29, cooldown: 11, propertyTag: GameTags.PROPERTY_DARK,
        descriptionIntro: '대상의 몸에 불길한 주술 각인을 새겨 움직임을 뒤틀어 놓습니다.',
        onHitDescription: '적중한 대상에게 같은 레벨의 마비독을 3초 동안 부여합니다.',
        onHit: (target, level) => target.applyStatusEffect(StatusEffectType.PARALYTIC_POISON, 3, level),
    },
    {
        id: 'weapon_master_technique', name: '완성의 일격', jobId: 'career:weapon_master', icon: 'jobs/warrior',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 305, perLevelPercent: 18,
        forgingPrecisionBasePercent: 55, forgingPrecisionPerLevelPercent: 5,
        manaCost: 28, cooldown: 13, weaponDescription: '검 또는 도끼를 장착해야 합니다.',
        weaponTags: [GameTags.WEAPON_SWORD, GameTags.WEAPON_AXE], unavoidable: true,
        descriptionIntro: '무기의 무게 중심을 완전히 제어해 빈틈없는 일격을 가합니다.', propertyTag: GameTags.PROPERTY_METAL,
    },
    {
        id: 'machinist_archer_technique', name: '철우 연사', jobId: 'career:machinist_archer', icon: 'jobs/archer',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 245, perLevelPercent: 15,
        secondaryAttribute: AttributeType.SPEED, secondaryAttributeScale: MOBILITY_DAMAGE_SCALE,
        secondaryBasePercent: 45, secondaryPerLevelPercent: 3,
        forgingPrecisionBasePercent: 50, forgingPrecisionPerLevelPercent: 5,
        manaCost: 27, cooldown: 12, weaponDescription: '활을 장착해야 합니다.', weaponTags: [GameTags.WEAPON_BOW],
        projectile: 'basic_arrow', propertyTag: GameTags.PROPERTY_METAL,
        descriptionIntro: '정밀 가공한 금속 화살을 기계 장력으로 고속 발사합니다.',
    },
    {
        id: 'steel_shadow_technique', name: '톱날 급습', jobId: 'career:steel_shadow', icon: 'jobs/assassin',
        damageType: 'physical', attribute: AttributeType.SPEED, attributeScale: MOBILITY_DAMAGE_SCALE,
        basePercent: 140, perLevelPercent: 9,
        secondaryAttribute: AttributeType.ATK, secondaryBasePercent: 115, secondaryPerLevelPercent: 7,
        forgingPrecisionBasePercent: 45, forgingPrecisionPerLevelPercent: 4,
        manaCost: 25, cooldown: 11, weaponDescription: '단검 또는 검을 장착해야 합니다.',
        weaponTags: [GameTags.WEAPON_DAGGER, GameTags.WEAPON_SWORD], guaranteedCritical: true,
        descriptionIntro: '톱날처럼 연마한 금속 칼날로 대상의 급소를 파고듭니다.', propertyTag: GameTags.PROPERTY_METAL,
    },
    {
        id: 'runeforger_technique', name: '폭발 룬', jobId: 'career:runeforger', icon: 'jobs/mage',
        damageType: 'magic', attribute: AttributeType.MAGIC_FORCE, basePercent: 300, perLevelPercent: 18,
        forgingPrecisionBasePercent: 55, forgingPrecisionPerLevelPercent: 5,
        manaCost: 34, cooldown: 14,
        projectile: 'magic_bolt', propertyTag: GameTags.PROPERTY_FIRE,
        descriptionIntro: '금속에 새긴 화염 룬을 대상 곁에서 폭발시킵니다.',
    },
    {
        id: 'battle_smith_technique', name: '모루 강타', jobId: 'career:battle_smith', icon: 'items/iron_pickaxe',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 285, perLevelPercent: 16,
        secondaryAttribute: AttributeType.MAX_LIFE, secondaryBasePercent: 2.5, secondaryPerLevelPercent: 0.2,
        forgingPrecisionBasePercent: 80, forgingPrecisionPerLevelPercent: 7,
        manaCost: 30, cooldown: 15, weaponDescription: '도끼 또는 검을 장착해야 합니다.',
        weaponTags: [GameTags.WEAPON_AXE, GameTags.WEAPON_SWORD], unavoidable: true,
        descriptionIntro: '모루를 내리치듯 무기를 크게 휘둘러 대상을 짓누릅니다.', propertyTag: GameTags.PROPERTY_METAL,
    },
    {
        id: 'artificer_technique', name: '자동 추적탄', jobId: 'career:artificer', icon: 'items/iron_pickaxe',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 225, perLevelPercent: 14,
        secondaryAttribute: AttributeType.SPEED, secondaryAttributeScale: MOBILITY_DAMAGE_SCALE,
        secondaryBasePercent: 55, secondaryPerLevelPercent: 4,
        forgingPrecisionBasePercent: 75, forgingPrecisionPerLevelPercent: 7,
        manaCost: 27, cooldown: 11,
        projectile: 'basic_arrow', propertyTag: GameTags.PROPERTY_ELECTRIC,
        descriptionIntro: '기계식 유도 장치가 달린 전기 탄환을 조립해 발사합니다.',
    },
    {
        id: 'venom_smith_technique', name: '독금 천공', jobId: 'career:venom_smith', icon: 'items/iron_pickaxe',
        damageType: 'physical', attribute: AttributeType.ATK, basePercent: 205, perLevelPercent: 13,
        secondaryAttribute: AttributeType.SPEED, secondaryAttributeScale: MOBILITY_DAMAGE_SCALE,
        secondaryBasePercent: 50, secondaryPerLevelPercent: 4,
        forgingPrecisionBasePercent: 75, forgingPrecisionPerLevelPercent: 7,
        manaCost: 26, cooldown: 12, weaponDescription: '단검을 장착해야 합니다.', weaponTags: [GameTags.WEAPON_DAGGER],
        propertyTag: GameTags.PROPERTY_POISON,
        descriptionIntro: '독성 금속으로 벼린 칼날을 대상의 방어 틈새에 찔러 넣습니다.',
        onHitDescription: '적중한 대상에게 같은 레벨의 맹독을 7초 동안 부여합니다.',
        onHit: (target, level) => target.applyStatusEffect(StatusEffectType.DEADLY_POISON, 7, level),
    },
    {
        id: 'arcane_smith_technique', name: '마도 용융탄', jobId: 'career:arcane_smith', icon: 'items/iron_pickaxe',
        damageType: 'magic', attribute: AttributeType.MAGIC_FORCE, basePercent: 270, perLevelPercent: 16,
        secondaryAttribute: AttributeType.MAX_LIFE, secondaryBasePercent: 2, secondaryPerLevelPercent: 0.15,
        forgingPrecisionBasePercent: 85, forgingPrecisionPerLevelPercent: 8,
        manaCost: 35, cooldown: 14,
        projectile: 'magic_bolt', propertyTag: GameTags.PROPERTY_FIRE, shieldPercent: 10,
        descriptionIntro: '용융한 금속과 마력을 탄환으로 빚어 대상에게 발사합니다.',
    },
];

const eliteTechniqueGroupByJobId: Readonly<Record<string, TagId>> = Object.freeze({
    'career:blade_ranger': GameTags.SKILL_GROUP_WARRIOR,
    'career:shadow_blade': GameTags.SKILL_GROUP_WARRIOR,
    'career:spellblade': GameTags.SKILL_GROUP_WARRIOR,
    'career:battle_smith': GameTags.SKILL_GROUP_WARRIOR,
    'career:siege_bow': GameTags.SKILL_GROUP_ARCHER,
    'career:night_hunter': GameTags.SKILL_GROUP_ARCHER,
    'career:elemental_marksman': GameTags.SKILL_GROUP_ARCHER,
    'career:artificer': GameTags.SKILL_GROUP_ARCHER,
    'career:executioner': GameTags.SKILL_GROUP_ASSASSIN,
    'career:phantom_shooter': GameTags.SKILL_GROUP_ASSASSIN,
    'career:arcane_reaper': GameTags.SKILL_GROUP_ASSASSIN,
    'career:venom_smith': GameTags.SKILL_GROUP_ASSASSIN,
    'career:battle_magus': GameTags.SKILL_GROUP_MAGIC,
    'career:star_weaver': GameTags.SKILL_GROUP_MAGIC,
    'career:hexblade': GameTags.SKILL_GROUP_MAGIC,
    'career:arcane_smith': GameTags.SKILL_GROUP_MAGIC,
    'career:weapon_master': GameTags.SKILL_GROUP_BLACKSMITH,
    'career:machinist_archer': GameTags.SKILL_GROUP_BLACKSMITH,
    'career:steel_shadow': GameTags.SKILL_GROUP_BLACKSMITH,
    'career:runeforger': GameTags.SKILL_GROUP_BLACKSMITH,
});

function eliteTechniqueDamage(context: SkillContext, technique: EliteTechniqueDefinition): number {
    const primary = scaledAttributeValue(context, technique.attribute, technique.attributeScale)
        * percentByLevel(context.skill.level, technique.basePercent, technique.perLevelPercent) / 100;
    const secondary = technique.secondaryAttribute
        ? scaledAttributeValue(context, technique.secondaryAttribute, technique.secondaryAttributeScale)
        * percentByLevel(
            context.skill.level,
            technique.secondaryBasePercent ?? 0,
            technique.secondaryPerLevelPercent ?? 0,
        ) / 100
        : 0;
    const tertiary = technique.tertiaryAttribute
        ? scaledAttributeValue(context, technique.tertiaryAttribute, technique.tertiaryAttributeScale)
            * percentByLevel(
                context.skill.level,
                technique.tertiaryBasePercent ?? 0,
                technique.tertiaryPerLevelPercent ?? 0,
            ) / 100
        : 0;
    const precision = technique.forgingPrecisionBasePercent !== undefined
        ? scaledAttributeValue(context, technique.attribute, technique.attributeScale)
            * context.owner.attribute.get(AttributeType.FORGING_PRECISION)
            * percentByLevel(
                context.skill.level,
                technique.forgingPrecisionBasePercent,
                technique.forgingPrecisionPerLevelPercent ?? 0,
            ) / 100
        : 0;
    return primary + secondary + tertiary + precision;
}

function eliteTechniqueDamageTooltip(context: SkillContext, technique: EliteTechniqueDefinition): string {
    const damage = eliteTechniqueDamage(context, technique);
    const primaryPercent = percentByLevel(context.skill.level, technique.basePercent, technique.perLevelPercent);
    const scaledLabel = (attribute: AttributeType, scale = 1) =>
        `${attribute.label}${scale === 1 ? '' : ` × ${formatNumber(scale)}`}`;
    const secondary = technique.secondaryAttribute
        ? ` + ${scaledLabel(technique.secondaryAttribute, technique.secondaryAttributeScale)} × ${formatNumber(percentByLevel(context.skill.level, technique.secondaryBasePercent ?? 0, technique.secondaryPerLevelPercent ?? 0))}%`
        : '';
    const tertiary = technique.tertiaryAttribute
        ? ` + ${scaledLabel(technique.tertiaryAttribute, technique.tertiaryAttributeScale)} × ${formatNumber(percentByLevel(context.skill.level, technique.tertiaryBasePercent ?? 0, technique.tertiaryPerLevelPercent ?? 0))}%`
        : '';
    const precision = technique.forgingPrecisionBasePercent !== undefined
        ? ` + ${scaledLabel(technique.attribute, technique.attributeScale)} × ${AttributeType.FORGING_PRECISION.label} × ${formatNumber(percentByLevel(context.skill.level, technique.forgingPrecisionBasePercent, technique.forgingPrecisionPerLevelPercent ?? 0))}%`
        : '';
    return tooltipValue(
        damage,
        `${scaledLabel(technique.attribute, technique.attributeScale)} × ${formatNumber(primaryPercent)}%${secondary}${tertiary}${precision}`,
    );
}

function eliteTechniqueDescription(technique: EliteTechniqueDefinition): string {
    const coefficientIcons = [
        technique.attribute,
        technique.secondaryAttribute,
        technique.tertiaryAttribute,
        ...(technique.forgingPrecisionBasePercent !== undefined ? [AttributeType.FORGING_PRECISION] : []),
    ]
        .filter((attribute): attribute is AttributeType => Boolean(attribute))
        .filter((attribute, index, values) => values.indexOf(attribute) === index)
        .map(attribute => `{{icon.${attribute.key}}}`)
        .join('');
    const clauses = [
        ...(technique.projectile
            ? ['시전자의 {{icon.critRate}} 치명타 확률과 {{icon.critDmg}} 치명타 피해를 적용받고']
            : []),
        ...(technique.guaranteedCritical ? ['반드시 치명타로 적중하며'] : []),
        ...(technique.unavoidable ? ['회피할 수 없고'] : []),
        `${coefficientIcons} [color=${technique.damageType === 'magic' ? '$magic' : 'orange'}]{{damage}}[/color]의 `
        + `${technique.damageType === 'magic' ? '마법' : '물리'} 피해를 입힙니다`,
    ];
    return [
        technique.descriptionIntro,
        `${technique.projectile ? '이 투사체는' : '이 공격은'} ${clauses.join(', ')}.`,
        technique.onHitDescription ?? '',
        technique.shieldPercent
            ? '공격 후 {{shieldAmount}}만큼의 피해를 막는 일반 보호막을 8초 동안 얻습니다.'
            : '',
        technique.projectile ? PROJECTILE_FLIGHT_TEXT : '',
    ].filter(Boolean).join(' ');
}

for (const technique of eliteTechniques) {
    const groupTag = eliteTechniqueGroupByJobId[technique.jobId];
    if (!groupTag) throw new Error(`엘리트 스킬 공유 쿨다운 계열이 없습니다: ${technique.jobId}`);
    defineSkill({
        id: technique.id,
        name: technique.name,
        icon: `skills/${technique.id}`,
        maxLevel: 5,
        descriptionTemplate: eliteTechniqueDescription(technique),
        costTemplate: `{{icon.maxMentality}} [color=$magic]정신력 ${technique.manaCost}[/color]`,
        activationConditionTemplate: targetActivationGuide(technique.weaponDescription),
        activationMessage: `${technique.name}!`,
        baseMetadata: null,
        calculatedFields: {
            damage: context => eliteTechniqueDamageTooltip(context, technique),
            shieldAmount: context => technique.shieldPercent
                ? tooltipValue(
                    context.owner.maxLife * technique.shieldPercent / 100,
                    `최대 생명력 × ${formatNumber(technique.shieldPercent)}%`,
                )
                : 0,
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
            // 독을 바른 물리 칼날은 직접 타격까지 독 피해로 바꾸지 않는다.
            effectTags: technique.propertyTag && !(technique.damageType === 'physical' && technique.propertyTag === GameTags.PROPERTY_POISON)
                ? [technique.propertyTag] : undefined,
            calculateDamage: context => eliteTechniqueDamage(context, technique),
            calculateEvasionAttackSpeed: technique.projectile
                ? context => projectileEvasionAttackSpeed(context, technique.projectile!, technique.damageType === 'magic')
                : undefined,
            criticalMode: technique.guaranteedCritical ? SkillCriticalMode.GUARANTEED : SkillCriticalMode.NORMAL,
            calculateManaCost: () => technique.manaCost,
            calculateShield: technique.shieldPercent
                ? context => context.owner.maxLife * technique.shieldPercent! / 100
                : undefined,
            notes: technique.onHit ? ['상태효과의 가치는 대상과 패턴에 따라 달라 직접 피해와 분리합니다.'] : undefined,
        },
        calculateMaxCooldown: () => technique.cooldown,
        sharedCooldowns: combatSharedCooldowns(groupTag, technique.propertyTag),
        jobRequirement: jobRequirement(technique.jobId),
        ...(technique.weaponDescription && technique.weaponTags?.length ? {
            weaponRequirement: weaponRequirement(technique.weaponDescription, ...technique.weaponTags),
        } : {}),
        canActivate: simpleCheck(technique.manaCost),
        onStart: context => {
            const found = targetOrDeny(context);
            if ('reason' in found) throw new Error(found.reason);
            spend(context, technique.manaCost);
            const damage = eliteTechniqueDamage(context, technique);
            if (technique.projectile) {
                projectileAttack(
                    context,
                    technique.projectile,
                    1,
                    technique.propertyTag ? [technique.propertyTag] : undefined,
                    (_projectile, result) => {
                        if (!result.evaded && result.finalDamage > 0) technique.onHit?.(_projectile.target, context.skill.level);
                    },
                    {
                        damage,
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
        tags: [
            GameTags.SKILL_ACTIVE,
            GameTags.SKILL_COMBAT,
            ...(technique.propertyTag ? [technique.propertyTag] : []),
            ...combatSkillGroups(groupTag, technique.propertyTag),
        ],
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
        '지면의 마력을 끌어올려 [color=gold]{{castTime}}초[/color] 동안 응축한 뒤 대상 아래에서 폭발시킵니다. '
        + '{{icon.magicForce}} [color=$magic]{{damage}}[/color]의 마법 피해를 입히고, '
        + '적중한 대상에게 [color=violet]{{paralysisChance}}% 확률[/color]로 마비독을 부여합니다.',
    costTemplate: '{{icon.maxMentality}} [color=$magic]정신력 {{manaCost}}[/color]',
    activationConditionTemplate: targetActivationGuide(),
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
        damage: context => {
            const multiplier = numberMeta(context, 'baseDamageMultiplier')
                + (context.skill.level - 1) * numberMeta(context, 'damageMultiplierPerLevel');
            return tooltipValue(
                seismicDamage(context),
                `마법력 × ${formatNumber(multiplier * 100)}% · 스킬 레벨당 계수 +${formatNumber(numberMeta(context, 'damageMultiplierPerLevel') * 100)}%p`,
            );
        },
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
        announceMonsterSkill(
            context,
            'seismic_crush',
            '지각 붕괴',
            castTime,
            `적중 시 ${formatNumber(numberMeta(context, 'paralysisChance'))}% 확률로 마비독 Lv.${context.skill.level} · ${formatNumber(numberMeta(context, 'paralysisDuration'))}초`,
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
            combatMessage: {
                title: '지각 붕괴',
                comment: `지면을 무너뜨려 대상을 덮쳤습니다. 적중 시 ${formatNumber(numberMeta(context, 'paralysisChance'))}% 확률로 마비독을 부여합니다.`,
            },
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

defineSkill({
    id: 'ironroot_lockdown',
    name: '철근 압살',
    icon: 'skills/ironroot_lockdown',
    aliases: ['ironrootlockdown'],
    maxLevel: 5,
    descriptionTemplate:
        '[color=gold]{{castTime}}초[/color] 동안 현재 위협 대상을 고정한 뒤 '
        + '회피할 수 없고 방어력을 무시하는 [color=red]최대 생명력 비례 고정 피해[/color]를 입힙니다. '
        + '적중한 대상은 [color=violet]{{controlDuration}}초 동안 제압[/color]됩니다.',
    costTemplate: '소모값 없음',
    activationConditionTemplate: '철근 심장수호자가 현재 위협 대상으로 지정한 대상에게 사용합니다.',
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
        announceMonsterSkill(
            context,
            'ironroot_lockdown',
            '철근 압살',
            castTime,
            `회피 불가 · 방어력 무시 · 적중 시 제압 ${formatNumber(numberMeta(context, 'controlDuration'))}초`,
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
            combatMessage: {
                title: '철근 압살',
                comment: `철근이 대상을 고정한 채 압살했습니다. 제압이 ${formatNumber(numberMeta(context, 'controlDuration'))}초 동안 적용됩니다.`,
            },
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

interface BossStrikeSkillDefinition {
    id: string;
    name: string;
    icon: string;
    damageType: 'physical' | 'magic';
    attribute: AttributeType;
    baseMultiplier: number;
    perLevelMultiplier: number;
    castTime: number;
    cooldown: number;
    propertyTag: TagId;
    activationHeader?: string;
    statusEffectId?: string;
    statusDuration?: number;
    unavoidable?: boolean;
    combatComment?: string;
}

function defineBossStrikeSkill(definition: BossStrikeSkillDefinition): void {
    const damage = (context: SkillContext) => context.owner.attribute.get(definition.attribute)
        * (definition.baseMultiplier + Math.max(0, context.skill.level - 1) * definition.perLevelMultiplier);
    const statusEffect = definition.statusEffectId ? StatusEffectType.fromKey(definition.statusEffectId) : undefined;
    defineSkill({
        id: definition.id,
        name: definition.name,
        // TODO: 구간 보스 전용 스킬 아트 제작 전까지 속성 아이콘을 사용한다.
        icon: definition.icon,
        maxLevel: 5,
        descriptionTemplate: `${definition.name}을 준비해 [color=gold]${formatNumber(definition.castTime)}초[/color] 뒤 위협 대상을 공격합니다. `
            + `{{icon.${definition.attribute.key}}} {{damage}}의 ${definition.damageType === 'magic' ? '마법' : '물리'} 피해를 입힙니다.`
            + `${statusEffect ? ` 적중한 대상에게 Lv.{{level}} ${statusEffect.label} 효과를 ${formatNumber(definition.statusDuration ?? 5)}초 동안 부여합니다.` : ''}`,
        costTemplate: '소모값 없음',
        activationConditionTemplate: '몬스터가 현재 위협 대상으로 지정한 대상에게 사용합니다.',
        activationMessage: `${definition.name}!`,
        activationHeader: definition.activationHeader ?? definition.id,
        baseMetadata: null,
        calculatedFields: {
            damage: context => tooltipValue(
                damage(context),
                `${definition.attribute.label} × ${formatNumber((definition.baseMultiplier + Math.max(0, context.skill.level - 1) * definition.perLevelMultiplier) * 100)}% · 스킬 레벨당 계수 +${formatNumber(definition.perLevelMultiplier * 100)}%p`,
            ),
        },
        balance: {
            role: statusEffect ? SkillBalanceRole.CONTROL : SkillBalanceRole.DAMAGE,
            damageType: definition.damageType,
            effectTags: [definition.propertyTag],
            calculateDamage: context => damage(context),
            unavoidable: definition.unavoidable,
            calculateManaCost: () => 0,
            notes: statusEffect ? [`${statusEffect.label}의 전술 가치는 직접 피해와 분리합니다.`] : undefined,
        },
        calculateMaxCooldown: () => definition.cooldown,
        canActivate: context => {
            if (context.player) return denySkill('구간 보스만 사용할 수 있는 스킬입니다.');
            const target = context.owner.currentTarget;
            if (!target || target.isDefeated || target.locationId !== context.owner.locationId) {
                return denySkill('현재 위협 대상을 공격할 수 없습니다.');
            }
            const denied = target.getAttackDeniedReason(context.owner.attackOwner);
            return denied ? denySkill(denied) : { accepted: true };
        },
        onStart: context => {
            const effectPreview = statusEffect
                ? `적중 시 ${statusEffect.label} Lv.${context.skill.level} · ${formatNumber(definition.statusDuration ?? 5)}초`
                : '강력한 직접 피해';
            announceMonsterSkill(
                context,
                definition.id,
                definition.name,
                definition.castTime,
                `${definition.unavoidable ? '회피 불가 · ' : ''}${effectPreview}`,
            );
            return { duration: definition.castTime, state: { released: false } };
        },
        onUpdate: context => {
            if (context.elapsed < definition.castTime || context.skill.getActiveState<boolean>('released')) return 'continue';
            context.skill.setActiveState('released', true);
            const target = context.owner.currentTarget;
            if (!target || target.isDefeated || target.locationId !== context.owner.locationId) return 'finish';
            const result = context.owner.attack(target, definition.damageType, damage(context), {
                unavoidable: definition.unavoidable,
                consumeMainHandDurability: false,
                triggerMainHandHitEffects: false,
                combatMessage: {
                    title: definition.name,
                    comment: [
                        definition.combatComment ?? `${definition.name}이(가) 대상을 강타했습니다.`,
                        ...(statusEffect
                            ? [` ${statusEffect.label} Lv.${context.skill.level} 효과가 ${formatNumber(definition.statusDuration ?? 5)}초 동안 적용됩니다.`]
                            : []),
                    ].join(''),
                },
            });
            if (result && !result.evaded && definition.statusEffectId) {
                const effect = StatusEffectType.fromKey(definition.statusEffectId);
                if (effect) target.applyStatusEffect(effect, definition.statusDuration ?? 5, context.skill.level);
            }
            return 'finish';
        },
        tags: [GameTags.SKILL_ACTIVE, GameTags.SKILL_COMBAT, definition.propertyTag],
    });
}

for (const skill of [
    // TODO: 은빛그물 보스 3종 전용 배너 제작 전까지 돌진·제어·독 계열 기존 헤더를 fallback으로 사용한다.
    {
        id: 'red_mane_pounce', name: '적갈기 도약', icon: 'affinities/natural', damageType: 'physical' as const,
        attribute: AttributeType.ATK, baseMultiplier: 1.35, perLevelMultiplier: 0.12,
        castTime: 0.9, cooldown: 8, propertyTag: GameTags.PROPERTY_NATURAL,
        statusEffectId: 'bleeding', statusDuration: 7, activationHeader: 'battle_rush',
    },
    {
        id: 'silverweb_bind', name: '은실 포박', icon: 'affinities/insect', damageType: 'magic' as const,
        attribute: AttributeType.MAGIC_FORCE, baseMultiplier: 1.15, perLevelMultiplier: 0.1,
        castTime: 1.15, cooldown: 8, propertyTag: GameTags.PROPERTY_INSECT,
        statusEffectId: 'paralytic_poison', statusDuration: 4, activationHeader: 'stunning_shot',
    },
    {
        id: 'brood_venom', name: '유충의 맹독', icon: 'affinities/poison', damageType: 'magic' as const,
        attribute: AttributeType.MAGIC_FORCE, baseMultiplier: 1.25, perLevelMultiplier: 0.11,
        castTime: 1.35, cooldown: 9, propertyTag: GameTags.PROPERTY_POISON,
        statusEffectId: 'deadly_poison', statusDuration: 7, activationHeader: 'venom_blade',
    },
    {
        id: 'dune_venom_barrage', name: '독모래 일제사', icon: 'affinities/poison', damageType: 'physical' as const,
        attribute: AttributeType.ATK, baseMultiplier: 1.45, perLevelMultiplier: 0.14,
        castTime: 1.1, cooldown: 8, propertyTag: GameTags.PROPERTY_POISON,
        statusEffectId: 'deadly_poison', statusDuration: 9, activationHeader: 'venom_blade',
    },
    {
        id: 'petrifying_sun_gaze', name: '석화의 태양안', icon: 'affinities/stone', damageType: 'magic' as const,
        attribute: AttributeType.MAGIC_FORCE, baseMultiplier: 1.35, perLevelMultiplier: 0.12,
        castTime: 1.65, cooldown: 11, propertyTag: GameTags.PROPERTY_STONE,
        statusEffectId: 'petrification', statusDuration: 3, unavoidable: true, activationHeader: 'sanctum_judgment',
    },
    {
        id: 'sun_vault_flare', name: '태양고 섬광', icon: 'affinities/fire', damageType: 'magic' as const,
        attribute: AttributeType.MAGIC_FORCE, baseMultiplier: 1.55, perLevelMultiplier: 0.15,
        castTime: 1.35, cooldown: 9, propertyTag: GameTags.PROPERTY_FIRE,
        statusEffectId: 'sun_fever', statusDuration: 12, activationHeader: 'fireball',
    },
    {
        id: 'hoarfrost_web_barrage', name: '상고발톱 그물비', icon: 'affinities/ice', damageType: 'magic' as const,
        attribute: AttributeType.MAGIC_FORCE, baseMultiplier: 1.55, perLevelMultiplier: 0.14,
        castTime: 1.15, cooldown: 8, propertyTag: GameTags.PROPERTY_ICE,
        statusEffectId: 'frozen', statusDuration: 3.5, activationHeader: 'stunning_shot',
    },
    {
        id: 'mirror_frost_lance', name: '빙경 관통창', icon: 'affinities/ice', damageType: 'magic' as const,
        attribute: AttributeType.MAGIC_FORCE, baseMultiplier: 1.72, perLevelMultiplier: 0.16,
        castTime: 1.4, cooldown: 9, propertyTag: GameTags.PROPERTY_ICE,
        statusEffectId: 'slowness', statusDuration: 7, unavoidable: true, activationHeader: 'magic_bolt',
    },
    {
        id: 'aurora_silence', name: '극광 침묵', icon: 'affinities/light', damageType: 'magic' as const,
        attribute: AttributeType.MAGIC_FORCE, baseMultiplier: 1.48, perLevelMultiplier: 0.13,
        castTime: 1.6, cooldown: 11, propertyTag: GameTags.PROPERTY_LIGHT,
        statusEffectId: 'silence', statusDuration: 4.5, activationHeader: 'sanctum_judgment',
    },
    {
        id: 'siren_fog_chorus', name: '해무 합창', icon: 'affinities/water', damageType: 'magic' as const,
        attribute: AttributeType.MAGIC_FORCE, baseMultiplier: 1.58, perLevelMultiplier: 0.14,
        castTime: 1.35, cooldown: 9, propertyTag: GameTags.PROPERTY_WATER,
        statusEffectId: 'charm', statusDuration: 4, activationHeader: 'magic_bolt',
    },
    {
        id: 'undertow_silence', name: '역조의 침묵', icon: 'affinities/water', damageType: 'magic' as const,
        attribute: AttributeType.MAGIC_FORCE, baseMultiplier: 1.68, perLevelMultiplier: 0.15,
        castTime: 1.5, cooldown: 10, propertyTag: GameTags.PROPERTY_WATER,
        statusEffectId: 'silence', statusDuration: 4.5, unavoidable: true, activationHeader: 'elemental_bind',
    },
    {
        id: 'admiral_abyss_anchor', name: '제독의 심해 닻', icon: 'affinities/metal', damageType: 'physical' as const,
        attribute: AttributeType.ATK, baseMultiplier: 1.85, perLevelMultiplier: 0.17,
        castTime: 1.25, cooldown: 9, propertyTag: GameTags.PROPERTY_METAL,
        statusEffectId: 'bind', statusDuration: 4, unavoidable: true, activationHeader: 'steel_slash',
    },
    {
        id: 'drowned_fleet_command', name: '침수함대 왕명', icon: 'affinities/undead', damageType: 'magic' as const,
        attribute: AttributeType.MAGIC_FORCE, baseMultiplier: 1.62, perLevelMultiplier: 0.15,
        castTime: 1.7, cooldown: 11, propertyTag: GameTags.PROPERTY_UNDEAD,
        statusEffectId: 'fear', statusDuration: 5, activationHeader: 'deathless_requiem',
    },
    {
        id: 'clockwork_overrun', name: '태엽 과주행', icon: 'affinities/metal', damageType: 'physical' as const,
        attribute: AttributeType.ATK, baseMultiplier: 1.92, perLevelMultiplier: 0.18,
        castTime: 1.05, cooldown: 8, propertyTag: GameTags.PROPERTY_METAL,
        statusEffectId: 'bleeding', statusDuration: 9, activationHeader: 'battle_rush',
    },
    {
        id: 'chronosteel_time_lock', name: '시간강 정지추', icon: 'affinities/electric', damageType: 'magic' as const,
        attribute: AttributeType.MAGIC_FORCE, baseMultiplier: 1.82, perLevelMultiplier: 0.17,
        castTime: 1.45, cooldown: 10, propertyTag: GameTags.PROPERTY_ELECTRIC,
        statusEffectId: 'bind', statusDuration: 4.5, unavoidable: true, activationHeader: 'elemental_bind',
    },
    {
        id: 'architect_causality_sever', name: '인과 절단', icon: 'affinities/dark', damageType: 'magic' as const,
        attribute: AttributeType.MAGIC_FORCE, baseMultiplier: 2.08, perLevelMultiplier: 0.2,
        castTime: 1.2, cooldown: 9, propertyTag: GameTags.PROPERTY_DARK,
        statusEffectId: 'silence', statusDuration: 5, unavoidable: true, activationHeader: 'deathless_requiem',
    },
    {
        id: 'architect_photon_verdict', name: '광자 판결', icon: 'affinities/light', damageType: 'magic' as const,
        attribute: AttributeType.MAGIC_FORCE, baseMultiplier: 1.95, perLevelMultiplier: 0.18,
        castTime: 1.55, cooldown: 10, propertyTag: GameTags.PROPERTY_LIGHT,
        statusEffectId: 'blindness', statusDuration: 5, activationHeader: 'sanctum_judgment',
    },
    {
        id: 'gatekeeper_cinder_breath', name: '삼아귀 흑염포', icon: 'affinities/fire', damageType: 'magic' as const,
        attribute: AttributeType.MAGIC_FORCE, baseMultiplier: 2.1, perLevelMultiplier: 0.2,
        castTime: 1.45, cooldown: 9, propertyTag: GameTags.PROPERTY_FIRE,
        statusEffectId: 'fire', statusDuration: 11, activationHeader: 'fireball',
    },
    {
        id: 'gatekeeper_triple_maul', name: '세 갈래 물어뜯기', icon: 'affinities/dark', damageType: 'physical' as const,
        attribute: AttributeType.ATK, baseMultiplier: 2.05, perLevelMultiplier: 0.19,
        castTime: 1.05, cooldown: 8, propertyTag: GameTags.PROPERTY_DARK,
        statusEffectId: 'bleeding', statusDuration: 10, unavoidable: true, activationHeader: 'battle_rush',
    },
    {
        id: 'blackflame_general_march', name: '흑염 군세진', icon: 'affinities/fire', damageType: 'physical' as const,
        attribute: AttributeType.ATK, baseMultiplier: 2.22, perLevelMultiplier: 0.21,
        castTime: 1.25, cooldown: 9, propertyTag: GameTags.PROPERTY_FIRE,
        statusEffectId: 'fear', statusDuration: 5, activationHeader: 'steel_slash',
    },
    {
        id: 'sovereign_crownfall', name: '재왕관 추락', icon: 'affinities/undead', damageType: 'magic' as const,
        attribute: AttributeType.MAGIC_FORCE, baseMultiplier: 2.35, perLevelMultiplier: 0.22,
        castTime: 1.6, cooldown: 10, propertyTag: GameTags.PROPERTY_UNDEAD,
        statusEffectId: 'curse', statusDuration: 10, unavoidable: true, activationHeader: 'deathless_requiem',
    },
    {
        id: 'sovereign_ash_sentence', name: '잿빛 종언', icon: 'affinities/dark', damageType: 'physical' as const,
        attribute: AttributeType.ATK, baseMultiplier: 2.25, perLevelMultiplier: 0.21,
        castTime: 1.15, cooldown: 9, propertyTag: GameTags.PROPERTY_DARK,
        statusEffectId: 'overmaster', statusDuration: 4, unavoidable: true, activationHeader: 'steel_slash',
    },
    {
        id: 'castellan_void_lance', name: '성주의 공허창', icon: 'affinities/dark', damageType: 'magic' as const,
        attribute: AttributeType.MAGIC_FORCE, baseMultiplier: 2.42, perLevelMultiplier: 0.23,
        castTime: 1.35, cooldown: 9, propertyTag: GameTags.PROPERTY_DARK,
        statusEffectId: 'silence', statusDuration: 5, activationHeader: 'magic_bolt',
    },
    {
        id: 'castellan_rampart_break', name: '성벽 파단', icon: 'affinities/metal', damageType: 'physical' as const,
        attribute: AttributeType.ATK, baseMultiplier: 2.36, perLevelMultiplier: 0.22,
        castTime: 1.1, cooldown: 8, propertyTag: GameTags.PROPERTY_METAL,
        statusEffectId: 'defense_reduction', statusDuration: 11, unavoidable: true, activationHeader: 'steel_slash',
    },
    {
        id: 'regent_crown_eclipse', name: '왕관 일식', icon: 'affinities/light', damageType: 'magic' as const,
        attribute: AttributeType.MAGIC_FORCE, baseMultiplier: 2.68, perLevelMultiplier: 0.25,
        castTime: 1.7, cooldown: 10, propertyTag: GameTags.PROPERTY_LIGHT,
        statusEffectId: 'blindness', statusDuration: 6, unavoidable: true, activationHeader: 'sanctum_judgment',
    },
    {
        id: 'regent_null_sentence', name: '무효 선고', icon: 'affinities/dark', damageType: 'magic' as const,
        attribute: AttributeType.MAGIC_FORCE, baseMultiplier: 2.58, perLevelMultiplier: 0.24,
        castTime: 1.25, cooldown: 9, propertyTag: GameTags.PROPERTY_DARK,
        statusEffectId: 'overmaster', statusDuration: 4.5, unavoidable: true, activationHeader: 'deathless_requiem',
    },
    {
        id: 'leviathan_moon_tide', name: '월조 해일', icon: 'affinities/water', damageType: 'magic' as const,
        attribute: AttributeType.MAGIC_FORCE, baseMultiplier: 2.74, perLevelMultiplier: 0.25,
        castTime: 1.55, cooldown: 9, propertyTag: GameTags.PROPERTY_WATER,
        statusEffectId: 'slowness', statusDuration: 7, unavoidable: true, activationHeader: 'elemental_bind',
    },
    {
        id: 'leviathan_depth_crush', name: '해압 분쇄', icon: 'affinities/stone', damageType: 'physical' as const,
        attribute: AttributeType.ATK, baseMultiplier: 2.66, perLevelMultiplier: 0.24,
        castTime: 1.1, cooldown: 8, propertyTag: GameTags.PROPERTY_STONE,
        statusEffectId: 'defense_reduction', statusDuration: 12, unavoidable: true, activationHeader: 'steel_slash',
    },
    {
        id: 'hierophant_white_night', name: '백야 강림', icon: 'affinities/light', damageType: 'magic' as const,
        attribute: AttributeType.MAGIC_FORCE, baseMultiplier: 2.96, perLevelMultiplier: 0.27,
        castTime: 1.8, cooldown: 10, propertyTag: GameTags.PROPERTY_LIGHT,
        statusEffectId: 'blindness', statusDuration: 6, unavoidable: true, activationHeader: 'sanctum_judgment',
    },
    {
        id: 'hierophant_eclipse_dirge', name: '월식 애가', icon: 'affinities/dark', damageType: 'magic' as const,
        attribute: AttributeType.MAGIC_FORCE, baseMultiplier: 2.84, perLevelMultiplier: 0.26,
        castTime: 1.3, cooldown: 9, propertyTag: GameTags.PROPERTY_DARK,
        statusEffectId: 'silence', statusDuration: 5.5, unavoidable: true, activationHeader: 'deathless_requiem',
    },
    {
        id: 'root_devourer_downfall', name: '역근 낙하', icon: 'affinities/earth', damageType: 'physical' as const,
        attribute: AttributeType.ATK, baseMultiplier: 3.08, perLevelMultiplier: 0.28,
        castTime: 1.35, cooldown: 9, propertyTag: GameTags.PROPERTY_EARTH,
        statusEffectId: 'defense_reduction', statusDuration: 12, unavoidable: true, activationHeader: 'battle_rush',
    },
    {
        id: 'root_devourer_rot_breath', name: '망각포자 숨결', icon: 'affinities/poison', damageType: 'magic' as const,
        attribute: AttributeType.MAGIC_FORCE, baseMultiplier: 2.94, perLevelMultiplier: 0.27,
        castTime: 1.55, cooldown: 10, propertyTag: GameTags.PROPERTY_POISON,
        statusEffectId: 'decay', statusDuration: 12, activationHeader: 'venom_blade',
    },
    {
        id: 'primordial_heart_pulse', name: '태초 박동', icon: 'affinities/holy', damageType: 'magic' as const,
        attribute: AttributeType.MAGIC_FORCE, baseMultiplier: 3.28, perLevelMultiplier: 0.3,
        castTime: 1.75, cooldown: 10, propertyTag: GameTags.PROPERTY_HOLY,
        statusEffectId: 'overmaster', statusDuration: 5, unavoidable: true, activationHeader: 'sanctum_judgment',
    },
    {
        id: 'primordial_forgetting_bloom', name: '망각 개화', icon: 'affinities/natural', damageType: 'magic' as const,
        attribute: AttributeType.MAGIC_FORCE, baseMultiplier: 3.12, perLevelMultiplier: 0.29,
        castTime: 1.3, cooldown: 9, propertyTag: GameTags.PROPERTY_NATURAL,
        statusEffectId: 'curse', statusDuration: 12, unavoidable: true, activationHeader: 'deathless_requiem',
    },
    {
        id: 'caldera_eruption', name: '칼데라 분출', icon: 'affinities/fire', damageType: 'magic' as const,
        attribute: AttributeType.MAGIC_FORCE, baseMultiplier: 1.4, perLevelMultiplier: 0.12,
        castTime: 1.6, cooldown: 9, propertyTag: GameTags.PROPERTY_FIRE, statusEffectId: 'fire', statusDuration: 10,
    },
    {
        id: 'bone_crown_decree', name: '백골 왕명', icon: 'affinities/undead', damageType: 'magic' as const,
        attribute: AttributeType.MAGIC_FORCE, baseMultiplier: 1.42, perLevelMultiplier: 0.13,
        castTime: 1.4, cooldown: 9, propertyTag: GameTags.PROPERTY_UNDEAD,
        statusEffectId: 'fear', statusDuration: 4, activationHeader: 'deathless_requiem',
        combatComment: '왕관에 남은 명령이 대상의 의지를 짓눌렀습니다.',
    },
    {
        id: 'fallen_oath_execution', name: '파계 처형', icon: 'affinities/metal', damageType: 'physical' as const,
        attribute: AttributeType.ATK, baseMultiplier: 1.65, perLevelMultiplier: 0.15,
        castTime: 1.25, cooldown: 9, propertyTag: GameTags.PROPERTY_METAL,
        statusEffectId: 'bleeding', statusDuration: 8, unavoidable: true, activationHeader: 'steel_slash',
    },
    {
        id: 'tempest_overload', name: '뇌정 과부하', icon: 'affinities/electric', damageType: 'magic' as const,
        attribute: AttributeType.MAGIC_FORCE, baseMultiplier: 1.5, perLevelMultiplier: 0.14,
        castTime: 1.3, cooldown: 8, propertyTag: GameTags.PROPERTY_ELECTRIC,
        statusEffectId: 'paralytic_poison', statusDuration: 4, unavoidable: true,
    },
    {
        id: 'nightwood_lash', name: '심재의 속박', icon: 'affinities/dark', damageType: 'magic' as const,
        attribute: AttributeType.MAGIC_FORCE, baseMultiplier: 1.35, perLevelMultiplier: 0.13,
        castTime: 1.2, cooldown: 8, propertyTag: GameTags.PROPERTY_DARK, statusEffectId: 'decay', statusDuration: 8,
    },
    {
        id: 'sanctum_judgment', name: '광륜 심판', icon: 'affinities/holy', damageType: 'magic' as const,
        attribute: AttributeType.MAGIC_FORCE, baseMultiplier: 1.55, perLevelMultiplier: 0.15,
        castTime: 1.5, cooldown: 9, propertyTag: GameTags.PROPERTY_HOLY, statusEffectId: 'blindness', statusDuration: 4,
        unavoidable: true,
    },
    {
        id: 'deathless_requiem', name: '불멸의 진혼', icon: 'affinities/undead', damageType: 'magic' as const,
        attribute: AttributeType.MAGIC_FORCE, baseMultiplier: 1.5, perLevelMultiplier: 0.15,
        castTime: 1.8, cooldown: 10, propertyTag: GameTags.PROPERTY_UNDEAD, statusEffectId: 'fear', statusDuration: 5,
    },
] satisfies readonly BossStrikeSkillDefinition[]) defineBossStrikeSkill(skill);

defineSkill({
    id: 'nightwood_regrowth',
    name: '검은 심재 재생',
    // TODO: 구간 보스 전용 스킬 아트 제작 전까지 자연 속성 아이콘을 사용한다.
    icon: 'affinities/natural',
    maxLevel: 5,
    descriptionTemplate: '2초 동안 뿌리를 내려 주변의 생기를 흡수한 뒤 {{healing}}의 생명력을 회복합니다.',
    costTemplate: '소모값 없음',
    activationConditionTemplate: '월영밤숲 구간 보스 전용 회복 패턴입니다.',
    activationMessage: '검은 심재 재생!',
    activationHeader: 'nightwood_regrowth',
    baseMetadata: null,
    calculatedFields: {
        healing: context => {
            const percent = 6 + context.skill.level * 1.5;
            return tooltipValue(context.owner.maxLife * percent / 100, `최대 생명력 × ${formatNumber(percent)}%`);
        },
    },
    calculateMaxCooldown: () => 16,
    canActivate: context => context.player
        ? denySkill('밤숲의 검은 심재만 사용할 수 있습니다.')
        : context.owner.life < context.owner.maxLife * 0.92
            ? { accepted: true }
            : denySkill('아직 재생할 필요가 없습니다.'),
    onStart: context => {
        announceMonsterSkill(context, 'nightwood_regrowth', '검은 심재 재생', 2, '시전이 끝나면 최대 생명력에 비례해 회복합니다.');
        return { duration: 2, state: { released: false } };
    },
    onUpdate: context => {
        if (context.elapsed < 2 || context.skill.getActiveState<boolean>('released')) return 'continue';
        context.skill.setActiveState('released', true);
        const result = context.owner.heal(context.owner.maxLife * (0.06 + context.skill.level * 0.015), context.owner);
        recordMonsterSkillResult(context, '검은 심재 재생', `${formatNumber(result.healedAmount)}의 생명력을 회복했습니다.`);
        return 'finish';
    },
    tags: [GameTags.SKILL_ACTIVE, GameTags.SKILL_COMBAT, GameTags.PROPERTY_NATURAL],
});
