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
import { getLocation } from '../models/Location.js';

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

registerItemUse('reduce_skill_cooldowns', (inv, item, finish) => {
    try {
        const player = getPlayerByUserId(inv.playerId);
        if (!player) return;
        const seconds = Math.max(0, item.getMetadata<number>('seconds') ?? 0);
        const result = player.skills.reduceCooldowns(seconds);
        if (result.affected === 0) {
            sendNotificationToUser(player.userId, {
                key: 'item:cooldown:no-target',
                message: '줄일 수 있는 스킬 재사용 대기시간이 없습니다.',
            });
            return;
        }
        if (!inv.removeItemInstance(item, 1)) return;
        sendNotificationToUser(player.userId, {
            key: 'item:cooldown:reduced',
            message: `${result.affected}개 스킬의 재사용 대기시간을 최대 ${seconds}초 되돌렸습니다.`,
        });
    } catch (error) {
        logger.error('스킬 쿨다운 감소 아이템 사용 실패', error);
    } finally {
        finish();
    }
});

registerItemUse('labyrinth_compass', (inv, item, finish) => {
    try {
        const player = getPlayerByUserId(inv.playerId);
        const location = player ? getLocation(player.locationId) : undefined;
        if (!player || !location || player.moving) return;
        const destinations = location.getAvailableConnections(player).filter(connection => connection.status === 'visible');
        const destination = destinations[Math.floor(Math.random() * destinations.length)];
        if (!destination) {
            sendNotificationToUser(player.userId, {
                key: 'item:labyrinth-compass:no-path',
                message: '나침반이 갈 수 있는 길을 찾지 못했습니다.',
            });
            return;
        }
        if (!inv.removeItemInstance(item, 1)) return;
        player.locationId = destination.locationId;
        sendNotificationToUser(player.userId, {
            key: 'item:labyrinth-compass:moved',
            message: `뒤틀린 바늘이 가리킨 ${destination.name}(으)로 순간이동했습니다.`,
        });
    } catch (error) {
        logger.error('미궁 나침반 사용 실패', error);
    } finally {
        finish();
    }
});

registerItemUse('grant_single_evasion', (inv, item, finish) => {
    try {
        const player = getPlayerByUserId(inv.playerId);
        const source = `item:${item.itemDataId}`;
        if (!player) return;
        if (player.hasGuaranteedEvasion(source)) {
            sendNotificationToUser(player.userId, {
                key: 'item:guaranteed-evasion:active',
                message: '이미 같은 공명 파편의 회피 효과가 준비되어 있습니다.',
            });
            return;
        }
        if (!inv.removeItemInstance(item, 1)) return;
        player.grantGuaranteedEvasion(source);
        sendNotificationToUser(player.userId, {
            key: 'item:guaranteed-evasion',
            message: '다음 회피 가능한 공격을 확정적으로 피합니다.',
        });
    } catch (error) {
        logger.error('확정 회피 아이템 사용 실패', error);
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
    id: 'echo_hourglass',
    name: '메아리 모래시계',
    description: '깨뜨리면 이미 사용한 모든 스킬의 재사용 대기시간을 최대 15초 되돌리는 미궁 유물.',
    // TODO(icons): 전용 유물 아이콘 제작 전까지 마법 소모품 카테고리 fallback을 사용한다.
    image: 'items/mana_potion',
    category: '유물 소모품',
    weight: 0.3,
    stackable: true,
    maxStack: 5,
    baseMetadata: { seconds: 15 },
    onUse: 'reduce_skill_cooldowns',
    equipSlot: null,
    modifiers: null,
    baseDurability: null,
    tags: [GameTags.ITEM_CONSUMABLE, GameTags.PROPERTY_DARK],
});

defineItem({
    id: 'twisted_labyrinth_compass',
    name: '뒤틀린 미궁 나침반',
    description: '현재 장소에서 잠기지 않은 길 하나를 무작위로 골라 즉시 이동시키는 불안정한 유물.',
    // TODO(icons): 전용 유물 아이콘 제작 전까지 마법 소모품 카테고리 fallback을 사용한다.
    image: 'items/mana_potion',
    category: '유물 소모품',
    weight: 0.4,
    stackable: true,
    maxStack: 5,
    baseMetadata: null,
    onUse: 'labyrinth_compass',
    equipSlot: null,
    modifiers: null,
    baseDurability: null,
    tags: [GameTags.ITEM_CONSUMABLE, GameTags.PROPERTY_DARK],
});

defineItem({
    id: 'resonance_evasion_shard',
    name: '공명 회피 파편',
    description: '사용하면 다음 회피 가능한 공격 한 번을 반드시 피하게 만드는 수정 파편.',
    // TODO(icons): 전용 수정 아이콘 제작 전까지 보석 소재 카테고리 fallback을 사용한다.
    image: 'items/diamond',
    category: '유물 소모품',
    weight: 0.2,
    stackable: true,
    maxStack: 10,
    baseMetadata: null,
    onUse: 'grant_single_evasion',
    equipSlot: null,
    modifiers: null,
    baseDurability: null,
    tags: [GameTags.ITEM_CONSUMABLE, GameTags.MATERIAL_DIAMOND, GameTags.PROPERTY_ELECTRIC],
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
    description: '가벼운 화살을 소모해 원거리 기본 공격을 한다. 투사체 가속이 5% 증가하며 화살이 없으면 근접 공격한다.',
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
        { attribute: 'projectileAcceleration', op: 'multiply', value: 1.05, source: '' },
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
    description: '정신 에너지를 모아 마법 투사체를 안정적으로 발사한다. 투사체 가속이 4% 증가한다.',
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
    modifiers: [
        { attribute: 'magicForce', op: 'add', value: 8, source: '' },
        { attribute: 'projectileAcceleration', op: 'multiply', value: 1.04, source: '' },
    ],
    baseDurability: 100,
    tags: [GameTags.ITEM_WEAPON, GameTags.WEAPON_STAFF, GameTags.MATERIAL_WOOD],
    balance: { role: ItemBalanceRole.WEAPON, attackType: 'magic', recommendedJobIds: ['career:mage'] },
});

defineItem({
    id: 'windsteel_sword',
    name: '풍뢰강 검',
    description: '폭풍 절벽의 전도성 금속으로 벼린 검. 공격과 발놀림을 함께 끌어올린다.',
    // TODO(icons): 전용 아이콘 제작 전까지 낡은 검 아이콘을 사용한다.
    image: 'items/old_sword',
    category: '장검',
    weight: 3.6,
    stackable: false,
    maxStack: 1,
    baseMetadata: null,
    onUse: null,
    equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'atk', op: 'add', value: 24, source: '' },
        { attribute: 'speed', op: 'multiply', value: 1.05, source: '' },
    ],
    baseDurability: 220,
    tags: [GameTags.ITEM_WEAPON, GameTags.WEAPON_SWORD, GameTags.PROPERTY_ELECTRIC, GameTags.PROPERTY_METAL],
    balance: { role: ItemBalanceRole.WEAPON, attackType: 'physical', recommendedJobIds: ['career:warrior'] },
});

