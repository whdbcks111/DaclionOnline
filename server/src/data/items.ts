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
    image: 'items/battle_tonic',
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
    image: 'items/arcane_tonic',
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
    image: 'items/swift_tonic',
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
    image: 'items/echo_hourglass',
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
    image: 'items/twisted_labyrinth_compass',
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
    image: 'items/resonance_evasion_shard',
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
    id: 'silverweb_hunter_bow',
    name: '은빛그물 사냥활',
    description: '숨을 줄인 시위와 가벼운 나무 탄성으로 명중점을 빠르게 잡는 사냥활. 투사체 가속이 8% 증가한다.',
    // TODO: 은빛그물 사냥활 전용 아트 제작 전까지 활 카테고리 fallback을 사용한다.
    image: 'items/light_bow',
    category: '활',
    weight: 2,
    stackable: false,
    maxStack: 1,
    baseMetadata: {
        basicAttackOverride: ItemAttackOverrideKeys.PROJECTILE,
        projectileAttack: { ammunitionItemId: 'wooden_arrow' },
    },
    onUse: null,
    equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'atk', op: 'add', value: 6, source: '' },
        { attribute: 'critRate', op: 'add', value: 0.02, source: '' },
        { attribute: 'projectileAcceleration', op: 'multiply', value: 1.08, source: '' },
    ],
    baseDurability: 120,
    tags: [GameTags.ITEM_WEAPON, GameTags.WEAPON_BOW, GameTags.MATERIAL_WOOD, GameTags.PROPERTY_NATURAL],
    balance: {
        role: ItemBalanceRole.WEAPON,
        attackType: 'physical',
        recommendedJobIds: ['career:archer'],
        notes: ['은빛그물 숲 Lv.10~20 구간의 사냥꾼 성장 장비입니다.'],
    },
});

defineItem({
    id: 'forest_antidote',
    name: '은이파리 해독제',
    description: '독·맹독·마비독을 제거하고 30초 동안 새 중독을 막는 숲의 해독제.',
    // TODO: 해독제 전용 아트 제작 전까지 포션 카테고리 fallback을 사용한다.
    image: 'items/health_potion',
    category: '소모품',
    weight: 0.25,
    stackable: true,
    maxStack: 20,
    baseMetadata: { [ItemMetadataKeys.STATUS_EFFECT]: { id: 'detoxification', level: 1, duration: 30 } },
    onUse: 'apply_status_effect',
    equipSlot: null,
    modifiers: null,
    baseDurability: null,
    tags: [GameTags.ITEM_CONSUMABLE, GameTags.PROPERTY_NATURAL],
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
    image: 'items/windsteel_sword',
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
    image: 'items/stormstring_bow',
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
    image: 'items/nightglass_dagger',
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
    image: 'items/starwood_staff',
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

// TODO(icons): 보스 전승서 전용 아이콘 제작 전까지 기존 스킬북 카테고리 아이콘을 재사용한다.
for (const book of [
    {
        id: 'predator_pounce_skillbook',
        name: '포식자의 도약 스킬북',
        description: '적갈기 늑대왕의 사냥 감각이 각인된 전승서. 사용하면 스킬 [ 포식자의 도약 ] 을 획득합니다.',
        skillDataId: 'predator_pounce',
        propertyTag: GameTags.PROPERTY_NATURAL,
    },
    {
        id: 'silverweb_snare_skillbook',
        name: '은실 사냥망 스킬북',
        description: '은빛그물 거미여왕의 포박술이 기록된 전승서. 사용하면 스킬 [ 은실 사냥망 ] 을 획득합니다.',
        skillDataId: 'silverweb_snare',
        propertyTag: GameTags.PROPERTY_INSECT,
    },
] as const) defineItem({
    id: book.id,
    name: book.name,
    description: book.description,
    image: 'items/seismic_crush_skillbook',
    category: '스킬북',
    weight: 0.3,
    stackable: true,
    maxStack: 10,
    baseMetadata: { skillDataId: book.skillDataId },
    onUse: 'learn_skill',
    equipSlot: null,
    modifiers: null,
    baseDurability: null,
    tags: [GameTags.ITEM_CONSUMABLE, GameTags.ITEM_SKILL_BOOK, book.propertyTag],
});

const mineralItems = [
    { id: 'stone', name: '돌', description: '가장 흔한 광물 자원.', weight: 0.8, tag: GameTags.MATERIAL_STONE },
    { id: 'coal', name: '석탄', description: '연료로 사용할 수 있는 검은 광물.', weight: 0.5, tag: GameTags.MATERIAL_COAL },
    { id: 'iron_ore', name: '철', description: '도구와 장비 제작에 쓰이는 철 광석.', weight: 0.7, tag: GameTags.MATERIAL_IRON },
    { id: 'gold_ore', name: '금', description: '희소하고 가치 있는 금 광석.', weight: 0.6, tag: GameTags.MATERIAL_GOLD },
    { id: 'ruby', name: '루비', description: '붉게 빛나는 희귀 보석.', weight: 0.2, tag: GameTags.MATERIAL_RUBY },
    { id: 'emerald', name: '에메랄드', description: '초록빛을 띠는 희귀 보석.', weight: 0.2, tag: GameTags.MATERIAL_EMERALD },
    { id: 'diamond', name: '다이아몬드', description: '극히 희귀하고 단단한 보석.', weight: 0.2, tag: GameTags.MATERIAL_DIAMOND },
    { id: 'enhancement_stone', name: '지핵 강화석', description: '철근미궁 지핵 수정실의 강화 수정맥에서만 얻는 무기 강화 재료.', weight: 0.25, tag: GameTags.MATERIAL_ENHANCEMENT_STONE },
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

for (const material of [
    {
        id: 'wolf_pelt', name: '적갈색 늑대 가죽',
        description: '은빛그물 숲의 늑대에게서 얻는 질긴 가죽.',
        image: 'items/earthworm_bait', tags: [GameTags.PROPERTY_NATURAL], weight: 0.7,
    },
    {
        id: 'silverweb_silk', name: '은빛 거미실',
        description: '빛을 받으면 은빛으로 반사하는 강인한 숲거미의 실.',
        image: 'items/earthworm_bait', tags: [GameTags.PROPERTY_INSECT], weight: 0.15,
    },
    {
        id: 'venom_gland', name: '자빛 독샘',
        description: '독그물을 짜내는 데 쓰는 농축된 거미 독샘.',
        image: 'items/mana_potion', tags: [GameTags.PROPERTY_POISON, GameTags.PROPERTY_INSECT], weight: 0.2,
    },
] as const) defineItem({
    id: material.id,
    name: material.name,
    description: material.description,
    // TODO: 숲 전용 소재 아트 제작 전까지 유기물/포션 카테고리 fallback을 사용한다.
    image: material.image,
    category: '몬스터 소재',
    weight: material.weight,
    stackable: true,
    maxStack: 99,
    baseMetadata: null,
    onUse: null,
    equipSlot: null,
    modifiers: null,
    baseDurability: null,
    tags: [...material.tags],
});

// TODO(icons): 황혼왕릉 소재·장비 전용 아트 제작 전까지 의미가 가까운 기존 카테고리 아이콘을 재사용한다.
for (const material of [
    {
        id: 'weathered_bone', name: '풍화된 뼛조각', image: 'items/stone', weight: 0.25,
        description: '황혼왕릉의 망자에게서 떨어진 단단한 뼛조각.',
        tags: [GameTags.PROPERTY_UNDEAD],
    },
    {
        id: 'gravecloth', name: '묘지기 천', image: 'items/earthworm_bait', weight: 0.15,
        description: '오래된 의복에서 풀어낸 질긴 검푸른 천.',
        tags: [GameTags.PROPERTY_DARK],
    },
    {
        id: 'broken_oath_badge', name: '깨진 맹세 휘장', image: 'items/gold_ore', weight: 0.2,
        description: '왕릉 기사단의 맹세가 반쪽만 남은 금속 휘장.',
        tags: [GameTags.PROPERTY_UNDEAD, GameTags.PROPERTY_METAL],
    },
    {
        id: 'mourning_lily', name: '애도의 백합', image: 'items/earthworm_bait', weight: 0.1,
        description: '죽은 자의 마력이 짙은 곳에서만 피어나는 창백한 꽃.',
        tags: [GameTags.PROPERTY_DARK, GameTags.PROPERTY_NATURAL],
    },
    {
        id: 'soul_ember', name: '혼불 조각', image: 'items/mana_potion', weight: 0.12,
        description: '꺼지지 않은 망자의 의지가 차갑게 응축된 마력 조각.',
        tags: [GameTags.PROPERTY_UNDEAD, GameTags.PROPERTY_DARK],
    },
] as const) defineItem({
    id: material.id,
    name: material.name,
    description: material.description,
    image: material.image,
    category: '몬스터 소재',
    weight: material.weight,
    stackable: true,
    maxStack: 99,
    baseMetadata: null,
    onUse: null,
    equipSlot: null,
    modifiers: null,
    baseDurability: null,
    tags: [...material.tags],
});

defineItem({
    id: 'graveward_tonic',
    name: '묘지기 향약',
    description: '왕릉의 혼불을 가라앉혀 45초 동안 독·출혈·부패의 지속시간을 빠르게 줄이는 향약.',
    image: 'items/health_potion',
    category: '소모품',
    weight: 0.25,
    stackable: true,
    maxStack: 20,
    baseMetadata: { [ItemMetadataKeys.STATUS_EFFECT]: { id: 'preservation', level: 2, duration: 45 } },
    onUse: 'apply_status_effect',
    equipSlot: null,
    modifiers: null,
    baseDurability: null,
    tags: [GameTags.ITEM_CONSUMABLE, GameTags.PROPERTY_HOLY],
});

defineItem({
    id: 'oathiron_sword',
    name: '맹세철 장검',
    description: '깨진 기사 휘장을 다시 접어 벼린 장검. 정면의 갑주를 파고드는 데 알맞다.',
    image: 'items/old_sword',
    category: '장검',
    weight: 3.5,
    stackable: false,
    maxStack: 1,
    baseMetadata: null,
    onUse: null,
    equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'atk', op: 'add', value: 16, source: '' },
        { attribute: 'armorPen', op: 'add', value: 6, source: '' },
    ],
    baseDurability: 175,
    tags: [GameTags.ITEM_WEAPON, GameTags.WEAPON_SWORD, GameTags.PROPERTY_METAL],
    balance: { role: ItemBalanceRole.WEAPON, attackType: 'physical', recommendedJobIds: ['career:warrior'] },
});

defineItem({
    id: 'requiem_bow',
    name: '진혼 시위',
    description: '묘지기 천으로 감아 소리를 죽인 장궁. 화살의 비행 속도와 급소 포착을 함께 높인다.',
    image: 'items/light_bow',
    category: '활',
    weight: 2.15,
    stackable: false,
    maxStack: 1,
    baseMetadata: {
        basicAttackOverride: ItemAttackOverrideKeys.PROJECTILE,
        projectileAttack: { ammunitionItemId: 'wooden_arrow' },
    },
    onUse: null,
    equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'atk', op: 'add', value: 13, source: '' },
        { attribute: 'critRate', op: 'add', value: 0.025, source: '' },
        { attribute: 'projectileAcceleration', op: 'multiply', value: 1.13, source: '' },
    ],
    baseDurability: 165,
    tags: [GameTags.ITEM_WEAPON, GameTags.WEAPON_BOW, GameTags.PROPERTY_DARK],
    balance: { role: ItemBalanceRole.WEAPON, attackType: 'physical', recommendedJobIds: ['career:archer'] },
});

defineItem({
    id: 'mourning_staff',
    name: '애도목 지팡이',
    description: '애도의 백합과 혼불을 매달아 망자의 마력을 멀리 쏘아 보내는 지팡이.',
    image: 'items/apprentice_staff',
    category: '지팡이',
    weight: 2.45,
    stackable: false,
    maxStack: 1,
    baseMetadata: {
        basicAttackOverride: ItemAttackOverrideKeys.PROJECTILE,
        projectileAttack: {
            projectile: { dataId: 'basic_magic_orb', overrides: { tags: [GameTags.PROPERTY_DARK] } },
        },
    },
    onUse: null,
    equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'magicForce', op: 'add', value: 18, source: '' },
        { attribute: 'mentalityRegen', op: 'add', value: 1, source: '' },
        { attribute: 'projectileAcceleration', op: 'multiply', value: 1.1, source: '' },
    ],
    baseDurability: 170,
    tags: [GameTags.ITEM_WEAPON, GameTags.WEAPON_STAFF, GameTags.PROPERTY_DARK, GameTags.PROPERTY_UNDEAD],
    balance: { role: ItemBalanceRole.WEAPON, attackType: 'magic', recommendedJobIds: ['career:mage'] },
});

defineItem({
    id: 'gravekeeper_shield',
    name: '묘문 수호방패',
    description: '왕릉 봉인문을 떼어 다시 다듬은 방패. 물리 충격과 망자의 마력을 함께 막는다.',
    image: 'items/old_shield',
    category: '방패',
    weight: 3.4,
    stackable: false,
    maxStack: 1,
    baseMetadata: null,
    onUse: null,
    equipSlot: 'offHand',
    modifiers: [
        { attribute: 'def', op: 'add', value: 8, source: '' },
        { attribute: 'magicDef', op: 'add', value: 8, source: '' },
        { attribute: 'maxLife', op: 'add', value: 80, source: '' },
    ],
    baseDurability: 210,
    tags: [GameTags.ITEM_ARMOR, GameTags.PROPERTY_METAL, GameTags.PROPERTY_HOLY],
    balance: { role: ItemBalanceRole.DEFENSE, recommendedJobIds: ['career:warrior', 'career:blacksmith'] },
});

