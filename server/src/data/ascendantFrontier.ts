import './items.js';
import './statusEffects.js';
import { AttributeType, type AttributeModifier } from '../models/Attribute.js';
import {
    createAcquisitionRequirements,
    defineItem,
    ItemBalanceRole,
    ItemMetadataKeys,
    MAX_STACKABLE_ITEM_COUNT,
} from '../models/Item.js';
import { ItemAttackOverrideKeys } from '../modules/itemAttack.js';
import { defineWorldMonster } from './monsters.js';
import { MonsterRank, MonsterStatProfile } from '../models/MonsterStats.js';
import { MonsterAiDisposition } from '../models/Threat.js';
import { defineBossStrikeSkill } from './skills.js';
import { defineResource, registerResourceInteraction } from '../models/Resource.js';
import { defineShop } from '../models/Shop.js';
import { StatusEffectType, type StatusEffectContext } from '../models/StatusEffect.js';
import { registerLocationPassive } from '../models/Location.js';
import { sendBotMessageToUser, sendNotificationToUser } from '../modules/message.js';
import { chat } from '../utils/chatBuilder.js';
import { GameTags } from '../../../shared/tags.js';
import { ASCENDANT_REGIONS, HIGH_LEVEL_MINES } from './ascendantRegions.js';

function environmentModifierSource(effectId: string): string {
    return `status-effect:${effectId}`;
}

function applyEnvironmentModifiers(
    context: StatusEffectContext,
    modifiers: readonly Omit<AttributeModifier, 'source'>[],
): void {
    const source = environmentModifierSource(context.effect.type.id);
    context.target.attribute.removeBySource(source);
    context.target.attribute.addModifiers(modifiers.map(modifier => ({ ...modifier, source })));
}

const environmentModifiers: readonly (readonly Omit<AttributeModifier, 'source'>[])[] = [
    [
        { attribute: AttributeType.LIFE_REGEN.key, op: 'multiply', value: 0.85 },
        { attribute: AttributeType.PROJECTILE_ACCELERATION.key, op: 'multiply', value: 1.12 },
    ],
    [
        { attribute: AttributeType.SPEED.key, op: 'multiply', value: 0.92 },
        { attribute: AttributeType.DEF.key, op: 'multiply', value: 1.06 },
        { attribute: AttributeType.MAGIC_DEF.key, op: 'multiply', value: 1.06 },
    ],
    [
        { attribute: AttributeType.CRIT_RATE.key, op: 'add', value: 0.04 },
        { attribute: AttributeType.CRIT_DMG.key, op: 'add', value: 0.12 },
        { attribute: AttributeType.MAGIC_DEF.key, op: 'multiply', value: 0.9 },
    ],
    [
        { attribute: AttributeType.ATTACK_SPEED.key, op: 'multiply', value: 1.1 },
        { attribute: AttributeType.MAGIC_DEF.key, op: 'multiply', value: 0.88 },
    ],
    [
        { attribute: AttributeType.DEF.key, op: 'multiply', value: 0.88 },
        { attribute: AttributeType.ARMOR_PEN.key, op: 'multiply', value: 1.14 },
        { attribute: AttributeType.MAGIC_PEN.key, op: 'multiply', value: 1.14 },
    ],
    [
        { attribute: AttributeType.CRIT_DMG.key, op: 'add', value: 0.2 },
        { attribute: AttributeType.LIFE_REGEN.key, op: 'multiply', value: 0.78 },
    ],
    [
        { attribute: AttributeType.SPEED.key, op: 'multiply', value: 0.86 },
        { attribute: AttributeType.MAX_LIFE.key, op: 'multiply', value: 1.12 },
        { attribute: AttributeType.DEF.key, op: 'multiply', value: 1.08 },
    ],
    [
        { attribute: AttributeType.MENTALITY_REGEN.key, op: 'multiply', value: 0.72 },
        { attribute: AttributeType.MAGIC_FORCE.key, op: 'multiply', value: 1.1 },
        { attribute: AttributeType.MAGIC_DEF.key, op: 'multiply', value: 1.08 },
    ],
    [
        { attribute: AttributeType.ATK.key, op: 'multiply', value: 0.92 },
        { attribute: AttributeType.MAGIC_FORCE.key, op: 'multiply', value: 0.92 },
        { attribute: AttributeType.ARMOR_PEN.key, op: 'multiply', value: 1.18 },
        { attribute: AttributeType.MAGIC_PEN.key, op: 'multiply', value: 1.18 },
    ],
    [
        { attribute: AttributeType.ATK.key, op: 'multiply', value: 1.12 },
        { attribute: AttributeType.MAGIC_FORCE.key, op: 'multiply', value: 1.12 },
    ],
];

