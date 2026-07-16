import { AttributeType } from '../models/Attribute.js';
import { defineSkill, denySkill } from '../models/Skill.js';
import type { SkillContext } from '../models/Skill.js';
import type Player from '../models/Player.js';
import { StatusEffectType } from '../models/StatusEffect.js';
import { sendNotificationFiltered } from '../modules/message.js';
import { isOnlinePlayerAtLocation } from '../modules/playerRegistry.js';
import { GameTags } from '../../../shared/tags.js';
import { spawnProjectileFromData } from '../models/Projectile.js';
import { getLocation } from '../models/Location.js';
import { ActionType } from '../models/Action.js';
import type Entity from '../models/Entity.js';

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

defineSkill({
    id: 'power_strike',
    name: '강타',
    icon: 'skills/power_strike',
    aliases: ['powerstrike'],
    maxLevel: 5,
    descriptionTemplate:
        '현재 대상으로 기본 공격을 가해 [color=orange]{{damage}}[/color]의 예상 물리 피해를 입힙니다. '
        + '이 공격은 [color=gold]100% 확률로 치명타[/color]가 발생합니다.\n'
        + '공격 직전에 물리 관통력이 일회성으로 [color=orange]+{{armorPenFlat}}[/color] 및 '
        + '[color=orange]+{{armorPenPercent}}%[/color] 증가합니다.',
    costTemplate:
        '[color=$magic]정신력 {{manaCost}}[/color]',
    activationConditionTemplate:
        '살아 있는 현재 대상과 [color=$magic]정신력 {{manaCost}} 이상[/color]이 필요합니다. '
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
        damage: context => attackPower(context)
            * context.owner.attribute.get(AttributeType.CRIT_DMG),
        armorPenFlat: context => numberMeta(context, 'armorPenFlat'),
        armorPenPercent: context => numberMeta(context, 'armorPenPercent'),
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
    { attribute: AttributeType.ATK, op: 'multiply', value: 1.12 },
    { attribute: AttributeType.SPEED, op: 'multiply', value: 1.25 },
]);
const INDOMITABLE = defineAttributeBuff('indomitable', '불굴', '방어력과 최대 생명력이 증가합니다.', [
    { attribute: AttributeType.DEF, op: 'add', value: 12 },
    { attribute: AttributeType.MAX_LIFE, op: 'multiply', value: 1.2 },
]);
const MANA_BARRIER = defineAttributeBuff('mana_barrier', '마력 보호막', '방어력과 마법 저항력이 증가합니다.', [
    { attribute: AttributeType.DEF, op: 'add', value: 8 },
    { attribute: AttributeType.MAGIC_DEF, op: 'add', value: 15 },
]);
const ELEMENTAL_INSIGHT = defineAttributeBuff('elemental_insight', '원소 통찰', '마법력과 정신력 재생이 증가합니다.', [
    { attribute: AttributeType.MAGIC_FORCE, op: 'multiply', value: 1.18 },
    { attribute: AttributeType.MENTALITY_REGEN, op: 'add', value: 2 },
]);

const STUN = StatusEffectType.define({
    id: 'stun', label: '기절', icon: 'status-effects/paralytic_poison', maxLevel: 5,
    descriptionTemplate: '공격·스킬·이동·장소 이동 행동을 할 수 없습니다.',
    onStart: ({ target, effect }) => applyStun(target, effect.type.id),
    onEarlyUpdate: ({ target, effect }) => applyStun(target, effect.type.id),
    onRemove: ({ target, effect }) => target.clearActionDisableSource(`status:${effect.type.id}`),
    aliases: ['기절'], tags: [],
});

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
    onStart: ({ target, effect }) => applyStealth(target, effect.type.id),
    onUpdate: ({ target, effect }) => applyStealth(target, effect.type.id),
    onRemove: ({ target, effect }) => {
        target.tags.removeRuntime(`status:${effect.type.id}`);
        target.attribute.removeBySource(`status:${effect.type.id}`);
    },
    aliases: ['은신'], tags: [GameTags.PROPERTY_DARK],
});