// TODO(icons): 유리모래 사막 전용 아트 제작 전까지 존재하는 광물·보석 카테고리 아이콘을 재사용한다.
for (const material of [
    {
        id: 'glass_sand', name: '유리모래', image: 'items/stone', weight: 0.35,
        description: '낮의 열기에 녹았다 밤의 냉기에 깨진 사막의 유리 알갱이.',
        tags: [GameTags.MATERIAL_GLASS, GameTags.PROPERTY_STONE],
    },
    {
        id: 'sunscarab_shell', name: '황금갑 성충갑', image: 'items/gold_ore', weight: 0.55,
        description: '태양빛을 반사하는 두꺼운 성충 등껑질. 방어구와 활장식에 쓴다.',
        tags: [GameTags.PROPERTY_INSECT, GameTags.PROPERTY_LIGHT],
    },
    {
        id: 'dune_scorpion_venom', name: '모래전갈 독수', image: 'items/ruby', weight: 0.25,
        description: '모래 전갈이 충격에 맞춰 결정화한 독. 맹독 조합과 단검 제작에 쓴다.',
        tags: [GameTags.PROPERTY_POISON],
    },
    {
        id: 'mirage_crystal', name: '신기루 수정', image: 'items/diamond', weight: 0.4,
        description: '사막의 빛과 그림자를 함께 굴절시키는 투명한 수정.',
        tags: [GameTags.MATERIAL_GLASS, GameTags.MATERIAL_DIAMOND, GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_DARK],
    },
    {
        id: 'sun_glyph_fragment', name: '태양 문양 파편', image: 'items/refined_gold', weight: 0.45,
        description: '태양의 고 내부에서 떼어낸 금속 파편. 뜨거운 마력이 흐른다.',
        tags: [GameTags.MATERIAL_GOLD, GameTags.PROPERTY_FIRE, GameTags.PROPERTY_LIGHT],
    },
] as const) defineItem({
    id: material.id,
    name: material.name,
    description: material.description,
    image: material.image,
    category: '사막 소재',
    weight: material.weight,
    stackable: true,
    maxStack: 99,
    baseMetadata: null,
    onUse: null,
    equipSlot: null,
    modifiers: null,
    baseDurability: null,
    tags: [...material.tags],
});

defineItem({
    id: 'oasis_date',
    name: '오아시스 대추야자',
    description: '대상단이 머나먼 사막길을 건널 때 챙기는 달콤한 열매. 배고픔을 45 회복한다.',
    image: 'items/traveler_bread',
    category: '음식',
    weight: 0.2,
    stackable: true,
    maxStack: 30,
    baseMetadata: { hunger: 45, thirst: 5, time: 1, useMessage: '대추야자를 먹는 중...' },
    onUse: 'restore_survival',
    equipSlot: null,
    modifiers: null,
    baseDurability: null,
    tags: [GameTags.ITEM_CONSUMABLE, GameTags.PROPERTY_NATURAL],
});

defineItem({
    id: 'shade_canteen',
    name: '그늘 수통',
    description: '기화 열을 낮추는 유리모래 안감을 대어 두어 시원한 물. 수분을 70 회복한다.',
    image: 'items/fresh_water',
    category: '음료',
    weight: 0.65,
    stackable: true,
    maxStack: 20,
    baseMetadata: { hunger: 0, thirst: 70, time: 1, useMessage: '그늘 수통의 물을 마시는 중...' },
    onUse: 'restore_survival',
    equipSlot: null,
    modifiers: null,
    baseDurability: null,
    tags: [GameTags.ITEM_CONSUMABLE, GameTags.PROPERTY_WATER],
});

// TODO(icons): 사막 장비는 전용 아트 전까지 같은 무기 종류의 기존 아이콘을 폴백으로 사용한다.
defineItem({
    id: 'dunebreaker_sword',
    name: '모래맥 파검',
    description: '유리모래를 겹겹이 접어 만든 넓은 장검. 단단한 갑주와 모래바위를 같이 가른다.',
    image: 'items/windsteel_sword', category: '장검', weight: 3.7, stackable: false, maxStack: 1,
    baseMetadata: null, onUse: null, equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'atk', op: 'add', value: 70, source: '' },
        { attribute: 'armorPen', op: 'add', value: 14, source: '' },
    ],
    baseDurability: 290,
    tags: [GameTags.ITEM_WEAPON, GameTags.WEAPON_SWORD, GameTags.MATERIAL_GLASS, GameTags.PROPERTY_EARTH],
    onBasicAttackHit: ({ target }) => {
        const fever = StatusEffectType.fromKey('sun_fever');
        if (fever && Math.random() < 0.16) target.applyStatusEffect(fever, 7, 3);
    },
    balance: { role: ItemBalanceRole.WEAPON, attackType: 'physical', recommendedJobIds: ['career:warrior'] },
});

defineItem({
    id: 'sunwire_bow',
    name: '태양사 장궁',
    description: '황금갑 섬유를 꼬아 화살의 비행을 안정시킨 장궁. 투사체 가속이 25% 증가한다.',
    image: 'items/stormstring_bow', category: '활', weight: 2.45, stackable: false, maxStack: 1,
    baseMetadata: {
        basicAttackOverride: ItemAttackOverrideKeys.PROJECTILE,
        projectileAttack: { ammunitionItemId: 'wooden_arrow' },
    },
    onUse: null, equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'atk', op: 'add', value: 58, source: '' },
        { attribute: 'critRate', op: 'add', value: 0.06, source: '' },
        { attribute: 'projectileAcceleration', op: 'multiply', value: 1.25, source: '' },
    ],
    baseDurability: 275,
    tags: [GameTags.ITEM_WEAPON, GameTags.WEAPON_BOW, GameTags.PROPERTY_LIGHT],
    balance: { role: ItemBalanceRole.WEAPON, attackType: 'physical', recommendedJobIds: ['career:archer'] },
});

defineItem({
    id: 'mirage_fang_dagger',
    name: '신기루 독아',
    description: '빛을 굴절시켜 칼날의 끝을 숨기는 독단검. 적중 시 22% 확률로 8초간 쇠약의 저주를 남긴다.',
    image: 'items/nightglass_dagger', category: '단검', weight: 1.45, stackable: false, maxStack: 1,
    baseMetadata: null, onUse: null, equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'atk', op: 'add', value: 62, source: '' },
        { attribute: 'armorPen', op: 'add', value: 18, source: '' },
        { attribute: 'critDmg', op: 'add', value: 0.12, source: '' },
    ],
    baseDurability: 245,
    tags: [GameTags.ITEM_WEAPON, GameTags.WEAPON_DAGGER, GameTags.PROPERTY_POISON, GameTags.PROPERTY_DARK],
    onBasicAttackHit: ({ target }) => {
        const curse = StatusEffectType.fromKey('curse');
        if (curse && Math.random() < 0.22) target.applyStatusEffect(curse, 8, 4);
    },
    balance: {
        role: ItemBalanceRole.WEAPON, attackType: 'physical', recommendedJobIds: ['career:assassin'],
        notes: ['쇠약의 저주 효과는 기본 DPS와 분리해 평가합니다.'],
    },
});

defineItem({
    id: 'helioglass_staff',
    name: '태양유리 지팡이',
    description: '태양의 고에서 회수한 굴절경으로 마력을 압축하는 지팡이.',
    image: 'items/starwood_staff', category: '지팡이', weight: 2.7, stackable: false, maxStack: 1,
    baseMetadata: {
        basicAttackOverride: ItemAttackOverrideKeys.PROJECTILE,
        projectileAttack: {
            projectile: { dataId: 'basic_magic_orb', overrides: { tags: [GameTags.PROPERTY_FIRE, GameTags.PROPERTY_LIGHT] } },
        },
    },
    onUse: null, equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'magicForce', op: 'add', value: 76, source: '' },
        { attribute: 'mentalityRegen', op: 'add', value: 4, source: '' },
        { attribute: 'magicPen', op: 'add', value: 12, source: '' },
        { attribute: 'projectileAcceleration', op: 'multiply', value: 1.22, source: '' },
    ],
    baseDurability: 285,
    tags: [GameTags.ITEM_WEAPON, GameTags.WEAPON_STAFF, GameTags.MATERIAL_GLASS, GameTags.PROPERTY_FIRE, GameTags.PROPERTY_LIGHT],
    balance: { role: ItemBalanceRole.WEAPON, attackType: 'magic', recommendedJobIds: ['career:mage'] },
});

defineItem({
    id: 'sunmirror_shield',
    name: '태양거울 방패',
    description: '태양의 고를 지키던 거울 기둥을 작게 다듬은 방패. 물리 충격과 마법 열기를 고르게 흘린다.',
    image: 'items/forged_shield', category: '방패', weight: 3.6, stackable: false, maxStack: 1,
    baseMetadata: null, onUse: null, equipSlot: 'offHand',
    modifiers: [
        { attribute: 'def', op: 'add', value: 22, source: '' },
        { attribute: 'magicDef', op: 'add', value: 24, source: '' },
        { attribute: 'maxLife', op: 'add', value: 280, source: '' },
    ],
    baseDurability: 330,
    tags: [GameTags.ITEM_ARMOR, GameTags.MATERIAL_GLASS, GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_STONE],
    balance: { role: ItemBalanceRole.DEFENSE, recommendedJobIds: ['career:warrior', 'career:blacksmith'] },
});

// TODO(icons): 서리잔향 설원·빙경궁 전용 소재/장비 아트 제작 전까지 같은 카테고리의 기존 아이콘을 사용한다.
for (const material of [
    {
        id: 'rime_crystal', name: '상고 수정', image: 'items/diamond', weight: 0.35,
        description: '설원 바위의 틈에서 자라난 푸른 수정. 냉기를 오래 붙잡는다.',
        tags: [GameTags.MATERIAL_RIME, GameTags.MATERIAL_DIAMOND, GameTags.PROPERTY_ICE],
    },
    {
        id: 'frostwolf_hide', name: '서리늑대 가죽', image: 'items/earthworm_bait', weight: 0.8,
        description: '상고바람을 견딘 늑대의 두꺼운 가죽. 가볍지만 냉기를 잘 막는다.',
        tags: [GameTags.MATERIAL_RIME, GameTags.PROPERTY_NATURAL],
    },
    {
        id: 'ice_silk', name: '빙실 거미줄', image: 'items/earthworm_bait', weight: 0.18,
        description: '서리가 맺혀도 끊어지지 않는 거미줄. 활시위와 마법 직조에 쓴다.',
        tags: [GameTags.MATERIAL_RIME, GameTags.PROPERTY_ICE, GameTags.PROPERTY_INSECT],
    },
    {
        id: 'mirrorsteel_fragment', name: '경철 파편', image: 'items/iron_ore', weight: 0.55,
        description: '빙경궁의 수호병에게서 떨어진 거울빛 금속 조각.',
        tags: [GameTags.MATERIAL_RIME, GameTags.PROPERTY_METAL, GameTags.PROPERTY_ICE],
    },
    {
        id: 'aurora_shard', name: '극광 파편', image: 'items/mana_potion', weight: 0.16,
        description: '밤하늘의 빛이 차갑게 굳어 생긴 마력 결정.',
        tags: [GameTags.MATERIAL_RIME, GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_ICE],
    },
    {
        id: 'frozen_core', name: '빙결 핵', image: 'items/diamond', weight: 0.7,
        description: '빙하 수호체의 움직임을 유지하던 고밀도 냉기 핵.',
        tags: [GameTags.MATERIAL_RIME, GameTags.PROPERTY_ICE, GameTags.PROPERTY_STONE],
    },
    {
        id: 'snowmoss', name: '눈솔이끼', image: 'items/earthworm_bait', weight: 0.08,
        description: '눈 아래에서도 푸른빛을 잃지 않는 약용 이끼.',
        tags: [GameTags.MATERIAL_RIME, GameTags.PROPERTY_NATURAL, GameTags.PROPERTY_ICE],
    },
] as const) defineItem({
    id: material.id,
    name: material.name,
    description: material.description,
    image: material.image,
    category: '설원 소재',
    weight: material.weight,
    stackable: true,
    maxStack: 99,
    baseMetadata: null,
    onUse: null,
    equipSlot: null,
    modifiers: null,
    baseDurability: null,
    tags: [...material.tags],
});

defineItem({
    id: 'winter_trail_ration',
    name: '설원 행군식',
    description: '눈솔이끼와 말린 고기를 눌러 만든 따뜻한 행군식. 배고픔 65와 수분 15를 회복한다.',
    image: 'items/traveler_bread', category: '음식', weight: 0.4, stackable: true, maxStack: 30,
    baseMetadata: { hunger: 65, thirst: 15, time: 1.2, useMessage: '설원 행군식을 데워 먹는 중...' },
    onUse: 'restore_survival', equipSlot: null, modifiers: null, baseDurability: null,
    tags: [GameTags.ITEM_CONSUMABLE, GameTags.PROPERTY_NATURAL],
});

