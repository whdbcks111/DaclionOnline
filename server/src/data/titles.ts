import { AttributeType } from '../models/Attribute.js';
import { CombatStage, registerCombatHook } from '../models/CombatPipeline.js';
import { GameEventIds } from '../models/GameEvent.js';
import { defineStatistic } from '../models/Progress.js';
import { StatType } from '../models/Stat.js';
import { defineTitle } from '../models/Title.js';
import type Player from '../models/Player.js';
import { GameTags } from '../../../shared/tags.js';
import { LegacyStatusEffects } from './statusEffects.js';

const TitleStatisticIds = Object.freeze({
    WOLF_KILLS: 'title-stat:kills/wolf',
    UNDEAD_KILLS: 'title-stat:kills/undead',
    INSECT_KILLS: 'title-stat:kills/insect',
    SLIME_KILLS: 'title-stat:kills/slime',
    BOSS_KILLS: 'title-stat:kills/boss',
    PICKAXE_HITS: 'title-stat:hits/pickaxe',
    UNARMED_HITS: 'title-stat:hits/unarmed',
    ORE_DESTROYED: 'title-stat:resources/ore',
    FISH_CAUGHT: 'title-stat:fishing/caught',
    MYTHIC_FISH_CAUGHT: 'title-stat:fishing/mythic',
    ITEMS_FORGED: 'title-stat:forging/completed',
});

function defineKillStatistic(id: string, label: string, tag: string): void {
    defineStatistic({
        id,
        eventId: GameEventIds.ENTITY_DEFEATED,
        label,
        description: '칭호 획득 조건에 사용하는 숨겨진 몬스터 처치 통계입니다.',
        visible: false,
        amount: event => event.subject?.hasTag(GameTags.ENTITY_MONSTER)
            && event.subject.hasTag(tag) ? 1 : 0,
        format: value => `${value}마리`,
    });
}

defineKillStatistic(TitleStatisticIds.WOLF_KILLS, '늑대 처치', GameTags.ENTITY_WOLF);
defineKillStatistic(TitleStatisticIds.UNDEAD_KILLS, '언데드 처치', GameTags.PROPERTY_UNDEAD);
defineKillStatistic(TitleStatisticIds.INSECT_KILLS, '벌레 처치', GameTags.PROPERTY_INSECT);
defineKillStatistic(TitleStatisticIds.SLIME_KILLS, '슬라임 처치', GameTags.ENTITY_SLIME);
defineKillStatistic(TitleStatisticIds.BOSS_KILLS, '보스 처치', GameTags.ENTITY_BOSS);

for (const statistic of [
    { id: TitleStatisticIds.PICKAXE_HITS, label: '곡괭이 적중', weaponType: 'pickaxe' },
    { id: TitleStatisticIds.UNARMED_HITS, label: '맨손 적중', weaponType: 'unarmed' },
] as const) defineStatistic({
    id: statistic.id,
    eventId: GameEventIds.ATTACK_HIT,
    label: statistic.label,
    description: '칭호 획득 조건에 사용하는 숨겨진 공격 통계입니다.',
    visible: false,
    amount: event => event.data.weaponType === statistic.weaponType ? 1 : 0,
    format: value => `${value}회`,
});

defineStatistic({
    id: TitleStatisticIds.ORE_DESTROYED,
    eventId: GameEventIds.RESOURCE_DESTROYED,
    label: '광석 파괴',
    description: '칭호 획득 조건에 사용하는 숨겨진 채광 통계입니다.',
    visible: false,
    amount: event => event.subject?.hasTag(GameTags.RESOURCE_ORE) ? 1 : 0,
    format: value => `${value}개`,
});

defineStatistic({
    id: TitleStatisticIds.FISH_CAUGHT,
    eventId: GameEventIds.FISH_CAUGHT,
    label: '낚은 물고기',
    description: '칭호 획득 조건에 사용하는 숨겨진 낚시 통계입니다.',
    visible: false,
    format: value => `${value}마리`,
});

defineStatistic({
    id: TitleStatisticIds.MYTHIC_FISH_CAUGHT,
    eventId: GameEventIds.FISH_CAUGHT,
    label: '신화 물고기',
    description: '칭호 획득 조건에 사용하는 숨겨진 신화 물고기 통계입니다.',
    visible: false,
    amount: event => event.data.rarity === 'mythic' ? 1 : 0,
    format: value => `${value}마리`,
});

defineStatistic({
    id: TitleStatisticIds.ITEMS_FORGED,
    eventId: GameEventIds.ITEM_FORGED,
    label: '단조 완료',
    description: '칭호 획득 조건에 사용하는 숨겨진 단조 통계입니다.',
    visible: false,
    format: value => `${value}회`,
});

function counter(player: Player, id: string): number {
    return player.progress.getCounterNumber(id);
}

