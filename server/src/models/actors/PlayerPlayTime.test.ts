import assert from 'node:assert/strict';
import test from 'node:test';
import {
    isNewcomerPlayTime,
    isNewcomerProgress,
    NEWCOMER_MAX_LEVEL,
    NEWCOMER_PLAY_TIME_SECONDS,
} from './Player.js';

test('누적 플레이 24시간 미만의 Player만 새싹 표시 대상이다', () => {
    assert.equal(isNewcomerPlayTime(0), true);
    assert.equal(isNewcomerPlayTime(NEWCOMER_PLAY_TIME_SECONDS - 0.001), true);
    assert.equal(isNewcomerPlayTime(NEWCOMER_PLAY_TIME_SECONDS), false);
    assert.equal(isNewcomerPlayTime(NEWCOMER_PLAY_TIME_SECONDS + 1), false);
});

test('잘못된 누적 플레이 시간은 새싹 표시 대상으로 취급하지 않는다', () => {
    assert.equal(isNewcomerPlayTime(-1), false);
    assert.equal(isNewcomerPlayTime(Number.NaN), false);
    assert.equal(isNewcomerPlayTime(Number.POSITIVE_INFINITY), false);
});

test('누적 플레이가 24시간 미만이어도 Lv.30을 달성하면 새싹 표시가 사라진다', () => {
    assert.equal(isNewcomerProgress(1, 0), true);
    assert.equal(isNewcomerProgress(NEWCOMER_MAX_LEVEL - 1, 0), true);
    assert.equal(isNewcomerProgress(NEWCOMER_MAX_LEVEL, 0), false);
    assert.equal(isNewcomerProgress(1, NEWCOMER_PLAY_TIME_SECONDS), false);
});