type BuffModifier = { attribute: AttributeType; op: 'add' | 'multiply'; value: number };
function defineAttributeBuff(id: string, label: string, description: string, modifiers: readonly BuffModifier[]): StatusEffectType {
    const apply = (target: import('../models/Entity.js').default) => {
        const source = `status:${id}`;
        target.attribute.removeBySource(source);
        target.attribute.addModifiers(modifiers.map(modifier => ({
            attribute: modifier.attribute.key, op: modifier.op, value: modifier.value, source,
        })));
    };
    return StatusEffectType.define({
        id, label, icon: id === 'mana_barrier' || id === 'elemental_insight' ? 'skills/career_mage' : 'skills/career_warrior', maxLevel: 5, descriptionTemplate: description,
        onStart: ({ target }) => apply(target),
        onUpdate: ({ target }) => apply(target),
        onRemove: ({ target }) => target.attribute.removeBySource(`status:${id}`),
        tags: [],
    });
}

function applyStun(target: import('../models/Entity.js').default, id: string): void {
    target.disableActions([ActionType.SKILL, ActionType.ATTACK, ActionType.MOVEMENT, ActionType.LOCATION_TRAVEL], `status:${id}`);
}

function applyStealth(target: import('../models/Entity.js').default, id: string): void {
    const source = `status:${id}`;
    target.tags.setRuntime(source, [GameTags.TRAIT_STEALTH]);
    target.attribute.removeBySource(source);
    target.attribute.addModifier({ attribute: AttributeType.SPEED.key, op: 'multiply', value: 1.25, source });
}

const JOBS = {
    warrior: 'career:warrior', archer: 'career:archer', assassin: 'career:assassin', mage: 'career:mage',
} as const;

function jobRequirement(jobId: string) { return { anyOf: [jobId], slot: undefined }; }
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
function projectileAttack(context: SkillContext, dataId: string, multiplier: number, tags?: string[], onHit?: Parameters<typeof spawnProjectileFromData>[0]['onHit']): void {
    const found = targetOrDeny(context);
    if ('reason' in found) throw new Error(found.reason);
    const projectile = spawnProjectileFromData({
        owner: context.owner, target: found.target, dataId,
        overrides: { damageMultiplier: multiplier, ...(tags ? { tags } : {}) }, onHit,
    });
    if (!projectile) throw new Error('투사체 생성에 실패했습니다.');
    context.owner.commitAttack(false);
}

defineSkill({
    id: 'steel_slash', name: '강철 베기', icon: 'skills/career_warrior', maxLevel: 5,
    descriptionTemplate: '검 또는 도끼로 [color=orange]공격력의 145%[/color] 물리 피해를 입힙니다.',
    costTemplate: '[color=$magic]정신력 10[/color]', activationConditionTemplate: '검 또는 도끼와 현재 대상이 필요합니다.',
    activationMessage: '강철 베기!', activationPhrase: '강철 베기!', baseMetadata: null, calculateMaxCooldown: () => 5,
    jobRequirement: jobRequirement(JOBS.warrior), weaponRequirement: weaponRequirement('검 또는 도끼를 장착해야 합니다.', GameTags.WEAPON_SWORD, GameTags.WEAPON_AXE),
    canActivate: simpleCheck(10), onStart: context => { spend(context, 10); directAttack(context, 1.45, { consumeMainHandDurability: true }); },
    tags: [GameTags.SKILL_ACTIVE, GameTags.SKILL_COMBAT],
});

defineSkill({
    id: 'battle_rush', name: '전투 질주', icon: 'skills/career_warrior', maxLevel: 5,
    descriptionTemplate: '8초간 공격력과 이동속도가 증가합니다.', costTemplate: '[color=$magic]정신력 14[/color]',
    activationConditionTemplate: '전사 계보 직업이 필요합니다.', activationMessage: '전투 질주!', baseMetadata: null,
    calculateMaxCooldown: () => 18, jobRequirement: jobRequirement(JOBS.warrior), canActivate: simpleCheck(14, false),
    onStart: context => { spend(context, 14); context.owner.applyStatusEffect(BATTLE_RUSH, 8, context.skill.level); },
    tags: [GameTags.SKILL_ACTIVE, GameTags.SKILL_COMBAT],
});

defineSkill({
    id: 'indomitable', name: '불굴', icon: 'skills/career_warrior', maxLevel: 5,
    descriptionTemplate: '10초간 방어력과 최대 생명력이 증가하고 생명력을 15% 회복합니다.', costTemplate: '[color=$magic]정신력 18[/color]',
    activationConditionTemplate: '전사 계보 직업이 필요합니다.', activationMessage: '불굴!', baseMetadata: null,
    calculateMaxCooldown: () => 28, jobRequirement: jobRequirement(JOBS.warrior), canActivate: simpleCheck(18, false),
    onStart: context => { spend(context, 18); context.owner.applyStatusEffect(INDOMITABLE, 10, context.skill.level); context.owner.heal(context.owner.maxLife * 0.15); },
    tags: [GameTags.SKILL_ACTIVE],
});

