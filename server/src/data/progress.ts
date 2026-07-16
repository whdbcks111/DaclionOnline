import { defineStatistic } from '../models/Progress.js';
import { GameEventIds } from '../models/GameEvent.js';
import { GameTags } from '../../../shared/tags.js';

defineStatistic({
    id: 'combat:critical_hits',
    eventId: GameEventIds.CRITICAL_HIT,
    label: '치명타 발동 횟수',
    description: '플레이어가 공격으로 치명타를 발동시킨 누적 횟수입니다.',
    visible: true,
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
