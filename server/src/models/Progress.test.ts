import assert from 'node:assert/strict';
import test from 'node:test';
import Entity from './Entity.js';
import Equipment from './Equipment.js';
import {
    PlayerProgress,
    ProgressType,
    defineProgress,
    defineStatistic,
} from './Progress.js';
import {
    clearRecentGameEvents,
    emitGameEvent,
    getRecentGameEvents,
} from './GameEvent.js';

class TestPlayerEntity extends Entity {
    override readonly name = '통계 시험 플레이어';
    readonly progress = PlayerProgress.createEmpty(77);

    constructor() {
        super(1, 0, 'test', { maxLife: 100 }, Equipment.createEmpty());
    }

    override get isPlayer(): boolean { return true; }
    override get playerUserId(): number { return 77; }
}

test('counter/flag/state progress는 타입별 기본값과 변경 API를 제공한다', () => {
    defineProgress({
        id: 'test:counter',
        type: ProgressType.COUNTER,
        label: '시험 횟수',
        description: '',
        visible: true,
    });
    defineProgress({
        id: 'test:flag',
        type: ProgressType.FLAG,
        label: '시험 플래그',
        description: '',
    });
    defineProgress({
        id: 'test:state',
        type: ProgressType.STATE,
        label: '시험 상태',
        description: '',
    });
    const progress = PlayerProgress.createEmpty(1);

    assert.equal(progress.getCounter('test:counter'), 0n);
    assert.equal(progress.increment('test:counter', 3), 3n);
    assert.equal(progress.getFlag('test:flag'), false);
    assert.equal(progress.setFlag('test:flag'), true);
    assert.equal(progress.setState('test:state', 'friendly'), 'friendly');
    assert.equal(progress.getState('test:state'), 'friendly');
    assert.equal(progress.dirty, true);
});

test('게임 이벤트는 통계를 증가시키고 최근 trace에는 Entity 원본을 노출하지 않는다', () => {
    clearRecentGameEvents();
    defineStatistic({
        id: 'test:event_count',
        eventId: 'test:counted_event',
        label: '이벤트 횟수',
        description: '',
        amount: event => Number(event.data.amount ?? 1),
    });
    const player = new TestPlayerEntity();

    emitGameEvent('test:counted_event', {
        actor: player,
        data: { amount: 2 },
    });

    assert.equal(player.progress.getCounter('test:event_count'), 2n);
    assert.deepEqual(getRecentGameEvents({ actorUserId: 77, limit: 1 }), [{
        id: 'test:counted_event',
        occurredAt: getRecentGameEvents({ limit: 1 })[0].occurredAt,
        actorUserId: 77,
        actorName: '통계 시험 플레이어',
        subjectUserId: undefined,
        subjectName: undefined,
        data: { amount: 2 },
    }]);
    assert.deepEqual(getRecentGameEvents({ limit: 0 }), []);
});
