import { AttributeType, type AttributeModifier } from '../models/Attribute.js';
import { ActionType } from '../models/Action.js';
import StatusEffect, {
    StatusEffectType,
    type StatusEffectContext,
    type StatusEffectLifecycleResult,
} from '../models/StatusEffect.js';
import {
    defineStatusEffectInteraction,
    defineStatusEffectNeutralization,
    StatusEffectInteractionMode,
} from '../models/StatusEffectInteraction.js';
import { GameTags } from '../../../shared/tags.js';

// TODO(icons): 레거시 효과별 전용 캐주얼 아이콘을 제작하기 전까지 기존 의미상 가까운 아이콘을 공유한다.
const ICON = Object.freeze({
    poison: 'status-effects/deadly_poison',
    physical: 'attributes/atk',
    magic: 'attributes/magicForce',
    defense: 'attributes/def',
    magicDefense: 'attributes/magicDef',
    speed: 'attributes/speed',
    life: 'attributes/maxLife',
    mentality: 'attributes/maxMentality',
    control: 'status-effects/paralytic_poison',
    stealth: 'skills/career_assassin',
    protection: 'skills/career_mage',
    ice: 'affinities/ice',
    fire: 'status-effects/fire',
});

function modifierSource(effect: StatusEffect): string { return `status-effect:${effect.type.id}`; }

function refreshModifiers(context: StatusEffectContext, modifiers: readonly Omit<AttributeModifier, 'source'>[]): void {
    const source = modifierSource(context.effect);
    context.target.attribute.removeBySource(source);
    context.target.attribute.addModifiers(modifiers.map(modifier => ({ ...modifier, source })));
}

function removeModifiers({ target, effect }: StatusEffectContext): void {
    target.attribute.removeBySource(modifierSource(effect));
}

function livingOnly({ target }: StatusEffectContext): StatusEffectLifecycleResult | void {
    return target.hasEffectTargetTag(GameTags.TRAIT_LIVING) ? undefined : 'remove';
}

function defineAttributeEffect(options: {
    id: string;
    label: string;
    icon: string;
    descriptionTemplate: string;
    aliases?: readonly string[];
    tags?: readonly string[];
    modifiers: (level: number) => readonly Omit<AttributeModifier, 'source'>[];
}): StatusEffectType {
    const apply = (context: StatusEffectContext) => refreshModifiers(context, options.modifiers(context.effect.level));
    return StatusEffectType.define({
        ...options,
        onStart: apply,
        onUpdate: apply,
        onRemove: removeModifiers,
    });
}

const POISON = StatusEffectType.define({
    id: 'poison', label: '독', icon: ICON.poison,
    descriptionTemplate: '초당 [color=purple]{{calc.damage}}[/color]의 독 피해를 받고 공격력과 마법력이 감소합니다.',
    calculatedFields: { damage: ({ effect }) => effect.level * 20 },
    onStart: context => {
        if (livingOnly(context) === 'remove') return 'remove';
        applyPoisonModifiers(context);
    },
    onUpdate: (context, dt) => {
        if (livingOnly(context) === 'remove') return 'remove';
        applyPoisonModifiers(context);
        context.target.damage(dt * context.effect.level * 20, 'absolute', {
            type: 'poison', causeEntity: null, effectSource: context.effect,
        });
    },
    onRemove: removeModifiers,
    tags: [GameTags.PROPERTY_POISON], aliases: ['독'],
});

const BLEEDING = StatusEffectType.define({
    id: 'bleeding', label: '출혈', icon: ICON.physical,
    descriptionTemplate: '초당 최대 생명력에 비례한 [color=red]{{calc.damagePerSecond}}[/color]의 출혈 피해를 받습니다.',
    calculatedFields: {
        damagePerSecond: ({ target, effect }) => effect.level * Math.min(target.maxLife * 0.005, 50),
    },
    onStart: livingOnly,
    onUpdate: (context, dt) => {
        if (livingOnly(context) === 'remove') return 'remove';
        const damage = context.effect.level * Math.min(context.target.maxLife * 0.005, 50) * dt;
        context.target.damage(damage, 'absolute', { type: 'bleeding', causeEntity: null, effectSource: context.effect });
    },
    aliases: ['출혈'], tags: [GameTags.PROPERTY_NATURAL],
});