const environmentEffects = ASCENDANT_REGIONS.map((region, index) => {
    const modifiers = environmentModifiers[index];
    const apply = (context: StatusEffectContext) => applyEnvironmentModifiers(context, modifiers);
    return StatusEffectType.define({
        id: region.environment.id,
        label: region.environment.label,
        icon: region.environment.icon,
        descriptionTemplate: region.environment.description,
        onStart: apply,
        onUpdate: apply,
        onRemove: ({ target, effect }) => {
            target.attribute.removeBySource(environmentModifierSource(effect.type.id));
        },
        tags: region.propertyTags,
        aliases: [region.environment.label],
    });
});

const statusByRegion = [
    'paralytic_poison', 'slowness', 'blindness', 'fire', 'defense_reduction',
    'silence', 'overmaster', 'decay', 'curse', 'bind',
] as const;

for (const [index, region] of ASCENDANT_REGIONS.entries()) {
    const materialId = `${region.id}_material`;
    const sigilId = `${region.id}_sigil`;
    const attackBase = 560 + index * 155;
    const defenseBase = 185 + index * 52;
    const durability = 1_600 + index * 320;
    const regionTag = `material:${region.id}`;
    const primaryProperty = region.propertyTags[0];
    const secondaryProperty = region.propertyTags[1];

    defineItem({
        id: materialId,
        name: region.materialName,
        description: `${region.name}의 환경이 오랜 시간 응축되어 생긴 고레벨 제작 소재.`,
        image: `items/${materialId}`,
        category: '재료', weight: 0.7 + index * 0.04, stackable: true, maxStack: MAX_STACKABLE_ITEM_COUNT,
        baseMetadata: null, onUse: null, equipSlot: null, modifiers: null, baseDurability: null,
        tags: [regionTag, primaryProperty],
    });
    defineItem({
        id: sigilId,
        name: `${region.name} 군주의 인장`,
        description: `${region.bossName}의 권능이 남은 인장. 숨은 제단과 이세계 통로의 열쇠로 쓰일 예정입니다.`,
        image: `items/${sigilId}`,
        category: '인장', weight: 0.2, stackable: true, maxStack: MAX_STACKABLE_ITEM_COUNT,
        baseMetadata: null, onUse: null, equipSlot: null, modifiers: null, baseDurability: null,
        tags: [regionTag, 'item:altar-offering', primaryProperty, secondaryProperty],
    });

    const equipmentIds = {
        sword: `${region.id}_sword`,
        bow: `${region.id}_bow`,
        dagger: `${region.id}_dagger`,
        staff: `${region.id}_staff`,
        shield: `${region.id}_shield`,
        pack: `${region.id}_pack`,
        relic: `${region.id}_relic`,
    };
    defineItem({
        id: equipmentIds.sword, name: `${region.materialName} 단층검`,
        description: `${region.name}의 압력을 견디도록 겹쳐 벼린 전사 계열 장검.`,
        image: `items/${equipmentIds.sword}`, category: '장검', weight: 5.2, stackable: false, maxStack: 1,
        baseMetadata: null, onUse: null, equipSlot: 'mainHand',
        modifiers: [
            { attribute: AttributeType.ATK.key, op: 'add', value: attackBase, source: '' },
            { attribute: AttributeType.ARMOR_PEN.key, op: 'add', value: 150 + index * 40, source: '' },
            { attribute: AttributeType.CRIT_DMG.key, op: 'add', value: 0.42 + index * 0.035, source: '' },
        ],
        baseDurability: durability, tags: [GameTags.ITEM_WEAPON, GameTags.WEAPON_SWORD, regionTag, primaryProperty],
        balance: { role: ItemBalanceRole.WEAPON, attackType: 'physical', recommendedJobIds: ['career:warrior'] },
    });
    defineItem({
        id: equipmentIds.bow, name: `${region.materialName} 원환궁`,
        description: `${region.name}의 흐름을 시위에 고정해 고속 화살을 발사하는 장궁.`,
        image: `items/${equipmentIds.bow}`, category: '활', weight: 3.5, stackable: false, maxStack: 1,
        baseMetadata: {
            [ItemMetadataKeys.BASIC_ATTACK_OVERRIDE]: ItemAttackOverrideKeys.PROJECTILE,
            [ItemMetadataKeys.PROJECTILE_ATTACK]: { ammunitionItemId: 'wooden_arrow' },
        },
        onUse: null, equipSlot: 'mainHand',
        modifiers: [
            { attribute: AttributeType.ATK.key, op: 'add', value: Math.round(attackBase * 0.86), source: '' },
            { attribute: AttributeType.CRIT_RATE.key, op: 'add', value: 0.17 + index * 0.008, source: '' },
            { attribute: AttributeType.PROJECTILE_ACCELERATION.key, op: 'multiply', value: 2.4 + index * 0.16, source: '' },
        ],
        baseDurability: durability - 80, tags: [GameTags.ITEM_WEAPON, GameTags.WEAPON_BOW, regionTag, secondaryProperty],
        balance: { role: ItemBalanceRole.WEAPON, attackType: 'physical', recommendedJobIds: ['career:archer'] },
    });
    defineItem({
        id: equipmentIds.dagger, name: `${region.materialName} 경계송곳니`,
        description: `${region.name}의 균열을 따라 방어 틈으로 미끄러지는 암살자용 단검.`,
        image: `items/${equipmentIds.dagger}`, category: '단검', weight: 1.8, stackable: false, maxStack: 1,
        baseMetadata: null, onUse: null, equipSlot: 'mainHand',
        modifiers: [
            { attribute: AttributeType.ATK.key, op: 'add', value: Math.round(attackBase * 0.9), source: '' },
            { attribute: AttributeType.ARMOR_PEN.key, op: 'add', value: 175 + index * 46, source: '' },
            { attribute: AttributeType.SPEED.key, op: 'add', value: 0.32 + index * 0.025, source: '' },
            { attribute: AttributeType.CRIT_DMG.key, op: 'add', value: 0.5 + index * 0.04, source: '' },
        ],
        baseDurability: durability - 140, tags: [GameTags.ITEM_WEAPON, GameTags.WEAPON_DAGGER, regionTag, primaryProperty],
        balance: { role: ItemBalanceRole.WEAPON, attackType: 'physical', recommendedJobIds: ['career:assassin'] },
    });
    defineItem({
        id: equipmentIds.staff, name: `${region.materialName} 공명지팡이`,
        description: `${region.name}의 환경 마력을 응축해 마력 구체로 변환하는 지팡이.`,
        image: `items/${equipmentIds.staff}`, category: '지팡이', weight: 3.7, stackable: false, maxStack: 1,
        baseMetadata: {
            [ItemMetadataKeys.BASIC_ATTACK_OVERRIDE]: ItemAttackOverrideKeys.PROJECTILE,
            [ItemMetadataKeys.PROJECTILE_ATTACK]: {
                projectile: { dataId: 'basic_magic_orb', overrides: { tags: [...region.propertyTags] } },
            },
        },
        onUse: null, equipSlot: 'mainHand',
        modifiers: [
            { attribute: AttributeType.MAGIC_FORCE.key, op: 'add', value: Math.round(attackBase * 1.05), source: '' },
            { attribute: AttributeType.MAGIC_PEN.key, op: 'add', value: 165 + index * 43, source: '' },
            { attribute: AttributeType.MENTALITY_REGEN.key, op: 'add', value: 22 + index * 5, source: '' },
            { attribute: AttributeType.PROJECTILE_ACCELERATION.key, op: 'multiply', value: 2.3 + index * 0.15, source: '' },
        ],
        baseDurability: durability - 60, tags: [GameTags.ITEM_WEAPON, GameTags.WEAPON_STAFF, regionTag, secondaryProperty],
        balance: { role: ItemBalanceRole.WEAPON, attackType: 'magic', recommendedJobIds: ['career:mage'] },
    });
    defineItem({
        id: equipmentIds.shield, name: `${region.materialName} 심층방패`,
        description: `${region.name}의 환경 압력을 양면에 분산시키는 대형 방패.`,
        image: `items/${equipmentIds.shield}`, category: '방패', weight: 5.8, stackable: false, maxStack: 1,
        baseMetadata: null, onUse: null, equipSlot: 'offHand',
        modifiers: [
            { attribute: AttributeType.DEF.key, op: 'add', value: defenseBase, source: '' },
            { attribute: AttributeType.MAGIC_DEF.key, op: 'add', value: defenseBase + 14, source: '' },
            { attribute: AttributeType.MAX_LIFE.key, op: 'add', value: 2_400 + index * 1_000, source: '' },
        ],
        baseDurability: durability + 160, tags: [GameTags.ITEM_ARMOR, regionTag, primaryProperty],
        balance: { role: ItemBalanceRole.DEFENSE, recommendedJobIds: ['career:warrior', 'career:blacksmith'] },
    });
    defineItem({
        id: equipmentIds.pack, name: `${region.name} 원정가방`,
        description: `${region.name} 장기 탐사를 위해 무게 분산 구조를 적용한 성장 가방.`,
        image: `items/${equipmentIds.pack}`, category: '가방', weight: 2.2, stackable: false, maxStack: 1,
        baseMetadata: null, onUse: null, equipSlot: 'bag',
        modifiers: [{ attribute: AttributeType.MAX_WEIGHT.key, op: 'add', value: 1_100 + index * 190, source: '' }],
        baseDurability: durability, tags: [GameTags.ITEM_BAG, regionTag],
        balance: { role: ItemBalanceRole.UTILITY },
    });
    defineItem({
        id: equipmentIds.relic, name: `${region.bossName}의 잔흔`,
        description: `${region.bossName}의 핵에서 떨어져 나온 보스 전용 장신구.`,
        image: `items/${equipmentIds.relic}`, category: '장신구', weight: 0.35, stackable: false, maxStack: 1,
        baseMetadata: null, onUse: null, equipSlot: 'accessory',
        modifiers: [
            { attribute: AttributeType.ATK.key, op: 'add', value: Math.round(attackBase * 0.22), source: '' },
            { attribute: AttributeType.MAGIC_FORCE.key, op: 'add', value: Math.round(attackBase * 0.22), source: '' },
            { attribute: AttributeType.MAX_LIFE.key, op: 'add', value: 1_600 + index * 650, source: '' },
        ],
        baseDurability: null, tags: [regionTag, primaryProperty, secondaryProperty],
        balance: { role: ItemBalanceRole.UTILITY },
    });

    const firstSkillId = `${region.id}_sovereign_assault`;
    const secondSkillId = `${region.id}_sovereign_decree`;
    defineBossStrikeSkill({
        id: firstSkillId,
        name: `${region.name} 심층강타`,
        icon: region.environment.icon,
        damageType: index % 2 === 0 ? 'physical' : 'magic',
        attribute: index % 2 === 0 ? AttributeType.ATK : AttributeType.MAGIC_FORCE,
        baseMultiplier: 4.6 + index * 0.38,
        perLevelMultiplier: 0.4 + index * 0.025,
        castTime: 1.1 + (index % 3) * 0.25,
        cooldown: 8.5,
        propertyTag: primaryProperty,
        statusEffectId: statusByRegion[index],
        statusDuration: 6 + index * 0.4,
        unavoidable: index >= 5,
        activationHeader: index % 2 === 0 ? 'steel_slash' : 'sanctum_judgment',
    });
    defineBossStrikeSkill({
        id: secondSkillId,
        name: `${region.bossName}의 선고`,
        icon: region.environment.icon,
        damageType: 'magic',
        attribute: AttributeType.MAGIC_FORCE,
        baseMultiplier: 4.35 + index * 0.4,
        perLevelMultiplier: 0.38 + index * 0.025,
        castTime: 1.55 + (index % 2) * 0.2,
        cooldown: 10,
        propertyTag: secondaryProperty,
        statusEffectId: index % 2 === 0 ? 'silence' : 'blindness',
        statusDuration: 5 + index * 0.3,
        unavoidable: index >= 7,
        activationHeader: 'deathless_requiem',
    });

    const monsterCommon = {
        drops: [{ itemDataId: materialId, minCount: 1, maxCount: 4, chance: 0.7 }],
        goldReward: { min: 7_000 + index * 1_400, max: 11_000 + index * 2_100 },
    };
    defineWorldMonster({
        id: `${region.id}_vanguard`, name: region.normalNames[0],
        description: `${region.name} 외곽에서 침입자의 첫 움직임을 시험하는 전위 개체.`,
        icon: `monsters/${region.id}_vanguard`, level: region.startLevel + 8,
        statProfile: MonsterStatProfile.BRUISER, statWeights: { maxLife: 1.08, atk: 1.1 },
        ...monsterCommon, tags: [GameTags.ENTITY_HUMANOID, primaryProperty, regionTag],
    });
    defineWorldMonster({
        id: `${region.id}_keeper`, name: region.normalNames[1],
        description: `${region.name}의 교차로와 보물실을 지키는 고방어 개체.`,
        icon: `monsters/${region.id}_keeper`, level: region.startLevel + 24,
        statProfile: MonsterStatProfile.TANK, statWeights: { maxLife: 1.1, def: 1.12, magicDef: 1.12 },
        ...monsterCommon, tags: [GameTags.ENTITY_ELEMENTAL, GameTags.TRAIT_INANIMATE, secondaryProperty, regionTag],
    });
    defineWorldMonster({
        id: `${region.id}_stalker`, name: region.normalNames[2],
        description: `${region.name}의 순환로를 가로질러 약해진 탐험자를 추격하는 기동 개체.`,
        icon: `monsters/${region.id}_stalker`, level: region.startLevel + 39,
        statProfile: MonsterStatProfile.SKIRMISHER, statWeights: { atk: 1.12, speed: 1.12, critDmg: 1.08 },
        ...monsterCommon, tags: [GameTags.ENTITY_BEAST, primaryProperty, secondaryProperty, regionTag],
    });
    defineWorldMonster({
        id: `${region.id}_sovereign`, name: region.bossName,
        description: `${region.name}의 주 통로 옆 숨은 심층을 지배하며 환경 자체를 무기로 쓰는 선택형 지역 보스.`,
        icon: `monsters/${region.id}_sovereign`, level: region.bossLevel,
        statProfile: MonsterStatProfile.HYBRID, statRank: MonsterRank.BOSS,
        statWeights: { maxLife: 1.08 + index * 0.015, atk: 1.1, magicForce: 1.13, def: 1.08, magicDef: 1.1 },
        expReward: region.bossLevel * 20 * 15,
        drops: [
            { itemDataId: materialId, minCount: 12 + index, maxCount: 20 + index * 2, chance: 1 },
            { itemDataId: sigilId, minCount: 1, maxCount: 1, chance: 1 },
            { itemDataId: equipmentIds.relic, minCount: 1, maxCount: 1, chance: 0.035 },
        ],
        goldReward: { min: 70_000 + index * 20_000, max: 100_000 + index * 30_000 },
        skills: [{ skillDataId: firstSkillId, level: 5 }, { skillDataId: secondSkillId, level: 5 }],
        skillPattern: {
            sequence: [firstSkillId, secondSkillId],
            randomOrder: index % 2 === 1,
            initialDelay: 2.2,
            interval: { min: Math.max(3.4, 5.4 - index * 0.16), max: Math.max(4.8, 7 - index * 0.12) },
        },
        ai: {
            intelligence: Math.min(100, 82 + index * 2),
            disposition: MonsterAiDisposition.THREAT,
            weights: {
                attack: 0.04, damage: 1.1, healing: 1.6 + index * 0.08,
                shielding: 1.65 + index * 0.08, control: 1.75 + index * 0.1, taunt: 3.2 + index * 0.16,
            },
            tauntResistance: Math.min(0.998, 0.9 + index * 0.01),
            switchThreshold: 0.32 + index * 0.01,
            decayPerSecond: 0.003,
        },
        tags: [
            GameTags.ENTITY_BOSS, GameTags.ENTITY_HUMANOID,
            primaryProperty, secondaryProperty, regionTag, `monster:${region.id}-sovereign`,
        ],
    });

    defineResource({
        id: `${region.id}_reliquary`, name: `${region.name} 봉인 유물함`,
        level: region.bossLevel, baseAttribute: { maxLife: 1 }, hardness: 0,
        drops: [], expReward: { min: 0, max: 0 }, interaction: 'open_ascendant_reliquary',
        attackable: false, interactionCooldown: { min: 4 * 60 * 60, max: 8 * 60 * 60 },
        tags: ['resource:treasure', regionTag],
    });
    defineResource({
        id: `${region.id}_altar`, name: `${region.name} 봉인 제단`,
        level: region.bossLevel, baseAttribute: { maxLife: 1 }, hardness: 0,
        drops: [], expReward: { min: 0, max: 0 }, interaction: 'inspect_ascendant_altar',
        attackable: false, tags: ['resource:altar', 'resource:otherworld-gate', regionTag],
    });

    const priceBase = 150_000 + index * 125_000;
    defineShop({
        id: `${region.id}_waystation_store`,
        recommendedLevel: region.startLevel,
        buyList: [
            ...[
                [equipmentIds.sword, `${region.materialName} 단층검`],
                [equipmentIds.bow, `${region.materialName} 원환궁`],
                [equipmentIds.dagger, `${region.materialName} 경계송곳니`],
                [equipmentIds.staff, `${region.materialName} 공명지팡이`],
                [equipmentIds.shield, `${region.materialName} 심층방패`],
            ].map(([itemDataId, label]) => ({
                label,
                create: () => ({ itemDataId, count: 1 }),
                count: 1, price: priceBase, stock: 1, restockTime: 3_600,
            })),
            {
                label: `${region.name} 원정가방`,
                create: () => ({ itemDataId: equipmentIds.pack, count: 1 }),
                count: 1, price: Math.round(priceBase * 0.7), stock: 1, restockTime: 3_600,
            },
            {
                label: '대용량 체력 포션', create: () => ({ itemDataId: 'large_health_potion', count: 1 }),
                count: 1, price: 100_000, stock: 30, restockTime: 120,
            },
            {
                label: '대용량 마나 포션', create: () => ({ itemDataId: 'large_mana_potion', count: 1 }),
                count: 1, price: 100_000, stock: 30, restockTime: 120,
            },
            {
                label: '목제 화살', create: () => ({ itemDataId: 'wooden_arrow', count: 500 }),
                count: 500, price: 5_000, stock: 40, restockTime: 30,
            },
        ],
        sellList: [{
            label: region.materialName,
            filter: item => item.itemDataId === materialId,
            count: 999,
            price: 3_000 + index * 900,
        }],
        tags: [`shop:${region.id}`],
    });

    const environmentEffect = environmentEffects[index];
    const affectedLocationSuffixes = [
        'threshold', 'outer_fork', 'upper_bend', 'upper_gallery', 'lower_bend', 'lower_gallery',
        'west_rise', 'echo_balcony', 'broken_span',
        'north_fork', 'north_archive', 'north_loop', 'hunter_cache',
        'south_fork', 'south_archive', 'south_loop', 'material_cache',
        'inner_crossroads', 'spiral_entry', 'spiral_upper', 'spiral_lower', 'spiral_nexus',
        'deep_loop', 'reliquary', 'altar_antechamber', 'sealed_altar',
        'final_fork', 'false_end', 'transition', 'boss_sanctum',
    ];
    for (const suffix of affectedLocationSuffixes) {
        registerLocationPassive(`${region.id}_${suffix}`, (location, _dt, onlinePlayers) => {
            for (const player of onlinePlayers) {
                if (player.locationId !== location.id || player.isDefeated) continue;
                const active = player.getStatusEffect(environmentEffect);
                if (!active || active.duration < 1.25) player.applyStatusEffect(environmentEffect, 3, 1);
            }
        });
    }
}

