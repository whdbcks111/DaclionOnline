import assert from 'node:assert/strict';
import test from 'node:test';
import { formatWeight } from './format.js';

test('중량은 최대 소수 둘째 자리와 kg 단위로 표시한다', () => {
    assert.equal(formatWeight(50), '50kg');
    assert.equal(formatWeight(1.2), '1.2kg');
    assert.equal(formatWeight(0.15), '0.15kg');
    assert.equal(formatWeight(0.1 + 0.2), '0.3kg');
});
