import { AttributeType, type AttributeModifier } from '../../models/core/Attribute.js';
import { ActionType } from '../../models/core/Action.js';
import StatusEffect, {
    ControlCategory,
    StatusEffectPersistencePolicy,
    StatusEffectRemovalReason,
    StatusEffectType,
    type StatusEffectContext,
    type StatusEffectLifecycleResult,
} from '../../models/combat/StatusEffect.js';
import {
    defineStatusEffectInteraction,
    defineStatusEffectNeutralization,
    StatusEffectInteractionMode,
} from '../../models/combat/StatusEffectInteraction.js';
import { GameTags } from '../../../../shared/tags.js';
import { ASCENDANT_REGIONS } from '../world/ascendantRegions.js';

// 이 파일은 skills/ascendantFrontier보다 먼저 로드되므로 복합 전투 상태와 장소 파생 효과의
// 수명 정책을 ID 기준으로 선등록한다. 정의부는 정책을 별도 중복 하드코딩하지 않는다.
for (const id of [
    'battle_rush',
    'indomitable',
    'mana_barrier',
    'elemental_insight',
    'wind_evasion',
    'stealth',
]) StatusEffectType.configurePersistencePolicy(id, StatusEffectPersistencePolicy.COMBAT_TRANSIENT);
for (const region of ASCENDANT_REGIONS) {
    StatusEffectType.configurePersistencePolicy(region.environment.id, StatusEffectPersistencePolicy.DERIVED);
}

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

/**
 * 균열 제한시간이 끝난 뒤 5초에 걸쳐 현재 방어·보호막과 무관하게 생명력을 소진한다.
 * 만료 순간 생존해 있으면 남은 생명력을 0으로 고정해 회복으로 저주를 버틸 수 없게 한다.
 */
export const WITCH_CURSE_STATUS_EFFECT = StatusEffectType.define({
    id: 'witch_curse',
    label: '마녀의 저주',
    icon: ICON.poison,
    descriptionTemplate: '다클레비스의 저주가 생명력을 직접 잠식합니다. 5초 뒤 반드시 사망합니다.',
    calculatedFields: {
        lifeDrainPerSecond: ({ target }) => Math.ceil(target.maxLife / 5),
    },
    calculatedFieldTooltips: {
        lifeDrainPerSecond: '최대 생명력의 20%',
    },
    onStart: livingOnly,
    onUpdate: (context, dt) => {
        if (livingOnly(context) === 'remove') return 'remove';
        context.target.life = Math.max(
            0,
            context.target.life - context.target.maxLife * 0.2 * Math.max(0, dt),
        );
    },
    onRemove: ({ target }, reason) => {
        if (reason === StatusEffectRemovalReason.EXPIRED && !target.isDefeated) target.life = 0;
    },
    persistencePolicy: StatusEffectPersistencePolicy.COMBAT_TRANSIENT,
    removable: false,
    tags: [GameTags.PROPERTY_DARK],
    aliases: ['마녀의 저주'],
});

/** 균열의 남은 공략 시간을 나타내며 정상 만료 때만 마녀의 저주로 변한다. */
export const WITCH_GAZE_STATUS_EFFECT = StatusEffectType.define({
    id: 'witch_gaze',
    label: '마녀의 주시',
    icon: ICON.mentality,
    descriptionTemplate: '상위차원의 마녀가 침입자를 지켜봅니다. 남은 시간이 끝나면 마녀의 저주가 발동합니다.',
    onStart: livingOnly,
    onRemove: ({ target }, reason) => {
        if (reason === StatusEffectRemovalReason.EXPIRED && !target.isDefeated) {
            target.applyStatusEffect(WITCH_CURSE_STATUS_EFFECT, 5, 1);
        }
    },
    persistencePolicy: StatusEffectPersistencePolicy.COMBAT_TRANSIENT,
    removable: false,
    tags: [GameTags.PROPERTY_DARK],
    aliases: ['마녀의 주시'],
});

