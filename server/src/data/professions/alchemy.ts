import { GameTags } from '../../../../shared/tags.js';
import {
    ALCHEMY_WATER_BOTTLE_ITEM_ID,
    AlchemyDelivery,
    AlchemyEffectType,
    AlchemyReagentTrait,
    FAILED_ALCHEMY_POTION_ITEM_ID,
    defineAlchemyFormula,
    defineAlchemyReagent,
    resolveAlchemyPotionUse,
} from '../../models/professions/Alchemy.js';
import {
    ItemBalanceRole,
    ItemMetadataKeys,
    MAX_STACKABLE_ITEM_COUNT,
    defineItem,
} from '../../models/economy/Item.js';
import { registerItemUse } from '../../modules/player/itemUse.js';
import { useAlchemyPotion } from '../../modules/professions/alchemy.js';

registerItemUse('alchemy_potion', useAlchemyPotion, {
    quickBundle: item => {
        const resolved = resolveAlchemyPotionUse(
            item.itemDataId,
            item.getMetadata(ItemMetadataKeys.ALCHEMY),
        );
        return resolved?.metadata.delivery === AlchemyDelivery.DRINK.key
            && resolved.effectType.audience === 'beneficial';
    },
});

// TODO(art): 1차 콘텐츠 확장 기간에는 의미가 가까운 기존 128×128 아이콘을 명시적으로 재사용한다.
defineItem({
    id: ALCHEMY_WATER_BOTTLE_ITEM_ID,
    name: '정제수 물병',
    description: '연금술 반응을 안정시키도록 끓여 식힌 정제수 한 병. 조제약 한 병마다 정확히 하나가 필요하다.',
    image: 'items/fresh_water',
    category: '연금술 재료',
    weight: 0.45,
    stackable: true,
    maxStack: MAX_STACKABLE_ITEM_COUNT,
    baseMetadata: null,
    onUse: null,
    equipSlot: null,
    modifiers: null,
    baseDurability: null,
    tags: [GameTags.ITEM_CONSUMABLE, GameTags.PROPERTY_WATER],
    balance: { role: ItemBalanceRole.UTILITY, notes: ['조제약 한 병당 하나를 소비합니다.'] },
});

const alchemyPotionItems = [
    {
        id: 'alchemy_life_draught', name: '생명 회복 조제약', image: 'items/health_potion',
        description: '생명 성질을 응축한 조제약. 품질에 따라 생명력 회복량이 달라진다.',
        property: GameTags.PROPERTY_NATURAL, role: ItemBalanceRole.RECOVERY,
    },
    {
        id: 'alchemy_mind_draught', name: '정신 회복 조제약', image: 'items/mana_potion',
        description: '정신 성질을 응축한 조제약. 품질에 따라 정신력 회복량이 달라진다.',
        property: GameTags.PROPERTY_WATER, role: ItemBalanceRole.RECOVERY,
    },
    {
        id: 'alchemy_regeneration_elixir', name: '재생 조제약', image: 'items/aurora_recovery_draught',
        description: '생명력을 서서히 되돌리는 조제약. 품질에 따라 효과 레벨과 지속시간이 달라진다.',
        property: GameTags.PROPERTY_NATURAL, role: ItemBalanceRole.BUFF,
    },
    {
        id: 'alchemy_battle_tonic', name: '전투 강화 조제약', image: 'items/battle_tonic',
        description: '육체의 공격성을 끌어올리는 조제약. 품질에 따라 효과 레벨과 지속시간이 달라진다.',
        property: GameTags.PROPERTY_METAL, role: ItemBalanceRole.BUFF,
    },
    {
        id: 'alchemy_arcane_tonic', name: '비전 강화 조제약', image: 'items/arcane_tonic',
        description: '마력 회로를 활성화하는 조제약. 품질에 따라 효과 레벨과 지속시간이 달라진다.',
        property: GameTags.PROPERTY_LIGHT, role: ItemBalanceRole.BUFF,
    },
    {
        id: 'alchemy_swiftness_tonic', name: '신속 조제약', image: 'items/swift_tonic',
        description: '몸의 반응과 이동을 가볍게 하는 조제약. 품질에 따라 효과 레벨과 지속시간이 달라진다.',
        property: GameTags.PROPERTY_ELECTRIC, role: ItemBalanceRole.BUFF,
    },
    {
        id: 'alchemy_detox_draught', name: '해독 조제약', image: 'items/forest_antidote',
        description: '독성 반응을 중화하도록 조율한 조제약. 품질에 따라 정화 효과와 지속시간이 달라진다.',
        property: GameTags.PROPERTY_NATURAL, role: ItemBalanceRole.BUFF,
    },
    {
        id: 'alchemy_preservation_tonic', name: '보존 조제약', image: 'items/graveward_tonic',
        description: '부패와 훼손을 늦추는 조제약. 품질에 따라 보존 효과와 지속시간이 달라진다.',
        property: GameTags.PROPERTY_ICE, role: ItemBalanceRole.BUFF,
    },
    {
        id: 'alchemy_toxic_flask', name: '독성 조제약', image: 'items/venom_gland',
        description: '적에게 던져 독성 피해와 맹독을 퍼뜨리기 위한 조제약. 음용하면 자신에게 작용한다.',
        property: GameTags.PROPERTY_POISON, role: ItemBalanceRole.UTILITY,
    },
    {
        id: FAILED_ALCHEMY_POTION_ITEM_ID, name: '실패한 조제약', image: 'items/fresh_water',
        description: '조합이 맞지 않아 색과 맛이 불안정한 약. 투입한 재료의 독성·생명·정신 성질에 따라 약한 효과나 피해가 남는다.',
        property: GameTags.PROPERTY_WATER, role: ItemBalanceRole.UTILITY,
    },
] as const;

