import { defineProgress, defineStatistic, ProgressType } from '../models/Progress.js';
import { GameEventIds } from '../models/GameEvent.js';
import { GameTags } from '../../../shared/tags.js';

defineProgress({
    id: 'profession:blacksmith',
    type: ProgressType.FLAG,
    label: '대장장이 전문 직업',
    description: '전투 직업과 별개로 마력 제련과 금속 단조를 사용할 수 있는 생산 전문 직업입니다.',
    visible: true,
    tags: ['profession:crafting'],
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
    id: 'combat:neutral_pvp_kills',
    eventId: GameEventIds.PVP_KILL,
    label: '중립 구역 플레이어 처치',
    description: '중립 구역에서 다른 플레이어를 처치한 누적 횟수입니다. 추후 평판·현상금 판정에 사용됩니다.',
    visible: true,
    amount: event => event.data.zoneType === 'neutral' ? 1 : 0,
    format: value => `${value}회`,
});

for (const statistic of [
    { id: 'career:mage_fire_kills', label: '불 속성 몬스터 처치', tag: GameTags.PROPERTY_FIRE },
    { id: 'career:mage_ice_kills', label: '얼음 속성 몬스터 처치', tag: GameTags.PROPERTY_ICE },
    { id: 'career:mage_electric_kills', label: '전기 속성 몬스터 처치', tag: GameTags.PROPERTY_ELECTRIC },
] as const) defineStatistic({
    id: statistic.id,
    eventId: GameEventIds.ENTITY_DEFEATED,
    label: statistic.label,
    description: '마법사 속성 주문 자동 획득에 사용하는 누적 처치 통계입니다.',
    visible: true,
    amount: event => event.subject?.hasTag(statistic.tag) ? 1 : 0,
    format: value => `${value}회`,
});