const DECAY = StatusEffectType.define({
    id: 'decay', label: '부패', icon: ICON.poison,
    descriptionTemplate: '최대 생명력이 감소하고 시간이 지날수록 초당 부패 피해가 증가합니다.',
    onStart: context => {
        if (livingOnly(context) === 'remove') return 'remove';
        applyDecayModifier(context);
    },
    onUpdate: (context, dt) => {
        if (livingOnly(context) === 'remove') return 'remove';
        applyDecayModifier(context);
        const progress = 1 - context.effect.durationRatio;
        context.target.damage(dt * context.effect.level * (10 + 55 * progress), 'absolute', {
            type: 'decay', causeEntity: null, effectSource: context.effect,
        });
    },
    onRemove: removeModifiers,
    aliases: ['부패'], tags: [GameTags.PROPERTY_POISON, GameTags.PROPERTY_DARK],
});

const HEAL_REDUCTION = StatusEffectType.define({
    id: 'heal_reduction', label: '회복 효율 감소', icon: ICON.life,
    descriptionTemplate: '받는 생명력 회복량이 [color=red]{{calc.reductionPercent}}%[/color] 감소합니다.',
    calculatedFields: { reductionPercent: ({ effect }) => Math.round((1 - Math.pow(0.9, effect.level)) * 100) },
    onStart: applyHealingReduction,
    onUpdate: applyHealingReduction,
    onRemove: ({ target, effect }) => { target.removeHealingReceivedModifier(modifierSource(effect)); },
    aliases: ['회복 감소', '치유 감소'], tags: [],
});

const DEFENSE_REDUCTION = defineAttributeEffect({
    id: 'defense_reduction', label: '방어력 감소', icon: ICON.defense,
    descriptionTemplate: '방어력이 레벨마다 5%씩 복리로 감소합니다.', aliases: ['방어력 감소'],
    modifiers: level => [{ attribute: AttributeType.DEF.key, op: 'multiply', value: Math.pow(0.95, level) }],
});

const MAGIC_DEFENSE_REDUCTION = defineAttributeEffect({
    id: 'magic_defense_reduction', label: '마법 저항력 감소', icon: ICON.magicDefense,
    descriptionTemplate: '마법 저항력이 레벨마다 5%씩 복리로 감소합니다.', aliases: ['마법 저항력 감소'],
    modifiers: level => [{ attribute: AttributeType.MAGIC_DEF.key, op: 'multiply', value: Math.pow(0.95, level) }],
});

const MAGIC_ENHANCEMENT = defineAttributeEffect({
    id: 'magic_enhancement', label: '마법 강화', icon: ICON.magic,
    descriptionTemplate: '마법력이 레벨당 5% 증가합니다.', aliases: ['마법 강화'],
    modifiers: level => [{ attribute: AttributeType.MAGIC_FORCE.key, op: 'multiply', value: 1 + level * 0.05 }],
});

const STRENGTH_ENHANCEMENT = defineAttributeEffect({
    id: 'strength_enhancement', label: '근력 강화', icon: ICON.physical,
    descriptionTemplate: '공격력이 레벨당 5% 증가합니다.', aliases: ['근력 강화'],
    modifiers: level => [{ attribute: AttributeType.ATK.key, op: 'multiply', value: 1 + level * 0.05 }],
});

const MENTALITY_REGENERATION = defineAttributeEffect({
    id: 'mentality_regeneration', label: '정신력 재생', icon: ICON.mentality,
    descriptionTemplate: '정신력 재생이 레벨당 5% 증가합니다.', aliases: ['마나 재생', '정신력 재생'],
    modifiers: level => [{ attribute: AttributeType.MENTALITY_REGEN.key, op: 'multiply', value: 1 + level * 0.05 }],
});