defineItem({
    id: 'stormstring_bow',
    name: '뇌운 시위',
    description: '팽팽한 전도성 시위가 화살의 속도와 치명적인 궤적을 높여 투사체 가속이 18% 증가하는 장궁.',
    // TODO(icons): 전용 아이콘 제작 전까지 가벼운 활 아이콘을 사용한다.
    image: 'items/light_bow',
    category: '활',
    weight: 2.3,
    stackable: false,
    maxStack: 1,
    baseMetadata: {
        basicAttackOverride: ItemAttackOverrideKeys.PROJECTILE,
        projectileAttack: { ammunitionItemId: 'wooden_arrow' },
    },
    onUse: null,
    equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'atk', op: 'add', value: 19, source: '' },
        { attribute: 'critRate', op: 'add', value: 0.04, source: '' },
        { attribute: 'projectileAcceleration', op: 'multiply', value: 1.18, source: '' },
    ],
    baseDurability: 210,
    tags: [GameTags.ITEM_WEAPON, GameTags.WEAPON_BOW, GameTags.PROPERTY_ELECTRIC, GameTags.PROPERTY_METAL],
    balance: { role: ItemBalanceRole.WEAPON, attackType: 'physical', recommendedJobIds: ['career:archer'] },
});

defineItem({
    id: 'nightglass_dagger',
    name: '밤유리 단검',
    description: '빛을 삼키는 유리질 칼날. 적중 시 25% 확률로 8초간 부패를 남긴다.',
    // TODO(icons): 전용 아이콘 제작 전까지 독 단검 아이콘을 사용한다.
    image: 'items/venom_dagger',
    category: '단검',
    weight: 1.4,
    stackable: false,
    maxStack: 1,
    baseMetadata: null,
    onUse: null,
    equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'atk', op: 'add', value: 21, source: '' },
        { attribute: 'armorPen', op: 'add', value: 7, source: '' },
    ],
    baseDurability: 180,
    tags: [GameTags.ITEM_WEAPON, GameTags.WEAPON_DAGGER, GameTags.PROPERTY_DARK],
    onBasicAttackHit: ({ target }) => {
        const decay = StatusEffectType.fromKey('decay');
        if (decay && Math.random() < 0.25) target.applyStatusEffect(decay, 8, 3);
    },
    balance: {
        role: ItemBalanceRole.WEAPON,
        attackType: 'physical',
        recommendedJobIds: ['career:assassin'],
        notes: ['부패의 대상 비례 효과는 기본 DPS와 분리합니다.'],
    },
});