defineItem({
    id: 'frostward_tonic',
    name: '상고막이 영약',
    description: '눈솔이끼와 상고 수정을 달여 60초 동안 빙결 지속시간을 빠르게 줄이는 영약.',
    image: 'items/health_potion', category: '소모품', weight: 0.25, stackable: true, maxStack: 20,
    baseMetadata: { [ItemMetadataKeys.STATUS_EFFECT]: { id: 'frozen_resistance', level: 5, duration: 60 } },
    onUse: 'apply_status_effect', equipSlot: null, modifiers: null, baseDurability: null,
    tags: [GameTags.ITEM_CONSUMABLE, GameTags.MATERIAL_RIME, GameTags.PROPERTY_ICE],
});

defineItem({
    id: 'aurora_recovery_draught',
    name: '극광 회복약',
    description: '극광 파편의 흐름을 안정시켜 35초 동안 생명력 재생을 크게 높이는 회복약.',
    image: 'items/mana_potion', category: '소모품', weight: 0.25, stackable: true, maxStack: 20,
    baseMetadata: { [ItemMetadataKeys.STATUS_EFFECT]: { id: 'regeneration', level: 8, duration: 35 } },
    onUse: 'apply_status_effect', equipSlot: null, modifiers: null, baseDurability: null,
    tags: [GameTags.ITEM_CONSUMABLE, GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_ICE],
});

defineItem({
    id: 'rimecleaver_sword',
    name: '빙맥 절단검',
    description: '경철 사이에 상고 수정을 접어 넣은 장검. 두꺼운 갑주를 가르고 냉기를 남긴다.',
    image: 'items/windsteel_sword', category: '장검', weight: 3.8, stackable: false, maxStack: 1,
    baseMetadata: null, onUse: null, equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'atk', op: 'add', value: 108, source: '' },
        { attribute: 'armorPen', op: 'add', value: 22, source: '' },
    ],
    baseDurability: 360,
    tags: [GameTags.ITEM_WEAPON, GameTags.WEAPON_SWORD, GameTags.MATERIAL_RIME, GameTags.PROPERTY_ICE, GameTags.PROPERTY_METAL],
    onBasicAttackHit: ({ target }) => {
        const slowness = StatusEffectType.fromKey('slowness');
        if (slowness && Math.random() < 0.18) target.applyStatusEffect(slowness, 6, 5);
    },
    balance: { role: ItemBalanceRole.WEAPON, attackType: 'physical', recommendedJobIds: ['career:warrior'] },
});

defineItem({
    id: 'icesilk_longbow',
    name: '빙실 연궁',
    description: '빙실 거미줄을 여러 겹 꼬아 만든 장궁. 화살을 빠르게 밀어내며 급소를 안정적으로 노린다.',
    image: 'items/stormstring_bow', category: '활', weight: 2.5, stackable: false, maxStack: 1,
    baseMetadata: {
        basicAttackOverride: ItemAttackOverrideKeys.PROJECTILE,
        projectileAttack: { ammunitionItemId: 'wooden_arrow' },
    },
    onUse: null, equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'atk', op: 'add', value: 80, source: '' },
        { attribute: 'critRate', op: 'add', value: 0.06, source: '' },
        { attribute: 'projectileAcceleration', op: 'multiply', value: 1.28, source: '' },
    ],
    baseDurability: 340,
    tags: [GameTags.ITEM_WEAPON, GameTags.WEAPON_BOW, GameTags.MATERIAL_RIME, GameTags.PROPERTY_ICE],
    balance: { role: ItemBalanceRole.WEAPON, attackType: 'physical', recommendedJobIds: ['career:archer'] },
});

defineItem({
    id: 'mirrorfang_dagger',
    name: '경빙 송곳니',
    description: '거울처럼 적의 움직임을 비추는 경철 단검. 방어 틈을 파고들어 빙결을 쌓는다.',
    image: 'items/nightglass_dagger', category: '단검', weight: 1.5, stackable: false, maxStack: 1,
    baseMetadata: null, onUse: null, equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'atk', op: 'add', value: 96, source: '' },
        { attribute: 'armorPen', op: 'add', value: 27, source: '' },
        { attribute: 'critDmg', op: 'add', value: 0.16, source: '' },
    ],
    baseDurability: 315,
    tags: [GameTags.ITEM_WEAPON, GameTags.WEAPON_DAGGER, GameTags.MATERIAL_RIME, GameTags.PROPERTY_ICE, GameTags.PROPERTY_METAL],
    onBasicAttackHit: ({ target }) => {
        const frozen = StatusEffectType.fromKey('frozen');
        if (frozen && Math.random() < 0.14) target.applyStatusEffect(frozen, 2.5, 4);
    },
    balance: {
        role: ItemBalanceRole.WEAPON, attackType: 'physical', recommendedJobIds: ['career:assassin'],
        notes: ['빙결 부가효과는 기본 DPS와 분리해 평가합니다.'],
    },
});

defineItem({
    id: 'auroraprism_staff',
    name: '극광분광 지팡이',
    description: '극광을 여러 갈래의 냉기 마력으로 분해해 쏘는 빙경궁 지팡이.',
    image: 'items/starwood_staff', category: '지팡이', weight: 2.8, stackable: false, maxStack: 1,
    baseMetadata: {
        basicAttackOverride: ItemAttackOverrideKeys.PROJECTILE,
        projectileAttack: {
            projectile: { dataId: 'basic_magic_orb', overrides: { tags: [GameTags.PROPERTY_ICE, GameTags.PROPERTY_LIGHT] } },
        },
    },
    onUse: null, equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'magicForce', op: 'add', value: 140, source: '' },
        { attribute: 'magicPen', op: 'add', value: 30, source: '' },
        { attribute: 'mentalityRegen', op: 'add', value: 6, source: '' },
        { attribute: 'projectileAcceleration', op: 'multiply', value: 1.28, source: '' },
    ],
    baseDurability: 365,
    tags: [GameTags.ITEM_WEAPON, GameTags.WEAPON_STAFF, GameTags.MATERIAL_RIME, GameTags.PROPERTY_ICE, GameTags.PROPERTY_LIGHT],
    balance: { role: ItemBalanceRole.WEAPON, attackType: 'magic', recommendedJobIds: ['career:mage'] },
});

defineItem({
    id: 'frostglass_bulwark',
    name: '빙경 성벽방패',
    description: '깨져도 다시 얼어붙는 경철판을 포갠 방패. 물리 충격과 마법 냉기를 함께 흘린다.',
    image: 'items/forged_shield', category: '방패', weight: 3.9, stackable: false, maxStack: 1,
    baseMetadata: null, onUse: null, equipSlot: 'offHand',
    modifiers: [
        { attribute: 'def', op: 'add', value: 34, source: '' },
        { attribute: 'magicDef', op: 'add', value: 38, source: '' },
        { attribute: 'maxLife', op: 'add', value: 430, source: '' },
    ],
    baseDurability: 430,
    tags: [GameTags.ITEM_ARMOR, GameTags.MATERIAL_RIME, GameTags.PROPERTY_ICE, GameTags.PROPERTY_METAL],
    balance: { role: ItemBalanceRole.DEFENSE, recommendedJobIds: ['career:warrior', 'career:blacksmith'] },
});

for (const book of [
    {
        id: 'hoarfrost_snare_skillbook', name: '상고 그물 전승서', skillDataId: 'hoarfrost_snare',
        description: '서리거미 여왕의 포박술이 기록된 전승서. 사용하면 스킬 [ 상고 그물 ] 을 획득합니다.',
    },
    {
        id: 'aurora_lance_skillbook', name: '극광 창 전승서', skillDataId: 'aurora_lance',
        description: '빙경 여왕의 분광 마법이 기록된 전승서. 사용하면 스킬 [ 극광 창 ] 을 획득합니다.',
    },
] as const) defineItem({
    id: book.id,
    name: book.name,
    description: book.description,
    image: 'items/seismic_crush_skillbook',
    category: '스킬북',
    weight: 0.3,
    stackable: true,
    maxStack: 10,
    baseMetadata: { skillDataId: book.skillDataId },
    onUse: 'learn_skill',
    equipSlot: null,
    modifiers: null,
    baseDurability: null,
    tags: [GameTags.ITEM_CONSUMABLE, GameTags.ITEM_SKILL_BOOK, GameTags.PROPERTY_ICE],
});

// TODO(icons): 안개파도 해안·침몰왕도 전용 아트 제작 전까지 광물/유기물/동일 무기 카테고리 아이콘을 사용한다.
for (const material of [
    {
        id: 'mist_salt', name: '해무 소금', image: 'items/stone', weight: 0.18,
        description: '안개파도 해안의 차가운 물보라가 바위에 남긴 푸른 소금.',
        tags: [GameTags.MATERIAL_CORAL, GameTags.PROPERTY_WATER],
    },
    {
        id: 'black_coral', name: '흑산호', image: 'items/coal', weight: 0.45,
        description: '빛이 닿지 않는 조류굴에서 자라 금속처럼 단단해진 검은 산호.',
        tags: [GameTags.MATERIAL_CORAL, GameTags.PROPERTY_WATER, GameTags.PROPERTY_STONE],
    },
    {
        id: 'siren_scale', name: '해무비늘', image: 'items/earthworm_bait', weight: 0.22,
        description: '노랫소리에 맞춰 빛을 굴절시키는 세이렌의 얇은 비늘.',
        tags: [GameTags.MATERIAL_CORAL, GameTags.PROPERTY_WATER, GameTags.PROPERTY_LIGHT],
    },
    {
        id: 'tide_pearl', name: '조류진주', image: 'items/diamond', weight: 0.2,
        description: '밀물과 썰물의 마력이 겹친 순간에만 굳어지는 푸른 진주.',
        tags: [GameTags.MATERIAL_CORAL, GameTags.PROPERTY_WATER, GameTags.PROPERTY_LIGHT],
    },
    {
        id: 'drowned_insignia', name: '침수 군단 휘장', image: 'items/gold_ore', weight: 0.24,
        description: '침몰왕도를 지키던 군단의 녹슨 휘장. 아직 명령 마력이 남아 있다.',
        tags: [GameTags.PROPERTY_UNDEAD, GameTags.PROPERTY_METAL, GameTags.PROPERTY_WATER],
    },
    {
        id: 'abyssal_iron', name: '심해철', image: 'items/iron_ore', weight: 0.72,
        description: '수압과 마력을 오랫동안 받아 검푸르게 변한 침몰왕도의 금속.',
        tags: [GameTags.MATERIAL_CORAL, GameTags.PROPERTY_METAL, GameTags.PROPERTY_WATER],
    },
    {
        id: 'kelp_resin', name: '청해초 수지', image: 'items/earthworm_bait', weight: 0.12,
        description: '바닷물에서도 접착력을 잃지 않는 청해초의 농축 수지.',
        tags: [GameTags.MATERIAL_CORAL, GameTags.PROPERTY_NATURAL, GameTags.PROPERTY_WATER],
    },
    {
        id: 'leviathan_bone', name: '해수룡 골편', image: 'items/stone', weight: 0.85,
        description: '거대한 해수룡의 뼈가 파도와 마력에 깎여 남은 단단한 골편.',
        tags: [GameTags.MATERIAL_CORAL, GameTags.PROPERTY_WATER, GameTags.PROPERTY_STONE],
    },
] as const) defineItem({
    id: material.id,
    name: material.name,
    description: material.description,
    image: material.image,
    category: '해안 소재',
    weight: material.weight,
    stackable: true,
    maxStack: 99,
    baseMetadata: null,
    onUse: null,
    equipSlot: null,
    modifiers: null,
    baseDurability: null,
    tags: [...material.tags],
});

defineItem({
    id: 'brine_trail_ration', name: '염풍 행군식',
    description: '해무 소금으로 간한 말린 생선과 빵. 배고픔 75와 수분 20을 회복한다.',
    image: 'items/traveler_bread', category: '음식', weight: 0.45, stackable: true, maxStack: 30,
    baseMetadata: { hunger: 75, thirst: 20, time: 1.2, useMessage: '염풍 행군식을 먹는 중...' },
    onUse: 'restore_survival', equipSlot: null, modifiers: null, baseDurability: null,
    tags: [GameTags.ITEM_CONSUMABLE, GameTags.PROPERTY_WATER, GameTags.PROPERTY_NATURAL],
});

defineItem({
    id: 'seafoam_tonic', name: '해포말 영약',
    description: '차가운 포말이 몸을 감싸 70초 동안 화염을 밀어내는 영약.',
    image: 'items/fresh_water', category: '소모품', weight: 0.3, stackable: true, maxStack: 20,
    baseMetadata: { [ItemMetadataKeys.STATUS_EFFECT]: { id: 'fire_resistance', level: 6, duration: 70 } },
    onUse: 'apply_status_effect', equipSlot: null, modifiers: null, baseDurability: null,
    tags: [GameTags.ITEM_CONSUMABLE, GameTags.PROPERTY_WATER],
});

defineItem({
    id: 'tideheart_draught', name: '조류심장 회복약',
    description: '조류진주의 박동을 안정시켜 40초 동안 강한 생명력 재생을 제공한다.',
    image: 'items/mana_potion', category: '소모품', weight: 0.3, stackable: true, maxStack: 20,
    baseMetadata: { [ItemMetadataKeys.STATUS_EFFECT]: { id: 'regeneration', level: 10, duration: 40 } },
    onUse: 'apply_status_effect', equipSlot: null, modifiers: null, baseDurability: null,
    tags: [GameTags.ITEM_CONSUMABLE, GameTags.PROPERTY_WATER, GameTags.PROPERTY_LIGHT],
});