function livingTarget(player: Player) {
    const target = player.currentTarget;
    return target && !target.isDefeated && target.locationId === player.locationId ? target : null;
}

function targetHas(tag: string) {
    return (player: Player) => Boolean(livingTarget(player)?.hasTag(tag));
}

function mainHandHas(player: Player, tag: string): boolean {
    return player.equipment.hasEquippedItemTag('mainHand', tag);
}

defineTitle({
    id: 'title:wolf_slayer',
    name: '늑대 학살자',
    aliases: ['늑대학살자'],
    acquisitionDescription: '늑대 몬스터 50마리 처치',
    description: '늑대를 대상으로 지정 중이면 공격력과 마법력이 5% 증가합니다.',
    canAcquire: player => counter(player, TitleStatisticIds.WOLF_KILLS) >= 50,
    isPassiveActive: targetHas(GameTags.ENTITY_WOLF),
    modifiers: () => [
        { attribute: AttributeType.ATK.key, op: 'multiply', value: 1.05 },
        { attribute: AttributeType.MAGIC_FORCE.key, op: 'multiply', value: 1.05 },
    ],
});

defineTitle({
    id: 'title:undead_killer',
    name: '언데드 킬러',
    acquisitionDescription: '언데드 몬스터 200마리 처치',
    description: '언데드를 대상으로 지정 중이면 치명타 확률이 5%p 증가합니다.',
    canAcquire: player => counter(player, TitleStatisticIds.UNDEAD_KILLS) >= 200,
    isPassiveActive: targetHas(GameTags.PROPERTY_UNDEAD),
    modifiers: () => [{ attribute: AttributeType.CRIT_RATE.key, op: 'add', value: 0.05 }],
});

defineTitle({
    id: 'title:undead_slayer',
    name: '언데드 슬레이어',
    acquisitionDescription: '언데드 몬스터 1,000마리 처치',
    description: '언데드를 대상으로 지정 중이면 치명타 확률이 10%p 증가합니다.',
    canAcquire: player => counter(player, TitleStatisticIds.UNDEAD_KILLS) >= 1_000,
    isPassiveActive: targetHas(GameTags.PROPERTY_UNDEAD),
    modifiers: () => [{ attribute: AttributeType.CRIT_RATE.key, op: 'add', value: 0.1 }],
});

defineTitle({
    id: 'title:insect_hunter',
    name: '벌레 사냥꾼',
    acquisitionDescription: '벌레 속성 몬스터 500마리 처치',
    description: '벌레 속성 대상을 지정 중이면 치명타 피해가 10% 증가합니다.',
    canAcquire: player => counter(player, TitleStatisticIds.INSECT_KILLS) >= 500,
    isPassiveActive: targetHas(GameTags.PROPERTY_INSECT),
    modifiers: () => [{ attribute: AttributeType.CRIT_DMG.key, op: 'multiply', value: 1.1 }],
});

defineTitle({
    id: 'title:flame_collector',
    name: '불꽃 수집가',
    acquisitionDescription: '불 속성 몬스터 200마리 처치',
    description: '불 속성 대상을 지정 중이면 치명타 피해가 10% 증가합니다.',
    canAcquire: player => counter(player, 'career:mage_fire_kills') >= 200,
    isPassiveActive: targetHas(GameTags.PROPERTY_FIRE),
    modifiers: () => [{ attribute: AttributeType.CRIT_DMG.key, op: 'multiply', value: 1.1 }],
});

defineTitle({
    id: 'title:pickaxe_slayer',
    name: '곡괭이 살해자',
    acquisitionDescription: '곡괭이 공격 200회 적중',
    description: '곡괭이 직접 공격이 적중하면 10% 확률로 대상을 1초간 기절시킵니다.',
    canAcquire: player => counter(player, TitleStatisticIds.PICKAXE_HITS) >= 200,
    isPassiveActive: player => mainHandHas(player, GameTags.TOOL_MINING),
    onCombatAfterDamage: (player, context) => {
        if (context.attacker !== player || !context.result || context.result.finalDamage <= 0 || Math.random() >= 0.1) return;
        context.target.applyStatusEffect(LegacyStatusEffects.STUN, 1, 1);
    },
});

defineTitle({
    id: 'title:axe_fighter',
    name: '액스 파이터',
    acquisitionDescription: '도끼 공격 500회 적중',
    description: '도끼 직접 공격이 적중하면 30% 확률로 대상에게 5초간 출혈을 부여합니다.',
    canAcquire: player => counter(player, 'combat:weapon_hits/axe') >= 500,
    isPassiveActive: player => mainHandHas(player, GameTags.WEAPON_AXE),
    onCombatAfterDamage: (player, context) => {
        if (context.attacker !== player || !context.result || context.result.finalDamage <= 0 || Math.random() >= 0.3) return;
        context.target.applyStatusEffect(LegacyStatusEffects.BLEEDING, 5, 1);
    },
});

