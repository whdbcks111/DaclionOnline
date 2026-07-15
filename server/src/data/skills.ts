import { AttributeType } from '../models/Attribute.js';
import { defineSkill, denySkill } from '../models/Skill.js';
import type { SkillContext } from '../models/Skill.js';
import type Player from '../models/Player.js';
import { StatusEffectType } from '../models/StatusEffect.js';
import { sendNotificationFiltered } from '../modules/message.js';
import { isOnlinePlayerAtLocation } from '../modules/playerRegistry.js';
import { GameTags } from '../../../shared/tags.js';

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