defineItem({
    id: 'tidebreaker_sword', name: '파식 조류검',
    description: '심해철의 무게를 파도처럼 전진시키는 장검. 방어를 깎고 출혈을 남긴다.',
    image: 'items/windsteel_sword', category: '장검', weight: 4, stackable: false, maxStack: 1,
    baseMetadata: null, onUse: null, equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'atk', op: 'add', value: 150, source: '' },
        { attribute: 'armorPen', op: 'add', value: 32, source: '' },
    ],
    baseDurability: 455,
    tags: [GameTags.ITEM_WEAPON, GameTags.WEAPON_SWORD, GameTags.PROPERTY_WATER, GameTags.PROPERTY_METAL],
    onBasicAttackHit: ({ target }) => {
        const bleeding = StatusEffectType.fromKey('bleeding');
        if (bleeding && Math.random() < 0.2) target.applyStatusEffect(bleeding, 8, 8);
    },
    balance: { role: ItemBalanceRole.WEAPON, attackType: 'physical', recommendedJobIds: ['career:warrior'] },
});

defineItem({
    id: 'mistcurrent_bow', name: '해무 조류궁',
    description: '청해초 수지와 세이렌 비늘로 화살의 흔들림을 지운 장궁.',
    image: 'items/stormstring_bow', category: '활', weight: 2.6, stackable: false, maxStack: 1,
    baseMetadata: {
        basicAttackOverride: ItemAttackOverrideKeys.PROJECTILE,
        projectileAttack: { ammunitionItemId: 'wooden_arrow' },
    },
    onUse: null, equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'atk', op: 'add', value: 112, source: '' },
        { attribute: 'critRate', op: 'add', value: 0.075, source: '' },
        { attribute: 'projectileAcceleration', op: 'multiply', value: 1.34, source: '' },
    ],
    baseDurability: 430,
    tags: [GameTags.ITEM_WEAPON, GameTags.WEAPON_BOW, GameTags.PROPERTY_WATER, GameTags.PROPERTY_NATURAL],
    balance: { role: ItemBalanceRole.WEAPON, attackType: 'physical', recommendedJobIds: ['career:archer'] },
});

defineItem({
    id: 'blackcoral_sting', name: '흑산호 침',
    description: '부러지는 대신 살점을 붙잡는 흑산호 단검. 관통과 치명타 피해에 집중한다.',
    image: 'items/nightglass_dagger', category: '단검', weight: 1.55, stackable: false, maxStack: 1,
    baseMetadata: null, onUse: null, equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'atk', op: 'add', value: 125, source: '' },
        { attribute: 'armorPen', op: 'add', value: 38, source: '' },
        { attribute: 'critDmg', op: 'add', value: 0.2, source: '' },
    ],
    baseDurability: 390,
    tags: [GameTags.ITEM_WEAPON, GameTags.WEAPON_DAGGER, GameTags.MATERIAL_CORAL, GameTags.PROPERTY_WATER, GameTags.PROPERTY_STONE],
    onBasicAttackHit: ({ target }) => {
        const defenseReduction = StatusEffectType.fromKey('defense_reduction');
        if (defenseReduction && Math.random() < 0.17) target.applyStatusEffect(defenseReduction, 8, 7);
    },
    balance: {
        role: ItemBalanceRole.WEAPON, attackType: 'physical', recommendedJobIds: ['career:assassin'],
        notes: ['방어력 감소 부가효과는 기본 DPS와 분리해 평가합니다.'],
    },
});

defineItem({
    id: 'deeppearl_staff', name: '심해진주 지팡이',
    description: '조류진주가 심해의 수압처럼 마력을 한 점으로 압축하는 지팡이.',
    image: 'items/starwood_staff', category: '지팡이', weight: 2.9, stackable: false, maxStack: 1,
    baseMetadata: {
        basicAttackOverride: ItemAttackOverrideKeys.PROJECTILE,
        projectileAttack: {
            projectile: { dataId: 'basic_magic_orb', overrides: { tags: [GameTags.PROPERTY_WATER, GameTags.PROPERTY_DARK] } },
        },
    },
    onUse: null, equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'magicForce', op: 'add', value: 178, source: '' },
        { attribute: 'magicPen', op: 'add', value: 42, source: '' },
        { attribute: 'mentalityRegen', op: 'add', value: 7, source: '' },
        { attribute: 'projectileAcceleration', op: 'multiply', value: 1.32, source: '' },
    ],
    baseDurability: 465,
    tags: [GameTags.ITEM_WEAPON, GameTags.WEAPON_STAFF, GameTags.MATERIAL_CORAL, GameTags.PROPERTY_WATER, GameTags.PROPERTY_DARK],
    balance: { role: ItemBalanceRole.WEAPON, attackType: 'magic', recommendedJobIds: ['career:mage'] },
});

defineItem({
    id: 'drowned_admiral_shield', name: '침몰제독 방패',
    description: '해수룡 골편과 심해철을 포갠 방패. 수압 같은 충격과 망자의 주문을 함께 견딘다.',
    image: 'items/forged_shield', category: '방패', weight: 4.2, stackable: false, maxStack: 1,
    baseMetadata: null, onUse: null, equipSlot: 'offHand',
    modifiers: [
        { attribute: 'def', op: 'add', value: 48, source: '' },
        { attribute: 'magicDef', op: 'add', value: 50, source: '' },
        { attribute: 'maxLife', op: 'add', value: 620, source: '' },
    ],
    baseDurability: 530,
    tags: [GameTags.ITEM_ARMOR, GameTags.PROPERTY_WATER, GameTags.PROPERTY_METAL, GameTags.PROPERTY_UNDEAD],
    balance: { role: ItemBalanceRole.DEFENSE, recommendedJobIds: ['career:warrior', 'career:blacksmith'] },
});

for (const book of [
    {
        id: 'siren_wave_skillbook', name: '해무 파가 전승서', skillDataId: 'siren_wave',
        description: '해무 세이렌의 파가가 기록된 전승서. 사용하면 스킬 [ 해무 파가 ] 를 획득합니다.',
    },
    {
        id: 'abyss_anchor_skillbook', name: '심해 닻 전승서', skillDataId: 'abyss_anchor',
        description: '침몰제독의 무거운 닻술이 기록된 전승서. 사용하면 스킬 [ 심해 닻 ] 을 획득합니다.',
    },
] as const) defineItem({
    id: book.id,
    name: book.name,
    description: book.description,
    image: 'items/seismic_crush_skillbook',
    category: '스킬북', weight: 0.3, stackable: true, maxStack: 10,
    baseMetadata: { skillDataId: book.skillDataId }, onUse: 'learn_skill', equipSlot: null,
    modifiers: null, baseDurability: null,
    tags: [GameTags.ITEM_CONSUMABLE, GameTags.ITEM_SKILL_BOOK, GameTags.PROPERTY_WATER],
});

// TODO(icons): 역설기계고 전용 아트 제작 전까지 광물·기계 부품과 같은 장비군의 기존 아이콘을 명시적으로 재사용한다.
for (const material of [
    {
        id: 'chronosteel_shard', name: '시간강 파편', image: 'items/iron_ore', weight: 0.7,
        description: '앞으로 휘었다가 되돌아오는 성질을 가진 기계고의 청회색 합금 조각.',
        tags: [GameTags.MATERIAL_CLOCKWORK, GameTags.PROPERTY_METAL],
    },
    {
        id: 'memory_gear', name: '기억 톱니', image: 'items/gold_ore', weight: 0.24,
        description: '맞물렸던 장치의 동작 순서를 표면에 새겨 두는 작은 황동 톱니.',
        tags: [GameTags.MATERIAL_CLOCKWORK, GameTags.PROPERTY_METAL, GameTags.PROPERTY_LIGHT],
    },
    {
        id: 'photon_lens', name: '광자 렌즈', image: 'items/diamond', weight: 0.2,
        description: '빛을 한 점이 아니라 정해진 미래의 궤도로 모으는 투명 렌즈.',
        tags: [GameTags.MATERIAL_CLOCKWORK, GameTags.PROPERTY_LIGHT],
    },
    {
        id: 'void_spring', name: '공허 용수철', image: 'items/coal', weight: 0.18,
        description: '압축할수록 주변의 빛과 소리를 삼키는 검은 태엽 용수철.',
        tags: [GameTags.MATERIAL_CLOCKWORK, GameTags.PROPERTY_DARK, GameTags.PROPERTY_METAL],
    },
    {
        id: 'logic_core', name: '논리핵', image: 'items/diamond', weight: 0.35,
        description: '자동인형의 판단 순서를 보관하는 다면체 마도 회로.',
        tags: [GameTags.MATERIAL_CLOCKWORK, GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_ELECTRIC],
    },
    {
        id: 'paradox_thread', name: '역설 실', image: 'items/earthworm_bait', weight: 0.08,
        description: '서로 다른 두 순간의 위치를 동시에 잇는 은보랏빛 마력 섬유.',
        tags: [GameTags.MATERIAL_CLOCKWORK, GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_DARK],
    },
    {
        id: 'automaton_plate', name: '자동인형 장갑판', image: 'items/iron_ore', weight: 1.1,
        description: '관절의 움직임에 맞춰 단단함이 변하는 기계 병사의 외장판.',
        tags: [GameTags.MATERIAL_CLOCKWORK, GameTags.PROPERTY_METAL],
    },
    {
        id: 'fracture_crystal', name: '균열 수정', image: 'items/diamond', weight: 0.28,
        description: '공간의 금이 결정으로 굳은 조각. 가까운 사물의 윤곽을 겹쳐 보이게 한다.',
        tags: [GameTags.MATERIAL_CLOCKWORK, GameTags.PROPERTY_DARK],
    },
    {
        id: 'archive_key_fragment', name: '기록고 열쇠 파편', image: 'items/gold_ore', weight: 0.16,
        description: '기계고의 폐쇄된 기록층을 열던 톱니형 열쇠의 일부.',
        tags: [GameTags.MATERIAL_CLOCKWORK, GameTags.PROPERTY_METAL, GameTags.PROPERTY_LIGHT],
    },
] as const) defineItem({
    id: material.id,
    name: material.name,
    description: material.description,
    image: material.image,
    category: '기계고 소재',
    weight: material.weight,
    stackable: true,
    maxStack: 99,
    baseMetadata: null,
    onUse: null,
    equipSlot: null,
    modifiers: null,
    baseDurability: null,
    tags: [...material.tags],
});

defineItem({
    id: 'cogwork_ration', name: '태엽 작업식',
    description: '자동 공방의 교대 시간을 견디도록 만든 압축 식량. 배고픔 90과 수분 30을 회복한다.',
    image: 'items/traveler_bread', category: '음식', weight: 0.48, stackable: true, maxStack: 30,
    baseMetadata: { hunger: 90, thirst: 30, time: 1.2, useMessage: '태엽 작업식을 풀어 먹는 중...' },
    onUse: 'restore_survival', equipSlot: null, modifiers: null, baseDurability: null,
    tags: [GameTags.ITEM_CONSUMABLE, GameTags.MATERIAL_CLOCKWORK],
});

for (const tonic of [
    {
        id: 'phase_tonic', name: '위상 촉진제', image: 'items/fresh_water',
        description: '공허 용수철의 반동을 몸에 흘려 55초 동안 움직임을 가속한다.',
        statusEffect: { id: 'swiftness', level: 11, duration: 55 },
        tags: [GameTags.PROPERTY_DARK, GameTags.PROPERTY_ELECTRIC],
    },
    {
        id: 'logic_elixir', name: '논리회로 영약', image: 'items/mana_potion',
        description: '논리핵의 계산 회로를 정신에 겹쳐 55초 동안 마법 위력을 강화한다.',
        statusEffect: { id: 'magic_enhancement', level: 11, duration: 55 },
        tags: [GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_ELECTRIC],
    },
    {
        id: 'temporal_salve', name: '시간봉합 연고', image: 'items/health_potion',
        description: '상처가 나기 전의 형상을 되짚어 40초 동안 강한 생명력 재생을 부여한다.',
        statusEffect: { id: 'regeneration', level: 12, duration: 40 },
        tags: [GameTags.PROPERTY_LIGHT],
    },
] as const) defineItem({
    id: tonic.id, name: tonic.name, description: tonic.description,
    image: tonic.image, category: '소모품', weight: 0.3, stackable: true, maxStack: 20,
    baseMetadata: { [ItemMetadataKeys.STATUS_EFFECT]: tonic.statusEffect },
    onUse: 'apply_status_effect', equipSlot: null, modifiers: null, baseDurability: null,
    tags: [GameTags.ITEM_CONSUMABLE, GameTags.MATERIAL_CLOCKWORK, ...tonic.tags],
});

defineItem({
    id: 'paradox_edge', name: '역설절단검',
    description: '베기 전과 베어 낸 뒤의 궤적을 겹쳐 갑옷의 같은 틈을 두 번 파고드는 시간강 장검.',
    image: 'items/windsteel_sword', category: '장검', weight: 4.1, stackable: false, maxStack: 1,
    baseMetadata: null, onUse: null, equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'atk', op: 'add', value: 190, source: '' },
        { attribute: 'armorPen', op: 'add', value: 48, source: '' },
    ],
    baseDurability: 520,
    tags: [GameTags.ITEM_WEAPON, GameTags.WEAPON_SWORD, GameTags.MATERIAL_CLOCKWORK, GameTags.PROPERTY_METAL],
    onBasicAttackHit: ({ target }) => {
        const effect = StatusEffectType.fromKey('defense_reduction');
        if (effect && Math.random() < 0.22) target.applyStatusEffect(effect, 9, 10);
    },
    balance: { role: ItemBalanceRole.WEAPON, attackType: 'physical', recommendedJobIds: ['career:warrior'] },
});