const rareForgeMinerals = [
    { rawId: 'astral_iron_ore', rawName: '성철 원광', refinedId: 'astral_steel', refinedName: '성철강', description: '별빛 관통 결을 품은 금속', tags: ['material:astral_steel', GameTags.PROPERTY_METAL, GameTags.PROPERTY_LIGHT] },
    { rawId: 'abyss_pearl_ore', rawName: '심연진주 원광', refinedId: 'abyssal_silver', refinedName: '심연은', description: '수압과 마력을 함께 받아내는 은빛 금속', tags: ['material:abyssal_silver', GameTags.PROPERTY_METAL, GameTags.PROPERTY_WATER, GameTags.PROPERTY_DARK] },
    { rawId: 'thunder_quartz_ore', rawName: '뇌광석영 원광', refinedId: 'storm_quartz', refinedName: '폭풍석영', description: '공격과 투사체의 흐름을 가속하는 결정', tags: ['material:storm_quartz', GameTags.MATERIAL_STONE, GameTags.PROPERTY_ELECTRIC] },
    { rawId: 'life_blood_ore', rawName: '생혈광 원석', refinedId: 'life_blood_alloy', refinedName: '생혈합금', description: '생명력과 회복성을 품은 붉은 합금', tags: ['material:life_blood_alloy', GameTags.PROPERTY_METAL, GameTags.PROPERTY_NATURAL] },
    { rawId: 'void_opal_ore', rawName: '공허오팔 원석', refinedId: 'void_opal', refinedName: '공허오팔', description: '치명적인 마력 틈을 만드는 검은 보석', tags: ['material:void_opal', GameTags.MATERIAL_STONE, GameTags.PROPERTY_DARK] },
    { rawId: 'prayerstone_ore', rawName: '기도석 원석', refinedId: 'sacred_prayerstone', refinedName: '성원석', description: '정신력의 흐름과 마법 저항을 고르게 다듬는 성석', tags: ['material:sacred_prayerstone', GameTags.MATERIAL_STONE, GameTags.PROPERTY_HOLY] },
    { rawId: 'origin_prism_ore', rawName: '기원프리즘 원석', refinedId: 'origin_prism', refinedName: '기원프리즘', description: '물리와 마법 관통을 함께 품은 태초의 결정', tags: ['material:origin_prism', GameTags.MATERIAL_STONE, GameTags.PROPERTY_HOLY, GameTags.PROPERTY_DARK] },
    { rawId: 'timeglass_ore', rawName: '시류사 원석', refinedId: 'timeglass_crystal', refinedName: '시류결정', description: '이동·공격·투사체의 시간을 앞당기는 결정', tags: ['material:timeglass_crystal', GameTags.MATERIAL_STONE, GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_DARK] },
] as const;

