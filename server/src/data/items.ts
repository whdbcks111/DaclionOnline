import {
    defineItem,
    ItemBalanceRole,
    ItemMetadataKeys,
} from '../models/Item.js';
import { startCoroutine, Wait } from '../modules/coroutine.js';
import { registerItemUse } from '../modules/itemUse.js';
import { sendNotificationToUser } from '../modules/message.js';
import { getPlayerByUserId } from '../modules/player.js';
import logger from '../utils/logger.js';
import { GameTags } from '../../../shared/tags.js';
import {
    executeProjectileItemAttack,
    ItemAttackOverrideKeys,
    registerItemAttackOverride,
} from '../modules/itemAttack.js';
import { StatusEffectType } from '../models/StatusEffect.js';
import { getFishCatalog } from './fishingCatalog.js';

registerItemAttackOverride(ItemAttackOverrideKeys.PROJECTILE, executeProjectileItemAttack);

registerItemUse('heal_hp', (inv, item, finish) => {
    function* healRoutine(amount: number, time: number) {
        try {
            const player = getPlayerByUserId(inv.playerId);
            if(!player) return;

            inv.removeItem(item.id, 1);
            sendNotificationToUser(player.userId, { key: 'item:heal_hp', message: '꿀꺽꿀꺽...', length: time * 1000 });
            yield Wait(time);
            const result = player.heal(amount, player);
            sendNotificationToUser(player.userId, { key: 'item:heal_hp', message: `생명력을 ${result.healedAmount.toFixed(0)}만큼 회복했습니다!` });
        }
        catch(e) {
            logger.error(e);
        }
        finally {
            finish();
        }
    }
    startCoroutine(healRoutine(item.getMetadata<number>('amount') ?? 0, item.getMetadata<number>('time') ?? 1));
});

registerItemUse('heal_mp', (inv, item, finish) => {
    function* healRoutine(amount: number, time: number) {
        try {
            const player = getPlayerByUserId(inv.playerId);
            if(!player) return;

            inv.removeItem(item.id, 1);
            sendNotificationToUser(player.userId, { key: 'item:heal_mp', message: '꿀꺽꿀꺽...', length: time * 1000 });
            yield Wait(time);
            player.mentality += amount;
            sendNotificationToUser(player.userId, { key: 'item:heal_mp', message: `정신력을 ${amount.toFixed(0)}만큼 회복했습니다!` });
        }
        catch(e) {
            logger.error(e);
        }
        finally {
            finish();
        }
    }
    startCoroutine(healRoutine(item.getMetadata<number>('amount') ?? 0, item.getMetadata<number>('time') ?? 1));
});

registerItemUse('learn_skill', (inv, item, finish) => {
    try {
        const player = getPlayerByUserId(inv.playerId);
        if (!player) return;
        const skillDataId = item.getMetadata<string>('skillDataId');
        if (!skillDataId) {
            sendNotificationToUser(player.userId, {
                key: 'item:learn_skill:invalid',
                message: '이 스킬북에는 유효한 스킬 정보가 없습니다.',
            });
            return;
        }
        const result = player.skills.grant(skillDataId, `item:${item.itemDataId}`);
        if (!result.acquired) {
            sendNotificationToUser(player.userId, {
                key: `item:learn_skill:owned:${skillDataId}`,
                message: `이미 스킬 [ ${result.skill.name} ] 을(를) 보유하고 있습니다.`,
            });
            return;
        }
        inv.removeItemInstance(item, 1);
    } catch (error) {
        logger.error('스킬북 사용 실패', error);
    } finally {
        finish();
    }
});

registerItemUse('restore_survival', (inv, item, finish) => {
    function* restoreRoutine() {
        try {
            const player = getPlayerByUserId(inv.playerId);
            if (!player) return;
            const hunger = Math.max(0, item.getMetadata<number>('hunger') ?? 0);
            const thirst = Math.max(0, item.getMetadata<number>('thirst') ?? 0);
            const time = Math.max(0, item.getMetadata<number>('time') ?? 1);
            if (!inv.removeItemInstance(item, 1)) return;
            sendNotificationToUser(player.userId, {
                key: `item:restore-survival:${item.itemDataId}`,
                message: item.getMetadata<string>('useMessage') ?? '섭취 중...',
                length: time * 1000,
            });
            yield Wait(time);
            if (hunger > 0) player.restoreHunger(hunger);
            if (thirst > 0) player.restoreThirst(thirst);
            sendNotificationToUser(player.userId, {
                key: `item:restore-survival:${item.itemDataId}`,
                message: `${item.name}을(를) 섭취해 ${hunger > 0 ? `배고픔 ${hunger}` : ''}${hunger > 0 && thirst > 0 ? ', ' : ''}${thirst > 0 ? `수분 ${thirst}` : ''}을(를) 회복했습니다.`,
            });
        } catch (error) {
            logger.error('생존 자원 아이템 사용 실패', error);
        } finally {
            finish();
        }
    }
    startCoroutine(restoreRoutine());
});