defineItem({
    id: 'starwood_staff',
    name: '성휘목 지팡이',
    description: '빛을 머금은 고목 심재로 만든 지팡이. 마법력과 정신력 순환, 투사체 가속을 12% 강화한다.',
    // TODO(icons): 전용 아이콘 제작 전까지 견습 지팡이 아이콘을 사용한다.
    image: 'items/apprentice_staff',
    category: '지팡이',
    weight: 2.6,
    stackable: false,
    maxStack: 1,
    baseMetadata: {
        basicAttackOverride: ItemAttackOverrideKeys.PROJECTILE,
        projectileAttack: { projectile: { dataId: 'basic_magic_orb', overrides: { tags: [GameTags.PROPERTY_LIGHT] } } },
    },
    onUse: null,
    equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'magicForce', op: 'add', value: 28, source: '' },
        { attribute: 'mentalityRegen', op: 'add', value: 2, source: '' },
        { attribute: 'projectileAcceleration', op: 'multiply', value: 1.12, source: '' },
    ],
    baseDurability: 230,
    tags: [GameTags.ITEM_WEAPON, GameTags.WEAPON_STAFF, GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_HOLY],
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

const refinedMinerals = [
    { id: 'refined_iron', name: '제련된 철', source: 'iron_ore', tag: GameTags.MATERIAL_IRON },
    { id: 'refined_gold', name: '제련된 금', source: 'gold_ore', tag: GameTags.MATERIAL_GOLD },
    { id: 'refined_ruby', name: '제련된 루비', source: 'ruby', tag: GameTags.MATERIAL_RUBY },
    { id: 'refined_emerald', name: '제련된 에메랄드', source: 'emerald', tag: GameTags.MATERIAL_EMERALD },
    { id: 'refined_diamond', name: '제련된 다이아몬드', source: 'diamond', tag: GameTags.MATERIAL_DIAMOND },
] as const;

for (const material of refinedMinerals) defineItem({
    id: material.id,
    name: material.name,
    description: '마력 제련으로 불순물을 걷어내 단조할 수 있게 만든 소재.',
    // TODO(icons): 전용 제련 소재 아이콘 제작 전까지 원광 아이콘을 사용한다.
    image: `items/${material.source}`,
    category: '제련 소재',
    weight: 0.55,
    stackable: true,
    maxStack: 99,
    baseMetadata: null,
    onUse: null,
    equipSlot: null,
    modifiers: null,
    baseDurability: null,
    tags: [material.tag, GameTags.MATERIAL_REFINED],
});

const forgedTemplates = [
    { id: 'forged_sword', name: '단조 장검', image: 'items/old_sword', category: '장검', weight: 3.4, slot: 'mainHand', tag: GameTags.WEAPON_SWORD },
    { id: 'forged_axe', name: '단조 도끼', image: 'items/training_axe', category: '도끼', weight: 3.8, slot: 'mainHand', tag: GameTags.WEAPON_AXE },
    { id: 'forged_dagger', name: '단조 단검', image: 'items/venom_dagger', category: '단검', weight: 1.7, slot: 'mainHand', tag: GameTags.WEAPON_DAGGER },
    { id: 'forged_shield', name: '단조 방패', image: 'items/old_shield', category: '방패', weight: 3.2, slot: 'offHand', tag: null },
    { id: 'forged_pickaxe', name: '단조 곡괭이', image: 'items/iron_pickaxe', category: '곡괭이', weight: 3.5, slot: 'mainHand', tag: null },
] as const;

for (const template of forgedTemplates) defineItem({
    id: template.id,
    name: template.name,
    description: '재료와 단조 결과에 따라 이름과 능력치가 정해지는 제작 장비.',
    // TODO(icons): 전용 조합형 장비 아이콘 제작 전까지 같은 형태의 아이콘을 사용한다.
    image: template.image,
    category: template.category,
    weight: template.weight,
    stackable: false,
    maxStack: 1,
    baseMetadata: null,
    onUse: null,
    equipSlot: template.slot,
    modifiers: null,
    baseDurability: 100,
    tags: [
        template.id === 'forged_shield' ? GameTags.ITEM_ARMOR : template.id === 'forged_pickaxe' ? GameTags.ITEM_TOOL : GameTags.ITEM_WEAPON,
        GameTags.ITEM_FORGED,
        ...(template.tag ? [template.tag] : []),
        ...(template.id === 'forged_pickaxe' ? [GameTags.TOOL_MINING] : []),
    ],
    balance: template.id === 'forged_shield'
        ? { role: ItemBalanceRole.DEFENSE }
        : { role: ItemBalanceRole.WEAPON, attackType: 'physical' },
});

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
