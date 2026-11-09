import assert from 'node:assert/strict';
import test from 'node:test';
import {
    checkPasswordResetCode,
    normalizePasswordResetEmail,
    type PasswordResetEntry,
} from './passwordReset.js';

function entry(): PasswordResetEntry {
    return {
        userId: 1,
        email: 'player@example.com',
        code: '123456',
        expiresAt: 20_000,
        sentAt: 1_000,
        attempts: 0,
    };
}

test('비밀번호 재설정 이메일은 공백과 대소문자를 정규화한다', () => {
    assert.equal(normalizePasswordResetEmail(' Player@Example.COM '), 'player@example.com');
});

test('비밀번호 재설정 코드는 오답 5회 또는 만료 뒤 사용할 수 없다', () => {
    const value = entry();
    assert.equal(checkPasswordResetCode(value, '123456', 10_000), 'valid');
    for (let attempt = 1; attempt < 5; attempt++) {
        assert.equal(checkPasswordResetCode(value, '000000', 10_000), 'incorrect');
    }
    assert.equal(checkPasswordResetCode(value, '000000', 10_000), 'attempts-exhausted');
    assert.equal(checkPasswordResetCode(value, '123456', 10_000), 'expired');
});