registerItemUse('apply_status_effect', (inv, item, finish) => {
    try {
        const player = getPlayerByUserId(inv.playerId);
        if (!player) return;
        const config = item.getMetadata<{ id?: string; level?: number; duration?: number }>(
            ItemMetadataKeys.STATUS_EFFECT,
        );
        const effect = config?.id ? StatusEffectType.fromKey(config.id) : undefined;
        if (!effect || !Number.isFinite(config?.duration) || (config?.duration ?? 0) <= 0) {
            sendNotificationToUser(player.userId, {
                key: `item:status-effect:invalid:${item.itemDataId}`,
                message: '이 아이템의 효과 정보가 올바르지 않습니다.',
            });
            return;
        }
        if (!inv.removeItemInstance(item, 1)) return;
        const level = Math.max(1, Math.floor(config?.level ?? 1));
        const result = player.applyStatusEffect(effect, config!.duration!, level);
        sendNotificationToUser(player.userId, {
            key: `item:status-effect:${effect.id}`,
            message: result.action.changed
                ? `${effect.label} Lv.${effect.normalizeLevel(level)} 효과를 얻었습니다. (${config!.duration}초)`
                : `${effect.label} 효과가 이미 더 강하게 적용되어 있습니다.`,
        });
    } catch (error) {
        logger.error('버프 아이템 사용 실패', error);
    } finally {
        finish();
    }
});

defineItem({
    id: 'health_potion',
    name: '체력 포션',
    description: '마시면 HP를 50 회복한다.',
    image: 'items/health_potion',
    category: '소모품',
    weight: 0.5,
    stackable: true,
    maxStack: 99,
    baseMetadata: { amount: 50 },
    onUse: 'heal_hp',
    equipSlot: null,
    modifiers: null,
    baseDurability: null,
    tags: [GameTags.ITEM_CONSUMABLE, GameTags.PROPERTY_NATURAL],
});

defineItem({
    id: 'mana_potion',
    name: '마나 포션',
    description: '마시면 MP를 30 회복한다.',
    image: 'items/mana_potion',
    category: '소모품',
    weight: 0.5,
    stackable: true,
    maxStack: 99,
    baseMetadata: { amount: 50 },
    onUse: 'heal_mp',
    equipSlot: null,
    modifiers: null,
    baseDurability: null,
    tags: [GameTags.ITEM_CONSUMABLE, GameTags.PROPERTY_WATER],
});

defineItem({
    id: 'battle_tonic',
    name: '전투 강장제',
    description: '60초 동안 공격력이 10% 증가한다.',
    // TODO(icons): 전용 아이콘 제작 전까지 체력 포션 아이콘을 사용한다.
    image: 'items/health_potion',
    category: '버프 소모품',
    weight: 0.4,
    stackable: true,
    maxStack: 20,
    baseMetadata: { [ItemMetadataKeys.STATUS_EFFECT]: { id: 'strength_enhancement', level: 2, duration: 60 } },
    onUse: 'apply_status_effect',
    equipSlot: null,
    modifiers: null,
    baseDurability: null,
    tags: [GameTags.ITEM_CONSUMABLE],
    balance: {
        role: ItemBalanceRole.BUFF,
        attackType: 'physical',
        recommendedJobIds: ['career:warrior', 'career:archer', 'career:assassin'],
    },
});

defineItem({
    id: 'arcane_tonic',
    name: '비전 영약',
    description: '60초 동안 마법력이 10% 증가한다.',
    // TODO(icons): 전용 아이콘 제작 전까지 마나 포션 아이콘을 사용한다.
    image: 'items/mana_potion',
    category: '버프 소모품',
    weight: 0.4,
    stackable: true,
    maxStack: 20,
    baseMetadata: { [ItemMetadataKeys.STATUS_EFFECT]: { id: 'magic_enhancement', level: 2, duration: 60 } },
    onUse: 'apply_status_effect',
    equipSlot: null,
    modifiers: null,
    baseDurability: null,
    tags: [GameTags.ITEM_CONSUMABLE],
    balance: { role: ItemBalanceRole.BUFF, attackType: 'magic', recommendedJobIds: ['career:mage'] },
});