defineItem({
    id: 'photon_repeater', name: '광자연사궁',
    description: '광자 렌즈가 다음 사격 궤도를 미리 잡아 화살을 빠르게 이어 보내는 복합궁.',
    image: 'items/stormstring_bow', category: '활', weight: 2.75, stackable: false, maxStack: 1,
    baseMetadata: {
        [ItemMetadataKeys.BASIC_ATTACK_OVERRIDE]: ItemAttackOverrideKeys.PROJECTILE,
        [ItemMetadataKeys.PROJECTILE_ATTACK]: { ammunitionItemId: 'wooden_arrow' },
    },
    onUse: null, equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'atk', op: 'add', value: 142, source: '' },
        { attribute: 'critRate', op: 'add', value: 0.09, source: '' },
        { attribute: 'projectileAcceleration', op: 'multiply', value: 1.45, source: '' },
    ],
    baseDurability: 495,
    tags: [GameTags.ITEM_WEAPON, GameTags.WEAPON_BOW, GameTags.MATERIAL_CLOCKWORK, GameTags.PROPERTY_LIGHT],
    balance: { role: ItemBalanceRole.WEAPON, attackType: 'physical', recommendedJobIds: ['career:archer'] },
});

defineItem({
    id: 'voidspring_dagger', name: '공허태엽 단검',
    description: '검신 안의 공허 용수철이 접촉 순간 튀어나와 얕은 상처를 깊게 벌리는 단검.',
    image: 'items/nightglass_dagger', category: '단검', weight: 1.6, stackable: false, maxStack: 1,
    baseMetadata: null, onUse: null, equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'atk', op: 'add', value: 158, source: '' },
        { attribute: 'armorPen', op: 'add', value: 54, source: '' },
        { attribute: 'critDmg', op: 'add', value: 0.26, source: '' },
    ],
    baseDurability: 455,
    tags: [GameTags.ITEM_WEAPON, GameTags.WEAPON_DAGGER, GameTags.MATERIAL_CLOCKWORK, GameTags.PROPERTY_DARK, GameTags.PROPERTY_METAL],
    onBasicAttackHit: ({ target }) => {
        const effect = StatusEffectType.fromKey('slowness');
        if (effect && Math.random() < 0.18) target.applyStatusEffect(effect, 6, 9);
    },
    balance: { role: ItemBalanceRole.WEAPON, attackType: 'physical', recommendedJobIds: ['career:assassin'] },
});

defineItem({
    id: 'logic_core_staff', name: '논리핵 지팡이',
    description: '논리핵이 마력의 낭비 경로를 지우고 가장 짧은 탄도만 남기는 마도 지팡이.',
    image: 'items/starwood_staff', category: '지팡이', weight: 3, stackable: false, maxStack: 1,
    baseMetadata: {
        [ItemMetadataKeys.BASIC_ATTACK_OVERRIDE]: ItemAttackOverrideKeys.PROJECTILE,
        [ItemMetadataKeys.PROJECTILE_ATTACK]: {
            projectile: {
                dataId: 'basic_magic_orb',
                overrides: { tags: [GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_ELECTRIC] },
            },
        },
    },
    onUse: null, equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'magicForce', op: 'add', value: 222, source: '' },
        { attribute: 'magicPen', op: 'add', value: 58, source: '' },
        { attribute: 'mentalityRegen', op: 'add', value: 10, source: '' },
        { attribute: 'projectileAcceleration', op: 'multiply', value: 1.48, source: '' },
    ],
    baseDurability: 535,
    tags: [GameTags.ITEM_WEAPON, GameTags.WEAPON_STAFF, GameTags.MATERIAL_CLOCKWORK, GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_ELECTRIC],
    balance: { role: ItemBalanceRole.WEAPON, attackType: 'magic', recommendedJobIds: ['career:mage'] },
});

defineItem({
    id: 'causality_aegis', name: '인과율 방패',
    description: '공격이 닿는 원인과 상처가 생기는 결과 사이를 벌려 충격을 흘리는 자동 장갑 방패.',
    image: 'items/forged_shield', category: '방패', weight: 4.5, stackable: false, maxStack: 1,
    baseMetadata: null, onUse: null, equipSlot: 'offHand',
    modifiers: [
        { attribute: 'def', op: 'add', value: 64, source: '' },
        { attribute: 'magicDef', op: 'add', value: 68, source: '' },
        { attribute: 'maxLife', op: 'add', value: 820, source: '' },
    ],
    baseDurability: 620,
    tags: [GameTags.ITEM_ARMOR, GameTags.MATERIAL_CLOCKWORK, GameTags.PROPERTY_METAL, GameTags.PROPERTY_LIGHT],
    balance: { role: ItemBalanceRole.DEFENSE, recommendedJobIds: ['career:warrior', 'career:blacksmith'] },
});

for (const book of [
    { id: 'photon_lance_skillbook', name: '광자창 전승서', skillDataId: 'photon_lance', property: GameTags.PROPERTY_LIGHT },
    { id: 'causality_lock_skillbook', name: '인과고정 전승서', skillDataId: 'causality_lock', property: GameTags.PROPERTY_DARK },
    { id: 'gearstorm_skillbook', name: '톱니폭우 전승서', skillDataId: 'gearstorm', property: GameTags.PROPERTY_METAL },
    { id: 'paradox_reversal_skillbook', name: '역설반전 전승서', skillDataId: 'paradox_reversal', property: GameTags.PROPERTY_LIGHT },
] as const) defineItem({
    id: book.id,
    name: book.name,
    description: `역설기계고의 전투 연산이 기록된 전승서. 사용하면 스킬 [ ${book.name.replace(' 전승서', '')} ] 을(를) 획득합니다.`,
    image: 'items/seismic_crush_skillbook', category: '스킬북', weight: 0.3, stackable: true, maxStack: 10,
    baseMetadata: { skillDataId: book.skillDataId }, onUse: 'learn_skill', equipSlot: null,
    modifiers: null, baseDurability: null,
    tags: [GameTags.ITEM_CONSUMABLE, GameTags.ITEM_SKILL_BOOK, GameTags.MATERIAL_CLOCKWORK, book.property],
});

// TODO: 잿빛성흔 심연 전용 아트 제작 전까지 소재·무기·스킬북 카테고리 fallback을 사용한다.
for (const material of [
    {
        id: 'ashen_sinew', name: '잿빛 힘줄', image: 'items/earthworm_bait', weight: 0.22,
        description: '심연 짐승의 근육 사이에서 타지 않고 남은 질긴 회색 힘줄.',
        tags: [GameTags.MATERIAL_ASHEN_ABYSS, GameTags.PROPERTY_DARK],
    },
    {
        id: 'blackflame_residue', name: '흑염 잔재', image: 'items/ember_ore', weight: 0.18,
        description: '빛을 내지 않으면서 주변의 온기만 태우는 검은 불꽃의 응결물.',
        tags: [GameTags.MATERIAL_ASHEN_ABYSS, GameTags.PROPERTY_FIRE, GameTags.PROPERTY_DARK],
    },
    {
        id: 'hollow_horn', name: '공허뿔', image: 'items/stone', weight: 0.75,
        description: '속이 텅 비었지만 두드리면 먼 곳의 포효가 되돌아오는 마수의 뿔.',
        tags: [GameTags.MATERIAL_ASHEN_ABYSS, GameTags.PROPERTY_DARK],
    },
    {
        id: 'cursebone_fragment', name: '저주뼈 파편', image: 'items/stone', weight: 0.42,
        description: '오래된 저주가 골수 대신 차 있는 검붉은 뼛조각.',
        tags: [GameTags.MATERIAL_ASHEN_ABYSS, GameTags.PROPERTY_UNDEAD, GameTags.PROPERTY_DARK],
    },
    {
        id: 'night_iron', name: '밤쇠', image: 'items/iron_ore', weight: 0.86,
        description: '검은재 지층에서 흑염과 함께 굳어 빛을 거의 반사하지 않는 철광.',
        tags: [GameTags.MATERIAL_ASHEN_ABYSS, GameTags.PROPERTY_METAL, GameTags.PROPERTY_DARK],
    },
    {
        id: 'sovereign_seal_fragment', name: '재왕 인장 파편', image: 'items/gold_ore', weight: 0.2,
        description: '잿왕성의 명령을 각인하던 인장이 전투 중 부서져 남은 조각.',
        tags: [GameTags.MATERIAL_ASHEN_ABYSS, GameTags.PROPERTY_FIRE, GameTags.PROPERTY_METAL],
    },
    {
        id: 'abyssal_hide', name: '심연가죽', image: 'items/earthworm_bait', weight: 0.65,
        description: '어둠 속에서만 결이 드러나는 두껍고 유연한 마수 가죽.',
        tags: [GameTags.MATERIAL_ASHEN_ABYSS, GameTags.PROPERTY_DARK],
    },
    {
        id: 'mourning_eye', name: '애도의 눈', image: 'items/ruby', weight: 0.12,
        description: '쓰러진 자의 마지막 모습을 반복해 비추는 보랏빛 결정안.',
        tags: [GameTags.MATERIAL_ASHEN_ABYSS, GameTags.PROPERTY_DARK, GameTags.PROPERTY_UNDEAD],
    },
] as const) defineItem({
    id: material.id,
    name: material.name,
    description: material.description,
    image: material.image,
    category: '심연 소재',
    weight: material.weight,
    stackable: true,
    maxStack: 99,
    baseMetadata: null,
    onUse: null,
    equipSlot: null,
    modifiers: null,
    baseDurability: null,
    tags: [...material.tags],
});

defineItem({
    id: 'ashmarch_ration', name: '재길 행군식',
    description: '흑염의 열을 밀봉해 차가운 심연에서도 굳지 않는 식량. 배고픔 95와 수분 35를 회복한다.',
    image: 'items/traveler_bread', category: '음식', weight: 0.52, stackable: true, maxStack: 30,
    baseMetadata: { hunger: 95, thirst: 35, time: 1.2, useMessage: '재길 행군식의 봉인을 푸는 중...' },
    onUse: 'restore_survival', equipSlot: null, modifiers: null, baseDurability: null,
    tags: [GameTags.ITEM_CONSUMABLE, GameTags.MATERIAL_ASHEN_ABYSS, GameTags.PROPERTY_FIRE],
});

for (const tonic of [
    {
        id: 'blackflame_ward', name: '흑염막이 영약', image: 'items/arcane_tonic',
        description: '흑염 잔재를 역류시켜 60초 동안 화염 저항을 부여한다.',
        statusEffect: { id: 'fire_resistance', level: 12, duration: 60 },
        tags: [GameTags.PROPERTY_FIRE],
    },
    {
        id: 'ashblood_elixir', name: '회혈 영약', image: 'items/health_potion',
        description: '잿빛 힘줄의 생명력을 정제해 45초 동안 강한 생명력 재생을 부여한다.',
        statusEffect: { id: 'regeneration', level: 13, duration: 45 },
        tags: [GameTags.PROPERTY_DARK],
    },
] as const) defineItem({
    id: tonic.id, name: tonic.name, description: tonic.description,
    image: tonic.image, category: '소모품', weight: 0.32, stackable: true, maxStack: 20,
    baseMetadata: { [ItemMetadataKeys.STATUS_EFFECT]: tonic.statusEffect },
    onUse: 'apply_status_effect', equipSlot: null, modifiers: null, baseDurability: null,
    tags: [GameTags.ITEM_CONSUMABLE, GameTags.MATERIAL_ASHEN_ABYSS, ...tonic.tags],
});

defineItem({
    id: 'sootcleaver_sword', name: '재가름 장검',
    description: '밤쇠의 무게를 칼끝에 모아 갑옷째 상처를 벌리는 검은 장검.',
    image: 'items/windsteel_sword', category: '장검', weight: 4.35, stackable: false, maxStack: 1,
    baseMetadata: null, onUse: null, equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'atk', op: 'add', value: 215, source: '' },
        { attribute: 'armorPen', op: 'add', value: 55, source: '' },
    ],
    baseDurability: 555,
    tags: [GameTags.ITEM_WEAPON, GameTags.WEAPON_SWORD, GameTags.MATERIAL_ASHEN_ABYSS, GameTags.PROPERTY_METAL],
    onBasicAttackHit: ({ target }) => {
        const effect = StatusEffectType.fromKey('bleeding');
        if (effect && Math.random() < 0.24) target.applyStatusEffect(effect, 10, 11);
    },
    balance: { role: ItemBalanceRole.WEAPON, attackType: 'physical', recommendedJobIds: ['career:warrior'] },
});

defineItem({
    id: 'hornstring_bow', name: '공허뿔 장궁',
    description: '공허뿔과 잿빛 힘줄을 겹쳐 화살의 첫 가속을 극단적으로 높인 장궁.',
    image: 'items/stormstring_bow', category: '활', weight: 2.9, stackable: false, maxStack: 1,
    baseMetadata: {
        [ItemMetadataKeys.BASIC_ATTACK_OVERRIDE]: ItemAttackOverrideKeys.PROJECTILE,
        [ItemMetadataKeys.PROJECTILE_ATTACK]: { ammunitionItemId: 'wooden_arrow' },
    },
    onUse: null, equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'atk', op: 'add', value: 160, source: '' },
        { attribute: 'critRate', op: 'add', value: 0.1, source: '' },
        { attribute: 'projectileAcceleration', op: 'multiply', value: 1.52, source: '' },
    ],
    baseDurability: 525,
    tags: [GameTags.ITEM_WEAPON, GameTags.WEAPON_BOW, GameTags.MATERIAL_ASHEN_ABYSS, GameTags.PROPERTY_DARK],
    balance: { role: ItemBalanceRole.WEAPON, attackType: 'physical', recommendedJobIds: ['career:archer'] },
});