function defineAttributeEffect(options: {
    id: string;
    label: string;
    icon: string;
    descriptionTemplate: string;
    aliases?: readonly string[];
    tags?: readonly string[];
    calculatedFields?: Readonly<Record<string, (context: StatusEffectContext) => string | number | boolean>>;
    calculatedFieldTooltips?: Readonly<Record<string, string | ((context: StatusEffectContext) => string)>>;
    controlCategory?: ControlCategory;
    persistencePolicy?: StatusEffectPersistencePolicy;
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
    descriptionTemplate: '초당 [color=purple]{{calc.damage}}[/color]의 독 피해를 받고 공격력과 마법력이 [color=purple]{{calc.powerReduction}}%[/color] 감소합니다.',
    calculatedFields: {
        damage: ({ effect }) => effect.level * 20,
        powerReduction: ({ effect }) => Math.round((1 - Math.max(0.5, Math.pow(0.96, effect.level))) * 100),
    },
    calculatedFieldTooltips: {
        damage: '효과 레벨 × 20',
        powerReduction: '(1 - 0.96의 효과 레벨 제곱) × 100 (최대 50%)',
    },
    onStart: context => {
        if (livingOnly(context) === 'remove') return 'remove';
        applyPoisonModifiers(context);
    },
    onUpdate: (context, dt) => {
        if (livingOnly(context) === 'remove') return 'remove';
        applyPoisonModifiers(context);
        context.target.damage(dt * context.effect.level * 20, 'absolute', {
            type: 'poison',
            causeEntity: context.effect.source ?? null,
            actorPlayerId: context.effect.sourcePlayerId,
            effectSource: context.effect,
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
    calculatedFieldTooltips: {
        damagePerSecond: '효과 레벨 × min(대상 최대 생명력 × 0.5%, 50)',
    },
    onStart: livingOnly,
    onUpdate: (context, dt) => {
        if (livingOnly(context) === 'remove') return 'remove';
        const damage = context.effect.level * Math.min(context.target.maxLife * 0.005, 50) * dt;
        context.target.damage(damage, 'absolute', {
            type: 'bleeding',
            causeEntity: context.effect.source ?? null,
            actorPlayerId: context.effect.sourcePlayerId,
            effectSource: context.effect,
        });
    },
    aliases: ['출혈'], tags: [GameTags.PROPERTY_NATURAL],
});

const DECAY = StatusEffectType.define({
    id: 'decay', label: '부패', icon: ICON.poison,
    descriptionTemplate: '최대 생명력이 [color=purple]{{calc.maxLifeReductionPercent}}%[/color] 감소하고 시간이 지날수록 초당 부패 피해가 증가합니다.',
    calculatedFields: {
        maxLifeReductionPercent: ({ effect }) => Math.round(
            (1 - Math.max(0.8, Math.pow(0.99, effect.level))) * 100,
        ),
    },
    calculatedFieldTooltips: {
        maxLifeReductionPercent: '1 - max(80%, 0.99의 효과 레벨 제곱)',
    },
    onStart: context => {
        if (livingOnly(context) === 'remove') return 'remove';
        applyDecayModifier(context);
    },
    onUpdate: (context, dt) => {
        if (livingOnly(context) === 'remove') return 'remove';
        applyDecayModifier(context);
        const progress = 1 - context.effect.durationRatio;
        const damagePerSecond = Math.min(
            context.effect.level * (10 + 55 * progress),
            context.target.maxLife * 0.02,
        );
        context.target.damage(dt * damagePerSecond, 'absolute', {
            type: 'decay',
            causeEntity: context.effect.source ?? null,
            actorPlayerId: context.effect.sourcePlayerId,
            effectSource: context.effect,
        });
    },
    onRemove: removeModifiers,
    aliases: ['부패'], tags: [GameTags.PROPERTY_POISON, GameTags.PROPERTY_DARK],
});

const HEAL_REDUCTION = StatusEffectType.define({
    id: 'heal_reduction', label: '회복 효율 감소', icon: ICON.life,
    descriptionTemplate: '받는 생명력 회복량이 [color=red]{{calc.reductionPercent}}%[/color] 감소합니다.',
    calculatedFields: { reductionPercent: ({ effect }) => Math.round((1 - Math.pow(0.9, effect.level)) * 100) },
    calculatedFieldTooltips: {
        reductionPercent: '(1 - 0.9의 효과 레벨 제곱) × 100',
    },
    onStart: applyHealingReduction,
    onUpdate: applyHealingReduction,
    onRemove: ({ target, effect }) => { target.removeHealingReceivedModifier(modifierSource(effect)); },
    aliases: ['회복 감소', '치유 감소'], tags: [],
});

const DEFENSE_REDUCTION = defineAttributeEffect({
    id: 'defense_reduction', label: '방어력 감소', icon: ICON.defense,
    descriptionTemplate: '방어력이 [color=orange]{{calc.reductionPercent}}%[/color] 감소합니다.', aliases: ['방어력 감소'],
    calculatedFields: {
        reductionPercent: ({ effect }) => Number(((1 - Math.pow(0.95, effect.level)) * 100).toFixed(2)),
    },
    calculatedFieldTooltips: {
        reductionPercent: '(1 - 0.95의 효과 레벨 제곱) × 100',
    },
    modifiers: level => [{ attribute: AttributeType.DEF.key, op: 'multiply', value: Math.pow(0.95, level) }],
});

const MAGIC_DEFENSE_REDUCTION = defineAttributeEffect({
    id: 'magic_defense_reduction', label: '마법 저항력 감소', icon: ICON.magicDefense,
    descriptionTemplate: '마법 저항력이 [color=purple]{{calc.reductionPercent}}%[/color] 감소합니다.', aliases: ['마법 저항력 감소'],
    calculatedFields: {
        reductionPercent: ({ effect }) => Number(((1 - Math.pow(0.95, effect.level)) * 100).toFixed(2)),
    },
    calculatedFieldTooltips: {
        reductionPercent: '(1 - 0.95의 효과 레벨 제곱) × 100',
    },
    modifiers: level => [{ attribute: AttributeType.MAGIC_DEF.key, op: 'multiply', value: Math.pow(0.95, level) }],
});

const MAGIC_ENHANCEMENT = defineAttributeEffect({
    id: 'magic_enhancement', label: '마법 강화', icon: ICON.magic,
    descriptionTemplate: '마법력이 [color=purple]{{calc.increasePercent}}%[/color] 증가합니다.', aliases: ['마법 강화'],
    calculatedFields: { increasePercent: ({ effect }) => effect.level * 5 },
    calculatedFieldTooltips: { increasePercent: '효과 레벨 × 5%' },
    modifiers: level => [{ attribute: AttributeType.MAGIC_FORCE.key, op: 'multiply', value: 1 + level * 0.05 }],
});

const STRENGTH_ENHANCEMENT = defineAttributeEffect({
    id: 'strength_enhancement', label: '근력 강화', icon: ICON.physical,
    descriptionTemplate: '공격력이 [color=orange]{{calc.increasePercent}}%[/color] 증가합니다.', aliases: ['근력 강화'],
    calculatedFields: { increasePercent: ({ effect }) => effect.level * 5 },
    calculatedFieldTooltips: { increasePercent: '효과 레벨 × 5%' },
    modifiers: level => [{ attribute: AttributeType.ATK.key, op: 'multiply', value: 1 + level * 0.05 }],
});

const RAMPART_VOLLEY = defineAttributeEffect({
    id: 'rampart_volley',
    label: '성벽 연사',
    icon: ICON.defense,
    descriptionTemplate: '성벽시위의 적중 중첩으로 방어력이 [color=orange]{{calc.defense}}[/color] 증가합니다. ({{level}}/5중첩)',
    aliases: ['성벽 연사'],
    calculatedFields: {
        defense: ({ effect }) => effect.level * 70,
    },
    calculatedFieldTooltips: {
        defense: '중첩당 방어력 70, 최대 5중첩',
    },
    persistencePolicy: StatusEffectPersistencePolicy.COMBAT_TRANSIENT,
    modifiers: level => [{ attribute: AttributeType.DEF.key, op: 'add', value: Math.min(5, level) * 70 }],
});

const MENTALITY_REGENERATION = defineAttributeEffect({
    id: 'mentality_regeneration', label: '정신력 재생', icon: ICON.mentality,
    descriptionTemplate: '정신력 재생이 [color=purple]{{calc.increasePercent}}%[/color] 증가합니다.', aliases: ['마나 재생', '정신력 재생'],
    calculatedFields: { increasePercent: ({ effect }) => effect.level * 5 },
    calculatedFieldTooltips: { increasePercent: '효과 레벨 × 5%' },
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
    calculatedFieldTooltips: {
        healPercent: '기본 0.25% + 효과 레벨 × 0.15%p',
    },
    onStart: livingOnly,
    onUpdate: updateRegeneration,
    persistenceMetadataKeys: ['tickElapsed'],
    aliases: ['재생'],
    tags: [],
});

const SLOWNESS = defineAttributeEffect({
    id: 'slowness', label: '둔화', icon: ICON.speed,
    descriptionTemplate: '이동속도가 [color=cyan]{{calc.reductionPercent}}%[/color] 감소합니다.', aliases: ['둔화'],
    calculatedFields: {
        reductionPercent: ({ effect }) => Number(((1 - Math.pow(0.95, effect.level)) * 100).toFixed(2)),
    },
    calculatedFieldTooltips: {
        reductionPercent: '(1 - 0.95의 효과 레벨 제곱) × 100',
    },
    controlCategory: ControlCategory.SOFT,
    modifiers: level => [{ attribute: AttributeType.SPEED.key, op: 'multiply', value: Math.pow(0.95, level) }],
});

const SWIFTNESS = defineAttributeEffect({
    id: 'swiftness', label: '신속', icon: ICON.speed,
    descriptionTemplate: '이동속도가 [color=cyan]{{calc.increasePercent}}%[/color] 증가합니다.', aliases: ['신속'],
    calculatedFields: { increasePercent: ({ effect }) => effect.level * 5 },
    calculatedFieldTooltips: { increasePercent: '효과 레벨 × 5%' },
    modifiers: level => [{ attribute: AttributeType.SPEED.key, op: 'multiply', value: 1 + level * 0.05 }],
});

const CURSE = StatusEffectType.define({
    id: 'curse', label: '쇠약의 저주', icon: 'affinities/dark',
    descriptionTemplate: '공격력·마법력과 받는 치유량이 각각 [color=purple]{{calc.powerReduction}}%[/color]·[color=red]{{calc.healReduction}}%[/color] 감소합니다.',
    calculatedFields: {
        powerReduction: ({ effect }) => Math.round((1 - Math.max(0.5, Math.pow(0.95, effect.level))) * 100),
        healReduction: ({ effect }) => Math.round((1 - Math.max(0.5, Math.pow(0.96, effect.level))) * 100),
    },
    calculatedFieldTooltips: {
        powerReduction: '(1 - 0.95의 효과 레벨 제곱) × 100 (최대 50%)',
        healReduction: '(1 - 0.96의 효과 레벨 제곱) × 100 (최대 50%)',
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
    controlCategory: ControlCategory.HARD,
    aliases: ['석화', '돌이 됨'], tags: [GameTags.PROPERTY_STONE],
});

const SUN_FEVER = StatusEffectType.define({
    id: 'sun_fever', label: '열병', icon: 'affinities/fire',
    descriptionTemplate: '이동속도와 공격속도가 [color=orange]{{calc.slowPercent}}%[/color] 감소하고 초당 수분 감소량이 {{calc.extraThirst}} 증가합니다. 빙결 효과와 만나면 상쇄됩니다.',
    calculatedFields: {
        slowPercent: ({ effect }) => Math.round((1 - Math.max(0.5, Math.pow(0.96, effect.level))) * 100),
        extraThirst: ({ effect }) => Number((effect.level * 0.02).toFixed(2)),
    },
    calculatedFieldTooltips: {
        slowPercent: '(1 - 0.96의 효과 레벨 제곱) × 100 (최대 50%)',
        extraThirst: '효과 레벨 × 초당 0.02',
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
    descriptionTemplate: '획득 경험치가 [color=gold]{{calc.increasePercent}}%[/color] 증가합니다.',
    calculatedFields: { increasePercent: ({ effect }) => effect.level * 5 },
    calculatedFieldTooltips: { increasePercent: '효과 레벨 × 5%' },
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
    calculatedFieldTooltips: {
        experienceBonusPercent: '기본 10% + 효과 레벨 × 5%',
    },
    onStart: applyHero,
    onUpdate: applyHero,
    onRemove: ({ target, effect }) => { target.removeExperienceGainModifier(modifierSource(effect)); },
    aliases: ['영웅', '현상금 사냥꾼'],
    tags: [],
});

const SILENCE = defineActionEffect('silence', '침묵', [ActionType.SKILL], ['침묵'], ControlCategory.SOFT);
const BIND = defineActionEffect('bind', '속박', [ActionType.MOVEMENT, ActionType.EVASION, ActionType.LOCATION_TRAVEL], ['속박'], ControlCategory.SOFT);
const STUN = defineActionEffect('stun', '기절', [ActionType.SKILL, ActionType.ITEM_USE, ActionType.ATTACK, ActionType.MOVEMENT, ActionType.EVASION, ActionType.LOCATION_TRAVEL], ['기절'], ControlCategory.HARD);
const OVERMASTER = defineActionEffect('overmaster', '제압', [ActionType.SKILL, ActionType.ITEM_USE, ActionType.ATTACK, ActionType.MOVEMENT, ActionType.EVASION, ActionType.LOCATION_TRAVEL], ['제압'], ControlCategory.HARD);
const AIRBORNE = defineActionEffect('airborne', '공중에 뜸', [ActionType.ITEM_USE, ActionType.ATTACK, ActionType.MOVEMENT, ActionType.EVASION, ActionType.LOCATION_TRAVEL], ['에어본', '공중'], ControlCategory.HARD);
const CHARM = defineActionEffect('charm', '매혹', [ActionType.SKILL, ActionType.ITEM_USE, ActionType.ATTACK, ActionType.EVASION], ['매혹'], ControlCategory.HARD);
const SLEEP = defineActionEffect('sleep', '수면', [ActionType.SKILL, ActionType.ITEM_USE, ActionType.ATTACK, ActionType.MOVEMENT, ActionType.EVASION, ActionType.LOCATION_TRAVEL], ['수면', '잠'], ControlCategory.HARD);

const NAUSEA = StatusEffectType.define({
    id: 'nausea', label: '멀미', icon: ICON.control,
    descriptionTemplate: '아이템과 스킬을 사용할 수 없고 매 tick 공격이 방해받을 수 있습니다.',
    onEarlyUpdate: ({ target, effect }) => {
        const source = modifierSource(effect);
        target.disableActionsForTick([ActionType.ITEM_USE, ActionType.SKILL], source);
        if (Math.random() < Math.min(1, 0.5 + 0.05 * effect.level)) target.disableActionForTick(ActionType.ATTACK, source);
    }, controlCategory: ControlCategory.SOFT, aliases: ['멀미'], tags: [],
});

const BLINDNESS = defineActionEffect('blindness', '실명', [ActionType.ATTACK, ActionType.EVASION], ['실명'], ControlCategory.SOFT);

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
    }, controlCategory: ControlCategory.HARD, aliases: ['공포'], tags: [],
});

const INVULNERABLE = StatusEffectType.define({
    id: 'invulnerable', label: '무적', icon: ICON.protection,
    descriptionTemplate: '모든 피해를 받지 않습니다.',
    onStart: applyInvulnerable,
    onUpdate: applyInvulnerable,
    onRemove: ({ target, effect }) => { target.removeDamageReceivedModifier(modifierSource(effect)); },
    persistencePolicy: StatusEffectPersistencePolicy.COMBAT_TRANSIENT,
    aliases: ['무적'], tags: [],
});

const INVISIBLE = StatusEffectType.define({
    id: 'invisible', label: '투명화', icon: ICON.stealth,
    descriptionTemplate: '다른 대상이 공격 대상으로 지정할 수 없습니다.',
    onStart: applyInvisible,
    onUpdate: applyInvisible,
    onRemove: ({ target, effect }) => { target.tags.removeRuntime(modifierSource(effect)); },
    persistencePolicy: StatusEffectPersistencePolicy.COMBAT_TRANSIENT,
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
    descriptionTemplate: '독·맹독·마비독·출혈·부패를 제거하고 지속 중 다시 걸리지 않게 합니다.', aliases: ['보존'], tags: [],
});

const FROZEN = StatusEffectType.define({
    id: 'frozen', label: '빙결', icon: ICON.ice,
    descriptionTemplate: '초당 [color=cyan]{{calc.damage}}[/color]의 얼음 피해를 받고 이동·공격속도가 감소합니다.',
    calculatedFields: { damage: ({ effect }) => effect.level * 15 },
    calculatedFieldTooltips: { damage: '효과 레벨 × 15' },
    onStart: applyFrozen,
    onUpdate: (context, dt) => {
        if (livingOnly(context) === 'remove') return 'remove';
        applyFrozen(context);
        context.target.damage(dt * context.effect.level * 15, 'absolute', {
            type: 'frozen',
            causeEntity: context.effect.source ?? null,
            actorPlayerId: context.effect.sourcePlayerId,
            effectSource: context.effect,
        });
    },
    onRemove: removeModifiers,
    controlCategory: ControlCategory.SOFT,
    aliases: ['빙결', '동결'], tags: [GameTags.PROPERTY_ICE],
});

function defineActionEffect(
    id: string,
    label: string,
    actions: readonly ActionType[],
    aliases: readonly string[],
    controlCategory: ControlCategory,
): StatusEffectType {
    const apply = ({ target, effect }: StatusEffectContext) => target.disableActions(actions, modifierSource(effect));
    return StatusEffectType.define({
        id, label, icon: ICON.control,
        descriptionTemplate: `${actions.map(action => action.label).join('·')} 행동을 할 수 없습니다.`,
        onStart: apply,
        onEarlyUpdate: apply,
        onRemove: ({ target, effect }) => { target.releaseActionDisableSource(modifierSource(effect)); },
        controlCategory,
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
        value: Math.max(0.8, Math.pow(0.99, context.effect.level)),
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
        target.heal(target.maxLife * regenerationHealRatio(effect), effect.source ?? target);
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
] as const) {
    defineStatusEffectInteraction(blocked, resistance, StatusEffectInteractionMode.REJECT_INCOMING);
    defineStatusEffectInteraction(resistance, blocked, StatusEffectInteractionMode.REMOVE_EXISTING);
}

for (const poison of [POISON, StatusEffectType.DEADLY_POISON, StatusEffectType.PARALYTIC_POISON]) {
    defineStatusEffectInteraction(poison, DETOXIFICATION, StatusEffectInteractionMode.REJECT_INCOMING);
    defineStatusEffectInteraction(DETOXIFICATION, poison, StatusEffectInteractionMode.REMOVE_EXISTING);
}

for (const ailment of [
    POISON,
    StatusEffectType.DEADLY_POISON,
    StatusEffectType.PARALYTIC_POISON,
    BLEEDING,
    DECAY,
]) {
    defineStatusEffectInteraction(ailment, PRESERVATION, StatusEffectInteractionMode.REJECT_INCOMING);
    defineStatusEffectInteraction(PRESERVATION, ailment, StatusEffectInteractionMode.REMOVE_EXISTING);
}

defineStatusEffectInteraction(INVISIBLE, EXPOSE, StatusEffectInteractionMode.REJECT_INCOMING);
defineStatusEffectInteraction(EXPOSE, INVISIBLE, StatusEffectInteractionMode.REMOVE_EXISTING);
defineStatusEffectInteraction(INVISIBLE, StatusEffectType.FIRE, StatusEffectInteractionMode.REJECT_INCOMING);
defineStatusEffectInteraction(StatusEffectType.FIRE, INVISIBLE, StatusEffectInteractionMode.REMOVE_EXISTING);

export const LegacyStatusEffects = Object.freeze({
    POISON, BLEEDING, DECAY, HEAL_REDUCTION, DEFENSE_REDUCTION, MAGIC_DEFENSE_REDUCTION,
    MAGIC_ENHANCEMENT, STRENGTH_ENHANCEMENT, RAMPART_VOLLEY, MENTALITY_REGENERATION, REGENERATION,
    EXPERIENCE_AMPLIFICATION, HERO, SLOWNESS, SWIFTNESS, CURSE, PETRIFICATION, SUN_FEVER,
    SILENCE, BIND, STUN, OVERMASTER,
    NAUSEA, BLINDNESS, AIRBORNE, CHARM, FEAR, SLEEP, INVULNERABLE, INVISIBLE, EXPOSE,
    FIRE_RESISTANCE, FROZEN_RESISTANCE, DETOXIFICATION, PRESERVATION, FROZEN,
});