defineItem({
    id: 'swift_tonic',
    name: '신속의 물약',
    description: '60초 동안 이동속도가 10% 증가한다.',
    // TODO(icons): 전용 아이콘 제작 전까지 마나 포션 아이콘을 사용한다.
    image: 'items/mana_potion',
    category: '버프 소모품',
    weight: 0.4,
    stackable: true,
    maxStack: 20,
    baseMetadata: { [ItemMetadataKeys.STATUS_EFFECT]: { id: 'swiftness', level: 2, duration: 60 } },
    onUse: 'apply_status_effect',
    equipSlot: null,
    modifiers: null,
    baseDurability: null,
    tags: [GameTags.ITEM_CONSUMABLE],
    balance: {
        role: ItemBalanceRole.BUFF,
        attackType: 'physical',
        recommendedJobIds: ['career:archer', 'career:assassin'],
        notes: ['이동속도 상승은 회피율 변화까지 실제 전투식으로 환산합니다.'],
    },
});

defineItem({
    id: 'traveler_bread',
    name: '여행자 빵',
    description: '든든하게 구운 빵. 배고픔을 35 회복한다.',
    image: 'items/traveler_bread',
    category: '음식',
    weight: 0.4,
    stackable: true,
    maxStack: 20,
    baseMetadata: { hunger: 35, thirst: 0, time: 1.5, useMessage: '빵을 먹는 중...' },
    onUse: 'restore_survival',
    equipSlot: null,
    modifiers: null,
    baseDurability: null,
    tags: [GameTags.ITEM_CONSUMABLE, GameTags.PROPERTY_NATURAL],
});

defineItem({
    id: 'fresh_water',
    name: '맑은 샘물',
    description: '휴대용 물통에 담긴 깨끗한 샘물. 수분을 40 회복한다.',
    image: 'items/fresh_water',
    category: '음료',
    weight: 0.6,
    stackable: true,
    maxStack: 20,
    baseMetadata: { hunger: 0, thirst: 40, time: 1, useMessage: '물을 마시는 중...' },
    onUse: 'restore_survival',
    equipSlot: null,
    modifiers: null,
    baseDurability: null,
    tags: [GameTags.ITEM_CONSUMABLE, GameTags.PROPERTY_WATER],
});

defineItem({
    id: 'old_sword',
    name: '낡은 검',
    description: '녹슬고 낡은 검. 그래도 쓸 수는 있다.',
    image: 'items/old_sword',
    category: '장검',
    weight: 3.0,
    stackable: false,
    maxStack: 1,
    baseMetadata: null,
    onUse: null,
    equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'atk', op: 'add', value: 5, source: '' },
    ],
    baseDurability: 50,
    tags: [GameTags.ITEM_WEAPON, GameTags.WEAPON_SWORD, GameTags.PROPERTY_FIRE],
    balance: {
        role: ItemBalanceRole.WEAPON,
        attackType: 'physical',
        recommendedJobIds: ['career:warrior'],
    },
});

defineItem({
    id: 'old_shield',
    name: '낡은 방패',
    description: '낡은 나무 방패.',
    image: 'items/old_shield',
    category: '방패',
    weight: 2.5,
    stackable: false,
    maxStack: 1,
    baseMetadata: null,
    onUse: null,
    equipSlot: 'offHand',
    modifiers: [
        { attribute: 'def', op: 'add', value: 3, source: '' },
    ],
    baseDurability: 60,
    tags: [GameTags.ITEM_ARMOR, GameTags.MATERIAL_WOOD],
    balance: { role: ItemBalanceRole.DEFENSE, recommendedJobIds: ['career:warrior'] },
});

