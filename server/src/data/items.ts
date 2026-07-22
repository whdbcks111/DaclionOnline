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