defineSkill({
    id: 'arcane_arrow', name: '마력 화살', icon: 'skills/career_archer', maxLevel: 5,
    descriptionTemplate: '탄약 없이 마력 화살을 발사해 마법 피해를 입힙니다.', costTemplate: '[color=$magic]정신력 12[/color]',
    activationConditionTemplate: '활과 현재 대상이 필요합니다.', activationMessage: '마력 화살!', baseMetadata: null,
    calculateMaxCooldown: () => 5, jobRequirement: jobRequirement(JOBS.archer), weaponRequirement: weaponRequirement('활을 장착해야 합니다.', GameTags.WEAPON_BOW),
    canActivate: simpleCheck(12), onStart: context => { spend(context, 12); projectileAttack(context, 'basic_magic_orb', 1.25, [GameTags.PROPERTY_LIGHT]); },
    tags: [GameTags.SKILL_ACTIVE, GameTags.SKILL_COMBAT],
});

defineSkill({
    id: 'multishot', name: '다중 사격', icon: 'skills/career_archer', maxLevel: 5,
    descriptionTemplate: '현재 장소의 공격 가능한 대상 최대 3명에게 화살을 발사합니다.', costTemplate: '[color=$magic]정신력 18[/color]',
    activationConditionTemplate: '활과 공격 가능한 오브젝트가 필요합니다.', activationMessage: '다중 사격!', baseMetadata: null,
    calculateMaxCooldown: () => 11, jobRequirement: jobRequirement(JOBS.archer), weaponRequirement: weaponRequirement('활을 장착해야 합니다.', GameTags.WEAPON_BOW),
    canActivate: context => {
        const checked = simpleCheck(18, false, true)(context);
        if (!checked.accepted) return checked;
        const player = requirePlayer(context);
        return (getLocation(player.locationId)?.getAttackableObjects(player).length ?? 0) > 0
            ? { accepted: true } : denySkill('현재 장소에 공격 가능한 대상이 없습니다.');
    }, onStart: context => {
        const player = requirePlayer(context); spend(context, 18);
        for (const target of getLocation(player.locationId)?.getAttackableObjects(player).slice(0, 3) ?? []) {
            spawnProjectileFromData({ owner: player, target, dataId: 'basic_arrow', overrides: { damageMultiplier: 0.85 } });
        }
        player.commitAttack(false);
    }, tags: [GameTags.SKILL_ACTIVE, GameTags.SKILL_COMBAT],
});

defineSkill({
    id: 'stunning_shot', name: '충격 화살', icon: 'skills/career_archer', maxLevel: 5,
    descriptionTemplate: '강화 화살을 발사해 적중한 대상을 2초간 기절시킵니다.', costTemplate: '[color=$magic]정신력 20[/color]',
    activationConditionTemplate: '활과 현재 대상이 필요합니다.', activationMessage: '충격 화살!', baseMetadata: null,
    calculateMaxCooldown: () => 16, jobRequirement: jobRequirement(JOBS.archer), weaponRequirement: weaponRequirement('활을 장착해야 합니다.', GameTags.WEAPON_BOW),
    canActivate: simpleCheck(20), onStart: context => { spend(context, 20); projectileAttack(context, 'basic_arrow', 1.05, undefined, (_p, result) => { if (!result.evaded) _p.target.applyStatusEffect(STUN, 2, 1); }); },
    tags: [GameTags.SKILL_ACTIVE, GameTags.SKILL_COMBAT],
});

defineSkill({
    id: 'wind_evasion', name: '바람 회피', icon: 'skills/career_archer', maxLevel: 5,
    descriptionTemplate: '4초간 이동 가능한 동안 공격을 확정 회피합니다.', costTemplate: '[color=$magic]정신력 22[/color]',
    activationConditionTemplate: '궁수 계보 직업이 필요합니다.', activationMessage: '바람 회피!', baseMetadata: null,
    calculateMaxCooldown: () => 24, jobRequirement: jobRequirement(JOBS.archer), canActivate: simpleCheck(22, false),
    onStart: context => { spend(context, 22); context.owner.applyStatusEffect(WIND_EVASION, 4, context.skill.level); }, tags: [GameTags.SKILL_ACTIVE],
});