const REGENERATION = StatusEffectType.define({
    id: 'regeneration', label: '재생', icon: 'attributes/lifeRegen',
    descriptionTemplate: '1초마다 최대 생명력의 [color=green]{{calc.healPercent}}%[/color]만큼 회복합니다. 현재 회복 효율의 영향을 받습니다.',
    baseMetadata: { tickInterval: 1, tickElapsed: 0, baseHealRatio: 0.0025, healRatioPerLevel: 0.0015 },
    calculatedFields: {
        healPercent: ({ effect }) => Number((regenerationHealRatio(effect) * 100).toFixed(2)),
        healAmount: ({ target, effect }) => target.maxLife * regenerationHealRatio(effect),
    },
    onStart: livingOnly,
    onUpdate: updateRegeneration,
    aliases: ['재생'],
    tags: [],
});

const SLOWNESS = defineAttributeEffect({
    id: 'slowness', label: '둔화', icon: ICON.speed,
    descriptionTemplate: '이동속도가 레벨마다 5%씩 복리로 감소합니다.', aliases: ['둔화'],
    modifiers: level => [{ attribute: AttributeType.SPEED.key, op: 'multiply', value: Math.pow(0.95, level) }],
});

const SWIFTNESS = defineAttributeEffect({
    id: 'swiftness', label: '신속', icon: ICON.speed,
    descriptionTemplate: '이동속도가 레벨당 5% 증가합니다.', aliases: ['신속'],
    modifiers: level => [{ attribute: AttributeType.SPEED.key, op: 'multiply', value: 1 + level * 0.05 }],
});

const CURSE = StatusEffectType.define({
    id: 'curse', label: '쇠약의 저주', icon: 'affinities/dark',
    descriptionTemplate: '공격력·마법력과 받는 치유량이 각각 [color=purple]{{calc.powerReduction}}%[/color]·[color=red]{{calc.healReduction}}%[/color] 감소합니다.',
    calculatedFields: {
        powerReduction: ({ effect }) => Math.round((1 - Math.max(0.5, Math.pow(0.95, effect.level))) * 100),
        healReduction: ({ effect }) => Math.round((1 - Math.max(0.5, Math.pow(0.96, effect.level))) * 100),
    },
    onStart: applyCurse,
    onUpdate: applyCurse,
    onRemove: context => {
        removeModifiers(context);
        context.target.removeHealingReceivedModifier(modifierSource(context.effect));
    },
    aliases: ['저주', '쇠약의 저주'], tags: [GameTags.PROPERTY_DARK],
});

const PETRIFICATION = StatusEffectType.define({
    id: 'petrification', label: '석화', icon: 'affinities/stone',
    descriptionTemplate: '공격·스킬·이동·회피·장소 이동을 할 수 없습니다. 방어력은 20% 증가하지만 마법 저항력은 20% 감소합니다.',
    onStart: applyPetrification,
    onEarlyUpdate: applyPetrification,
    onUpdate: context => refreshModifiers(context, [
        { attribute: AttributeType.DEF.key, op: 'multiply', value: 1.2 },
        { attribute: AttributeType.MAGIC_DEF.key, op: 'multiply', value: 0.8 },
    ]),
    onRemove: context => {
        context.target.releaseActionDisableSource(modifierSource(context.effect));
        removeModifiers(context);
    },
    aliases: ['석화', '돌이 됨'], tags: [GameTags.PROPERTY_STONE],
});

const SUN_FEVER = StatusEffectType.define({
    id: 'sun_fever', label: '열병', icon: 'affinities/fire',
    descriptionTemplate: '이동속도와 공격속도가 [color=orange]{{calc.slowPercent}}%[/color] 감소하고 초당 수분 감소량이 {{calc.extraThirst}} 증가합니다. 빙결 효과와 만나면 상쇄됩니다.',
    calculatedFields: {
        slowPercent: ({ effect }) => Math.round((1 - Math.max(0.5, Math.pow(0.96, effect.level))) * 100),
        extraThirst: ({ effect }) => Number((effect.level * 0.02).toFixed(2)),
    },
    onStart: context => {
        if (livingOnly(context) === 'remove') return 'remove';
        applySunFever(context);
    },
    onUpdate: context => {
        if (livingOnly(context) === 'remove') return 'remove';
        applySunFever(context);
    },
    onRemove: removeModifiers,
    aliases: ['열병', '일사병'], tags: [GameTags.PROPERTY_FIRE],
});

