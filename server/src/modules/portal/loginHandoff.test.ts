import assert from 'node:assert/strict';
import test from 'node:test';
import { LoginHandoff } from './loginHandoff.js';

test('포털 연결 코드는 로그인 토큰을 노출하지 않으며 브라우저 state에 묶인 일회용이다', () => {
    const handoff = new LoginHandoff();
    const code = handoff.issue('secret-session-token', 'browser-state', 1_000);
    assert.match(code, /^[0-9a-f]{64}$/);
    assert.notEqual(code, 'secret-session-token');
    assert.equal(handoff.consume(code, 'browser-state', 1_001), 'secret-session-token');
    assert.equal(handoff.consume(code, 'browser-state', 1_002), undefined);
    const other = handoff.issue('another-token', 'real-browser', 1_000);
    assert.equal(handoff.consume(other, 'attacker-browser', 1_001), undefined);
    assert.equal(handoff.consume(other, 'real-browser', 1_002), undefined);
});

test('포털 연결 코드는 30초 뒤 만료되고 과다 발급을 제한한다', () => {
    const handoff = new LoginHandoff(30_000, 1);
    const code = handoff.issue('token', 'state', 1_000);
    assert.throws(() => handoff.issue('token', 'state', 1_001));
    assert.equal(handoff.consume(code, 'state', 31_000), undefined);
    assert.ok(handoff.issue('new-token', 'state', 31_001));
});