defineItem({
    id: 'gloamfang_dagger', name: '황혼송곳',
    description: '그림자가 가장 짙어지는 순간에만 날이 드러나는 밤쇠 단검.',
    image: 'items/nightglass_dagger', category: '단검', weight: 1.7, stackable: false, maxStack: 1,
    baseMetadata: null, onUse: null, equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'atk', op: 'add', value: 180, source: '' },
        { attribute: 'armorPen', op: 'add', value: 62, source: '' },
        { attribute: 'critDmg', op: 'add', value: 0.3, source: '' },
    ],
    baseDurability: 485,
    tags: [GameTags.ITEM_WEAPON, GameTags.WEAPON_DAGGER, GameTags.MATERIAL_ASHEN_ABYSS, GameTags.PROPERTY_DARK, GameTags.PROPERTY_METAL],
    onBasicAttackHit: ({ target }) => {
        const effect = StatusEffectType.fromKey('curse');
        if (effect && Math.random() < 0.2) target.applyStatusEffect(effect, 8, 10);
    },
    balance: { role: ItemBalanceRole.WEAPON, attackType: 'physical', recommendedJobIds: ['career:assassin'] },
});

defineItem({
    id: 'blackflame_staff', name: '흑염각 지팡이',
    description: '공허뿔 내부에서 흑염을 순환시켜 빛 없는 마력탄을 발사하는 지팡이.',
    image: 'items/starwood_staff', category: '지팡이', weight: 3.2, stackable: false, maxStack: 1,
    baseMetadata: {
        [ItemMetadataKeys.BASIC_ATTACK_OVERRIDE]: ItemAttackOverrideKeys.PROJECTILE,
        [ItemMetadataKeys.PROJECTILE_ATTACK]: {
            projectile: {
                dataId: 'basic_magic_orb',
                overrides: { tags: [GameTags.PROPERTY_FIRE, GameTags.PROPERTY_DARK] },
            },
        },
    },
    onUse: null, equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'magicForce', op: 'add', value: 248, source: '' },
        { attribute: 'magicPen', op: 'add', value: 68, source: '' },
        { attribute: 'mentalityRegen', op: 'add', value: 11, source: '' },
        { attribute: 'projectileAcceleration', op: 'multiply', value: 1.55, source: '' },
    ],
    baseDurability: 570,
    tags: [GameTags.ITEM_WEAPON, GameTags.WEAPON_STAFF, GameTags.MATERIAL_ASHEN_ABYSS, GameTags.PROPERTY_FIRE, GameTags.PROPERTY_DARK],
    balance: { role: ItemBalanceRole.WEAPON, attackType: 'magic', recommendedJobIds: ['career:mage'] },
});

defineItem({
    id: 'ashguard_bulwark', name: '재성벽 방패',
    description: '밤쇠와 심연가죽 사이에 저주뼈를 넣어 물리 충격과 마력을 함께 흘리는 대형 방패.',
    image: 'items/forged_shield', category: '방패', weight: 4.8, stackable: false, maxStack: 1,
    baseMetadata: null, onUse: null, equipSlot: 'offHand',
    modifiers: [
        { attribute: 'def', op: 'add', value: 73, source: '' },
        { attribute: 'magicDef', op: 'add', value: 75, source: '' },
        { attribute: 'maxLife', op: 'add', value: 950, source: '' },
    ],
    baseDurability: 660,
    tags: [GameTags.ITEM_ARMOR, GameTags.MATERIAL_ASHEN_ABYSS, GameTags.PROPERTY_METAL, GameTags.PROPERTY_DARK],
    balance: { role: ItemBalanceRole.DEFENSE, recommendedJobIds: ['career:warrior', 'career:blacksmith'] },
});

for (const book of [
    { id: 'hellhound_charge_skillbook', name: '재아귀 돌진 전승서', skillDataId: 'hellhound_charge', property: GameTags.PROPERTY_FIRE },
    { id: 'blackflame_brand_skillbook', name: '흑염 낙인 전승서', skillDataId: 'blackflame_brand', property: GameTags.PROPERTY_DARK },
    { id: 'sovereign_decree_skillbook', name: '재왕의 칙령 전승서', skillDataId: 'sovereign_decree', property: GameTags.PROPERTY_UNDEAD },
] as const) defineItem({
    id: book.id,
    name: book.name,
    description: `잿빛성흔 심연의 전투 의식이 기록된 전승서. 사용하면 스킬 [ ${book.name.replace(' 전승서', '')} ] 을(를) 획득합니다.`,
    image: 'items/seismic_crush_skillbook', category: '스킬북', weight: 0.3, stackable: true, maxStack: 10,
    baseMetadata: { skillDataId: book.skillDataId }, onUse: 'learn_skill', equipSlot: null,
    modifiers: null, baseDurability: null,
    tags: [GameTags.ITEM_CONSUMABLE, GameTags.ITEM_SKILL_BOOK, GameTags.MATERIAL_ASHEN_ABYSS, book.property],
});

defineItem({
    id: 'ember_ore',
    name: '화맥 광석',
    description: '홍염산지의 깊은 지층에서만 굳어지는 불꽃 맥석. 마력 제련으로 홍염강을 만들 수 있다.',
    image: 'items/ember_ore',
    category: '광물',
    weight: 0.85,
    stackable: true,
    maxStack: 99,
    baseMetadata: null,
    onUse: null,
    equipSlot: null,
    modifiers: null,
    baseDurability: null,
    tags: [GameTags.MATERIAL_EMBER, GameTags.PROPERTY_FIRE, GameTags.MATERIAL_STONE],
});

defineItem({
    id: 'ember_alloy',
    name: '홍염강',
    description: '화맥 광석의 열과 금속 성분을 함께 붙잡아 제련한 화염 합금. 고급 단조 소재로 사용한다.',
    image: 'items/ember_alloy',
    category: '제련 소재',
    weight: 0.65,
    stackable: true,
    maxStack: 99,
    baseMetadata: null,
    onUse: null,
    equipSlot: null,
    modifiers: null,
    baseDurability: null,
    tags: [GameTags.MATERIAL_EMBER, GameTags.MATERIAL_REFINED, GameTags.PROPERTY_FIRE, GameTags.PROPERTY_METAL],
});

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
    image: `items/${material.id}`,
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
    { id: 'forged_sword', name: '단조 장검', image: 'items/forged_sword', category: '장검', weight: 3.4, slot: 'mainHand', tag: GameTags.WEAPON_SWORD },
    { id: 'forged_axe', name: '단조 도끼', image: 'items/forged_axe', category: '도끼', weight: 3.8, slot: 'mainHand', tag: GameTags.WEAPON_AXE },
    { id: 'forged_dagger', name: '단조 단검', image: 'items/forged_dagger', category: '단검', weight: 1.7, slot: 'mainHand', tag: GameTags.WEAPON_DAGGER },
    { id: 'forged_shield', name: '단조 방패', image: 'items/forged_shield', category: '방패', weight: 3.2, slot: 'offHand', tag: null },
    { id: 'forged_pickaxe', name: '단조 곡괭이', image: 'items/forged_pickaxe', category: '곡괭이', weight: 3.5, slot: 'mainHand', tag: null },
] as const;

for (const template of forgedTemplates) defineItem({
    id: template.id,
    name: template.name,
    description: '재료와 단조 결과에 따라 이름과 능력치가 정해지는 제작 장비.',
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

// TODO(icons): 공허왕관 성채 전용 아트 제작 전까지 소재·장비·전승서 카테고리 fallback을 사용한다.
for (const material of [
    {
        id: 'nullsilver', name: '무광은', image: 'items/refined_iron', weight: 0.72,
        description: '빛을 반사하지 않고 마력의 흔적만 희미하게 되돌려 보내는 공허왕관의 은빛 합금.',
        tags: [GameTags.MATERIAL_VOIDCROWN, GameTags.PROPERTY_METAL, GameTags.PROPERTY_DARK],
    },
    {
        id: 'crown_glass', name: '왕관유리', image: 'items/resonance_evasion_shard', weight: 0.24,
        description: '깨진 왕관 첨탑의 빛과 어둠이 한 면에 함께 굳은 자색 유리.',
        tags: [GameTags.MATERIAL_VOIDCROWN, GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_DARK],
    },
    {
        id: 'void_silk', name: '공허비단', image: 'items/earthworm_bait', weight: 0.12,
        description: '허공을 헤엄치는 나방이 남긴, 손끝보다 한 박자 늦게 흔들리는 검은 비단.',
        tags: [GameTags.MATERIAL_VOIDCROWN, GameTags.PROPERTY_DARK],
    },
    {
        id: 'starved_vine', name: '기아덩굴', image: 'items/earthworm_bait', weight: 0.3,
        description: '빛과 수분 대신 마력을 빨아들여 성채의 벽을 타고 자라는 창백한 덩굴.',
        tags: [GameTags.MATERIAL_VOIDCROWN, GameTags.PROPERTY_NATURAL, GameTags.PROPERTY_DARK],
    },
    {
        id: 'astral_ink', name: '별먹', image: 'items/arcane_tonic', weight: 0.15,
        description: '별빛이 닿지 않는 문장을 기록하기 위해 왕실 서고에서 쓰던 액체 마력.',
        tags: [GameTags.MATERIAL_VOIDCROWN, GameTags.PROPERTY_DARK],
    },
    {
        id: 'regent_insignia', name: '섭정 인장', image: 'items/gold_ore', weight: 0.22,
        description: '공허왕관의 명령 체계를 증명하던 금속 인장 조각. 아직도 희미한 복종의 마력이 남아 있다.',
        tags: [GameTags.MATERIAL_VOIDCROWN, GameTags.PROPERTY_METAL, GameTags.PROPERTY_DARK],
    },
] as const) defineItem({
    id: material.id,
    name: material.name,
    description: material.description,
    image: material.image,
    category: '성채 소재',
    weight: material.weight,
    stackable: true,
    maxStack: 99,
    baseMetadata: null,
    onUse: null,
    equipSlot: null,
    modifiers: null,
    baseDurability: null,
    tags: [...material.tags],
});

defineItem({
    id: 'voidcrown_ration', name: '무광 행군식',
    description: '기아덩굴의 쓴맛을 별먹으로 눌러 보존한 성채 식량. 배고픔 110과 수분 45를 회복한다.',
    image: 'items/traveler_bread', category: '음식', weight: 0.5, stackable: true, maxStack: 30,
    baseMetadata: { hunger: 110, thirst: 45, time: 1.1, useMessage: '무광 행군식의 밀봉을 푸는 중...' },
    onUse: 'restore_survival', equipSlot: null, modifiers: null, baseDurability: null,
    tags: [GameTags.ITEM_CONSUMABLE, GameTags.MATERIAL_VOIDCROWN, GameTags.PROPERTY_DARK],
});

defineItem({
    id: 'voidcrown_draught', name: '공허맥 회복약',
    description: '기아덩굴과 왕관유리의 흐름을 안정시켜 50초 동안 강한 생명력 재생을 부여한다.',
    image: 'items/health_potion', category: '소모품', weight: 0.34, stackable: true, maxStack: 20,
    baseMetadata: { [ItemMetadataKeys.STATUS_EFFECT]: { id: 'regeneration', level: 15, duration: 50 } },
    onUse: 'apply_status_effect', equipSlot: null, modifiers: null, baseDurability: null,
    tags: [GameTags.ITEM_CONSUMABLE, GameTags.MATERIAL_VOIDCROWN, GameTags.PROPERTY_DARK],
});

defineItem({
    id: 'nullsilver_greatsword', name: '무광은 파성검',
    description: '무광은의 무게중심을 칼끝에 모아 두꺼운 방어선도 한 호흡에 갈라내는 대검.',
    image: 'items/windsteel_sword', category: '장검', weight: 4.7, stackable: false, maxStack: 1,
    baseMetadata: null, onUse: null, equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'atk', op: 'add', value: 292, source: '' },
        { attribute: 'armorPen', op: 'add', value: 76, source: '' },
        { attribute: 'critDmg', op: 'add', value: 0.24, source: '' },
    ],
    baseDurability: 680,
    tags: [GameTags.ITEM_WEAPON, GameTags.WEAPON_SWORD, GameTags.MATERIAL_VOIDCROWN, GameTags.PROPERTY_METAL],
    balance: { role: ItemBalanceRole.WEAPON, attackType: 'physical', recommendedJobIds: ['career:warrior'] },
});

defineItem({
    id: 'crownstring_longbow', name: '왕관현 장궁',
    description: '공허비단과 왕관유리를 활시위에 겹쳐 먼 거리에서도 화살의 초가속을 잃지 않는 장궁.',
    image: 'items/stormstring_bow', category: '활', weight: 3.1, stackable: false, maxStack: 1,
    baseMetadata: {
        [ItemMetadataKeys.BASIC_ATTACK_OVERRIDE]: ItemAttackOverrideKeys.PROJECTILE,
        [ItemMetadataKeys.PROJECTILE_ATTACK]: { ammunitionItemId: 'wooden_arrow' },
    },
    onUse: null, equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'atk', op: 'add', value: 236, source: '' },
        { attribute: 'critRate', op: 'add', value: 0.12, source: '' },
        { attribute: 'projectileAcceleration', op: 'multiply', value: 1.68, source: '' },
    ],
    baseDurability: 640,
    tags: [GameTags.ITEM_WEAPON, GameTags.WEAPON_BOW, GameTags.MATERIAL_VOIDCROWN, GameTags.PROPERTY_LIGHT],
    balance: { role: ItemBalanceRole.WEAPON, attackType: 'physical', recommendedJobIds: ['career:archer'] },
});