defineItem({
    id: 'venom_dagger',
    name: '독 단검',
    description: '독을 머금은 단검. 물리 공격 적중 시 50% 확률로 8초간 1레벨 맹독을 부여한다.',
    image: 'items/venom_dagger',
    category: '단검',
    weight: 1.5,
    stackable: false,
    maxStack: 1,
    baseMetadata: null,
    onUse: null,
    equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'atk', op: 'add', value: 3, source: '' },
    ],
    baseDurability: 40,
    tags: [GameTags.ITEM_WEAPON, GameTags.WEAPON_DAGGER, GameTags.PROPERTY_POISON],
    onBasicAttackHit: ({ target }) => {
        if (Math.random() < 0.5) {
            target.applyStatusEffect(StatusEffectType.DEADLY_POISON, 8, 1);
        }
    },
    balance: {
        role: ItemBalanceRole.WEAPON,
        attackType: 'physical',
        recommendedJobIds: ['career:assassin'],
        notes: ['맹독 부여의 기대 피해는 대상 생명력과 현재 잃은 생명력에 따라 달라져 기본 DPS와 분리합니다.'],
    },
});

defineItem({
    id: 'light_bow',
    name: '가벼운 활',
    description: '가벼운 화살을 소모해 원거리 기본 공격을 한다. 화살이 없으면 근접 공격한다.',
    image: 'items/light_bow',
    category: '활',
    weight: 1.8,
    stackable: false,
    maxStack: 1,
    baseMetadata: {
        basicAttackOverride: ItemAttackOverrideKeys.PROJECTILE,
        projectileAttack: { ammunitionItemId: 'wooden_arrow' },
    },
    onUse: null,
    equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'atk', op: 'add', value: 2, source: '' },
    ],
    baseDurability: 80,
    tags: [GameTags.ITEM_WEAPON, GameTags.WEAPON_BOW, GameTags.MATERIAL_WOOD],
    balance: {
        role: ItemBalanceRole.WEAPON,
        attackType: 'physical',
        recommendedJobIds: ['career:archer'],
        notes: ['화살의 damageBonus와 개별 투사체 override는 별도 탄약 기여로 분리됩니다.'],
    },
});

defineItem({
    id: 'training_axe',
    name: '훈련용 도끼',
    description: '전직소에서 지급하는 균형 잡힌 한손 도끼.',
    image: 'items/training_axe',
    category: '도끼',
    weight: 3.4,
    stackable: false,
    maxStack: 1,
    baseMetadata: null,
    onUse: null,
    equipSlot: 'mainHand',
    modifiers: [{ attribute: 'atk', op: 'add', value: 7, source: '' }],
    baseDurability: 90,
    tags: [GameTags.ITEM_WEAPON, GameTags.WEAPON_AXE, GameTags.MATERIAL_IRON],
    balance: { role: ItemBalanceRole.WEAPON, attackType: 'physical', recommendedJobIds: ['career:warrior'] },
});

defineItem({
    id: 'apprentice_staff',
    name: '견습 마법 지팡이',
    description: '정신 에너지를 모아 마법 투사체를 안정적으로 발사하는 지팡이.',
    image: 'items/apprentice_staff',
    category: '지팡이',
    weight: 2.2,
    stackable: false,
    maxStack: 1,
    baseMetadata: {
        basicAttackOverride: ItemAttackOverrideKeys.PROJECTILE,
        projectileAttack: { projectile: { dataId: 'basic_magic_orb' } },
    },
    onUse: null,
    equipSlot: 'mainHand',
    modifiers: [{ attribute: 'magicForce', op: 'add', value: 8, source: '' }],
    baseDurability: 100,
    tags: [GameTags.ITEM_WEAPON, GameTags.WEAPON_STAFF, GameTags.MATERIAL_WOOD],
    balance: { role: ItemBalanceRole.WEAPON, attackType: 'magic', recommendedJobIds: ['career:mage'] },
});

defineItem({
    id: 'wooden_arrow',
    name: '화살',
    description: '투사체 기본 공격에 한 발씩 소모되는 가벼운 나무 화살.',
    image: 'items/wooden_arrow',
    category: '탄약',
    weight: 0.1,
    stackable: true,
    maxStack: 99,
    baseMetadata: {
        projectile: {
            dataId: 'basic_arrow',
            overrides: {
                name: '가벼운 화살',
                damageBonus: 2,
                attributeOverrides: { armorPen: 1 },
            },
        },
    },
    onUse: null,
    equipSlot: null,
    modifiers: null,
    baseDurability: null,
    tags: [GameTags.ITEM_AMMUNITION, GameTags.MATERIAL_WOOD, GameTags.PROPERTY_NATURAL],
});

