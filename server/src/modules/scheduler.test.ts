import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { gameAction } from '../models/GameAction.js';
import {
    cancelGameTasksByPrefix,
    clearGameTasks,
    hasGameTask,
    scheduleGameTask,
    updateGameScheduler,
} from './scheduler.js';

afterEach(clearGameTasks);

test('공용 scheduler는 key 교체·prefix 해제·반복 종료를 지원한다', () => {
    let value = 0;
    scheduleGameTask('skill:1', 1, () => { value += 1; });
    scheduleGameTask('skill:1', 1, () => { value += 10; });
    scheduleGameTask('effect:1', 0.5, () => { value += 100; return value < 250; }, { repeatSeconds: 0.5 });
    updateGameScheduler(0.5);
    assert.equal(value, 100);
    updateGameScheduler(0.5);
    assert.equal(value, 210);
    updateGameScheduler(0.5);
    assert.equal(value, 310);
    assert.equal(hasGameTask('effect:1'), false);
    scheduleGameTask('skill:a', 1, () => undefined);
    scheduleGameTask('skill:b', 1, () => undefined);
    assert.equal(cancelGameTasksByPrefix('skill:'), 2);
});

test('GameAction은 사전 조건 실패 시 변경하지 않고 적용 실패 시 역순 롤백한다', () => {
    let gold = 10;
    const denied = gameAction('구매').require(() => gold >= 20, '골드가 부족합니다.').step(() => { gold -= 20; }).run();
    assert.deepEqual(denied, { ok: false, error: '골드가 부족합니다.' });
    assert.equal(gold, 10);

    const failed = gameAction('보상 지급')
        .step(() => { gold -= 5; }, () => { gold += 5; })
        .step(() => { throw new Error('인벤토리가 가득 찼습니다.'); })
        .run();
    assert.equal(failed.ok, false);
    assert.equal(gold, 10);
});
