import assert from 'node:assert/strict';
import test from 'node:test';
import { FixedWindowRateLimiter } from './rateLimit.js';

test('고정 구간 limiter는 허용 횟수 뒤 요청을 막고 구간 종료 후 복구한다', () => {
    const limiter = new FixedWindowRateLimiter(2, 1_000);
    assert.equal(limiter.consume('client', 10_000).allowed, true);
    assert.equal(limiter.consume('client', 10_100).allowed, true);
    const denied = limiter.consume('client', 10_200);
    assert.equal(denied.allowed, false);
    assert.equal(denied.retryAfterMs, 800);
    assert.equal(limiter.consume('client', 11_000).allowed, true);
});

test('limiter key 상한은 만료되지 않은 임의 key의 메모리 증가를 제한한다', () => {
    const limiter = new FixedWindowRateLimiter(1, 1_000, 2);
    assert.equal(limiter.consume('a', 0).allowed, true);
    assert.equal(limiter.consume('b', 0).allowed, true);
    assert.equal(limiter.consume('c', 1).allowed, false);
    assert.equal(limiter.consume('c', 1_000).allowed, true);
});