for (const mineral of rareForgeMinerals) {
    defineItem({
        id: mineral.rawId,
        name: mineral.rawName,
        description: `고레벨 전용 광산에서 낮은 확률로 발견되는 ${mineral.description}의 원광.`,
        image: `items/${mineral.rawId}`,
        category: '희귀 원광', weight: 0.9, stackable: true, maxStack: MAX_STACKABLE_ITEM_COUNT,
        baseMetadata: null, onUse: null, equipSlot: null, modifiers: null, baseDurability: null,
        tags: [GameTags.RESOURCE_ORE, ...mineral.tags],
    });
    defineItem({
        id: mineral.refinedId,
        name: mineral.refinedName,
        description: `마력 제련으로 불순물을 걷어낸 ${mineral.description}. 단조 재료로 사용할 수 있다.`,
        image: `items/${mineral.refinedId}`,
        category: '희귀 제련 소재', weight: 0.65, stackable: true, maxStack: MAX_STACKABLE_ITEM_COUNT,
        baseMetadata: null, onUse: null, equipSlot: null, modifiers: null, baseDurability: null,
        tags: [...mineral.tags],
    });
}

for (const mine of HIGH_LEVEL_MINES) {
    const region = ASCENDANT_REGIONS.find(candidate => candidate.id === mine.regionId)!;
    defineResource({
        id: `${mine.id}_ore_vein`,
        name: `${mine.name} 복합 광맥`,
        level: mine.level,
        baseAttribute: {
            maxLife: 140_000 + mine.level * 1_100,
            def: 300 + mine.level * 0.9,
            magicDef: 250 + mine.level * 0.7,
        },
        hardness: 350 + mine.level * 0.65,
        drops: [
            { itemDataId: `${region.id}_material`, weight: 95, minCount: 2, maxCount: 5 },
            { itemDataId: mine.rawMineralIds[0], weight: 2.5, minCount: 1, maxCount: 1 },
            { itemDataId: mine.rawMineralIds[1], weight: 2.5, minCount: 1, maxCount: 1 },
        ],
        expReward: { min: mine.level * 120, max: mine.level * 175 },
        interaction: 'inspect_ore',
        tags: [GameTags.RESOURCE_ORE, GameTags.TRAIT_INANIMATE, GameTags.MATERIAL_STONE, ...region.propertyTags],
    });
}