for (const potion of alchemyPotionItems) defineItem({
    id: potion.id,
    name: potion.name,
    description: potion.description,
    image: potion.image,
    category: '연금 조제약',
    weight: 0.35,
    stackable: true,
    maxStack: MAX_STACKABLE_ITEM_COUNT,
    baseMetadata: null,
    onUse: 'alchemy_potion',
    equipSlot: null,
    modifiers: null,
    baseDurability: null,
    tags: [GameTags.ITEM_CONSUMABLE, potion.property],
    balance: { role: potion.role, notes: ['인스턴스 품질·효율·지속시간·전달 방식 metadata를 사용합니다.'] },
    gameplayEffects: ['조제 정확도와 감각에 따른 품질', '음용 또는 대상 중심 투척 효과'],
});

for (const reagent of [
    { itemDataId: 'mourning_lily', traits: [AlchemyReagentTrait.LIFE, AlchemyReagentTrait.CLEANSE] },
    { itemDataId: 'oasis_date', traits: [AlchemyReagentTrait.LIFE, AlchemyReagentTrait.CATALYST] },
    { itemDataId: 'mana_crystal', traits: [AlchemyReagentTrait.MIND, AlchemyReagentTrait.ARCANE] },
    { itemDataId: 'tide_pearl', traits: [AlchemyReagentTrait.MIND, AlchemyReagentTrait.CATALYST] },
    { itemDataId: 'snowmoss', traits: [AlchemyReagentTrait.GROWTH, AlchemyReagentTrait.CLEANSE] },
    { itemDataId: 'primal_sap', traits: [AlchemyReagentTrait.GROWTH, AlchemyReagentTrait.LIFE] },
    { itemDataId: 'wolf_pelt', traits: [AlchemyReagentTrait.MIGHT] },
    { itemDataId: 'iron_ore', traits: [AlchemyReagentTrait.MIGHT, AlchemyReagentTrait.WARD] },
    { itemDataId: 'logic_core', traits: [AlchemyReagentTrait.ARCANE, AlchemyReagentTrait.CATALYST] },
    { itemDataId: 'aurora_shard', traits: [AlchemyReagentTrait.MOTION, AlchemyReagentTrait.ARCANE] },
    { itemDataId: 'photon_lens', traits: [AlchemyReagentTrait.MOTION, AlchemyReagentTrait.CATALYST] },
    { itemDataId: 'venom_gland', traits: [AlchemyReagentTrait.TOXIN, AlchemyReagentTrait.CLEANSE] },
    { itemDataId: 'rime_crystal', traits: [AlchemyReagentTrait.WARD, AlchemyReagentTrait.CLEANSE] },
    { itemDataId: 'dune_scorpion_venom', traits: [AlchemyReagentTrait.TOXIN] },
] as const) defineAlchemyReagent(reagent);