defineItem({
    id: 'voidsilk_stiletto', name: '공허비단 침',
    description: '공허비단의 흔들림을 따라 칼끝이 뒤늦게 나타나는 무광은 단검.',
    image: 'items/nightglass_dagger', category: '단검', weight: 1.55, stackable: false, maxStack: 1,
    baseMetadata: null, onUse: null, equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'atk', op: 'add', value: 258, source: '' },
        { attribute: 'armorPen', op: 'add', value: 82, source: '' },
        { attribute: 'critDmg', op: 'add', value: 0.38, source: '' },
        { attribute: 'speed', op: 'add', value: 0.18, source: '' },
    ],
    baseDurability: 585,
    tags: [GameTags.ITEM_WEAPON, GameTags.WEAPON_DAGGER, GameTags.MATERIAL_VOIDCROWN, GameTags.PROPERTY_DARK],
    balance: { role: ItemBalanceRole.WEAPON, attackType: 'physical', recommendedJobIds: ['career:assassin'] },
});

defineItem({
    id: 'starless_scepter', name: '무성좌 지팡이',
    description: '별먹으로 지운 성좌를 왕관유리에 다시 새겨 공허의 마력을 한 점으로 압축하는 지팡이.',
    image: 'items/starwood_staff', category: '지팡이', weight: 3.25, stackable: false, maxStack: 1,
    baseMetadata: {
        [ItemMetadataKeys.BASIC_ATTACK_OVERRIDE]: ItemAttackOverrideKeys.PROJECTILE,
        [ItemMetadataKeys.PROJECTILE_ATTACK]: {
            projectile: {
                dataId: 'basic_magic_orb',
                overrides: { tags: [GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_DARK] },
            },
        },
    },
    onUse: null, equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'magicForce', op: 'add', value: 335, source: '' },
        { attribute: 'magicPen', op: 'add', value: 88, source: '' },
        { attribute: 'mentalityRegen', op: 'add', value: 14, source: '' },
        { attribute: 'projectileAcceleration', op: 'multiply', value: 1.72, source: '' },
    ],
    baseDurability: 700,
    tags: [GameTags.ITEM_WEAPON, GameTags.WEAPON_STAFF, GameTags.MATERIAL_VOIDCROWN, GameTags.PROPERTY_DARK, GameTags.PROPERTY_LIGHT],
    balance: { role: ItemBalanceRole.WEAPON, attackType: 'magic', recommendedJobIds: ['career:mage'] },
});

defineItem({
    id: 'regent_aegis', name: '섭정의 무광방패',
    description: '무광은과 왕관유리 사이에 공허비단을 겹쳐 물리 충격과 마력을 서로 다른 층으로 흘리는 방패.',
    image: 'items/forged_shield', category: '방패', weight: 5, stackable: false, maxStack: 1,
    baseMetadata: null, onUse: null, equipSlot: 'offHand',
    modifiers: [
        { attribute: 'def', op: 'add', value: 92, source: '' },
        { attribute: 'magicDef', op: 'add', value: 98, source: '' },
        { attribute: 'maxLife', op: 'add', value: 1_280, source: '' },
    ],
    baseDurability: 790,
    tags: [GameTags.ITEM_ARMOR, GameTags.MATERIAL_VOIDCROWN, GameTags.PROPERTY_METAL, GameTags.PROPERTY_DARK],
    balance: { role: ItemBalanceRole.DEFENSE, recommendedJobIds: ['career:warrior', 'career:blacksmith'] },
});

for (const book of [
    { id: 'voidstep_skillbook', name: '공허걸음 전승서', skillDataId: 'voidstep', property: GameTags.PROPERTY_DARK },
    { id: 'crown_nullification_skillbook', name: '왕관무효 전승서', skillDataId: 'crown_nullification', property: GameTags.PROPERTY_LIGHT },
] as const) defineItem({
    id: book.id,
    name: book.name,
    description: `공허왕관 성채의 전투 의식이 기록된 전승서. 사용하면 스킬 [ ${book.name.replace(' 전승서', '')} ] 을(를) 획득합니다.`,
    image: 'items/seismic_crush_skillbook', category: '스킬북', weight: 0.3, stackable: true, maxStack: 10,
    baseMetadata: { skillDataId: book.skillDataId }, onUse: 'learn_skill', equipSlot: null,
    modifiers: null, baseDurability: null,
    tags: [GameTags.ITEM_CONSUMABLE, GameTags.ITEM_SKILL_BOOK, GameTags.MATERIAL_VOIDCROWN, book.property],
});

// TODO(icons): 월식해구 전용 아트 제작 전까지 물·빛·어둠 계열 소재와 장비 fallback을 사용한다.
for (const material of [
    {
        id: 'moon_brine', name: '월염수', image: 'items/mana_potion', weight: 0.38,
        description: '달빛이 닿지 않는 해구에서만 은빛으로 굳는 고농도 마력 염수.',
        tags: [GameTags.MATERIAL_ECLIPSE_TRENCH, GameTags.PROPERTY_WATER, GameTags.PROPERTY_DARK],
    },
    {
        id: 'eclipse_scale', name: '월식비늘', image: 'items/resonance_evasion_shard', weight: 0.45,
        description: '빛과 어둠을 번갈아 반사하는 심해 생물의 단단한 비늘.',
        tags: [GameTags.MATERIAL_ECLIPSE_TRENCH, GameTags.PROPERTY_WATER, GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_DARK],
    },
    {
        id: 'drowned_silver', name: '침은', image: 'items/refined_iron', weight: 0.78,
        description: '깊은 수압과 월염수에 오래 눌려 푸른 결이 생긴 은빛 합금.',
        tags: [GameTags.MATERIAL_ECLIPSE_TRENCH, GameTags.PROPERTY_METAL, GameTags.PROPERTY_WATER],
    },
    {
        id: 'night_pearl', name: '밤진주', image: 'items/resonance_evasion_shard', weight: 0.18,
        description: '어둠 속에서 주변의 희미한 빛을 모아 내부에 보존하는 검푸른 진주.',
        tags: [GameTags.MATERIAL_ECLIPSE_TRENCH, GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_DARK],
    },
    {
        id: 'abyss_fiber', name: '해구섬유', image: 'items/earthworm_bait', weight: 0.14,
        description: '해류가 바뀔 때마다 스스로 꼬임을 바꾸는 질긴 심해 식물 섬유.',
        tags: [GameTags.MATERIAL_ECLIPSE_TRENCH, GameTags.PROPERTY_NATURAL, GameTags.PROPERTY_WATER],
    },
    {
        id: 'tide_sigil', name: '조류인장', image: 'items/gold_ore', weight: 0.25,
        description: '백야성소의 수문과 조류를 통제하던 의식용 금속 인장.',
        tags: [GameTags.MATERIAL_ECLIPSE_TRENCH, GameTags.PROPERTY_METAL, GameTags.PROPERTY_LIGHT],
    },
] as const) defineItem({
    id: material.id,
    name: material.name,
    description: material.description,
    image: material.image,
    category: '해구 소재',
    weight: material.weight,
    stackable: true,
    maxStack: 99,
    baseMetadata: null,
    onUse: null,
    equipSlot: null,
    modifiers: null,
    baseDurability: null,
    tags: [...material.tags],
});

defineItem({
    id: 'eclipse_ration', name: '월식 해초말이',
    description: '해구섬유의 연한 속살과 월염수를 말려 만든 보존식. 배고픔 125와 수분 90을 회복한다.',
    image: 'items/traveler_bread', category: '음식', weight: 0.55, stackable: true, maxStack: 30,
    baseMetadata: { hunger: 125, thirst: 90, time: 1.1, useMessage: '월식 해초말이의 봉인을 푸는 중...' },
    onUse: 'restore_survival', equipSlot: null, modifiers: null, baseDurability: null,
    tags: [GameTags.ITEM_CONSUMABLE, GameTags.MATERIAL_ECLIPSE_TRENCH, GameTags.PROPERTY_WATER],
});

defineItem({
    id: 'tideheart_tonic', name: '조류심장 영약',
    description: '밤진주에 응축한 월염수를 녹여 55초 동안 강한 정신력 재생을 부여한다.',
    image: 'items/arcane_tonic', category: '소모품', weight: 0.34, stackable: true, maxStack: 20,
    baseMetadata: { [ItemMetadataKeys.STATUS_EFFECT]: { id: 'mentality_regeneration', level: 16, duration: 55 } },
    onUse: 'apply_status_effect', equipSlot: null, modifiers: null, baseDurability: null,
    tags: [GameTags.ITEM_CONSUMABLE, GameTags.MATERIAL_ECLIPSE_TRENCH, GameTags.PROPERTY_WATER],
});

defineItem({
    id: 'drowned_edge', name: '침은 파도검',
    description: '침은의 무게를 칼날 앞쪽에 모아 해류처럼 연속되는 타격을 만드는 장검.',
    image: 'items/windsteel_sword', category: '장검', weight: 4.8, stackable: false, maxStack: 1,
    baseMetadata: null, onUse: null, equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'atk', op: 'add', value: 338, source: '' },
        { attribute: 'armorPen', op: 'add', value: 88, source: '' },
        { attribute: 'attackSpeed', op: 'multiply', value: 1.12, source: '' },
    ],
    baseDurability: 735,
    tags: [GameTags.ITEM_WEAPON, GameTags.WEAPON_SWORD, GameTags.MATERIAL_ECLIPSE_TRENCH, GameTags.PROPERTY_METAL, GameTags.PROPERTY_WATER],
    balance: { role: ItemBalanceRole.WEAPON, attackType: 'physical', recommendedJobIds: ['career:warrior'] },
});

defineItem({
    id: 'mooncurrent_bow', name: '월조류 장궁',
    description: '해구섬유로 만든 활시위가 주변 조류를 밀어내 화살의 초가속을 유지하는 장궁.',
    image: 'items/stormstring_bow', category: '활', weight: 3.2, stackable: false, maxStack: 1,
    baseMetadata: {
        [ItemMetadataKeys.BASIC_ATTACK_OVERRIDE]: ItemAttackOverrideKeys.PROJECTILE,
        [ItemMetadataKeys.PROJECTILE_ATTACK]: { ammunitionItemId: 'wooden_arrow' },
    },
    onUse: null, equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'atk', op: 'add', value: 275, source: '' },
        { attribute: 'critRate', op: 'add', value: 0.14, source: '' },
        { attribute: 'projectileAcceleration', op: 'multiply', value: 1.82, source: '' },
    ],
    baseDurability: 700,
    tags: [GameTags.ITEM_WEAPON, GameTags.WEAPON_BOW, GameTags.MATERIAL_ECLIPSE_TRENCH, GameTags.PROPERTY_WATER, GameTags.PROPERTY_LIGHT],
    balance: { role: ItemBalanceRole.WEAPON, attackType: 'physical', recommendedJobIds: ['career:archer'] },
});

defineItem({
    id: 'nightpearl_knife', name: '밤진주 잠행도',
    description: '밤진주의 빛을 칼등에 가두고 칼끝만 어둠 속에 남기는 침은 단검.',
    image: 'items/nightglass_dagger', category: '단검', weight: 1.6, stackable: false, maxStack: 1,
    baseMetadata: null, onUse: null, equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'atk', op: 'add', value: 298, source: '' },
        { attribute: 'armorPen', op: 'add', value: 96, source: '' },
        { attribute: 'critDmg', op: 'add', value: 0.44, source: '' },
        { attribute: 'speed', op: 'add', value: 0.21, source: '' },
    ],
    baseDurability: 640,
    tags: [GameTags.ITEM_WEAPON, GameTags.WEAPON_DAGGER, GameTags.MATERIAL_ECLIPSE_TRENCH, GameTags.PROPERTY_DARK],
    balance: { role: ItemBalanceRole.WEAPON, attackType: 'physical', recommendedJobIds: ['career:assassin'] },
});

defineItem({
    id: 'eclipse_oracle_staff', name: '월식 예언봉',
    description: '밤진주와 조류인장을 겹쳐 빛과 어둠의 마력을 같은 파동으로 발사하는 지팡이.',
    image: 'items/starwood_staff', category: '지팡이', weight: 3.3, stackable: false, maxStack: 1,
    baseMetadata: {
        [ItemMetadataKeys.BASIC_ATTACK_OVERRIDE]: ItemAttackOverrideKeys.PROJECTILE,
        [ItemMetadataKeys.PROJECTILE_ATTACK]: {
            projectile: {
                dataId: 'basic_magic_orb',
                overrides: { tags: [GameTags.PROPERTY_WATER, GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_DARK] },
            },
        },
    },
    onUse: null, equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'magicForce', op: 'add', value: 390, source: '' },
        { attribute: 'magicPen', op: 'add', value: 102, source: '' },
        { attribute: 'mentalityRegen', op: 'add', value: 16, source: '' },
        { attribute: 'projectileAcceleration', op: 'multiply', value: 1.88, source: '' },
    ],
    baseDurability: 755,
    tags: [GameTags.ITEM_WEAPON, GameTags.WEAPON_STAFF, GameTags.MATERIAL_ECLIPSE_TRENCH, GameTags.PROPERTY_WATER, GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_DARK],
    balance: { role: ItemBalanceRole.WEAPON, attackType: 'magic', recommendedJobIds: ['career:mage'] },
});