const EXPERIENCE_AMPLIFICATION = StatusEffectType.define({
    id: 'experience_amplification', label: '경험 증폭', icon: 'attributes/luck',
    descriptionTemplate: '획득 경험치가 레벨당 5% 증가합니다.',
    onStart: applyExperienceAmplification,
    onUpdate: applyExperienceAmplification,
    onRemove: ({ target, effect }) => { target.removeExperienceGainModifier(modifierSource(effect)); },
    aliases: ['경험 증폭'], tags: [],
});

// TODO(art): 카르마 전용 아트 제작 단계에서 영웅 상태효과 아이콘으로 교체한다.
const HERO = StatusEffectType.define({
    id: 'hero',
    label: '영웅',
    icon: 'attributes/luck',
    descriptionTemplate: '악명 높은 플레이어를 처치한 보상입니다. 획득 경험치가 {{calc.experienceBonusPercent}}% 증가합니다.',
    calculatedFields: {
        experienceBonusPercent: ({ effect }) => 10 + effect.level * 5,
    },
    onStart: applyHero,
    onUpdate: applyHero,
    onRemove: ({ target, effect }) => { target.removeExperienceGainModifier(modifierSource(effect)); },
    aliases: ['영웅', '현상금 사냥꾼'],
    tags: [],
});

const SILENCE = defineActionEffect('silence', '침묵', [ActionType.SKILL], ['침묵']);
const BIND = defineActionEffect('bind', '속박', [ActionType.MOVEMENT, ActionType.EVASION, ActionType.LOCATION_TRAVEL], ['속박']);
const STUN = defineActionEffect('stun', '기절', [ActionType.SKILL, ActionType.ITEM_USE, ActionType.ATTACK, ActionType.MOVEMENT, ActionType.EVASION, ActionType.LOCATION_TRAVEL], ['기절']);
const OVERMASTER = defineActionEffect('overmaster', '제압', [ActionType.SKILL, ActionType.ITEM_USE, ActionType.ATTACK, ActionType.MOVEMENT, ActionType.EVASION, ActionType.LOCATION_TRAVEL], ['제압']);
const AIRBORNE = defineActionEffect('airborne', '공중에 뜸', [ActionType.ITEM_USE, ActionType.ATTACK, ActionType.MOVEMENT, ActionType.EVASION, ActionType.LOCATION_TRAVEL], ['에어본', '공중']);
const CHARM = defineActionEffect('charm', '매혹', [ActionType.SKILL, ActionType.ITEM_USE, ActionType.ATTACK, ActionType.EVASION], ['매혹']);
const SLEEP = defineActionEffect('sleep', '수면', [ActionType.SKILL, ActionType.ITEM_USE, ActionType.ATTACK, ActionType.MOVEMENT, ActionType.EVASION, ActionType.LOCATION_TRAVEL], ['수면', '잠']);

const NAUSEA = StatusEffectType.define({
    id: 'nausea', label: '멀미', icon: ICON.control,
    descriptionTemplate: '아이템과 스킬을 사용할 수 없고 매 tick 공격이 방해받을 수 있습니다.',
    onEarlyUpdate: ({ target, effect }) => {
        const source = modifierSource(effect);
        target.disableActionsForTick([ActionType.ITEM_USE, ActionType.SKILL], source);
        if (Math.random() < Math.min(1, 0.5 + 0.05 * effect.level)) target.disableActionForTick(ActionType.ATTACK, source);
    }, aliases: ['멀미'], tags: [],
});

