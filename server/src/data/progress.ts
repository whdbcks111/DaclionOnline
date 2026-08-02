import './tagEffects.js';
import { defineProgress, defineStatistic, ProgressType } from '../models/Progress.js';
import { GameEventIds } from '../models/GameEvent.js';
import { getTagEffectTagDisplay } from '../models/TagEffect.js';
import { GameTags } from '../../../shared/tags.js';
import { defineFishingCollection } from '../models/FishingCollection.js';
import { getFishCatalog } from './fishingCatalog.js';
import { FISHING_EQUIPMENT_TIERS } from './fishingEquipmentCatalog.js';

defineFishingCollection(
    getFishCatalog().map(fish => ({
        itemDataId: fish.id,
        name: fish.name,
        rarityKey: fish.rarity.key,
        rarityLabel: fish.rarity.label,
        rarityColor: fish.rarity.color,
    })),
    [
        {
            requiredCount: 10,
            label: '최대 경험치 10% + 5,000 Gold + 통통한 지렁이 미끼 100개',
            experienceRatio: 0.1, gold: 5_000, itemDataId: 'earthworm_bait', itemCount: 100,
            combatBonus: {
                label: '전투 강장제·비전 영약·신속의 물약 각 3개',
                items: [
                    { itemDataId: 'battle_tonic', count: 3 },
                    { itemDataId: 'arcane_tonic', count: 3 },
                    { itemDataId: 'swift_tonic', count: 3 },
                ],
            },
        },
        {
            requiredCount: 20,
            label: '최대 경험치 15% + 20,000 Gold + 태양대추 반죽미끼 100개',
            experienceRatio: 0.15, gold: 20_000,
            itemDataId: FISHING_EQUIPMENT_TIERS[0].bait.id, itemCount: 100,
            combatBonus: {
                label: '대용량 체력·마나 포션 각 3개',
                items: [
                    { itemDataId: 'large_health_potion', count: 3 },
                    { itemDataId: 'large_mana_potion', count: 3 },
                ],
            },
        },
        {
            requiredCount: 35,
            label: '최대 경험치 25% + 100,000 Gold + 태엽 반짝미끼 100개',
            experienceRatio: 0.25, gold: 100_000,
            itemDataId: FISHING_EQUIPMENT_TIERS[2].bait.id, itemCount: 100,
            combatBonus: {
                label: '도감 전용 전투 스킬 [ 은린 장막 ]',
                skillDataIds: ['silver_scale_veil'],
            },
        },
        {
            requiredCount: 50,
            label: '최대 경험치 35% + 500,000 Gold + 압해 진주미끼 100개',
            experienceRatio: 0.35, gold: 500_000,
            itemDataId: FISHING_EQUIPMENT_TIERS[5].bait.id, itemCount: 100,
            combatBonus: {
                label: '조류심장 회복약·영약 각 5개',
                items: [
                    { itemDataId: 'tideheart_draught', count: 5 },
                    { itemDataId: 'tideheart_tonic', count: 5 },
                ],
            },
        },
        {
            requiredCount: getFishCatalog().length,
            label: '최대 경험치 50% + 2,000,000 Gold + 창세빛 미끼 200개',
            experienceRatio: 0.5, gold: 2_000_000,
            itemDataId: FISHING_EQUIPMENT_TIERS.at(-1)!.bait.id, itemCount: 200,
            combatBonus: {
                label: '도감 전용 전투 스킬 [ 해연의 작살 ] + 대용량 체력·마나 포션 각 10개',
                items: [
                    { itemDataId: 'large_health_potion', count: 10 },
                    { itemDataId: 'large_mana_potion', count: 10 },
                ],
                skillDataIds: ['abyssal_harpoon'],
            },
        },
    ],
);

defineProgress({
    id: 'security:human_verification_required',
    type: ProgressType.FLAG,
    label: '사람 확인 필요',
    description: '반복 행동 검사 완료 전 재접속으로 우회하지 못하게 유지하는 운영 플래그입니다.',
    visible: false,
    tags: ['security:anti-automation'],
});

defineProgress({
    id: 'daily:commission-last-claim-day',
    type: ProgressType.STATE,
    label: '마지막 일일 의뢰 보상일',
    description: '한국 표준시 기준 하루 한 번만 성장 의뢰 보상을 받도록 마지막 수령 날짜를 보존합니다.',
    visible: false,
    tags: ['quest:daily'],
});

defineProgress({
    id: 'security:human_verification_failures',
    type: ProgressType.COUNTER,
    label: '사람 확인 실패',
    description: '사람 확인 오답 횟수를 운영 기록으로 보존합니다.',
    visible: false,
    tags: ['security:anti-automation'],
});