defineItem({
    id: 'basic_pickaxe',
    name: '곡괭이',
    description: '광석처럼 단단한 자원을 채굴할 수 있는 기본 곡괭이.',
    image: 'items/basic_pickaxe',
    category: '도구',
    weight: 2.8,
    stackable: false,
    maxStack: 1,
    baseMetadata: null,
    onUse: null,
    equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'atk', op: 'add', value: 4, source: '' },
    ],
    baseDurability: 100,
    tags: [GameTags.ITEM_TOOL, GameTags.TOOL_MINING, GameTags.MATERIAL_IRON],
});

defineItem({
    id: 'iron_pickaxe',
    name: '철 곡괭이',
    description: '철과 돌을 조합해 만든 튼튼한 채굴 도구.',
    image: 'items/iron_pickaxe',
    category: '도구',
    weight: 3.2,
    stackable: false,
    maxStack: 1,
    baseMetadata: null,
    onUse: null,
    equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'atk', op: 'add', value: 7, source: '' },
    ],
    baseDurability: 180,
    tags: [GameTags.ITEM_TOOL, GameTags.TOOL_MINING, GameTags.MATERIAL_IRON],
});

defineItem({
    id: 'seismic_crush_skillbook',
    name: '지각 붕괴 스킬북',
    description: '사용하면 스킬 [ 지각 붕괴 ] 를 획득하는 희귀한 수정 각인서.',
    image: 'items/seismic_crush_skillbook',
    category: '스킬북',
    weight: 0.3,
    stackable: true,
    maxStack: 10,
    baseMetadata: { skillDataId: 'seismic_crush' },
    onUse: 'learn_skill',
    equipSlot: null,
    modifiers: null,
    baseDurability: null,
    tags: [GameTags.ITEM_CONSUMABLE, GameTags.ITEM_SKILL_BOOK, GameTags.MATERIAL_DIAMOND],
});

const mineralItems = [
    { id: 'stone', name: '돌', description: '가장 흔한 광물 자원.', weight: 0.8, tag: GameTags.MATERIAL_STONE },
    { id: 'coal', name: '석탄', description: '연료로 사용할 수 있는 검은 광물.', weight: 0.5, tag: GameTags.MATERIAL_COAL },
    { id: 'iron_ore', name: '철', description: '도구와 장비 제작에 쓰이는 철 광석.', weight: 0.7, tag: GameTags.MATERIAL_IRON },
    { id: 'gold_ore', name: '금', description: '희소하고 가치 있는 금 광석.', weight: 0.6, tag: GameTags.MATERIAL_GOLD },
    { id: 'ruby', name: '루비', description: '붉게 빛나는 희귀 보석.', weight: 0.2, tag: GameTags.MATERIAL_RUBY },
    { id: 'emerald', name: '에메랄드', description: '초록빛을 띠는 희귀 보석.', weight: 0.2, tag: GameTags.MATERIAL_EMERALD },
    { id: 'diamond', name: '다이아몬드', description: '극히 희귀하고 단단한 보석.', weight: 0.2, tag: GameTags.MATERIAL_DIAMOND },
] as const;

for (const mineral of mineralItems) {
    defineItem({
        id: mineral.id,
        name: mineral.name,
        description: mineral.description,
        image: `items/${mineral.id}`,
        category: '광물',
        weight: mineral.weight,
        stackable: true,
        maxStack: 99,
        baseMetadata: null,
        onUse: null,
        equipSlot: null,
        modifiers: null,
        baseDurability: null,
        tags: [mineral.tag],
    });
}

defineItem({
    id: 'beginner_fishing_rod',
    name: '초보자 낚싯대',
    description: '루미나르 연못에서 쓰기 좋은 가벼운 낚싯대. 원형 채집 영역을 조종한다.',
    image: 'items/beginner_fishing_rod',
    category: '낚시 도구',
    weight: 1.6,
    stackable: false,
    maxStack: 1,
    baseMetadata: { fishingNetShape: 'circle' },
    onUse: null,
    equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'luck', op: 'add', value: 1, source: '' },
        { attribute: 'fishingBiteSpeed', op: 'add', value: 0.1, source: '' },
        { attribute: 'fishingNetSize', op: 'add', value: 6, source: '' },
        { attribute: 'fishingNetSpeed', op: 'add', value: 8, source: '' },
        { attribute: 'fishingGaugeStart', op: 'add', value: 0.08, source: '' },
    ],
    baseDurability: 120,
    tags: [GameTags.ITEM_TOOL, GameTags.TOOL_FISHING, GameTags.MATERIAL_WOOD],
});

