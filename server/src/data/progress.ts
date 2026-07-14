import { defineStatistic } from '../models/Progress.js';
import { GameEventIds } from '../models/GameEvent.js';

defineStatistic({
    id: 'combat:critical_hits',
    eventId: GameEventIds.CRITICAL_HIT,
    label: '치명타 발동 횟수',
    description: '플레이어가 공격으로 치명타를 발동시킨 누적 횟수입니다.',
    visible: true,
    format: value => `${value}회`,
});