const BLINDNESS = defineActionEffect('blindness', '실명', [ActionType.ATTACK, ActionType.EVASION], ['실명']);

const FEAR = StatusEffectType.define({
    id: 'fear', label: '공포', icon: ICON.control,
    descriptionTemplate: '공격·스킬·회피를 할 수 없고 이동속도가 감소합니다.',
    onStart: applyFear,
    onEarlyUpdate: applyFear,
    onUpdate: context => refreshModifiers(context, [{
        attribute: AttributeType.SPEED.key, op: 'multiply', value: Math.pow(0.9, context.effect.level),
    }]),
    onRemove: context => {
        context.target.releaseActionDisableSource(modifierSource(context.effect));
        removeModifiers(context);
    }, aliases: ['공포'], tags: [],
});

const INVULNERABLE = StatusEffectType.define({
    id: 'invulnerable', label: '무적', icon: ICON.protection,
    descriptionTemplate: '모든 피해를 받지 않습니다.',
    onStart: applyInvulnerable,
    onUpdate: applyInvulnerable,
    onRemove: ({ target, effect }) => { target.removeDamageReceivedModifier(modifierSource(effect)); },
    aliases: ['무적'], tags: [],
});

const INVISIBLE = StatusEffectType.define({
    id: 'invisible', label: '투명화', icon: ICON.stealth,
    descriptionTemplate: '다른 대상이 공격 대상으로 지정할 수 없습니다.',
    onStart: applyInvisible,
    onUpdate: applyInvisible,
    onRemove: ({ target, effect }) => { target.tags.removeRuntime(modifierSource(effect)); },
    aliases: ['투명화', '은신'], tags: [GameTags.PROPERTY_DARK],
});

const EXPOSE = StatusEffectType.define({
    id: 'expose', label: '발각됨', icon: ICON.stealth,
    descriptionTemplate: '투명화할 수 없고 이미 적용된 투명화가 제거됩니다.',
    aliases: ['발각', '노출'], tags: [],
});

const FIRE_RESISTANCE = StatusEffectType.define({
    id: 'fire_resistance', label: '화염 저항', icon: ICON.fire,
    descriptionTemplate: '지속 중 화염 효과를 차단합니다.', aliases: ['화염 저항'], tags: [GameTags.PROPERTY_FIRE],
});

const FROZEN_RESISTANCE = StatusEffectType.define({
    id: 'frozen_resistance', label: '빙결 저항', icon: ICON.ice,
    descriptionTemplate: '지속 중 빙결 효과를 차단합니다.', aliases: ['빙결 저항'], tags: [GameTags.PROPERTY_ICE],
});

const DETOXIFICATION = StatusEffectType.define({
    id: 'detoxification', label: '해독', icon: ICON.poison,
    descriptionTemplate: '독·맹독·마비독을 제거하고 지속 중 새 중독을 차단합니다.', aliases: ['해독'], tags: [],
});

const PRESERVATION = StatusEffectType.define({
    id: 'preservation', label: '보존', icon: ICON.life,
    descriptionTemplate: '부패를 제거하고 지속 중 새 부패를 차단합니다.', aliases: ['보존'], tags: [],
});

const FROZEN = StatusEffectType.define({
    id: 'frozen', label: '빙결', icon: ICON.ice,
    descriptionTemplate: '초당 [color=cyan]{{calc.damage}}[/color]의 얼음 피해를 받고 이동·공격속도가 감소합니다.',
    calculatedFields: { damage: ({ effect }) => effect.level * 15 },
    onStart: applyFrozen,
    onUpdate: (context, dt) => {
        if (livingOnly(context) === 'remove') return 'remove';
        applyFrozen(context);
        context.target.damage(dt * context.effect.level * 15, 'absolute', {
            type: 'frozen', causeEntity: null, effectSource: context.effect,
        });
    },
    onRemove: removeModifiers,
    aliases: ['빙결', '동결'], tags: [GameTags.PROPERTY_ICE],
});