defineItem({
    id: 'refined_fishing_rod',
    name: '정교한 낚싯대',
    description: '상점에서 구할 수 있는 균형형 고급 낚싯대. 채집 범위와 속도, 입질과 시작 게이지가 고르게 좋아진다.',
    image: 'items/refined_fishing_rod',
    category: '낚시 도구',
    weight: 1.8,
    stackable: false,
    maxStack: 1,
    baseMetadata: { fishingNetShape: 'circle' },
    onUse: null,
    equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'luck', op: 'add', value: 3, source: '' },
        { attribute: 'fishingBiteSpeed', op: 'add', value: 0.25, source: '' },
        { attribute: 'fishingNetSize', op: 'add', value: 10, source: '' },
        { attribute: 'fishingNetSpeed', op: 'add', value: 16, source: '' },
        { attribute: 'fishingGaugeStart', op: 'add', value: 0.1, source: '' },
    ],
    baseDurability: 260,
    tags: [GameTags.ITEM_TOOL, GameTags.TOOL_FISHING, GameTags.MATERIAL_IRON],
});

defineItem({
    id: 'wide_net_fishing_rod',
    name: '너울그물 낚싯대',
    description: '보물상자에서만 발견되는 기묘한 낚싯대. 매우 넓은 직사각형 채집 영역을 펼치지만 움직임이 둔하다.',
    image: 'items/wide_net_fishing_rod',
    category: '낚시 도구',
    weight: 2.4,
    stackable: false,
    maxStack: 1,
    baseMetadata: { fishingNetShape: 'rectangle' },
    onUse: null,
    equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'luck', op: 'add', value: 2, source: '' },
        { attribute: 'fishingBiteSpeed', op: 'add', value: 0.05, source: '' },
        { attribute: 'fishingNetSize', op: 'add', value: 20, source: '' },
        { attribute: 'fishingNetSpeed', op: 'add', value: -6, source: '' },
    ],
    baseDurability: 180,
    tags: [GameTags.ITEM_TOOL, GameTags.TOOL_FISHING, GameTags.MATERIAL_WOOD],
});

defineItem({
    id: 'swift_current_fishing_rod',
    name: '급류바늘 낚싯대',
    description: '보물상자에서만 발견되는 기묘한 낚싯대. 채집 영역은 작지만 물살을 타듯 극단적으로 빠르게 움직인다.',
    image: 'items/swift_current_fishing_rod',
    category: '낚시 도구',
    weight: 1.2,
    stackable: false,
    maxStack: 1,
    baseMetadata: { fishingNetShape: 'circle' },
    onUse: null,
    equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'luck', op: 'add', value: 2, source: '' },
        { attribute: 'fishingBiteSpeed', op: 'add', value: 0.1, source: '' },
        { attribute: 'fishingNetSize', op: 'add', value: -4, source: '' },
        { attribute: 'fishingNetSpeed', op: 'add', value: 46, source: '' },
    ],
    baseDurability: 160,
    tags: [GameTags.ITEM_TOOL, GameTags.TOOL_FISHING, GameTags.MATERIAL_IRON],
});

defineItem({
    id: 'earthworm_bait',
    name: '통통한 지렁이 미끼',
    description: '낚시 한 번에 하나를 소비한다. 보조 슬롯이 비어 있으면 낚시 시작 시 가진 묶음이 자동 장착된다.',
    image: 'items/earthworm_bait',
    category: '미끼',
    weight: 0.05,
    stackable: true,
    maxStack: 99,
    baseMetadata: null,
    onUse: null,
    equipSlot: 'offHand',
    modifiers: [
        { attribute: 'luck', op: 'add', value: 3, source: '' },
        { attribute: 'fishingBiteSpeed', op: 'add', value: 0.35, source: '' },
    ],
    baseDurability: null,
    tags: [GameTags.ITEM_CONSUMABLE, GameTags.ITEM_BAIT, GameTags.PROPERTY_NATURAL],
});

for (const fish of getFishCatalog()) {
    defineItem({
        id: fish.id,
        name: fish.name,
        description: fish.description,
        weight: fish.weight,
        image: `items/${fish.id}`,
        category: '물고기',
        stackable: true,
        maxStack: 20,
        baseMetadata: null,
        onUse: null,
        equipSlot: null,
        modifiers: null,
        baseDurability: null,
        tags: [GameTags.ITEM_FISH, GameTags.PROPERTY_WATER, fish.rarity.tag],
    });
}