defineSkill({
    id: 'stealth', name: '은신', icon: 'skills/career_assassin', maxLevel: 5,
    descriptionTemplate: '8초간 은신하고 이동속도가 증가합니다. 암습 사용 시 해제됩니다.', costTemplate: '[color=$magic]정신력 16[/color]',
    activationConditionTemplate: '암살자 계보 직업이 필요합니다.', activationMessage: '은신!', baseMetadata: null,
    calculateMaxCooldown: () => 20, jobRequirement: jobRequirement(JOBS.assassin), canActivate: simpleCheck(16, false),
    onStart: context => { spend(context, 16); context.owner.applyStatusEffect(STEALTH, 8, context.skill.level); }, tags: [GameTags.SKILL_ACTIVE],
});

defineSkill({
    id: 'ambush', name: '암습', icon: 'skills/career_assassin', maxLevel: 5,
    descriptionTemplate: '은신을 해제하고 회피 불가 확정 치명타 공격을 가합니다.', costTemplate: '[color=$magic]정신력 18[/color]',
    activationConditionTemplate: '단검, 은신 효과와 현재 대상이 필요합니다.', activationMessage: '암습!', baseMetadata: null,
    calculateMaxCooldown: () => 10, jobRequirement: jobRequirement(JOBS.assassin), weaponRequirement: weaponRequirement('단검을 장착해야 합니다.', GameTags.WEAPON_DAGGER),
    canActivate: context => context.owner.getStatusEffect(STEALTH) ? simpleCheck(18)(context) : denySkill('은신 상태에서만 사용할 수 있습니다.'),
    onStart: context => { spend(context, 18); context.owner.removeStatusEffect(STEALTH); directAttack(context, 1.65, { criticalRate: 1, unavoidable: true, consumeMainHandDurability: true }); },
    tags: [GameTags.SKILL_ACTIVE, GameTags.SKILL_COMBAT],
});

defineSkill({
    id: 'venom_blade', name: '맹독 칼날', icon: 'skills/career_assassin', maxLevel: 5,
    descriptionTemplate: '단검으로 공격하고 적중 대상에게 맹독을 부여합니다.', costTemplate: '[color=$magic]정신력 14[/color]',
    activationConditionTemplate: '단검과 현재 대상이 필요합니다.', activationMessage: '맹독 칼날!', baseMetadata: null,
    calculateMaxCooldown: () => 9, jobRequirement: jobRequirement(JOBS.assassin), weaponRequirement: weaponRequirement('단검을 장착해야 합니다.', GameTags.WEAPON_DAGGER),
    canActivate: simpleCheck(14), onStart: context => { const found = targetOrDeny(context); if ('reason' in found) throw new Error(found.reason); spend(context, 14); const result = directAttack(context, 1.2, { consumeMainHandDurability: true }); if (!result.evaded && result.finalDamage > 0) found.target.applyStatusEffect(StatusEffectType.DEADLY_POISON, 8, Math.min(5, context.skill.level)); },
    tags: [GameTags.SKILL_ACTIVE, GameTags.SKILL_COMBAT, GameTags.PROPERTY_POISON],
});

defineSkill({
    id: 'magic_bolt', name: '마력탄', icon: 'skills/career_mage', maxLevel: 5,
    descriptionTemplate: '지팡이로 응축한 정신 에너지를 발사해 마법 피해를 입힙니다.', costTemplate: '[color=$magic]정신력 10[/color]',
    activationConditionTemplate: '지팡이와 현재 대상이 필요합니다.', activationMessage: '마력탄!', baseMetadata: null,
    calculateMaxCooldown: () => 4, jobRequirement: jobRequirement(JOBS.mage), weaponRequirement: weaponRequirement('지팡이를 장착해야 합니다.', GameTags.WEAPON_STAFF),
    canActivate: simpleCheck(10), onStart: context => { spend(context, 10); projectileAttack(context, 'basic_magic_orb', 1.3); }, tags: [GameTags.SKILL_ACTIVE, GameTags.SKILL_COMBAT],
});

defineSkill({
    id: 'mana_barrier', name: '마력 보호막', icon: 'skills/career_mage', maxLevel: 5,
    descriptionTemplate: '10초간 방어력과 마법 저항력을 증가시킵니다.', costTemplate: '[color=$magic]정신력 22[/color]',
    activationConditionTemplate: '마법사 계보 직업이 필요합니다.', activationMessage: '마력 보호막!', baseMetadata: null,
    calculateMaxCooldown: () => 22, jobRequirement: jobRequirement(JOBS.mage), canActivate: simpleCheck(22, false),
    onStart: context => { spend(context, 22); context.owner.applyStatusEffect(MANA_BARRIER, 10, context.skill.level); }, tags: [GameTags.SKILL_ACTIVE],
});