registerResourceInteraction('open_ascendant_reliquary', (resource, player) => {
    const region = ASCENDANT_REGIONS.find(candidate => resource.resourceDataId === `${candidate.id}_reliquary`);
    if (!region) return false;
    const equipment = [
        `${region.id}_sword`, `${region.id}_bow`, `${region.id}_dagger`,
        `${region.id}_staff`, `${region.id}_shield`,
    ];
    const roll = Math.random();
    const itemDataId = roll < 0.8
        ? `${region.id}_material`
        : equipment[Math.floor(Math.random() * equipment.length)];
    const count = roll < 0.8 ? 6 + Math.floor(Math.random() * 9) : 1;
    const requirements = createAcquisitionRequirements(itemDataId, region.startLevel, 'treasure');
    const destination = player.receiveLoot(itemDataId, count, requirements
        ? { [ItemMetadataKeys.REQUIREMENTS]: requirements }
        : null);
    const gold = Math.round(region.bossLevel * (180 + Math.random() * 140));
    player.gold += gold;
    sendBotMessageToUser(player.userId, chat()
        .color('gold', builder => builder.weight('bold', nested => nested.text(`[ ${region.name} 유물함 ]`)))
        .text(`\n${itemDataId === `${region.id}_material` ? region.materialName : '지역 장비'} x${count}`)
        .text(`\nGold +${gold}`)
        .text(destination === 'ground' ? '\n인벤토리 중량이 부족해 아이템은 바닥에 놓였습니다.' : '')
        .build());
    return true;
});

registerResourceInteraction('inspect_ascendant_altar', (resource, player) => {
    const region = ASCENDANT_REGIONS.find(candidate => resource.resourceDataId === `${candidate.id}_altar`);
    if (!region) return false;
    const sigilId = `${region.id}_sigil`;
    const hasSigil = player.inventory.countMatching(item => item.itemDataId === sigilId) > 0;
    sendNotificationToUser(player.userId, {
        key: `ascendant-altar:${region.id}`,
        message: hasSigil
            ? `${region.name} 군주의 인장이 제단에 반응합니다. 아직 지옥문 의식이 완성되지 않았습니다.`
            : `${region.bossName}의 인장이 있어야 제단의 문양을 깨울 수 있습니다.`,
        length: 5_000,
    });
    return true;
});
