import assert from 'node:assert/strict';
import test from 'node:test';
import type { VerifyEntry } from '../types/index.js';
import {
    isVerifiedRegistrationEmail,
    normalizeRegistrationEmail,
} from './register.js';

function verification(email: string, expirationDate: Date, verified = true): VerifyEntry {
    return {
        email,
        code: '123456',
        sentAt: new Date(1_000),
        expirationDate,
        ...(verified ? { verified: true as const } : {}),
    };
}

test('회원가입은 인증받은 이메일과 정규화된 가입 이메일이 같을 때만 허용한다', () => {
    const now = 10_000;
    const entry = verification('player@example.com', new Date(now + 1_000));

    assert.equal(normalizeRegistrationEmail(' Player@Example.COM '), 'player@example.com');
    assert.equal(isVerifiedRegistrationEmail(entry, ' Player@Example.COM ', now), true);
    assert.equal(isVerifiedRegistrationEmail(entry, 'attacker@example.com', now), false);
});

test('만료되거나 아직 확인하지 않은 이메일 인증은 가입에 사용할 수 없다', () => {
    const now = 10_000;
    assert.equal(isVerifiedRegistrationEmail(
        verification('player@example.com', new Date(now - 1)),
        'player@example.com',
        now,
    ), false);
    assert.equal(isVerifiedRegistrationEmail(
        verification('player@example.com', new Date(now + 1_000), false),
        'player@example.com',
        now,
    ), false);
});