defineSkill({
    id: 'elemental_bind', name: '원소 속박', icon: 'skills/career_mage', maxLevel: 5,
    descriptionTemplate: '마법 피해를 주고 대상의 행동을 1.5초간 속박합니다.', costTemplate: '[color=$magic]정신력 24[/color]',
    activationConditionTemplate: '지팡이와 현재 대상이 필요합니다.', activationMessage: '원소 속박!', baseMetadata: null,
    calculateMaxCooldown: () => 15, jobRequirement: jobRequirement(JOBS.mage), weaponRequirement: weaponRequirement('지팡이를 장착해야 합니다.', GameTags.WEAPON_STAFF),
    canActivate: simpleCheck(24), onStart: context => { spend(context, 24); projectileAttack(context, 'basic_magic_orb', 0.9, [GameTags.PROPERTY_ICE], (_p, result) => { if (!result.evaded) _p.target.applyStatusEffect(STUN, 1.5, 1); }); }, tags: [GameTags.SKILL_ACTIVE, GameTags.SKILL_COMBAT],
});

defineSkill({
    id: 'elemental_insight', name: '원소 통찰', icon: 'skills/career_mage', maxLevel: 5,
    descriptionTemplate: '12초간 마법력과 정신력 재생이 증가합니다.', costTemplate: '[color=$magic]정신력 16[/color]',
    activationConditionTemplate: '마법사 계보 직업이 필요합니다.', activationMessage: '원소 통찰!', baseMetadata: null,
    calculateMaxCooldown: () => 25, jobRequirement: jobRequirement(JOBS.mage), canActivate: simpleCheck(16, false),
    onStart: context => { spend(context, 16); context.owner.applyStatusEffect(ELEMENTAL_INSIGHT, 12, context.skill.level); }, tags: [GameTags.SKILL_ACTIVE],
});

for (const elemental of [
    { id: 'fireball', name: '화염구', icon: 'affinities/fire', tag: GameTags.PROPERTY_FIRE, stat: 'career:mage_fire_kills', effect: StatusEffectType.FIRE },
    { id: 'frost_bolt', name: '빙결탄', icon: 'affinities/ice', tag: GameTags.PROPERTY_ICE, stat: 'career:mage_ice_kills', effect: STUN },
    { id: 'lightning_orb', name: '뇌전구', icon: 'affinities/electric', tag: GameTags.PROPERTY_ELECTRIC, stat: 'career:mage_electric_kills', effect: StatusEffectType.PARALYTIC_POISON },
] as const) defineSkill({
    id: elemental.id, name: elemental.name, icon: elemental.icon, maxLevel: 5,
    descriptionTemplate: `${elemental.name}를 발사해 속성 마법 피해와 상태효과를 부여합니다.`, costTemplate: '[color=$magic]정신력 28[/color]',
    activationConditionTemplate: `마법사 계보와 지팡이가 필요하며 관련 속성 몬스터 처치 통계 5회에 자동 획득합니다.`,
    activationMessage: `${elemental.name}!`, baseMetadata: null, calculateMaxCooldown: () => 9,
    jobRequirement: jobRequirement(JOBS.mage), weaponRequirement: weaponRequirement('지팡이를 장착해야 합니다.', GameTags.WEAPON_STAFF),
    autoAcquire: { watchedProgress: [elemental.stat], check: ({ player }) => Boolean(player?.career?.hasJob(JOBS.mage) && player.progress.getCounter(elemental.stat) >= 5n) },
    canActivate: simpleCheck(28), onStart: context => { spend(context, 28); projectileAttack(context, 'basic_magic_orb', 1.55, [elemental.tag], (_p, result) => { if (!result.evaded) _p.target.applyStatusEffect(elemental.effect, 4, Math.min(3, context.skill.level)); }); },
    tags: [GameTags.SKILL_ACTIVE, GameTags.SKILL_COMBAT, elemental.tag],
});

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
        + '[color=$magic]{{damage}}의 마법 피해[/color]를 입힙니다. '
        + '적중 시 [color=violet]{{paralysisChance}}% 확률[/color]로 마비독을 부여합니다.',
    costTemplate: '[color=$magic]정신력 {{manaCost}}[/color]',
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