function defineActionEffect(id: string, label: string, actions: readonly ActionType[], aliases: readonly string[]): StatusEffectType {
    const apply = ({ target, effect }: StatusEffectContext) => target.disableActions(actions, modifierSource(effect));
    return StatusEffectType.define({
        id, label, icon: ICON.control,
        descriptionTemplate: `${actions.map(action => action.label).join('·')} 행동을 할 수 없습니다.`,
        onStart: apply,
        onEarlyUpdate: apply,
        onRemove: ({ target, effect }) => { target.releaseActionDisableSource(modifierSource(effect)); },
        aliases, tags: [],
    });
}

function applyPoisonModifiers(context: StatusEffectContext): void {
    const multiplier = Math.max(0.5, Math.pow(0.96, context.effect.level));
    refreshModifiers(context, [
        { attribute: AttributeType.ATK.key, op: 'multiply', value: multiplier },
        { attribute: AttributeType.MAGIC_FORCE.key, op: 'multiply', value: multiplier },
    ]);
}

function applyDecayModifier(context: StatusEffectContext): void {
    refreshModifiers(context, [{
        attribute: AttributeType.MAX_LIFE.key,
        op: 'multiply',
        value: Math.max(0.3, Math.pow(0.985, context.effect.level)),
    }]);
    context.target.clampVitals();
}

function applyHealingReduction({ target, effect }: StatusEffectContext): void {
    target.setHealingReceivedModifier(modifierSource(effect), Math.pow(0.9, effect.level));
}

function regenerationHealRatio(effect: StatusEffect): number {
    const base = Math.max(0, effect.getMetadata<number>('baseHealRatio') ?? 0.0025);
    const perLevel = Math.max(0, effect.getMetadata<number>('healRatioPerLevel') ?? 0.0015);
    return base + perLevel * effect.level;
}

function updateRegeneration(context: StatusEffectContext, dt: number): StatusEffectLifecycleResult | void {
    if (livingOnly(context) === 'remove') return 'remove';
    const { target, effect } = context;
    const interval = Math.max(0.05, effect.getMetadata<number>('tickInterval') ?? 1);
    let elapsed = (effect.getMetadata<number>('tickElapsed') ?? 0) + dt;
    while (elapsed >= interval && !target.isDefeated) {
        elapsed -= interval;
        target.heal(target.maxLife * regenerationHealRatio(effect), target);
    }
    effect.setMetadata('tickElapsed', elapsed);
}

function applyExperienceAmplification({ target, effect }: StatusEffectContext): void {
    target.setExperienceGainModifier(modifierSource(effect), 1 + effect.level * 0.05);
}

function applyHero({ target, effect }: StatusEffectContext): void {
    target.setExperienceGainModifier(modifierSource(effect), 1 + (10 + effect.level * 5) / 100);
}

function applyCurse(context: StatusEffectContext): void {
    const powerMultiplier = Math.max(0.5, Math.pow(0.95, context.effect.level));
    refreshModifiers(context, [
        { attribute: AttributeType.ATK.key, op: 'multiply', value: powerMultiplier },
        { attribute: AttributeType.MAGIC_FORCE.key, op: 'multiply', value: powerMultiplier },
    ]);
    context.target.setHealingReceivedModifier(
        modifierSource(context.effect),
        Math.max(0.5, Math.pow(0.96, context.effect.level)),
    );
}

function applyPetrification(context: StatusEffectContext): void {
    context.target.disableActions([
        ActionType.ATTACK,
        ActionType.SKILL,
        ActionType.MOVEMENT,
        ActionType.EVASION,
        ActionType.LOCATION_TRAVEL,
    ], modifierSource(context.effect));
    refreshModifiers(context, [
        { attribute: AttributeType.DEF.key, op: 'multiply', value: 1.2 },
        { attribute: AttributeType.MAGIC_DEF.key, op: 'multiply', value: 0.8 },
    ]);
}