for (const formula of [
    {
        id: 'life-restoration', name: '생명 회복 조제약', aliases: ['생명약', '회복약'],
        description: '즉시 생명력을 회복합니다.', resultItemDataId: 'alchemy_life_draught', difficulty: 3,
        ingredients: [{ itemDataId: 'mourning_lily', count: 2 }, { itemDataId: 'oasis_date', count: 1 }],
        effect: { type: AlchemyEffectType.RESTORE_LIFE, basePower: 750 },
    },
    {
        id: 'mind-restoration', name: '정신 회복 조제약', aliases: ['정신약', '마나약'],
        description: '즉시 정신력을 회복합니다.', resultItemDataId: 'alchemy_mind_draught', difficulty: 3,
        ingredients: [{ itemDataId: 'mana_crystal', count: 2 }, { itemDataId: 'tide_pearl', count: 1 }],
        effect: { type: AlchemyEffectType.RESTORE_MENTALITY, basePower: 420 },
    },
    {
        id: 'regeneration', name: '재생 조제약', aliases: ['재생약'],
        description: '일정 시간 생명력을 재생합니다.', resultItemDataId: 'alchemy_regeneration_elixir', difficulty: 6,
        ingredients: [{ itemDataId: 'snowmoss', count: 2 }, { itemDataId: 'primal_sap', count: 1 }],
        effect: { type: AlchemyEffectType.BENEFICIAL_STATUS, basePower: 8, baseDuration: 55, statusEffectId: 'regeneration' },
    },
    {
        id: 'battle-enhancement', name: '전투 강화 조제약', aliases: ['전투약', '근력약'],
        description: '일정 시간 공격력을 강화합니다.', resultItemDataId: 'alchemy_battle_tonic', difficulty: 4,
        ingredients: [{ itemDataId: 'wolf_pelt', count: 2 }, { itemDataId: 'iron_ore', count: 1 }],
        effect: { type: AlchemyEffectType.BENEFICIAL_STATUS, basePower: 4, baseDuration: 90, statusEffectId: 'strength_enhancement' },
    },
    {
        id: 'arcane-enhancement', name: '비전 강화 조제약', aliases: ['비전약', '마법약'],
        description: '일정 시간 마법력을 강화합니다.', resultItemDataId: 'alchemy_arcane_tonic', difficulty: 6,
        ingredients: [{ itemDataId: 'mana_crystal', count: 2 }, { itemDataId: 'logic_core', count: 1 }],
        effect: { type: AlchemyEffectType.BENEFICIAL_STATUS, basePower: 5, baseDuration: 85, statusEffectId: 'magic_enhancement' },
    },
    {
        id: 'swiftness', name: '신속 조제약', aliases: ['신속약', '속도약'],
        description: '일정 시간 이동속도를 강화합니다.', resultItemDataId: 'alchemy_swiftness_tonic', difficulty: 6,
        ingredients: [{ itemDataId: 'aurora_shard', count: 1 }, { itemDataId: 'photon_lens', count: 1 }],
        effect: { type: AlchemyEffectType.BENEFICIAL_STATUS, basePower: 4, baseDuration: 80, statusEffectId: 'swiftness' },
    },
    {
        id: 'detoxification', name: '해독 조제약', aliases: ['해독약'],
        description: '독성 상태를 중화하고 저항을 돕습니다.', resultItemDataId: 'alchemy_detox_draught', difficulty: 5,
        ingredients: [{ itemDataId: 'snowmoss', count: 2 }, { itemDataId: 'venom_gland', count: 1 }],
        effect: { type: AlchemyEffectType.BENEFICIAL_STATUS, basePower: 2, baseDuration: 45, statusEffectId: 'detoxification' },
    },
    {
        id: 'preservation', name: '보존 조제약', aliases: ['보존약'],
        description: '부패와 훼손에 대한 보존 효과를 얻습니다.', resultItemDataId: 'alchemy_preservation_tonic', difficulty: 5,
        ingredients: [{ itemDataId: 'mourning_lily', count: 1 }, { itemDataId: 'rime_crystal', count: 1 }],
        effect: { type: AlchemyEffectType.BENEFICIAL_STATUS, basePower: 4, baseDuration: 65, statusEffectId: 'preservation' },
    },
    {
        id: 'toxic', name: '독성 조제약', aliases: ['독약', '투척독'],
        description: '독성 피해와 맹독을 일으킵니다.', resultItemDataId: 'alchemy_toxic_flask', difficulty: 7,
        ingredients: [{ itemDataId: 'venom_gland', count: 1 }, { itemDataId: 'dune_scorpion_venom', count: 1 }],
        effect: { type: AlchemyEffectType.HARMFUL_STATUS, basePower: 5, baseDuration: 12, statusEffectId: 'poison', damageType: 'magic' },
    },
] as const) defineAlchemyFormula(formula);