defineTitle({
    id: 'title:martial_artist',
    name: '격투가',
    acquisitionDescription: '맨손 공격 100회 적중',
    description: '주무기를 장착하지 않은 동안 공격력이 30% 증가합니다.',
    canAcquire: player => counter(player, TitleStatisticIds.UNARMED_HITS) >= 100,
    isPassiveActive: player => !player.equipment.getEquipped('mainHand'),
    modifiers: () => [{ attribute: AttributeType.ATK.key, op: 'multiply', value: 1.3 }],
});

defineTitle({
    id: 'title:path_of_miner',
    name: '광부의 길',
    acquisitionDescription: '곡괭이 공격 200회 적중',
    description: '곡괭이를 장착한 동안 획득 경험치가 5% 증가합니다.',
    canAcquire: player => counter(player, TitleStatisticIds.PICKAXE_HITS) >= 200,
    isPassiveActive: player => mainHandHas(player, GameTags.TOOL_MINING),
    experienceGainMultiplier: () => 1.05,
});

defineTitle({
    id: 'title:slayer',
    name: '학살자',
    acquisitionDescription: 'PVP에서 유효 플레이어 처치 100회',
    description: '플레이어를 대상으로 지정 중이면 치명타 피해가 5% 증가합니다.',
    canAcquire: player => counter(player, 'combat:pvp_credited_kills') >= 100,
    isPassiveActive: targetHas(GameTags.ENTITY_PLAYER),
    modifiers: () => [{ attribute: AttributeType.CRIT_DMG.key, op: 'multiply', value: 1.05 }],
});

defineTitle({
    id: 'title:annihilator',
    name: '몰살자',
    acquisitionDescription: 'PVP에서 유효 플레이어 처치 500회',
    description: '플레이어를 대상으로 지정 중이면 치명타 확률이 5%p 증가합니다.',
    canAcquire: player => counter(player, 'combat:pvp_credited_kills') >= 500,
    isPassiveActive: targetHas(GameTags.ENTITY_PLAYER),
    modifiers: () => [{ attribute: AttributeType.CRIT_RATE.key, op: 'add', value: 0.05 }],
});

defineTitle({
    id: 'title:arcspell',
    name: '아크스펠',
    acquisitionDescription: '정신력 스탯 500 달성',
    description: '대상의 마법 저항력이 방어력보다 높으면 마법력이 15% 증가합니다.',
    canAcquire: player => player.stat.get(StatType.MENTALITY) >= 500,
    isPassiveActive: player => {
        const target = livingTarget(player);
        return Boolean(target && target.attribute.get(AttributeType.MAGIC_DEF) > target.attribute.get(AttributeType.DEF));
    },
    modifiers: () => [{ attribute: AttributeType.MAGIC_FORCE.key, op: 'multiply', value: 1.15 }],
});

defineTitle({
    id: 'title:mage',
    name: '마도사',
    acquisitionDescription: '정신력 스탯 300 달성',
    description: '마법력이 3% 증가합니다.',
    canAcquire: player => player.stat.get(StatType.MENTALITY) >= 300,
    modifiers: () => [{ attribute: AttributeType.MAGIC_FORCE.key, op: 'multiply', value: 1.03 }],
});

defineTitle({
    id: 'title:rapid_fire',
    name: '속사',
    acquisitionDescription: '민첩 스탯 500 달성',
    description: '현재 공격력의 5%만큼 물리 관통력이 증가합니다.',
    canAcquire: player => player.stat.get(StatType.AGILITY) >= 500,
    modifiers: player => [{
        attribute: AttributeType.ARMOR_PEN.key,
        op: 'add',
        value: player.attribute.get(AttributeType.ATK) * 0.05,
    }],
});

defineTitle({
    id: 'title:fatal_deed',
    name: '페이탈디드',
    acquisitionDescription: '궁수 또는 암살자 직업을 가진 상태로 감각 스탯 500 달성',
    description: '치명타 확률이 3%p 증가합니다.',
    canAcquire: player => player.stat.get(StatType.SENSIBILITY) >= 500
        && (player.career.hasJob('career:archer') || player.career.hasJob('career:assassin')),
    modifiers: () => [{ attribute: AttributeType.CRIT_RATE.key, op: 'add', value: 0.03 }],
});

defineTitle({
    id: 'title:super_sense',
    name: '초감각',
    acquisitionDescription: '대장장이 직업을 가진 상태로 감각 스탯 1,000 달성',
    description: '제련 정밀도가 7% 증가합니다.',
    canAcquire: player => player.stat.get(StatType.SENSIBILITY) >= 1_000
        && player.career.hasJob('career:blacksmith'),
    modifiers: () => [{ attribute: AttributeType.FORGING_PRECISION.key, op: 'multiply', value: 1.07 }],
});