defineProgress({
    id: 'profession:blacksmith',
    type: ProgressType.FLAG,
    label: '구형 대장장이 전직 데이터',
    description: '정식 직업 슬롯으로 자동 이전하기 위한 호환 플래그입니다.',
    visible: false,
    tags: ['migration:legacy'],
});

defineStatistic({
    id: 'combat:critical_hits',
    eventId: GameEventIds.CRITICAL_HIT,
    label: '치명타 발동 횟수',
    description: '플레이어가 공격으로 치명타를 발동시킨 누적 횟수입니다.',
    visible: true,
    format: value => `${value}회`,
});

for (const weapon of [
    { key: 'sword', label: '검' },
    { key: 'axe', label: '도끼' },
    { key: 'bow', label: '활' },
    { key: 'dagger', label: '단검' },
    { key: 'staff', label: '지팡이' },
] as const) defineStatistic({
    id: `combat:weapon_hits/${weapon.key}`,
    eventId: GameEventIds.ATTACK_HIT,
    label: `${weapon.label} 적중 횟수`,
    description: `${weapon.label} 숙련 스킬의 숨겨진 획득 조건입니다.`,
    visible: false,
    amount: event => event.data.weaponType === weapon.key ? 1 : 0,
    format: value => `${value}회`,
});

defineStatistic({
    id: 'combat:pvp_kills',
    eventId: GameEventIds.PVP_KILL,
    label: '플레이어 처치',
    description: 'PVP에서 다른 플레이어를 처치한 누적 횟수입니다.',
    visible: true,
    format: value => `${value}회`,
});

defineStatistic({
    id: 'combat:pvp_credited_kills',
    eventId: GameEventIds.PVP_KILL,
    label: '유효 플레이어 처치',
    description: '반복 처치 방지 조건을 통과해 칭호와 긍정적 보상에 인정된 PVP 처치 횟수입니다.',
    visible: true,
    amount: event => event.data.creditEligible === true ? 1 : 0,
    format: value => `${value}회`,
});

defineStatistic({
    id: 'combat:neutral_pvp_kills',
    eventId: GameEventIds.PVP_KILL,
    label: '중립 구역 플레이어 처치',
    description: '중립 구역에서 다른 플레이어를 처치한 누적 횟수입니다. 추후 평판·현상금 판정에 사용됩니다.',
    visible: true,
    amount: event => event.data.zoneType === 'neutral' ? 1 : 0,
    format: value => `${value}회`,
});

for (const statistic of [
    { id: 'career:mage_fire_kills', tag: GameTags.PROPERTY_FIRE, mageProgress: true },
    { id: 'career:mage_ice_kills', tag: GameTags.PROPERTY_ICE, mageProgress: true },
    { id: 'career:mage_electric_kills', tag: GameTags.PROPERTY_ELECTRIC, mageProgress: true },
    { id: 'combat:property_kills/water', tag: GameTags.PROPERTY_WATER, mageProgress: false },
    { id: 'combat:property_kills/natural', tag: GameTags.PROPERTY_NATURAL, mageProgress: false },
    { id: 'combat:property_kills/poison', tag: GameTags.PROPERTY_POISON, mageProgress: false },
    { id: 'combat:property_kills/stone', tag: GameTags.PROPERTY_STONE, mageProgress: false },
    { id: 'combat:property_kills/dark', tag: GameTags.PROPERTY_DARK, mageProgress: false },
    { id: 'combat:property_kills/light', tag: GameTags.PROPERTY_LIGHT, mageProgress: false },
    { id: 'combat:property_kills/undead', tag: GameTags.PROPERTY_UNDEAD, mageProgress: false },
    { id: 'combat:property_kills/holy', tag: GameTags.PROPERTY_HOLY, mageProgress: false },
    { id: 'combat:property_kills/insect', tag: GameTags.PROPERTY_INSECT, mageProgress: false },
    { id: 'combat:property_kills/metal', tag: GameTags.PROPERTY_METAL, mageProgress: false },
    { id: 'combat:property_kills/earth', tag: GameTags.PROPERTY_EARTH, mageProgress: false },
] as const) {
    const display = getTagEffectTagDisplay(statistic.tag);
    if (!display) throw new Error(`속성 처치 통계 표시 메타데이터가 없습니다: ${statistic.tag}`);
    defineStatistic({
        id: statistic.id,
        eventId: GameEventIds.ENTITY_DEFEATED,
        label: `${display.label} 속성 몬스터 처치`,
        description: statistic.mageProgress
            ? '마법사 속성 주문 자동 획득에 사용하는 누적 처치 통계입니다.'
            : '해당 속성을 가진 몬스터를 처치한 누적 횟수입니다.',
        visible: true,
        tags: [statistic.tag],
        amount: event => event.subject?.hasTag(GameTags.ENTITY_MONSTER)
            && event.subject.hasTag(statistic.tag) ? 1 : 0,
        format: value => `${value}회`,
    });
}
