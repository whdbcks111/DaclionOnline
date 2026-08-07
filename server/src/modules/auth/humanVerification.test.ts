import assert from 'node:assert/strict';
import test from 'node:test';
import {
    analyzeHuntingPattern,
    type HuntingActivitySample,
} from './humanVerification.js';

function samples(
    count: number,
    intervalMs: number,
    token: (index: number) => { locationId: string; targetKey: string },
): HuntingActivitySample[] {
    return Array.from({ length: count }, (_, index) => ({
        occurredAt: index * intervalMs,
        ...token(index),
    }));
}

test('장시간 같은 사냥 동선을 일정하게 반복하면 사람 확인 후보로 판정한다', () => {
    const analysis = analyzeHuntingPattern(samples(50, 60_000, index => ({
        locationId: `field-${index % 2}`,
        targetKey: `monster-${index % 2}`,
    })));

    assert.equal(analysis.suspicious, true);
    assert.ok(analysis.routeRepetition > 0.9);
    assert.ok(analysis.timingRegularity > 0.9);
});

test('사냥 시간이 길어도 대상과 동선이 다양하면 반복 사냥으로 단정하지 않는다', () => {
    const analysis = analyzeHuntingPattern(samples(50, 60_000, index => ({
        locationId: `field-${index}`,
        targetKey: `monster-${index}`,
    })));

    assert.equal(analysis.suspicious, false);
    assert.ok(analysis.routeRepetition < 0.1);
});

test('장시간 이탈이 포함된 기록은 연속 자동 사냥으로 판정하지 않는다', () => {
    const activity = samples(50, 60_000, () => ({
        locationId: 'field',
        targetKey: 'monster',
    }));
    activity[25] = { ...activity[25], occurredAt: activity[24].occurredAt + 9 * 60_000 };
    for (let index = 26; index < activity.length; index++) {
        activity[index] = { ...activity[index], occurredAt: activity[index - 1].occurredAt + 60_000 };
    }

    assert.equal(analyzeHuntingPattern(activity).suspicious, false);
});