defineTitle({
    id: 'title:slime_researcher',
    name: '슬라임 연구가',
    acquisitionDescription: '슬라임 100마리 처치',
    description: '슬라임을 대상으로 지정 중이면 공격력과 마법력이 4% 증가합니다.',
    canAcquire: player => counter(player, TitleStatisticIds.SLIME_KILLS) >= 100,
    isPassiveActive: targetHas(GameTags.ENTITY_SLIME),
    modifiers: () => [
        { attribute: AttributeType.ATK.key, op: 'multiply', value: 1.04 },
        { attribute: AttributeType.MAGIC_FORCE.key, op: 'multiply', value: 1.04 },
    ],
});

defineTitle({
    id: 'title:boss_challenger',
    name: '거인에게 맞서는 자',
    acquisitionDescription: '보스 몬스터 25마리 처치',
    description: '보스를 대상으로 지정 중이면 공격력과 마법력이 5% 증가합니다.',
    canAcquire: player => counter(player, TitleStatisticIds.BOSS_KILLS) >= 25,
    isPassiveActive: targetHas(GameTags.ENTITY_BOSS),
    modifiers: () => [
        { attribute: AttributeType.ATK.key, op: 'multiply', value: 1.05 },
        { attribute: AttributeType.MAGIC_FORCE.key, op: 'multiply', value: 1.05 },
    ],
});

defineTitle({
    id: 'title:vein_reader',
    name: '광맥을 읽는 자',
    acquisitionDescription: '광석 자원 300개 파괴',
    description: '제련 정밀도가 5% 증가하고 행운이 5 증가합니다.',
    canAcquire: player => counter(player, TitleStatisticIds.ORE_DESTROYED) >= 300,
    modifiers: () => [
        { attribute: AttributeType.FORGING_PRECISION.key, op: 'multiply', value: 1.05 },
        { attribute: AttributeType.LUCK.key, op: 'add', value: 5 },
    ],
});

defineTitle({
    id: 'title:legendary_angler',
    name: '전설을 낚은 자',
    acquisitionDescription: '물고기 100마리와 신화 등급 물고기 1마리 낚기',
    description: '행운이 10 증가하고 입질 속도가 5% 증가합니다.',
    canAcquire: player => counter(player, TitleStatisticIds.FISH_CAUGHT) >= 100
        && counter(player, TitleStatisticIds.MYTHIC_FISH_CAUGHT) >= 1,
    modifiers: () => [
        { attribute: AttributeType.LUCK.key, op: 'add', value: 10 },
        { attribute: AttributeType.FISHING_BITE_SPEED.key, op: 'multiply', value: 1.05 },
    ],
});

defineTitle({
    id: 'title:master_forge',
    name: '불꽃과 망치의 주인',
    acquisitionDescription: '장비 단조 100회 완료',
    description: '제련 정밀도가 5% 증가하고 치명타 피해가 5% 증가합니다.',
    canAcquire: player => counter(player, TitleStatisticIds.ITEMS_FORGED) >= 100,
    modifiers: () => [
        { attribute: AttributeType.FORGING_PRECISION.key, op: 'multiply', value: 1.05 },
        { attribute: AttributeType.CRIT_DMG.key, op: 'multiply', value: 1.05 },
    ],
});

defineTitle({
    id: 'title:elemental_tuner',
    name: '삼원소 조율자',
    acquisitionDescription: '불·얼음·전기 속성 몬스터를 각각 100마리 처치',
    description: '원소 몬스터를 대상으로 지정 중이면 마법력이 7% 증가합니다.',
    canAcquire: player => counter(player, 'career:mage_fire_kills') >= 100
        && counter(player, 'career:mage_ice_kills') >= 100
        && counter(player, 'career:mage_electric_kills') >= 100,
    isPassiveActive: player => {
        const target = livingTarget(player);
        return Boolean(target && [
            GameTags.PROPERTY_FIRE,
            GameTags.PROPERTY_ICE,
            GameTags.PROPERTY_ELECTRIC,
        ].some(tag => target.hasTag(tag)));
    },
    modifiers: () => [{ attribute: AttributeType.MAGIC_FORCE.key, op: 'multiply', value: 1.07 }],
});

for (const stage of [CombatStage.PREPARE, CombatStage.AFTER_DAMAGE]) registerCombatHook({
    key: `title:equipped:${stage.key}`,
    stage,
    priority: stage === CombatStage.PREPARE ? -50 : 50,
    filter: context => context.attackOwner.isPlayer,
    run: context => {
        const player = context.attackOwner as Player;
        player.titles?.applyCombat(stage, context);
    },
});