defineItem({
    id: 'white_night_bulwark', name: '백야 조류방패',
    description: '월식비늘 사이로 충격을 순환시켜 물리 피해와 마법 피해를 번갈아 흘려보내는 방패.',
    image: 'items/forged_shield', category: '방패', weight: 5.2, stackable: false, maxStack: 1,
    baseMetadata: null, onUse: null, equipSlot: 'offHand',
    modifiers: [
        { attribute: 'def', op: 'add', value: 108, source: '' },
        { attribute: 'magicDef', op: 'add', value: 114, source: '' },
        { attribute: 'maxLife', op: 'add', value: 1_520, source: '' },
    ],
    baseDurability: 850,
    tags: [GameTags.ITEM_ARMOR, GameTags.MATERIAL_ECLIPSE_TRENCH, GameTags.PROPERTY_WATER, GameTags.PROPERTY_LIGHT],
    balance: { role: ItemBalanceRole.DEFENSE, recommendedJobIds: ['career:warrior', 'career:blacksmith'] },
});

for (const book of [
    { id: 'undertow_step_skillbook', name: '역조보법 전승서', skillDataId: 'undertow_step', property: GameTags.PROPERTY_WATER },
    { id: 'eclipse_verdict_skillbook', name: '월식선고 전승서', skillDataId: 'eclipse_verdict', property: GameTags.PROPERTY_DARK },
] as const) defineItem({
    id: book.id,
    name: book.name,
    description: `월식해구와 백야성소의 전투 의식이 기록된 전승서. 사용하면 스킬 [ ${book.name.replace(' 전승서', '')} ] 을(를) 획득합니다.`,
    image: 'items/seismic_crush_skillbook', category: '스킬북', weight: 0.3, stackable: true, maxStack: 10,
    baseMetadata: { skillDataId: book.skillDataId }, onUse: 'learn_skill', equipSlot: null,
    modifiers: null, baseDurability: null,
    tags: [GameTags.ITEM_CONSUMABLE, GameTags.ITEM_SKILL_BOOK, GameTags.MATERIAL_ECLIPSE_TRENCH, book.property],
});

// TODO(icons): 역근수해 전용 아트 제작 전까지 자연·땅·빛 계열 소재와 장비 fallback을 사용한다.
for (const material of [
    {
        id: 'skyroot_bark', name: '천근수피', image: 'items/earthworm_bait', weight: 0.64,
        description: '하늘에서 아래로 자라는 역근의 바깥을 감싼 청회색 수피.',
        tags: [GameTags.MATERIAL_WORLDROOT, GameTags.PROPERTY_NATURAL, GameTags.PROPERTY_EARTH],
    },
    {
        id: 'primal_sap', name: '태초수액', image: 'items/health_potion', weight: 0.32,
        description: '세계수가 처음 싹튼 순간의 생명력이 아직도 맥동하는 푸른 수액.',
        tags: [GameTags.MATERIAL_WORLDROOT, GameTags.PROPERTY_NATURAL, GameTags.PROPERTY_LIGHT],
    },
    {
        id: 'memory_amber', name: '기억호박', image: 'items/resonance_evasion_shard', weight: 0.28,
        description: '수해를 지나간 생명의 기억을 얇은 결로 보존하는 황금빛 호박.',
        tags: [GameTags.MATERIAL_WORLDROOT, GameTags.PROPERTY_NATURAL, GameTags.PROPERTY_LIGHT],
    },
    {
        id: 'rot_spore', name: '망각포자', image: 'items/earthworm_bait', weight: 0.12,
        description: '기억과 생기를 천천히 분해해 새로운 흙으로 돌려보내는 검은 포자.',
        tags: [GameTags.MATERIAL_WORLDROOT, GameTags.PROPERTY_POISON, GameTags.PROPERTY_DARK],
    },
    {
        id: 'heart_seed', name: '심장씨앗', image: 'items/refined_emerald', weight: 0.24,
        description: '태초심장의 박동 하나를 씨앗껍질 안에 가둔 희귀한 생명 결정.',
        tags: [GameTags.MATERIAL_WORLDROOT, GameTags.PROPERTY_NATURAL, GameTags.PROPERTY_HOLY],
    },
    {
        id: 'rootbone_iron', name: '근골철', image: 'items/refined_iron', weight: 0.86,
        description: '오래된 뿌리뼈와 금속 광맥이 한 덩어리로 굳은 역근수해의 합금.',
        tags: [GameTags.MATERIAL_WORLDROOT, GameTags.PROPERTY_METAL, GameTags.PROPERTY_EARTH],
    },
] as const) defineItem({
    id: material.id,
    name: material.name,
    description: material.description,
    image: material.image,
    category: '역근 소재',
    weight: material.weight,
    stackable: true,
    maxStack: 99,
    baseMetadata: null,
    onUse: null,
    equipSlot: null,
    modifiers: null,
    baseDurability: null,
    tags: [...material.tags],
});

defineItem({
    id: 'worldroot_ration', name: '천근수피 빵',
    description: '천근수피 속살과 태초수액을 구워 만든 단단한 보존식. 배고픔 145와 수분 70을 회복한다.',
    image: 'items/traveler_bread', category: '음식', weight: 0.58, stackable: true, maxStack: 30,
    baseMetadata: { hunger: 145, thirst: 70, time: 1.1, useMessage: '천근수피 빵의 단단한 껍질을 자르는 중...' },
    onUse: 'restore_survival', equipSlot: null, modifiers: null, baseDurability: null,
    tags: [GameTags.ITEM_CONSUMABLE, GameTags.MATERIAL_WORLDROOT, GameTags.PROPERTY_NATURAL],
});

defineItem({
    id: 'primordial_draught', name: '태초맥 영약',
    description: '태초수액과 심장씨앗의 맥동을 안정시켜 60초 동안 강한 재생 효과를 부여한다.',
    image: 'items/health_potion', category: '소모품', weight: 0.36, stackable: true, maxStack: 20,
    baseMetadata: { [ItemMetadataKeys.STATUS_EFFECT]: { id: 'regeneration', level: 18, duration: 60 } },
    onUse: 'apply_status_effect', equipSlot: null, modifiers: null, baseDurability: null,
    tags: [GameTags.ITEM_CONSUMABLE, GameTags.MATERIAL_WORLDROOT, GameTags.PROPERTY_NATURAL, GameTags.PROPERTY_HOLY],
});

defineItem({
    id: 'rootbone_cleaver', name: '근골철 수맥검',
    description: '근골철의 결을 뿌리 방향으로 세워 방어를 가르고 생명맥을 끊는 장검.',
    image: 'items/windsteel_sword', category: '장검', weight: 5, stackable: false, maxStack: 1,
    baseMetadata: null, onUse: null, equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'atk', op: 'add', value: 392, source: '' },
        { attribute: 'armorPen', op: 'add', value: 104, source: '' },
        { attribute: 'critDmg', op: 'add', value: 0.32, source: '' },
    ],
    baseDurability: 810,
    tags: [GameTags.ITEM_WEAPON, GameTags.WEAPON_SWORD, GameTags.MATERIAL_WORLDROOT, GameTags.PROPERTY_METAL, GameTags.PROPERTY_EARTH],
    balance: { role: ItemBalanceRole.WEAPON, attackType: 'physical', recommendedJobIds: ['career:warrior'] },
});

defineItem({
    id: 'heartstring_greatbow', name: '심장현 대궁',
    description: '심장씨앗의 맥동을 활시위에 옮겨 화살이 목표에 가까워질수록 더 빠르게 당겨지는 대궁.',
    image: 'items/stormstring_bow', category: '활', weight: 3.35, stackable: false, maxStack: 1,
    baseMetadata: {
        [ItemMetadataKeys.BASIC_ATTACK_OVERRIDE]: ItemAttackOverrideKeys.PROJECTILE,
        [ItemMetadataKeys.PROJECTILE_ATTACK]: { ammunitionItemId: 'wooden_arrow' },
    },
    onUse: null, equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'atk', op: 'add', value: 318, source: '' },
        { attribute: 'critRate', op: 'add', value: 0.15, source: '' },
        { attribute: 'projectileAcceleration', op: 'multiply', value: 2.02, source: '' },
    ],
    baseDurability: 770,
    tags: [GameTags.ITEM_WEAPON, GameTags.WEAPON_BOW, GameTags.MATERIAL_WORLDROOT, GameTags.PROPERTY_NATURAL, GameTags.PROPERTY_LIGHT],
    balance: { role: ItemBalanceRole.WEAPON, attackType: 'physical', recommendedJobIds: ['career:archer'] },
});

defineItem({
    id: 'amber_memory_fang', name: '기억호박 송곳니',
    description: '기억호박에 남은 사냥의 순간을 칼끝으로 재생하는 짧은 근골철 단검.',
    image: 'items/nightglass_dagger', category: '단검', weight: 1.65, stackable: false, maxStack: 1,
    baseMetadata: null, onUse: null, equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'atk', op: 'add', value: 346, source: '' },
        { attribute: 'armorPen', op: 'add', value: 112, source: '' },
        { attribute: 'critDmg', op: 'add', value: 0.5, source: '' },
        { attribute: 'speed', op: 'add', value: 0.24, source: '' },
    ],
    baseDurability: 705,
    tags: [GameTags.ITEM_WEAPON, GameTags.WEAPON_DAGGER, GameTags.MATERIAL_WORLDROOT, GameTags.PROPERTY_NATURAL, GameTags.PROPERTY_LIGHT],
    balance: { role: ItemBalanceRole.WEAPON, attackType: 'physical', recommendedJobIds: ['career:assassin'] },
});

defineItem({
    id: 'origin_heart_staff', name: '기원심장 지팡이',
    description: '태초수액의 맥동을 기억호박에 순환시켜 생명과 신성 마력을 한 점으로 모으는 지팡이.',
    image: 'items/starwood_staff', category: '지팡이', weight: 3.45, stackable: false, maxStack: 1,
    baseMetadata: {
        [ItemMetadataKeys.BASIC_ATTACK_OVERRIDE]: ItemAttackOverrideKeys.PROJECTILE,
        [ItemMetadataKeys.PROJECTILE_ATTACK]: {
            projectile: {
                dataId: 'basic_magic_orb',
                overrides: { tags: [GameTags.PROPERTY_NATURAL, GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_HOLY] },
            },
        },
    },
    onUse: null, equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'magicForce', op: 'add', value: 455, source: '' },
        { attribute: 'magicPen', op: 'add', value: 118, source: '' },
        { attribute: 'mentalityRegen', op: 'add', value: 19, source: '' },
        { attribute: 'projectileAcceleration', op: 'multiply', value: 2.08, source: '' },
    ],
    baseDurability: 825,
    tags: [GameTags.ITEM_WEAPON, GameTags.WEAPON_STAFF, GameTags.MATERIAL_WORLDROOT, GameTags.PROPERTY_NATURAL, GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_HOLY],
    balance: { role: ItemBalanceRole.WEAPON, attackType: 'magic', recommendedJobIds: ['career:mage'] },
});

defineItem({
    id: 'canopy_heartshield', name: '천개심 방패',
    description: '천근수피와 근골철 사이에서 태초수액이 순환해 충격을 생명력으로 흩어 보내는 방패.',
    image: 'items/forged_shield', category: '방패', weight: 5.4, stackable: false, maxStack: 1,
    baseMetadata: null, onUse: null, equipSlot: 'offHand',
    modifiers: [
        { attribute: 'def', op: 'add', value: 126, source: '' },
        { attribute: 'magicDef', op: 'add', value: 132, source: '' },
        { attribute: 'maxLife', op: 'add', value: 1_820, source: '' },
        { attribute: 'lifeRegen', op: 'add', value: 8, source: '' },
    ],
    baseDurability: 930,
    tags: [GameTags.ITEM_ARMOR, GameTags.MATERIAL_WORLDROOT, GameTags.PROPERTY_NATURAL, GameTags.PROPERTY_EARTH],
    balance: { role: ItemBalanceRole.DEFENSE, recommendedJobIds: ['career:warrior', 'career:blacksmith'] },
});

for (const book of [
    { id: 'rootbreaker_descent_skillbook', name: '역근강하 전승서', skillDataId: 'rootbreaker_descent', property: GameTags.PROPERTY_EARTH },
    { id: 'primordial_sanctuary_skillbook', name: '태초성역 전승서', skillDataId: 'primordial_sanctuary', property: GameTags.PROPERTY_HOLY },
] as const) defineItem({
    id: book.id,
    name: book.name,
    description: `역근수해와 태초심장의 전투 의식이 기록된 전승서. 사용하면 스킬 [ ${book.name.replace(' 전승서', '')} ] 을(를) 획득합니다.`,
    image: 'items/seismic_crush_skillbook', category: '스킬북', weight: 0.3, stackable: true, maxStack: 10,
    baseMetadata: { skillDataId: book.skillDataId }, onUse: 'learn_skill', equipSlot: null,
    modifiers: null, baseDurability: null,
    tags: [GameTags.ITEM_CONSUMABLE, GameTags.ITEM_SKILL_BOOK, GameTags.MATERIAL_WORLDROOT, book.property],
});