function applySunFever(context: StatusEffectContext): void {
    const multiplier = Math.max(0.5, Math.pow(0.96, context.effect.level));
    refreshModifiers(context, [
        { attribute: AttributeType.SPEED.key, op: 'multiply', value: multiplier },
        { attribute: AttributeType.ATTACK_SPEED.key, op: 'multiply', value: multiplier },
        { attribute: AttributeType.THIRST_DRAIN.key, op: 'add', value: context.effect.level * 0.02 },
    ]);
}

function applyFear(context: StatusEffectContext): void {
    context.target.disableActions([ActionType.ATTACK, ActionType.SKILL, ActionType.EVASION], modifierSource(context.effect));
    refreshModifiers(context, [{
        attribute: AttributeType.SPEED.key, op: 'multiply', value: Math.pow(0.9, context.effect.level),
    }]);
}

function applyInvulnerable({ target, effect }: StatusEffectContext): void {
    target.setDamageReceivedModifier(modifierSource(effect), 0);
}

function applyInvisible({ target, effect }: StatusEffectContext): void {
    target.tags.setRuntime(modifierSource(effect), [GameTags.TRAIT_STEALTH]);
}

function applyFrozen(context: StatusEffectContext): StatusEffectLifecycleResult | void {
    if (livingOnly(context) === 'remove') return 'remove';
    refreshModifiers(context, [
        { attribute: AttributeType.SPEED.key, op: 'multiply', value: Math.pow(0.94, context.effect.level) },
        { attribute: AttributeType.ATTACK_SPEED.key, op: 'multiply', value: Math.pow(0.93, context.effect.level) },
    ]);
}

defineStatusEffectNeutralization(StatusEffectType.FIRE, FROZEN);
defineStatusEffectNeutralization(SLOWNESS, SWIFTNESS);
defineStatusEffectNeutralization(SUN_FEVER, FROZEN);

for (const [blocked, resistance] of [
    [StatusEffectType.FIRE, FIRE_RESISTANCE],
    [FROZEN, FROZEN_RESISTANCE],
    [DECAY, PRESERVATION],
] as const) {
    defineStatusEffectInteraction(blocked, resistance, StatusEffectInteractionMode.REJECT_INCOMING);
    defineStatusEffectInteraction(resistance, blocked, StatusEffectInteractionMode.REMOVE_EXISTING);
}

for (const poison of [POISON, StatusEffectType.DEADLY_POISON, StatusEffectType.PARALYTIC_POISON]) {
    defineStatusEffectInteraction(poison, DETOXIFICATION, StatusEffectInteractionMode.REJECT_INCOMING);
    defineStatusEffectInteraction(DETOXIFICATION, poison, StatusEffectInteractionMode.REMOVE_EXISTING);
}

defineStatusEffectInteraction(INVISIBLE, EXPOSE, StatusEffectInteractionMode.REJECT_INCOMING);
defineStatusEffectInteraction(EXPOSE, INVISIBLE, StatusEffectInteractionMode.REMOVE_EXISTING);
defineStatusEffectInteraction(INVISIBLE, StatusEffectType.FIRE, StatusEffectInteractionMode.REJECT_INCOMING);
defineStatusEffectInteraction(StatusEffectType.FIRE, INVISIBLE, StatusEffectInteractionMode.REMOVE_EXISTING);

export const LegacyStatusEffects = Object.freeze({
    POISON, BLEEDING, DECAY, HEAL_REDUCTION, DEFENSE_REDUCTION, MAGIC_DEFENSE_REDUCTION,
    MAGIC_ENHANCEMENT, STRENGTH_ENHANCEMENT, MENTALITY_REGENERATION, REGENERATION,
    EXPERIENCE_AMPLIFICATION, HERO, SLOWNESS, SWIFTNESS, CURSE, PETRIFICATION, SUN_FEVER,
    SILENCE, BIND, STUN, OVERMASTER,
    NAUSEA, BLINDNESS, AIRBORNE, CHARM, FEAR, SLEEP, INVULNERABLE, INVISIBLE, EXPOSE,
    FIRE_RESISTANCE, FROZEN_RESISTANCE, DETOXIFICATION, PRESERVATION, FROZEN,
});
